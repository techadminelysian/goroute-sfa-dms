import {
  SalesInvoice,
  SKU,
  SKUMaster,
  TradeScheme,
  ClaimsLedgerEntry,
  ClaimAccrualResult,
  AccruedLineItemResult,
} from '../types';
import { INITIAL_TRADE_SCHEMES } from '../data/tradeSchemes';

/**
 * In-memory / fallback store for SKU Master, Trade Schemes, and Claims Ledger
 * Allows the claim engine to work seamlessly across both client-side state and backend services.
 */
let inMemorySKUMaster: Map<string, SKUMaster> = new Map();
let inMemoryTradeSchemes: Map<string, TradeScheme> = new Map(
  INITIAL_TRADE_SCHEMES.map((s) => [s.schemeId, s])
);
let inMemoryClaimsLedger: Map<string, ClaimsLedgerEntry> = new Map();

/**
 * Helper to seed or update the SKU master store for testing / runtime
 */
export function registerSKUMaster(skus: (SKUMaster | SKU)[]): void {
  for (const sku of skus) {
    const skuId = (sku as SKUMaster).skuId || (sku as SKU).id;
    const pts = Number((sku as SKUMaster).pts ?? (sku as SKU).landing_price ?? 0);
    const ptr = Number((sku as SKUMaster).ptr ?? (sku as SKU).selling_price ?? 0);
    const isClaimEligible = Boolean((sku as SKUMaster).isClaimEligible ?? (sku as SKU).is_claim_eligible ?? false);
    const claimSchemeId = (sku as SKUMaster).claimSchemeId ?? (sku as SKU).claim_scheme_id ?? null;

    inMemorySKUMaster.set(skuId, {
      skuId,
      productName: (sku as SKUMaster).productName || (sku as SKU).name || 'Unknown SKU',
      pts,
      ptr,
      isClaimEligible,
      claimSchemeId,
      effectiveFrom: (sku as SKUMaster).effectiveFrom || (sku as SKU).effective_from || new Date().toISOString(),
      effectiveTo: (sku as SKUMaster).effectiveTo ?? (sku as SKU).effective_to ?? null,
    });
  }
}

/**
 * Helper to seed or update trade schemes in the engine
 */
export function registerTradeSchemes(schemes: TradeScheme[]): void {
  for (const scheme of schemes) {
    inMemoryTradeSchemes.set(scheme.schemeId, scheme);
  }
}

/**
 * Helper to retrieve all active claims ledger entries
 */
export function getClaimsLedgerEntries(): ClaimsLedgerEntry[] {
  return Array.from(inMemoryClaimsLedger.values());
}

/**
 * 1. Fetches an SKU Master record by its unique ID
 */
export async function fetchSKUMaster(skuId: string): Promise<SKUMaster | null> {
  return inMemorySKUMaster.get(skuId) || null;
}

/**
 * 2. Fetches a Trade Scheme configuration by its unique ID
 */
export async function fetchTradeScheme(schemeId: string): Promise<TradeScheme | null> {
  return inMemoryTradeSchemes.get(schemeId) || null;
}

/**
 * Determines the billing period date range (e.g. Month-start to Month-end) for the given invoice date
 */
export function getPeriodDateRange(invoiceDateStr: string): { periodStart: string; periodEnd: string } {
  const date = new Date(invoiceDateStr);
  if (isNaN(date.getTime())) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return {
      periodStart: new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0],
      periodEnd: new Date(Date.UTC(year, month + 1, 0)).toISOString().split('T')[0],
    };
  }

  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));

  return {
    periodStart: firstDay.toISOString().split('T')[0],
    periodEnd: lastDay.toISOString().split('T')[0],
  };
}

/**
 * Calculates the expected claim per unit for an SKU based on trade scheme type and calculation logic.
 *
 * Formula:
 * - PRICE_DIFF: (pts - ptr)
 * - TRADE_DISCOUNT: (pts - ptr) + (tradeDiscountFlat || (pts * tradeDiscountPercent / 100))
 * - QPS: (pts - ptr) + quantityBonus
 * - FOC: (pts - ptr) + freeGoodsValue, where freeGoodsValue = (freeQuantity * pts) / buyQuantity
 *
 * Validation:
 * - Throws Error if scheme status is not 'ACTIVE'
 * - Throws Error if scheme validity dates are invalid or referenceDate is out of bounds
 * - Throws Error if SKU PTS or PTR are negative or invalid numbers
 *
 * @param sku The SKU or SKUMaster containing pts and ptr rates
 * @param scheme The TradeScheme configuration
 * @param referenceDate Optional date to check validity against (defaults to current date)
 * @returns number Expected claim per unit in currency
 *
 * --- UNIT TEST EXAMPLES ---
 *
 * Example 1 (PRICE_DIFF Scheme):
 * ```typescript
 * const sku = { pts: 110, ptr: 105 };
 * const scheme = {
 *   schemeId: 'SCH-01',
 *   schemeName: 'Price Subsidy',
 *   companyId: 'COMP-1',
 *   schemeType: 'PRICE_DIFF',
 *   status: 'ACTIVE',
 *   validFrom: '2026-01-01',
 *   validTo: '2026-12-31',
 *   calculationLogic: {}
 * };
 * const claim = calculateExpectedClaimPerUnit(sku, scheme);
 * // Expected Output: (110 - 105) = 5
 * ```
 *
 * Example 2 (TRADE_DISCOUNT with flat amount):
 * ```typescript
 * const sku = { pts: 100, ptr: 100 };
 * const scheme = {
 *   schemeId: 'SCH-02',
 *   schemeName: 'Flat Trade Off',
 *   companyId: 'COMP-1',
 *   schemeType: 'TRADE_DISCOUNT',
 *   status: 'ACTIVE',
 *   validFrom: '2026-01-01',
 *   validTo: '2026-12-31',
 *   calculationLogic: { tradeDiscountFlat: 10 }
 * };
 * const claim = calculateExpectedClaimPerUnit(sku, scheme);
 * // Expected Output: (100 - 100) + 10 = 10
 * ```
 *
 * Example 3 (TRADE_DISCOUNT with percentage):
 * ```typescript
 * const sku = { pts: 200, ptr: 190 };
 * const scheme = {
 *   schemeId: 'SCH-03',
 *   schemeName: '5% Trade Incentive',
 *   companyId: 'COMP-1',
 *   schemeType: 'TRADE_DISCOUNT',
 *   status: 'ACTIVE',
 *   validFrom: '2026-01-01',
 *   validTo: '2026-12-31',
 *   calculationLogic: { tradeDiscountPercent: 5 }
 * };
 * const claim = calculateExpectedClaimPerUnit(sku, scheme);
 * // Expected Output: (200 - 190) + (200 * 5 / 100) = 10 + 10 = 20
 * ```
 *
 * Example 4 (QPS with Quantity Bonus):
 * ```typescript
 * const sku = { pts: 150, ptr: 150 };
 * const scheme = {
 *   schemeId: 'SCH-04',
 *   schemeName: 'Bulk Volume QPS',
 *   companyId: 'COMP-1',
 *   schemeType: 'QPS',
 *   status: 'ACTIVE',
 *   validFrom: '2026-01-01',
 *   validTo: '2026-12-31',
 *   calculationLogic: { quantityBonus: 8 }
 * };
 * const claim = calculateExpectedClaimPerUnit(sku, scheme);
 * // Expected Output: (150 - 150) + 8 = 8
 * ```
 *
 * Example 5 (FOC - Buy 10 Get 1 Free):
 * ```typescript
 * const sku = { pts: 100, ptr: 100 };
 * const scheme = {
 *   schemeId: 'SCH-05',
 *   schemeName: 'Buy 10 Get 1 Free',
 *   companyId: 'COMP-1',
 *   schemeType: 'FOC',
 *   status: 'ACTIVE',
 *   validFrom: '2026-01-01',
 *   validTo: '2026-12-31',
 *   calculationLogic: { buyQuantity: 10, freeQuantity: 1 }
 * };
 * const claim = calculateExpectedClaimPerUnit(sku, scheme);
 * // Expected Output: (100 - 100) + (1 * 100 / 10) = 0 + 10 = 10
 * ```
 *
 * Example 6 (Validation Failure - Inactive Scheme):
 * ```typescript
 * const sku = { pts: 100, ptr: 90 };
 * const scheme = { ...scheme, status: 'INACTIVE' };
 * // calculateExpectedClaimPerUnit(sku, scheme) throws Error("Trade scheme 'SCH-01' is INACTIVE.")
 * ```
 */
export function calculateExpectedClaimPerUnit(
  sku: { pts?: number; ptr?: number; landing_price?: number; selling_price?: number },
  scheme: TradeScheme,
  referenceDate?: string | Date
): number {
  // 1. Validate Scheme Status
  if (!scheme) {
    throw new Error('Trade scheme is required for claim calculation.');
  }

  if (scheme.status !== 'ACTIVE') {
    throw new Error(
      `Trade scheme '${scheme.schemeName || scheme.schemeId}' is INACTIVE. Claims cannot be calculated for inactive schemes.`
    );
  }

  // 2. Validate Scheme Validity Dates
  if (!scheme.validFrom || !scheme.validTo) {
    throw new Error(`Trade scheme '${scheme.schemeId}' missing validFrom or validTo date range.`);
  }

  const validFromTime = new Date(scheme.validFrom).getTime();
  const validToTime = new Date(scheme.validTo).getTime();

  if (isNaN(validFromTime) || isNaN(validToTime)) {
    throw new Error(`Trade scheme '${scheme.schemeId}' contains invalid date format in validity range.`);
  }

  if (validToTime < validFromTime) {
    throw new Error(
      `Trade scheme '${scheme.schemeId}' date range is invalid: validTo (${scheme.validTo}) is earlier than validFrom (${scheme.validFrom}).`
    );
  }

  // Check reference date against scheme date window
  if (referenceDate) {
    const refTime = typeof referenceDate === 'string' ? new Date(referenceDate).getTime() : referenceDate.getTime();
    if (!isNaN(refTime)) {
      // Allow inclusive boundaries up to end of the validTo day
      const startOfDay = new Date(scheme.validFrom).setHours(0, 0, 0, 0);
      const endOfDay = new Date(scheme.validTo).setHours(23, 59, 59, 999);

      if (refTime < startOfDay || refTime > endOfDay) {
        throw new Error(
          `Reference date (${new Date(refTime).toISOString().split('T')[0]}) is outside the trade scheme validity window [${scheme.validFrom} to ${scheme.validTo}].`
        );
      }
    }
  }

  // 3. Extract & Validate SKU Pricing Rates
  const pts = Number(sku.pts ?? sku.landing_price);
  const ptr = Number(sku.ptr ?? sku.selling_price);

  if (isNaN(pts) || pts < 0) {
    throw new Error(`Invalid SKU PTS (Price to Stockist): '${sku.pts}'. Value must be a non-negative number.`);
  }

  if (isNaN(ptr) || ptr < 0) {
    throw new Error(`Invalid SKU PTR (Price to Retailer): '${sku.ptr}'. Value must be a non-negative number.`);
  }

  // Base price gap (reimburses distributor if mandated selling price is below purchase rate)
  const baseRateDifference = pts - ptr;
  const logic = scheme.calculationLogic || {};

  let schemeBonus = 0;

  switch (scheme.schemeType) {
    case 'PRICE_DIFF': {
      // Standard price difference margin gap
      schemeBonus = Number(logic.priceDifferenceMargin || 0);
      return baseRateDifference + schemeBonus;
    }

    case 'TRADE_DISCOUNT': {
      // If flat discount is configured, use it; otherwise calculate percentage of PTS
      if (logic.tradeDiscountFlat !== undefined && logic.tradeDiscountFlat !== null && Number(logic.tradeDiscountFlat) > 0) {
        schemeBonus = Number(logic.tradeDiscountFlat);
      } else if (logic.tradeDiscountPercent !== undefined && logic.tradeDiscountPercent !== null) {
        const percent = Number(logic.tradeDiscountPercent);
        schemeBonus = (pts * percent) / 100;
      }
      return baseRateDifference + schemeBonus;
    }

    case 'QPS': {
      // Quantity Purchase Scheme: volume incentive bonus per unit
      schemeBonus = Number(logic.quantityBonus ?? logic.tradeDiscountFlat ?? logic.priceDifferenceMargin ?? 0);
      return baseRateDifference + schemeBonus;
    }

    case 'FOC': {
      // Free Of Cost: e.g. Buy X Get Y Free -> (freeQuantity * pts) / buyQuantity
      const buyQty = Number(logic.buyQuantity || 0);
      const freeQty = Number(logic.freeQuantity || 0);

      if (buyQty > 0 && freeQty > 0) {
        schemeBonus = (freeQty * pts) / buyQty;
      }
      return baseRateDifference + schemeBonus;
    }

    default: {
      throw new Error(`Unsupported trade scheme type: '${(scheme as any).schemeType}'.`);
    }
  }
}

/**
 * Helper breakdown returning structured components of the calculation
 */
export function getClaimCalculationBreakdown(
  sku: { pts?: number; ptr?: number; landing_price?: number; selling_price?: number },
  scheme: TradeScheme,
  referenceDate?: string | Date
): {
  pts: number;
  ptr: number;
  priceDifference: number;
  schemeBonus: number;
  expectedClaimPerUnit: number;
} {
  const pts = Number(sku.pts ?? sku.landing_price ?? 0);
  const ptr = Number(sku.ptr ?? sku.selling_price ?? 0);
  const priceDifference = Math.max(0, pts - ptr);
  const expectedClaimPerUnit = calculateExpectedClaimPerUnit(sku, scheme, referenceDate);
  const schemeBonus = expectedClaimPerUnit - (pts - ptr);

  return {
    pts,
    ptr,
    priceDifference,
    schemeBonus,
    expectedClaimPerUnit,
  };
}

/**
 * Upserts an accrual record in the Claims Ledger table/collection:
 * - If a ledger entry exists for (distributorId, skuId, schemeId, periodStart, periodEnd),
 *   it updates unitsSold and increments totalExpectedClaim.
 * - Otherwise, it creates a new entry with status 'ACCUMULATING'.
 */
export async function upsertClaimsLedgerEntry(params: {
  companyId: string;
  distributorId: string;
  skuId: string;
  schemeId: string;
  periodStart: string;
  periodEnd: string;
  quantityToAdd: number;
  expectedClaimPerUnit: number;
}): Promise<ClaimsLedgerEntry> {
  const {
    companyId,
    distributorId,
    skuId,
    schemeId,
    periodStart,
    periodEnd,
    quantityToAdd,
    expectedClaimPerUnit,
  } = params;

  // Composite key identifier for ledger entry
  const compositeKey = `${companyId}_${distributorId}_${skuId}_${schemeId}_${periodStart}_${periodEnd}`;
  const now = new Date().toISOString();

  let existingEntry = inMemoryClaimsLedger.get(compositeKey);

  if (existingEntry) {
    // UPDATE existing period ledger
    const updatedUnitsSold = existingEntry.unitsSold + quantityToAdd;
    const updatedTotalExpected = updatedUnitsSold * expectedClaimPerUnit;

    const updatedEntry: ClaimsLedgerEntry = {
      ...existingEntry,
      unitsSold: updatedUnitsSold,
      expectedClaimPerUnit,
      totalExpectedClaim: updatedTotalExpected,
      updatedAt: now,
    };

    inMemoryClaimsLedger.set(compositeKey, updatedEntry);
    return updatedEntry;
  } else {
    // INSERT new period ledger entry
    const newEntry: ClaimsLedgerEntry = {
      ledgerId: `LEDGER-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      companyId,
      distributorId,
      skuId,
      schemeId,
      periodStart,
      periodEnd,
      unitsSold: quantityToAdd,
      expectedClaimPerUnit,
      totalExpectedClaim: quantityToAdd * expectedClaimPerUnit,
      claimedAmount: 0,
      settledAmount: 0,
      status: 'ACCUMULATING',
      creditNoteNumber: null,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryClaimsLedger.set(compositeKey, newEntry);
    return newEntry;
  }
}

/**
 * Processes a Sales Invoice and automatically accrues distributor trade claims for claim-eligible SKUs.
 *
 * Workflow:
 * 1. Iterates over all invoice line items.
 * 2. Fetches SKU master data to check if `isClaimEligible` is true and retrieves `claimSchemeId`.
 * 3. Skips normal SKUs (isClaimEligible = false).
 * 4. For eligible SKUs, fetches the linked Trade Scheme configuration.
 * 5. Calculates expectedClaimPerUnit via pure `calculateExpectedClaimPerUnit` utility.
 * 6. Upserts the claim in the Claims Ledger table (`claims_ledger`).
 * 7. Returns a detailed accrual summary.
 *
 * @param invoice The Sales Invoice to process
 * @returns Promise<ClaimAccrualResult> Summary of accrued and skipped items
 */
export async function processSalesInvoice(invoice: SalesInvoice): Promise<ClaimAccrualResult> {
  try {
    // Validation
    if (!invoice || !invoice.invoiceId || !invoice.distributorId) {
      throw new Error('Invalid invoice payload: invoiceId and distributorId are required.');
    }

    if (!Array.isArray(invoice.lineItems) || invoice.lineItems.length === 0) {
      return {
        success: true,
        invoiceId: invoice.invoiceId,
        distributorId: invoice.distributorId,
        totalEligibleUnits: 0,
        totalAccruedAmount: 0,
        accruedItemsCount: 0,
        skippedItemsCount: 0,
        processedItems: [],
        accruedLedgerEntries: [],
        message: 'No line items to process in invoice.',
      };
    }

    const { periodStart, periodEnd } = getPeriodDateRange(invoice.invoiceDate || new Date().toISOString());
    const processedItems: AccruedLineItemResult[] = [];
    const accruedLedgerMap = new Map<string, ClaimsLedgerEntry>();

    let totalEligibleUnits = 0;
    let totalAccruedAmount = 0;
    let accruedItemsCount = 0;
    let skippedItemsCount = 0;

    // Process each line item asynchronously
    for (const item of invoice.lineItems) {
      const { skuId, quantity, unitPrice } = item;

      // 1. Fetch SKU Master
      const skuMaster = await fetchSKUMaster(skuId);

      if (!skuMaster) {
        skippedItemsCount++;
        processedItems.push({
          skuId,
          quantity,
          isClaimEligible: false,
          priceDifference: 0,
          activeDiscount: 0,
          expectedClaimPerUnit: 0,
          totalLineClaim: 0,
          reason: 'Skipped - SKU master record not found in system.',
        });
        continue;
      }

      // Check claim eligibility
      if (!skuMaster.isClaimEligible || !skuMaster.claimSchemeId) {
        skippedItemsCount++;
        processedItems.push({
          skuId,
          productName: skuMaster.productName,
          quantity,
          isClaimEligible: false,
          priceDifference: 0,
          activeDiscount: 0,
          expectedClaimPerUnit: 0,
          totalLineClaim: 0,
          reason: 'Skipped - Normal SKU (not eligible for trade claim).',
        });
        continue;
      }

      // 2. Fetch linked Trade Scheme
      const tradeScheme = await fetchTradeScheme(skuMaster.claimSchemeId);

      if (!tradeScheme || tradeScheme.status !== 'ACTIVE') {
        skippedItemsCount++;
        processedItems.push({
          skuId,
          productName: skuMaster.productName,
          quantity,
          isClaimEligible: true,
          schemeId: skuMaster.claimSchemeId,
          priceDifference: 0,
          activeDiscount: 0,
          expectedClaimPerUnit: 0,
          totalLineClaim: 0,
          reason: 'Skipped - Linked trade scheme is inactive or not found.',
        });
        continue;
      }

      // 3. Calculation via pure utility function
      const pts = Number(skuMaster.pts);
      const ptr = Number(unitPrice ?? skuMaster.ptr); // Use invoice unit price or master PTR

      let expectedClaimPerUnit = 0;
      try {
        expectedClaimPerUnit = calculateExpectedClaimPerUnit(
          { pts, ptr },
          tradeScheme,
          invoice.invoiceDate
        );
      } catch (err: any) {
        skippedItemsCount++;
        processedItems.push({
          skuId: skuMaster.skuId,
          productName: skuMaster.productName,
          quantity,
          isClaimEligible: true,
          schemeId: tradeScheme.schemeId,
          priceDifference: 0,
          activeDiscount: 0,
          expectedClaimPerUnit: 0,
          totalLineClaim: 0,
          reason: `Skipped - Claim calculation error: ${err.message}`,
        });
        continue;
      }

      const priceDifference = Math.max(0, pts - ptr);
      const activeDiscount = expectedClaimPerUnit - (pts - ptr);
      const totalLineClaim = quantity * expectedClaimPerUnit;

      // 4. Accrue claim in Claims Ledger (INSERT or UPDATE)
      const companyId = tradeScheme.companyId || invoice.companyId || 'COMPANY-DEFAULT';
      const ledgerEntry = await upsertClaimsLedgerEntry({
        companyId,
        distributorId: invoice.distributorId,
        skuId: skuMaster.skuId,
        schemeId: tradeScheme.schemeId,
        periodStart,
        periodEnd,
        quantityToAdd: quantity,
        expectedClaimPerUnit,
      });

      accruedLedgerMap.set(ledgerEntry.ledgerId, ledgerEntry);

      totalEligibleUnits += quantity;
      totalAccruedAmount += totalLineClaim;
      accruedItemsCount++;

      processedItems.push({
        skuId: skuMaster.skuId,
        productName: skuMaster.productName,
        quantity,
        isClaimEligible: true,
        schemeId: tradeScheme.schemeId,
        schemeName: tradeScheme.schemeName,
        schemeType: tradeScheme.schemeType,
        priceDifference,
        activeDiscount,
        expectedClaimPerUnit,
        totalLineClaim,
        ledgerId: ledgerEntry.ledgerId,
        reason: `Eligible - Accrued ₹${totalLineClaim.toFixed(2)} to ledger ${ledgerEntry.ledgerId}`,
      });
    }

    return {
      success: true,
      invoiceId: invoice.invoiceId,
      distributorId: invoice.distributorId,
      totalEligibleUnits,
      totalAccruedAmount: Number(totalAccruedAmount.toFixed(2)),
      accruedItemsCount,
      skippedItemsCount,
      processedItems,
      accruedLedgerEntries: Array.from(accruedLedgerMap.values()),
      message: `Processed invoice ${invoice.invoiceId}: Accrued ₹${totalAccruedAmount.toFixed(2)} across ${accruedItemsCount} eligible SKU(s). ${skippedItemsCount} normal SKU(s) skipped.`,
    };
  } catch (error: any) {
    return {
      success: false,
      invoiceId: invoice?.invoiceId || 'UNKNOWN',
      distributorId: invoice?.distributorId || 'UNKNOWN',
      totalEligibleUnits: 0,
      totalAccruedAmount: 0,
      accruedItemsCount: 0,
      skippedItemsCount: 0,
      processedItems: [],
      accruedLedgerEntries: [],
      message: `Error processing sales invoice: ${error?.message || 'Unknown error'}`,
      error: error?.message || String(error),
    };
  }
}

