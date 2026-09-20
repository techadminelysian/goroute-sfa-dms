import {
  ClaimsLedger,
  ClaimsLedgerEntry,
  ClaimsLedgerStatus,
  CompanyClaimSummary,
  ClaimAgingBucketItem,
} from '../types';
import { getClaimsLedgerEntries, upsertClaimsLedgerEntry } from './claimAccrual';

/**
 * ==============================================================================
 * DATABASE & FIRESTORE INDEXING RECOMMENDATIONS
 * ==============================================================================
 *
 * To optimize performance for high-volume distributor claim transactions,
 * configure the following composite and single-field indexes on the `claims_ledger` collection:
 *
 * 1. Company & Period Query Index (Used by getClaimsByCompanyAndPeriod):
 *    - Fields: (companyId ASC, distributorId ASC, periodStart ASC, periodEnd ASC)
 *    - Purpose: Enables O(log N) lookup when filtering claims for a specific FMCG manufacturer
 *      across billing cycle date windows.
 *
 * 2. Distributor Summary & Aggregation Index (Used by getClaimSummaryByCompany):
 *    - Fields: (distributorId ASC, companyId ASC, status ASC)
 *    - Purpose: Optimizes group-by aggregations for dashboard summary cards (expected, claimed, settled).
 *
 * 3. Lifecycle Status Query Index (Used by getClaimsByStatus):
 *    - Fields: (status ASC, periodStart DESC)
 *    - Purpose: Quickly lists all active, submitted, approved, or pending claims sorted by recency.
 *
 * 4. Aging Analysis Index (Used by getAgingReport):
 *    - Fields: (distributorId ASC, status ASC, periodEnd ASC)
 *    - Purpose: Facilitates rapid bucket range scans across non-settled claims based on maturity age.
 *
 * 5. Scheme Reconciliation Index:
 *    - Fields: (schemeId ASC, status ASC)
 *    - Purpose: Accelerates manufacturer-side audit and scheme ROI reconciliation.
 * ==============================================================================
 */

/**
 * Return type interface for Company Claim Summary
 */
export interface CompanyClaimSummaryResult {
  companyId: string;
  companyName?: string;
  totalExpected: number;
  totalClaimed: number;
  totalSettled: number;
  pendingAmount: number;
}

/**
 * Return type interface for Aging Report Item
 */
export interface AgingReportItemResult {
  companyId: string;
  bucket: string;
  amount: number;
  claimCount?: number;
}

/**
 * ClaimsRepository
 *
 * Data access and query repository providing analytical and reporting queries
 * for distributor claims dashboards, company summaries, and aging analysis.
 */
export class ClaimsRepository {
  /**
   * Optional custom data provider / override for integration with external databases.
   * Defaults to in-memory / local claims ledger storage.
   */
  private getEntries: () => ClaimsLedger[];

  constructor(customSource?: () => ClaimsLedger[]) {
    this.getEntries = customSource || getClaimsLedgerEntries;
  }

  /**
   * 1. getClaimsByCompanyAndPeriod
   *
   * Retrieves all claims ledger records for a specific manufacturer company,
   * distributor tenant, and billing period range (inclusive).
   *
   * Database Index: (companyId ASC, distributorId ASC, periodStart ASC, periodEnd ASC)
   *
   * @param companyId UUID / identifier of the FMCG manufacturing company
   * @param distributorId UUID / identifier of the distributor
   * @param startDate ISO date string (YYYY-MM-DD) for window start
   * @param endDate ISO date string (YYYY-MM-DD) for window end
   * @returns Promise<ClaimsLedger[]> Array of matching claims ledger records
   */
  public async getClaimsByCompanyAndPeriod(
    companyId: string,
    distributorId: string,
    startDate: string,
    endDate: string
  ): Promise<ClaimsLedger[]> {
    if (!companyId || !distributorId) {
      throw new Error('companyId and distributorId are required parameters.');
    }

    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate).getTime();

    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
      throw new Error(`Invalid date format provided. Start: '${startDate}', End: '${endDate}'.`);
    }

    if (endTimestamp < startTimestamp) {
      throw new Error(
        `endDate (${endDate}) cannot be earlier than startDate (${startDate}).`
      );
    }

    const allEntries = this.getEntries();

    return allEntries.filter((entry) => {
      if (entry.companyId !== companyId || entry.distributorId !== distributorId) {
        return false;
      }

      const entryStart = new Date(entry.periodStart).getTime();
      const entryEnd = new Date(entry.periodEnd).getTime();

      // Check if entry date range overlaps with requested filter window
      return entryStart >= startTimestamp && entryEnd <= endTimestamp;
    });
  }

  /**
   * 2. getClaimSummaryByCompany
   *
   * Computes aggregated claim metrics (total expected, total claimed, total settled, and pending amount)
   * grouped by FMCG company for a given distributor.
   *
   * Database Index: (distributorId ASC, companyId ASC, status ASC)
   *
   * @param distributorId UUID / identifier of the distributor
   * @returns Promise<Array<{ companyId: string; totalExpected: number; totalClaimed: number; totalSettled: number; pendingAmount: number }>>
   */
  public async getClaimSummaryByCompany(
    distributorId: string
  ): Promise<CompanyClaimSummaryResult[]> {
    if (!distributorId) {
      throw new Error('distributorId is required to calculate claim summary.');
    }

    const allEntries = this.getEntries();
    const distributorEntries = allEntries.filter((e) => e.distributorId === distributorId);

    // Grouping map by companyId
    const companySummaryMap = new Map<
      string,
      {
        companyId: string;
        totalExpected: number;
        totalClaimed: number;
        totalSettled: number;
        pendingAmount: number;
      }
    >();

    for (const entry of distributorEntries) {
      const companyId = entry.companyId || 'UNKNOWN_COMPANY';
      let summary = companySummaryMap.get(companyId);

      if (!summary) {
        summary = {
          companyId,
          totalExpected: 0,
          totalClaimed: 0,
          totalSettled: 0,
          pendingAmount: 0,
        };
        companySummaryMap.set(companyId, summary);
      }

      const expected = Number(entry.totalExpectedClaim || 0);
      const claimed = Number(entry.claimedAmount || 0);
      const settled = Number(entry.settledAmount || 0);

      summary.totalExpected += expected;
      summary.totalClaimed += claimed;
      summary.totalSettled += settled;

      // Pending amount: Amount accrued/claimed that has not yet been settled or rejected
      if (entry.status !== 'SETTLED' && entry.status !== 'REJECTED') {
        const pendingForLine = Math.max(0, expected - settled);
        summary.pendingAmount += pendingForLine;
      }
    }

    // Format numbers to 2 decimal places
    return Array.from(companySummaryMap.values()).map((s) => ({
      companyId: s.companyId,
      totalExpected: Number(s.totalExpected.toFixed(2)),
      totalClaimed: Number(s.totalClaimed.toFixed(2)),
      totalSettled: Number(s.totalSettled.toFixed(2)),
      pendingAmount: Number(s.pendingAmount.toFixed(2)),
    }));
  }

  /**
   * 3. getClaimsByStatus
   *
   * Filters and retrieves all claims matching a specific lifecycle status
   * (e.g. 'ACCUMULATING', 'CLAIM_FILED', 'APPROVED', 'SETTLED', 'REJECTED').
   *
   * Database Index: (status ASC, periodStart DESC)
   *
   * @param status The lifecycle status to filter by
   * @returns Promise<ClaimsLedger[]> Array of matching claims ledger records
   */
  public async getClaimsByStatus(
    status: ClaimsLedgerStatus | string
  ): Promise<ClaimsLedger[]> {
    if (!status) {
      throw new Error('Status parameter is required.');
    }

    const allEntries = this.getEntries();
    return allEntries.filter(
      (entry) => entry.status.toUpperCase() === status.toUpperCase()
    );
  }

  /**
   * 4. getAgingReport
   *
   * Generates an aging analysis of unsettled claims for a distributor grouped by company and age bucket.
   *
   * Standard Ageing Buckets Example: `[30, 60, 90]`
   * Yields Buckets:
   * - "0-30 Days"
   * - "31-60 Days"
   * - "61-90 Days"
   * - "90+ Days"
   *
   * Database Index: (distributorId ASC, status ASC, periodEnd ASC)
   *
   * @param distributorId UUID / identifier of the distributor
   * @param ageingBuckets Array of bucket cutoff days (e.g. [30, 60, 90])
   * @param referenceDate Optional base date to calculate age from (defaults to current date)
   * @returns Promise<Array<{ companyId: string; bucket: string; amount: number }>>
   */
  public async getAgingReport(
    distributorId: string,
    ageingBuckets: number[] = [30, 60, 90],
    referenceDate?: string | Date
  ): Promise<AgingReportItemResult[]> {
    if (!distributorId) {
      throw new Error('distributorId is required for aging report generation.');
    }

    // Sort bucket thresholds in ascending order
    const sortedBuckets = [...ageingBuckets].sort((a, b) => a - b);
    const refTime = referenceDate
      ? new Date(referenceDate).getTime()
      : new Date().getTime();

    const allEntries = this.getEntries();

    // Filter only unsettled/unrejected claims for this distributor with outstanding balance
    const openEntries = allEntries.filter((entry) => {
      if (entry.distributorId !== distributorId) return false;
      if (entry.status === 'SETTLED' || entry.status === 'REJECTED') return false;

      const outstanding = (entry.totalExpectedClaim || 0) - (entry.settledAmount || 0);
      return outstanding > 0;
    });

    // Helper to determine bucket label for a given age in days
    const getBucketLabel = (ageInDays: number): string => {
      let prevCutoff = 0;

      for (const cutoff of sortedBuckets) {
        if (ageInDays <= cutoff) {
          return prevCutoff === 0
            ? `0-${cutoff} Days`
            : `${prevCutoff + 1}-${cutoff} Days`;
        }
        prevCutoff = cutoff;
      }

      return `${prevCutoff}+ Days`;
    };

    // Pre-populate all buckets per company for consistent matrix reporting
    const uniqueCompanyIds = Array.from(
      new Set(
        allEntries
          .filter((e) => e.distributorId === distributorId)
          .map((e) => e.companyId || 'UNKNOWN_COMPANY')
      )
    );

    // If no companies found in ledger, return empty array
    if (uniqueCompanyIds.length === 0) {
      return [];
    }

    // Map: `${companyId}___${bucketLabel}` -> total outstanding amount
    const bucketAmountMap = new Map<
      string,
      { companyId: string; bucket: string; amount: number; count: number }
    >();

    // Initialize all bucket combinations with 0
    const allBucketLabels: string[] = [];
    let prev = 0;
    for (const cutoff of sortedBuckets) {
      allBucketLabels.push(prev === 0 ? `0-${cutoff} Days` : `${prev + 1}-${cutoff} Days`);
      prev = cutoff;
    }
    allBucketLabels.push(`${prev}+ Days`);

    for (const companyId of uniqueCompanyIds) {
      for (const bucketLabel of allBucketLabels) {
        const key = `${companyId}___${bucketLabel}`;
        bucketAmountMap.set(key, {
          companyId,
          bucket: bucketLabel,
          amount: 0,
          count: 0,
        });
      }
    }

    // Accumulate amounts into buckets based on claim age
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    for (const entry of openEntries) {
      const companyId = entry.companyId || 'UNKNOWN_COMPANY';
      const claimDate = new Date(entry.periodEnd || entry.createdAt || new Date()).getTime();

      // Days elapsed since periodEnd / claim generation
      const ageInDays = Math.max(0, Math.floor((refTime - claimDate) / MS_PER_DAY));
      const bucketLabel = getBucketLabel(ageInDays);

      const outstandingAmount = Math.max(
        0,
        (entry.totalExpectedClaim || 0) - (entry.settledAmount || 0)
      );

      const key = `${companyId}___${bucketLabel}`;
      const record = bucketAmountMap.get(key);

      if (record) {
        record.amount += outstandingAmount;
        record.count += 1;
      } else {
        bucketAmountMap.set(key, {
          companyId,
          bucket: bucketLabel,
          amount: outstandingAmount,
          count: 1,
        });
      }
    }

    return Array.from(bucketAmountMap.values())
      .map((item) => ({
        companyId: item.companyId,
        bucket: item.bucket,
        amount: Number(item.amount.toFixed(2)),
        claimCount: item.count,
      }))
      .sort((a, b) => {
        if (a.companyId !== b.companyId) {
          return a.companyId.localeCompare(b.companyId);
        }
        return allBucketLabels.indexOf(a.bucket) - allBucketLabels.indexOf(b.bucket);
      });
  }

  /**
   * Helper to seed / record a claim ledger entry directly for testing or seeding
   */
  public async recordClaimEntry(params: {
    companyId: string;
    distributorId: string;
    skuId: string;
    schemeId: string;
    periodStart: string;
    periodEnd: string;
    quantityToAdd: number;
    expectedClaimPerUnit: number;
  }): Promise<ClaimsLedger> {
    return upsertClaimsLedgerEntry(params);
  }
}

// Export singleton instance for app-wide use
export const claimsRepository = new ClaimsRepository();
