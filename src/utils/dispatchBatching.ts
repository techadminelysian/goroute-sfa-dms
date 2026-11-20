import { Company, DispatchPoint, Order, SKU } from '../types';
import {
  resolveOrderPrimaryDispatchPointId,
  UNMAPPED_DISPATCH_POINT_ID,
  UNMAPPED_DISPATCH_POINT_LABEL,
} from './dispatchRouting';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converts a Date or ISO timestamp into YYYY-MM-DD in IST (Asia/Kolkata, UTC+5:30).
 * Pure YYYY-MM-DD strings are preserved verbatim without timezone drift.
 */
export function getISTDateString(input?: string | Date | null): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (DATE_ONLY_REGEX.test(trimmed)) {
      return trimmed;
    }
  }

  let utcMs: number;
  if (input instanceof Date) {
    utcMs = input.getTime();
  } else if (typeof input === 'string' && input.trim()) {
    const parsed = Date.parse(input.trim());
    utcMs = Number.isNaN(parsed) ? Date.now() : parsed;
  } else {
    utcMs = Date.now();
  }

  if (Number.isNaN(utcMs)) {
    utcMs = Date.now();
  }

  return new Date(utcMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Adds (or subtracts) calendar days to a YYYY-MM-DD string deterministically in UTC.
 */
export function addDaysToYYYYMMDD(ymd: string, days: number): string {
  const normalized = DATE_ONLY_REGEX.test(ymd) ? ymd : getISTDateString(ymd);
  const [yStr, mStr, dStr] = normalized.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) {
    return getISTDateString(new Date(Date.now() + days * 86400000));
  }
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function getTodayISTDateString(now: Date = new Date()): string {
  return getISTDateString(now);
}

export function getTomorrowISTDateString(now: Date = new Date()): string {
  return addDaysToYYYYMMDD(getISTDateString(now), 1);
}

export interface NextDayDispatchAssignment {
  confirmed_at: string;
  dispatch_date: string;
  dispatch_batch_id: string;
}

/**
 * Assigns next-day dispatch_date (D + 1 in IST) strictly from the confirmation timestamp.
 * Orders confirmed between 00:00 and 23:59 IST on Day D map to dispatch_date = D + 1.
 */
export function computeNextDayDispatchAssignment(
  confirmationTimestamp?: string | Date
): NextDayDispatchAssignment {
  const confirmedAtIso =
    confirmationTimestamp instanceof Date
      ? confirmationTimestamp.toISOString()
      : typeof confirmationTimestamp === 'string' && confirmationTimestamp.trim()
      ? confirmationTimestamp.trim()
      : new Date().toISOString();

  const confirmDayIST = getISTDateString(confirmedAtIso);
  const dispatchDate = addDaysToYYYYMMDD(confirmDayIST, 1);

  return {
    confirmed_at: confirmedAtIso,
    dispatch_date: dispatchDate,
    dispatch_batch_id: `BATCH-${dispatchDate}`,
  };
}

/**
 * Strict Stage Gate: Only post-confirmation orders (Principal PO CONFIRMED / DEPOT_STOCK CONFIRMED
 * or un-dispatched INVOICED orders) can enter a Dispatch Sheet.
 * Never returns true for PENDING_VERIFICATION or unconfirmed VERIFIED orders.
 */
export function isOrderStageEligibleForDispatchQueue(order: Order): boolean {
  if (!order) return false;
  if (
    order.status === 'CANCELLED' ||
    order.status === 'DISPATCHED' ||
    order.status === 'DELIVERED' ||
    Boolean(order.dispatched_at)
  ) {
    return false;
  }

  return (
    order.status === 'CONFIRMED' ||
    order.status === 'PUNCHED_TO_PRINCIPAL' ||
    order.status === 'APPROVED' ||
    order.status === 'INVOICED'
  );
}

/**
 * Checks whether an order has already been dispatched or delivered.
 */
export function isOrderAlreadyDispatched(order: Order): boolean {
  if (!order) return false;
  return (
    order.status === 'DISPATCHED' ||
    order.status === 'DELIVERED' ||
    Boolean(order.dispatched_at)
  );
}

/**
 * Resolves the effective dispatch_date (YYYY-MM-DD in IST) for an order:
 * 1. Explicit `order.dispatch_date` if stamped at confirmation or carry-forward.
 * 2. Derived `D + 1` (IST) from `order.confirmed_at`.
 * 3. Legacy fallback (`verified_at` or `order_date` + 1 day) for historical confirmed orders
 *    created before dispatch_date stamping — cleanly isolating them into Prior Backlog.
 */
export function getOrderEffectiveDispatchDate(order: Order): string {
  if (order.dispatch_date && DATE_ONLY_REGEX.test(order.dispatch_date.trim())) {
    return order.dispatch_date.trim();
  }
  if (order.confirmed_at) {
    return addDaysToYYYYMMDD(getISTDateString(order.confirmed_at), 1);
  }
  const legacyAnchor = order.verified_at || order.invoiced_at || order.order_date;
  if (legacyAnchor) {
    return addDaysToYYYYMMDD(getISTDateString(legacyAnchor), 1);
  }
  return getISTDateString();
}

export interface PartitionedDispatchOrders {
  targetDispatchDate: string;
  freshBatchOrders: Order[];
  priorBacklogOrders: Order[];
  futureScheduledOrders: Order[];
  dispatchedForDateOrders: Order[];
}

/**
 * Partitions confirmed orders strictly by `targetDispatchDate` (default Tomorrow IST):
 * - freshBatchOrders: un-dispatched confirmed orders scheduled strictly for `targetDispatchDate`
 * - priorBacklogOrders: older un-dispatched confirmed orders (`dispatch_date < targetDispatchDate`)
 * - futureScheduledOrders: orders scheduled for dates after `targetDispatchDate`
 * - dispatchedForDateOrders: already-dispatched orders belonging to `targetDispatchDate`
 */
export function partitionDispatchOrdersForDate(
  orders: Order[],
  targetDispatchDate: string = getTomorrowISTDateString()
): PartitionedDispatchOrders {
  const normalizedTarget = DATE_ONLY_REGEX.test(targetDispatchDate)
    ? targetDispatchDate
    : getISTDateString(targetDispatchDate);

  const freshBatchOrders: Order[] = [];
  const priorBacklogOrders: Order[] = [];
  const futureScheduledOrders: Order[] = [];
  const dispatchedForDateOrders: Order[] = [];

  for (const ord of orders || []) {
    if (!ord || ord.status === 'CANCELLED') continue;

    const effDate = getOrderEffectiveDispatchDate(ord);

    if (isOrderAlreadyDispatched(ord)) {
      if (effDate === normalizedTarget) {
        dispatchedForDateOrders.push(ord);
      }
      continue;
    }

    if (!isOrderStageEligibleForDispatchQueue(ord)) {
      continue;
    }

    if (effDate === normalizedTarget) {
      freshBatchOrders.push(ord);
    } else if (effDate < normalizedTarget) {
      priorBacklogOrders.push(ord);
    } else {
      futureScheduledOrders.push(ord);
    }
  }

  return {
    targetDispatchDate: normalizedTarget,
    freshBatchOrders,
    priorBacklogOrders,
    futureScheduledOrders,
    dispatchedForDateOrders,
  };
}

export interface DispatchBatchSummary {
  batchId: string;
  dispatchDate: string;
  dispatchPointId: string;
  dispatchPointName: string;
  dispatchPointCode: string;
  totalOrders: number;
  dispatchedCount: number;
  pendingCount: number;
  invoicedCount: number;
  totalUnits: number;
  totalValue: number;
  status: 'FINALIZED' | 'PARTIAL' | 'QUEUED';
  companyNames: string[];
  partyNames: string[];
  orders: Order[];
}

/**
 * Builds daily dispatch batch history summaries grouped by (dispatch_date x dispatch_point_id)
 * for audit & reporting across confirmed, invoiced, and dispatched batches.
 */
export function buildDispatchBatchHistorySummaries(
  orders: Order[],
  dispatchPoints: DispatchPoint[] = [],
  companies: Company[] = [],
  skus: SKU[] = []
): DispatchBatchSummary[] {
  const map = new Map<string, DispatchBatchSummary>();

  for (const ord of orders || []) {
    if (!ord || ord.status === 'CANCELLED') continue;
    const isConfirmedOrPost =
      isOrderStageEligibleForDispatchQueue(ord) || isOrderAlreadyDispatched(ord);
    if (!isConfirmedOrPost) continue;

    const dispatchDate = getOrderEffectiveDispatchDate(ord);
    const resolvedDpId = resolveOrderPrimaryDispatchPointId(ord, companies, skus, dispatchPoints);
    const dpObj = resolvedDpId !== UNMAPPED_DISPATCH_POINT_ID
      ? dispatchPoints.find((d) => d.id === resolvedDpId)
      : undefined;
    const dpId = dpObj ? dpObj.id : UNMAPPED_DISPATCH_POINT_ID;
    const key = `${dispatchDate}__${dpId}`;

    let entry = map.get(key);
    if (!entry) {
      entry = {
        batchId: ord.dispatch_batch_id || `BATCH-${dispatchDate}`,
        dispatchDate,
        dispatchPointId: dpId,
        dispatchPointName: dpObj?.name || UNMAPPED_DISPATCH_POINT_LABEL,
        dispatchPointCode: dpObj?.code || 'UNMAPPED',
        totalOrders: 0,
        dispatchedCount: 0,
        pendingCount: 0,
        invoicedCount: 0,
        totalUnits: 0,
        totalValue: 0,
        status: 'QUEUED',
        companyNames: [],
        partyNames: [],
        orders: [],
      };
      map.set(key, entry);
    }

    entry.totalOrders += 1;
    if (isOrderAlreadyDispatched(ord)) {
      entry.dispatchedCount += 1;
    } else {
      entry.pendingCount += 1;
    }
    if (ord.status === 'INVOICED' || Boolean(ord.invoiced_at)) {
      entry.invoicedCount += 1;
    }

    const orderUnits = (ord.lines || []).reduce(
      (sum, l) => sum + (l.verified_quantity != null ? Number(l.verified_quantity) : Number(l.quantity) || 0),
      0
    );
    entry.totalUnits += orderUnits;
    entry.totalValue += Number(ord.total_amount) || 0;

    if (ord.retailer_name_raw && !entry.partyNames.includes(ord.retailer_name_raw)) {
      entry.partyNames.push(ord.retailer_name_raw);
    }

    (ord.lines || []).forEach((l) => {
      const compId = l.company_id || skus.find((s) => s.id === l.sku_id)?.company_id || ord.company_id;
      const comp = companies.find((c) => c.id === compId);
      const compLabel = comp?.name || l.company_name;
      if (compLabel && !entry!.companyNames.includes(compLabel)) {
        entry!.companyNames.push(compLabel);
      }
    });

    entry.orders.push(ord);
  }

  const list = Array.from(map.values()).map((entry) => {
    const status: DispatchBatchSummary['status'] =
      entry.pendingCount === 0 && entry.dispatchedCount > 0
        ? 'FINALIZED'
        : entry.dispatchedCount > 0
        ? 'PARTIAL'
        : 'QUEUED';
    return {
      ...entry,
      totalValue: Math.round(entry.totalValue * 100) / 100,
      status,
    };
  });

  return list.sort((a, b) => {
    const dateCmp = b.dispatchDate.localeCompare(a.dispatchDate);
    if (dateCmp !== 0) return dateCmp;
    return a.dispatchPointName.localeCompare(b.dispatchPointName);
  });
}
