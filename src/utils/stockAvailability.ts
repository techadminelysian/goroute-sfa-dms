import { Company, Order, OrderLine, SKU, StockLedgerEntry } from '../types';
import { computeNextDayDispatchAssignment } from './dispatchBatching';
import { resolveOrderPrimaryDispatchPointId, UNMAPPED_DISPATCH_POINT_ID } from './dispatchRouting';

export interface DepotSkuStockInfo {
  skuId: string;
  physicalOnHand: number;
  reservedUndispatched: number;
  availableForConfirmation: number;
}

export interface OrderLineStockEvaluation {
  lineId: string;
  skuId: string;
  skuName: string;
  orderedQty: number;
  availableQty: number;
  fulfillableQty: number;
  shortageQty: number;
}

export type OrderDepotStockStatus = 'FULL_STOCK' | 'PARTIAL_STOCK' | 'NO_STOCK';

export interface OrderDepotEvaluation {
  orderId: string;
  orderNumber: string;
  dispatchPointId: string;
  status: OrderDepotStockStatus;
  totalOrderedQty: number;
  totalFulfillableQty: number;
  totalShortageQty: number;
  lines: OrderLineStockEvaluation[];
  isMultiCompanyOrder: boolean;
}

/**
 * Determines whether an order is awaiting physical dispatch at the depot.
 * Covers CONFIRMED, legacy APPROVED/PUNCHED_TO_PRINCIPAL, and INVOICED orders
 * whose physical DISPATCH_OUT has not yet occurred.
 */
export function isOrderAwaitingPhysicalDispatch(
  order: Order,
  stockLedger: StockLedgerEntry[] = []
): boolean {
  if (order.status === 'CANCELLED' || order.status === 'DISPATCHED' || order.status === 'DELIVERED') {
    return false;
  }
  if (order.dispatched_at) {
    return false;
  }
  const hasDispatchOutEntry = stockLedger.some(
    (st) => st.entry_type === 'DISPATCH_OUT' && st.linked_order_id === order.id
  );
  if (hasDispatchOutEntry) {
    return false;
  }

  return (
    order.status === 'CONFIRMED' ||
    order.status === 'INVOICED' ||
    order.status === 'APPROVED' ||
    order.status === 'PUNCHED_TO_PRINCIPAL'
  );
}

/**
 * Computes live depot stock availability per SKU at a given dispatch point:
 *   physicalOnHand = SUM(INWARD + RETURN) - SUM(DISPATCH_OUT + ADJUSTMENT_DAMAGE)
 *   reservedUndispatched = SUM(lines of un-dispatched CONFIRMED/INVOICED orders at same depot)
 *   availableForConfirmation = max(0, physicalOnHand - reservedUndispatched)
 */
export function getDepotAvailableStockMap(
  dispatchPointId: string,
  stockLedger: StockLedgerEntry[],
  orders: Order[],
  excludeOrderIds: string[] = []
): Record<string, DepotSkuStockInfo> {
  const map: Record<string, DepotSkuStockInfo> = {};

  const ensureEntry = (skuId: string) => {
    if (!map[skuId]) {
      map[skuId] = {
        skuId,
        physicalOnHand: 0,
        reservedUndispatched: 0,
        availableForConfirmation: 0,
      };
    }
    return map[skuId];
  };

  for (const st of stockLedger) {
    if (st.dispatch_point_id !== dispatchPointId) continue;
    const rec = ensureEntry(st.sku_id);
    const qty = Number(st.quantity) || 0;
    if (st.entry_type === 'INWARD' || st.entry_type === 'RETURN') {
      rec.physicalOnHand += qty;
    } else if (st.entry_type === 'DISPATCH_OUT' || st.entry_type === 'ADJUSTMENT_DAMAGE') {
      rec.physicalOnHand = Math.max(0, rec.physicalOnHand - qty);
    }
  }

  const excludeSet = new Set(excludeOrderIds);
  for (const ord of orders) {
    if (ord.dispatch_point_id !== dispatchPointId) continue;
    if (excludeSet.has(ord.id)) continue;
    if (!isOrderAwaitingPhysicalDispatch(ord, stockLedger)) continue;

    for (const line of ord.lines || []) {
      const rec = ensureEntry(line.sku_id);
      const q = line.verified_quantity != null ? Number(line.verified_quantity) : Number(line.quantity) || 0;
      rec.reservedUndispatched += q;
    }
  }

  for (const rec of Object.values(map)) {
    rec.availableForConfirmation = Math.max(0, rec.physicalOnHand - rec.reservedUndispatched);
  }

  return map;
}

/**
 * Sequentially evaluates a batch of orders against live depot stock so that
 * multiple orders sharing the same SKU/depot do not double-count available units.
 */
export function evaluateOrdersAgainstDepotStock(
  targetOrders: Order[],
  companyId: string,
  stockLedger: StockLedgerEntry[],
  allOrders: Order[],
  skus: SKU[],
  companies: Company[] = []
): Record<string, OrderDepotEvaluation> {
  const results: Record<string, OrderDepotEvaluation> = {};

  // Build mutable remaining stock per dispatch_point_id -> sku_id
  const remainingByDepot: Record<string, Record<string, number>> = {};

  const getRemainingForDepot = (dpId: string) => {
    if (!remainingByDepot[dpId]) {
      const stockMap = getDepotAvailableStockMap(dpId, stockLedger, allOrders);
      const rem: Record<string, number> = {};
      for (const [skuId, info] of Object.entries(stockMap)) {
        rem[skuId] = info.availableForConfirmation;
      }
      remainingByDepot[dpId] = rem;
    }
    return remainingByDepot[dpId];
  };

  for (const ord of targetOrders) {
    const resolvedFromCompany =
      companies.length > 0
        ? resolveOrderPrimaryDispatchPointId(ord, companies, skus)
        : UNMAPPED_DISPATCH_POINT_ID;
    const dpId =
      resolvedFromCompany !== UNMAPPED_DISPATCH_POINT_ID
        ? resolvedFromCompany
        : (ord.dispatch_point_id || UNMAPPED_DISPATCH_POINT_ID);
    const rem = getRemainingForDepot(dpId);
    const allLines = ord.lines || [];

    const companySet = new Set<string>();
    for (const l of allLines) {
      const skuComp = l.company_id || skus.find((s) => s.id === l.sku_id)?.company_id;
      if (skuComp) companySet.add(skuComp);
    }
    const isMultiCompanyOrder = companySet.size > 1;

    let totalOrderedQty = 0;
    let totalFulfillableQty = 0;
    let totalShortageQty = 0;
    const lineEvals: OrderLineStockEvaluation[] = [];

    for (const l of allLines) {
      const skuComp = l.company_id || skus.find((s) => s.id === l.sku_id)?.company_id;
      // Within a company card, lines of other companies cannot be fast-tracked silently unless evaluated too
      const isTargetCompanyLine = !companyId || companyId === 'ALL' || skuComp === companyId || !skuComp;
      const orderedQty = l.verified_quantity != null ? Number(l.verified_quantity) : Number(l.quantity) || 0;
      const avail = isTargetCompanyLine ? Math.max(0, rem[l.sku_id] || 0) : 0;
      const fulfillableQty = isTargetCompanyLine ? Math.min(orderedQty, avail) : 0;
      const shortageQty = Math.max(0, orderedQty - fulfillableQty);

      if (isTargetCompanyLine && fulfillableQty > 0) {
        rem[l.sku_id] = avail - fulfillableQty;
      }

      totalOrderedQty += orderedQty;
      totalFulfillableQty += fulfillableQty;
      totalShortageQty += shortageQty;

      lineEvals.push({
        lineId: l.id,
        skuId: l.sku_id,
        skuName: l.sku_name,
        orderedQty,
        availableQty: avail,
        fulfillableQty,
        shortageQty,
      });
    }

    const status: OrderDepotStockStatus =
      totalOrderedQty > 0 && totalShortageQty === 0
        ? 'FULL_STOCK'
        : totalFulfillableQty > 0
        ? 'PARTIAL_STOCK'
        : 'NO_STOCK';

    results[ord.id] = {
      orderId: ord.id,
      orderNumber: ord.order_number,
      dispatchPointId: dpId,
      status,
      totalOrderedQty,
      totalFulfillableQty,
      totalShortageQty,
      lines: lineEvals,
      isMultiCompanyOrder,
    };
  }

  return results;
}

function recalculateOrderFinancials(lines: OrderLine[], skus: SKU[]): {
  lines: OrderLine[];
  totalAmount: number;
  taxAmount: number;
  companyIds: string[];
  hasBelowCost: boolean;
} {
  let subtotal = 0;
  let totalTax = 0;
  let hasBelowCost = false;
  const companySet = new Set<string>();

  const normalizedLines = lines.map((l) => {
    const sku = skus.find((s) => s.id === l.sku_id);
    const qty = Number(l.quantity) || 0;
    const unitPrice = Number(l.unit_price) || 0;
    const discountPct = Number(l.discount_percentage) || 0;
    const grossBeforeDisc = qty * unitPrice;
    const discountAmt = discountPct > 0 ? Math.round((grossBeforeDisc * discountPct) / 100 * 100) / 100 : 0;
    const lineTotal = Math.round((grossBeforeDisc - discountAmt) * 100) / 100;
    const taxRate = sku?.tax_rate !== undefined ? Number(sku.tax_rate) : 18;
    const lineTax = Math.round(lineTotal * (taxRate / 100) * 100) / 100;
    const landing = Number(l.landing_price) || sku?.landing_price || 0;
    const isBelow = landing > 0 && unitPrice < landing;

    if (isBelow) hasBelowCost = true;
    if (l.company_id || sku?.company_id) {
      companySet.add((l.company_id || sku?.company_id)!);
    }

    subtotal += lineTotal;
    totalTax += lineTax;

    return {
      ...l,
      quantity: qty,
      verified_quantity: qty,
      discount_amount: discountAmt,
      total: lineTotal,
      is_below_cost: isBelow,
      expected_claim_total: isBelow ? Math.round((landing - unitPrice) * qty * 100) / 100 : 0,
    };
  });

  return {
    lines: normalizedLines,
    totalAmount: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(totalTax * 100) / 100,
    companyIds: Array.from(companySet),
    hasBelowCost,
  };
}

/**
 * Splits a VERIFIED order into:
 *  - confirmedOrder: fulfillable SKUs/quantities from depot stock (status: 'CONFIRMED', fulfillment_source: 'DEPOT_STOCK')
 *  - shortageOrder: remaining shortage quantities kept in 'VERIFIED' status for Principal PO consolidation
 */
export function buildSplitOrdersForDepotAndPO(
  order: Order,
  fulfillableQtyByLineId: Record<string, number>,
  skus: SKU[],
  confirmedByUserName: string
): {
  confirmedOrder: Order;
  shortageOrder: Order;
} {
  const now = new Date().toISOString();
  const dispatchAssignment = computeNextDayDispatchAssignment(now);
  const baseSplitSeq = (order.split_sequence || 0) + 1;
  const stkOrderId = `ord_stk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const stkOrderNumber = order.order_number.endsWith('-STK')
    ? `${order.order_number}-${baseSplitSeq}`
    : `${order.order_number}-STK`;

  const confirmedRawLines: OrderLine[] = [];
  const shortageRawLines: OrderLine[] = [];

  for (const line of order.lines || []) {
    const originalQty = line.verified_quantity != null ? Number(line.verified_quantity) : Number(line.quantity) || 0;
    const rawFulfill = fulfillableQtyByLineId[line.id] ?? fulfillableQtyByLineId[line.sku_id] ?? 0;
    const fulfillQty = Math.max(0, Math.min(originalQty, Math.floor(rawFulfill)));
    const shortageQty = Math.max(0, originalQty - fulfillQty);

    if (fulfillQty > 0) {
      confirmedRawLines.push({
        ...line,
        id: `${line.id}_stk_${baseSplitSeq}`,
        order_id: stkOrderId,
        quantity: fulfillQty,
        verified_quantity: fulfillQty,
      });
    }
    if (shortageQty > 0) {
      shortageRawLines.push({
        ...line,
        order_id: order.id,
        quantity: shortageQty,
        verified_quantity: shortageQty,
      });
    }
  }

  const confirmedFin = recalculateOrderFinancials(confirmedRawLines, skus);
  const shortageFin = recalculateOrderFinancials(shortageRawLines, skus);

  const confirmedOrder: Order = {
    ...order,
    id: stkOrderId,
    firestore_doc_id: stkOrderId,
    order_number: stkOrderNumber,
    company_id: confirmedFin.companyIds.length === 1 ? confirmedFin.companyIds[0] : (confirmedFin.companyIds.length > 1 ? 'MULTI' : order.company_id),
    company_ids: confirmedFin.companyIds.length > 0 ? confirmedFin.companyIds : order.company_ids,
    status: 'CONFIRMED',
    fulfillment_source: 'DEPOT_STOCK',
    parent_order_id: order.id,
    split_sequence: baseSplitSeq,
    confirmed_at: dispatchAssignment.confirmed_at,
    dispatch_date: dispatchAssignment.dispatch_date,
    dispatch_batch_id: dispatchAssignment.dispatch_batch_id,
    lines: confirmedFin.lines,
    total_amount: confirmedFin.totalAmount,
    original_total_amount: confirmedFin.totalAmount,
    tax_amount: confirmedFin.taxAmount,
    has_below_cost_lines: confirmedFin.hasBelowCost,
    is_locked: true,
    notes: `${order.notes ? `${order.notes} | ` : ''}Split from ${order.order_number} & confirmed from Depot Stock by ${confirmedByUserName} on ${now.split('T')[0]}`,
  };

  const shortageOrder: Order = {
    ...order,
    company_id: shortageFin.companyIds.length === 1 ? shortageFin.companyIds[0] : (shortageFin.companyIds.length > 1 ? 'MULTI' : order.company_id),
    company_ids: shortageFin.companyIds.length > 0 ? shortageFin.companyIds : order.company_ids,
    status: 'VERIFIED',
    fulfillment_source: 'PRINCIPAL_PO',
    split_sequence: baseSplitSeq,
    lines: shortageFin.lines,
    total_amount: shortageFin.totalAmount,
    original_total_amount: order.original_total_amount || order.total_amount,
    tax_amount: shortageFin.taxAmount,
    has_below_cost_lines: shortageFin.hasBelowCost,
    is_locked: true,
    notes: `${order.notes ? `${order.notes} | ` : ''}Shortage remainder queued for Principal PO (${confirmedOrder.order_number} confirmed from Depot Stock)`,
  };

  return { confirmedOrder, shortageOrder };
}
