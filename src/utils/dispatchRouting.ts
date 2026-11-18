import { Company, DispatchPoint, Order, OrderLine, SKU, User } from '../types';

export interface SplitDispatchBreakdown {
  dispatchPointId: string;
  dispatchPointName: string;
  dispatchPointCode: string;
  address: string;
  phone: string;
  supervisorName: string;
  orderId: string;
  orderNumber: string;
  companies: { id: string; name: string; code: string }[];
  skuCount: number;
  unitsCount: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
}

export interface DispatchMatrixPartyColumn {
  partyKey: string;
  partyName: string;
  raiserRoleLabel: 'CFS' | 'SR' | 'Distributor' | 'Direct';
  raiserName: string;
  headerLabel: string;
  beatName: string;
  orderNumbers: string[];
  totalQuantity: number;
}

export interface DispatchMatrixSkuRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  packSize: string;
  quantitiesByPartyKey: Record<string, number>;
  totalQuantity: number;
}

export interface DispatchSkuPartyMatrix {
  dispatchPointId: string;
  dispatchPointName: string;
  dispatchPointCode: string;
  mappedCompanyIds: string[];
  mappedCompanyNames: string[];
  parties: DispatchMatrixPartyColumn[];
  rows: DispatchMatrixSkuRow[];
  grandTotalQuantity: number;
  sourceOrderCount: number;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefinedDeep(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

export function getCompanyIdsForDispatchPoint(
  dpId: string,
  companies: Pick<Company, 'id' | 'dispatch_point_id'>[] = []
): Set<string> {
  if (!dpId || dpId === 'ALL') {
    return new Set(companies.map((c) => c.id));
  }
  return new Set(companies.filter((c) => c.dispatch_point_id === dpId).map((c) => c.id));
}

export function getEffectiveLineCompanyId(
  line: Partial<OrderLine>,
  order: Partial<Order>,
  skus: Pick<SKU, 'id' | 'company_id'>[] = []
): string {
  if (line.company_id) return line.company_id;
  const matchedSku = line.sku_id ? skus.find((s) => s.id === line.sku_id) : undefined;
  if (matchedSku?.company_id) return matchedSku.company_id;
  if (order.company_id && order.company_id !== 'MULTI') return order.company_id;
  if (Array.isArray(order.company_ids) && order.company_ids.length === 1) return order.company_ids[0];
  return '';
}

export function resolveDispatchPointIdForCompany(
  companyId: string,
  companies: Pick<Company, 'id' | 'dispatch_point_id'>[] = [],
  fallbackDpId: string = 'dp_central'
): string {
  if (companyId) {
    const comp = companies.find((c) => c.id === companyId);
    if (comp?.dispatch_point_id) return comp.dispatch_point_id;
  }
  return fallbackDpId;
}

export function doesOrderLineBelongToDispatchPoint(
  line: Partial<OrderLine>,
  order: Partial<Order>,
  dpId: string,
  companies: Pick<Company, 'id' | 'dispatch_point_id'>[] = [],
  skus: Pick<SKU, 'id' | 'company_id'>[] = []
): boolean {
  if (!dpId || dpId === 'ALL') return true;
  const compId = getEffectiveLineCompanyId(line, order, skus);
  if (compId) {
    const comp = companies.find((c) => c.id === compId);
    if (comp?.dispatch_point_id) {
      return comp.dispatch_point_id === dpId;
    }
  }
  return order.dispatch_point_id === dpId;
}

export function doesOrderBelongToDispatchPoint(
  order: Order,
  dpId: string,
  companies: Pick<Company, 'id' | 'dispatch_point_id'>[] = [],
  skus: Pick<SKU, 'id' | 'company_id'>[] = []
): boolean {
  if (!dpId || dpId === 'ALL') return true;
  const lines = order.lines || [];
  if (lines.length > 0) {
    return lines.some((l) => doesOrderLineBelongToDispatchPoint(l, order, dpId, companies, skus));
  }
  if (order.company_id && order.company_id !== 'MULTI') {
    const comp = companies.find((c) => c.id === order.company_id);
    if (comp?.dispatch_point_id) return comp.dispatch_point_id === dpId;
  }
  return order.dispatch_point_id === dpId;
}

function recalculateLinesFinancials(
  lines: OrderLine[],
  skus: Pick<SKU, 'id' | 'company_id' | 'tax_rate' | 'landing_price'>[] = [],
  companies: Pick<Company, 'id' | 'name'>[] = []
): {
  lines: OrderLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  companyIds: string[];
  hasBelowCost: boolean;
} {
  let subtotal = 0;
  let totalTax = 0;
  let hasBelowCost = false;
  const companySet = new Set<string>();

  const enrichedLines = lines.map((line) => {
    const sku = skus.find((s) => s.id === line.sku_id);
    const compId = line.company_id || sku?.company_id || '';
    const comp = compId ? companies.find((c) => c.id === compId) : undefined;

    const qty = Number(line.quantity) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const discountPct = Number(line.discount_percentage) || 0;
    const gross = qty * unitPrice;
    const discountAmt =
      line.discount_amount != null && Number(line.discount_amount) > 0
        ? Number(line.discount_amount)
        : discountPct > 0
        ? Math.round((gross * discountPct) / 100 * 100) / 100
        : 0;
    const lineTotal =
      line.total != null && !Number.isNaN(Number(line.total))
        ? Math.round(Number(line.total) * 100) / 100
        : Math.round((gross - discountAmt) * 100) / 100;

    const taxRate = sku?.tax_rate !== undefined ? Number(sku.tax_rate) : 18;
    const lineTax = lineTotal * (taxRate / 100);
    const landing = Number(line.landing_price) || sku?.landing_price || 0;
    const isBelow = Boolean(line.is_below_cost) || (landing > 0 && unitPrice < landing);

    if (isBelow) hasBelowCost = true;
    if (compId) companySet.add(compId);
    subtotal += lineTotal;
    totalTax += lineTax;

    return {
      ...line,
      company_id: compId || line.company_id,
      company_name: line.company_name || comp?.name || line.company_name,
      total: lineTotal,
      is_below_cost: isBelow,
    };
  });

  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const roundedTax = Math.round(totalTax * 100) / 100;
  const roundedTotal = Math.round((roundedSubtotal + roundedTax) * 100) / 100;

  return {
    lines: enrichedLines,
    subtotal: roundedSubtotal,
    taxAmount: roundedTax,
    totalAmount: roundedTotal,
    companyIds: Array.from(companySet),
    hasBelowCost,
  };
}

/**
 * Dynamically splits an order across multiple Dispatch Points when its line items belong
 * to Principal Companies mapped to different Dispatch Points.
 *
 * - Single Dispatch Point: returns 1 normalized order with `dispatch_point_id` aligned to the company's DP.
 * - Multiple Dispatch Points: returns N split child orders (`-DP1`, `-DP2`, ...), each linked via
 *   `parent_order_id`, routed to its own Dispatch Point, and with recalculated GST & totals.
 */
export function splitOrderByDispatchPoint(
  order: Order,
  companies: Company[] = [],
  skus: SKU[] = [],
  dispatchPoints: DispatchPoint[] = []
): Order[] {
  const fallbackDpId = order.dispatch_point_id || dispatchPoints[0]?.id || 'dp_central';
  const lines = order.lines || [];

  // Already explicitly split child order or empty lines: keep as single normalized order
  if (order.parent_order_id || lines.length === 0) {
    const singleCompId = order.company_id && order.company_id !== 'MULTI' ? order.company_id : order.company_ids?.[0] || '';
    const resolvedDpId = singleCompId
      ? resolveDispatchPointIdForCompany(singleCompId, companies, fallbackDpId)
      : fallbackDpId;
    return [stripUndefinedDeep({ ...order, dispatch_point_id: resolvedDpId })];
  }

  // Group lines by resolved Dispatch Point ID
  const groupsMap = new Map<string, OrderLine[]>();
  for (const line of lines) {
    const compId = getEffectiveLineCompanyId(line, order, skus);
    const targetDpId = resolveDispatchPointIdForCompany(compId, companies, fallbackDpId);
    const list = groupsMap.get(targetDpId) || [];
    list.push({
      ...line,
      company_id: compId || line.company_id,
      company_name: line.company_name || companies.find((c) => c.id === compId)?.name,
    });
    groupsMap.set(targetDpId, list);
  }

  const dpEntries = Array.from(groupsMap.entries());

  // All lines map to a single Dispatch Point: align dispatch_point_id cleanly without suffixing
  if (dpEntries.length <= 1) {
    const targetDpId = dpEntries[0]?.[0] || fallbackDpId;
    const targetLines = dpEntries[0]?.[1] || lines;
    const companySet = new Set<string>();
    targetLines.forEach((l) => {
      if (l.company_id) companySet.add(l.company_id);
    });
    const companyIds = companySet.size > 0 ? Array.from(companySet) : (order.company_ids || (order.company_id ? [order.company_id] : []));

    return [
      stripUndefinedDeep({
        ...order,
        dispatch_point_id: targetDpId,
        company_id: companyIds.length === 1 ? companyIds[0] : (companyIds.length > 1 ? 'MULTI' : order.company_id),
        company_ids: companyIds,
        lines: targetLines,
      }),
    ];
  }

  // Multi-Dispatch Point Split: produce 1 child order per Dispatch Point
  const totalParts = dpEntries.length;
  const splitOrders: Order[] = dpEntries.map(([dpId, dpLines], idx) => {
    const childId = `${order.id}_dp_${idx + 1}`;
    const childOrderNumber = `${order.order_number}-DP${idx + 1}`;
    const dpObj = dispatchPoints.find((d) => d.id === dpId);
    const dpLabel = dpObj ? `${dpObj.name} (${dpObj.code})` : dpId;

    const {
      lines: financialsLines,
      taxAmount,
      totalAmount,
      companyIds,
      hasBelowCost,
    } = recalculateLinesFinancials(dpLines, skus, companies);

    const companyNames = companyIds
      .map((cid) => companies.find((c) => c.id === cid)?.name || cid)
      .filter(Boolean);

    const relinkedLines = financialsLines.map((l) => ({
      ...l,
      order_id: childId,
    }));

    const splitNote = `[Auto-Split ${idx + 1}/${totalParts} -> ${dpLabel} | ${companyNames.join(', ')}]`;

    return stripUndefinedDeep({
      ...order,
      id: childId,
      firestore_doc_id: childId,
      order_number: childOrderNumber,
      parent_order_id: order.id,
      split_sequence: idx + 1,
      dispatch_point_id: dpId,
      company_id: companyIds.length === 1 ? companyIds[0] : 'MULTI',
      company_ids: companyIds,
      lines: relinkedLines,
      total_amount: totalAmount,
      original_total_amount: totalAmount,
      tax_amount: taxAmount,
      has_below_cost_lines: hasBelowCost,
      notes: order.notes ? `${order.notes} | ${splitNote}` : splitNote,
      exception_comment: order.exception_comment
        ? `${splitNote} ${order.exception_comment}`
        : splitNote,
    });
  });

  return splitOrders;
}

/**
 * Computes human-readable pickup Dispatch Point breakdown across one or more orders
 * (or sibling split orders sharing the same parent_order_id) for field raiser visibility.
 */
export function getDispatchPickupBreakdown(
  orders: Order[],
  companies: Company[] = [],
  skus: SKU[] = [],
  dispatchPoints: DispatchPoint[] = []
): SplitDispatchBreakdown[] {
  const byDpId = new Map<
    string,
    {
      dpId: string;
      orderId: string;
      orderNumbers: Set<string>;
      companyIds: Set<string>;
      skuIds: Set<string>;
      unitsCount: number;
      subtotal: number;
      gstAmount: number;
      totalAmount: number;
    }
  >();

  for (const ord of orders) {
    const lines = ord.lines || [];
    if (lines.length === 0) {
      const dpId = ord.dispatch_point_id || dispatchPoints[0]?.id || 'dp_central';
      const bucket = byDpId.get(dpId) || {
        dpId,
        orderId: ord.id,
        orderNumbers: new Set<string>(),
        companyIds: new Set<string>(),
        skuIds: new Set<string>(),
        unitsCount: 0,
        subtotal: 0,
        gstAmount: 0,
        totalAmount: 0,
      };
      bucket.orderNumbers.add(ord.order_number);
      if (ord.company_id && ord.company_id !== 'MULTI') bucket.companyIds.add(ord.company_id);
      bucket.totalAmount += Number(ord.total_amount) || 0;
      bucket.gstAmount += Number(ord.tax_amount) || 0;
      bucket.subtotal += Math.max(0, (Number(ord.total_amount) || 0) - (Number(ord.tax_amount) || 0));
      byDpId.set(dpId, bucket);
      continue;
    }

    for (const line of lines) {
      const compId = getEffectiveLineCompanyId(line, ord, skus);
      const dpId = resolveDispatchPointIdForCompany(
        compId,
        companies,
        ord.dispatch_point_id || dispatchPoints[0]?.id || 'dp_central'
      );
      const bucket = byDpId.get(dpId) || {
        dpId,
        orderId: ord.id,
        orderNumbers: new Set<string>(),
        companyIds: new Set<string>(),
        skuIds: new Set<string>(),
        unitsCount: 0,
        subtotal: 0,
        gstAmount: 0,
        totalAmount: 0,
      };
      bucket.orderNumbers.add(ord.order_number);
      if (compId) bucket.companyIds.add(compId);
      if (line.sku_id) bucket.skuIds.add(line.sku_id);
      const qty = Number(line.quantity) || 0;
      const lineTotal =
        line.total != null && !Number.isNaN(Number(line.total))
          ? Number(line.total)
          : qty * (Number(line.unit_price) || 0);
      const skuObj = skus.find((s) => s.id === line.sku_id);
      const taxRate = skuObj?.tax_rate !== undefined ? Number(skuObj.tax_rate) : 18;
      const lineTax = lineTotal * (taxRate / 100);

      bucket.unitsCount += qty;
      bucket.subtotal += lineTotal;
      bucket.gstAmount += lineTax;
      bucket.totalAmount += lineTotal + lineTax;
      byDpId.set(dpId, bucket);
    }
  }

  return Array.from(byDpId.values()).map((bucket) => {
    const dp = dispatchPoints.find((d) => d.id === bucket.dpId);
    const comps = Array.from(bucket.companyIds).map((cid) => {
      const c = companies.find((comp) => comp.id === cid);
      return {
        id: cid,
        name: c?.name || cid,
        code: c?.code || 'CO',
      };
    });

    return {
      dispatchPointId: bucket.dpId,
      dispatchPointName: dp?.name || bucket.dpId,
      dispatchPointCode: dp?.code || 'DP',
      address: dp?.address || '',
      phone: dp?.phone || '',
      supervisorName: resolveDispatchPointSupervisor(dp).supervisorName,
      orderId: bucket.orderId,
      orderNumber: Array.from(bucket.orderNumbers).join(', '),
      companies: comps,
      skuCount: bucket.skuIds.size,
      unitsCount: bucket.unitsCount,
      subtotal: Math.round(bucket.subtotal * 100) / 100,
      gstAmount: Math.round(bucket.gstAmount * 100) / 100,
      totalAmount: Math.round(bucket.totalAmount * 100) / 100,
    };
  });
}

function resolvePartyRaiserInfo(
  order: Order,
  users: User[] = []
): { roleLabel: 'CFS' | 'SR' | 'Distributor' | 'Direct'; raiserName: string } {
  const sourceRole = order.order_source_role;
  const raiserUser = users.find(
    (u) => u.id === order.created_by_user_id || u.id === order.commission_agent_id
  );
  const role = sourceRole || raiserUser?.role || '';

  if (role === 'COMMISSION_AGENT' || (!role && order.commission_agent_id)) {
    return {
      roleLabel: 'CFS',
      raiserName: order.commission_agent_name || order.order_raiser_name || raiserUser?.name || 'CFS',
    };
  }
  if (role === 'SALES_EXECUTIVE') {
    return {
      roleLabel: 'SR',
      raiserName: order.order_raiser_name || raiserUser?.name || 'Sales Rep',
    };
  }
  if (role === 'DISTRIBUTOR' || order.channel === 'DISTRIBUTOR') {
    return {
      roleLabel: 'Distributor',
      raiserName: order.order_raiser_name || raiserUser?.name || order.retailer_name_raw || 'Distributor',
    };
  }
  return {
    roleLabel: 'Direct',
    raiserName: order.order_raiser_name || raiserUser?.name || 'Direct',
  };
}

/**
 * Builds an SKU-vs-Party Dispatch Sheet Matrix for a single Dispatch Point (or all):
 * - Rows (Column A): SKU Names strictly filtered to companies mapped to `dispatchPointId`.
 * - Columns (Row 1): Party Names (annotated with CFS / SR / Distributor role & raiser when applicable).
 */
export function buildDispatchSkuPartyMatrix(
  orders: Order[],
  dispatchPointId: string | 'ALL',
  companies: Company[] = [],
  skus: SKU[] = [],
  users: User[] = [],
  dispatchPoints: DispatchPoint[] = []
): DispatchSkuPartyMatrix {
  const dpObj = dispatchPoints.find((d) => d.id === dispatchPointId);
  const mappedCompanies =
    dispatchPointId === 'ALL'
      ? companies
      : companies.filter((c) => c.dispatch_point_id === dispatchPointId);
  const mappedCompanyIds = mappedCompanies.map((c) => c.id);
  const mappedCompanyIdSet = new Set(mappedCompanyIds);

  const partyMap = new Map<string, DispatchMatrixPartyColumn>();
  const rowMap = new Map<string, DispatchMatrixSkuRow>();
  const includedOrderIds = new Set<string>();

  for (const ord of orders) {
    const lines = ord.lines || [];
    for (const line of lines) {
      const compId = getEffectiveLineCompanyId(line, ord, skus);
      const skuObj = skus.find((s) => s.id === line.sku_id);

      // Strict Principal Company -> Dispatch Point scoping
      if (dispatchPointId !== 'ALL') {
        if (compId && mappedCompanyIdSet.size > 0) {
          if (!mappedCompanyIdSet.has(compId)) continue;
        } else if (!doesOrderLineBelongToDispatchPoint(line, ord, dispatchPointId, companies, skus)) {
          continue;
        }
      }

      const qty = line.verified_quantity != null ? Number(line.verified_quantity) : Number(line.quantity) || 0;
      if (qty <= 0) continue;

      includedOrderIds.add(ord.id);

      const { roleLabel, raiserName } = resolvePartyRaiserInfo(ord, users);
      const partyDisplayName = ord.retailer_name_raw || 'Unknown Party';
      const partyKey = `${(ord.retailer_id || partyDisplayName).trim().toLowerCase()}__${roleLabel}`;

      let partyCol = partyMap.get(partyKey);
      if (!partyCol) {
        const showRaiser =
          roleLabel !== 'Direct' &&
          raiserName &&
          raiserName.trim().toLowerCase() !== partyDisplayName.trim().toLowerCase();
        const headerLabel = showRaiser
          ? `${partyDisplayName} (${roleLabel}: ${raiserName})`
          : `${partyDisplayName} (${roleLabel})`;

        partyCol = {
          partyKey,
          partyName: partyDisplayName,
          raiserRoleLabel: roleLabel,
          raiserName,
          headerLabel,
          beatName: ord.beat_name || '',
          orderNumbers: [],
          totalQuantity: 0,
        };
        partyMap.set(partyKey, partyCol);
      }

      if (!partyCol.orderNumbers.includes(ord.order_number)) {
        partyCol.orderNumbers.push(ord.order_number);
      }
      partyCol.totalQuantity += qty;

      const resolvedCompId = compId || skuObj?.company_id || '';
      const compObj = companies.find((c) => c.id === resolvedCompId);
      const rowKey = line.sku_id || line.sku_name;

      let skuRow = rowMap.get(rowKey);
      if (!skuRow) {
        skuRow = {
          skuId: line.sku_id,
          skuCode: skuObj?.code || 'SKU',
          skuName: skuObj?.name || line.sku_name || 'Product',
          companyId: resolvedCompId,
          companyName: compObj?.name || line.company_name || 'Principal Company',
          companyCode: compObj?.code || 'CO',
          packSize: skuObj?.pack_size || '1x12',
          quantitiesByPartyKey: {},
          totalQuantity: 0,
        };
        rowMap.set(rowKey, skuRow);
      }

      skuRow.quantitiesByPartyKey[partyKey] = (skuRow.quantitiesByPartyKey[partyKey] || 0) + qty;
      skuRow.totalQuantity += qty;
    }
  }

  const parties = Array.from(partyMap.values()).sort((a, b) =>
    a.partyName.localeCompare(b.partyName)
  );
  const rows = Array.from(rowMap.values()).sort((a, b) => {
    const compCmp = a.companyName.localeCompare(b.companyName);
    return compCmp !== 0 ? compCmp : a.skuName.localeCompare(b.skuName);
  });

  const grandTotalQuantity = rows.reduce((sum, r) => sum + r.totalQuantity, 0);

  return {
    dispatchPointId,
    dispatchPointName:
      dispatchPointId === 'ALL'
        ? 'All Dispatch Points'
        : dpObj?.name || dispatchPointId,
    dispatchPointCode:
      dispatchPointId === 'ALL'
        ? 'ALL'
        : dpObj?.code || 'DP',
    mappedCompanyIds,
    mappedCompanyNames: mappedCompanies.map((c) => c.name),
    parties,
    rows,
    grandTotalQuantity,
    sourceOrderCount: includedOrderIds.size,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Serializes a SKU-vs-Party Dispatch Matrix into CSV:
 * - Column A: SKU Name
 * - Row 1: Party Names (B1..N1), plus Total Qty
 */
export function serializeDispatchMatrixToCsv(matrix: DispatchSkuPartyMatrix): string {
  const headerRow = [
    escapeCsvCell('SKU Name'),
    ...matrix.parties.map((p) => escapeCsvCell(p.headerLabel)),
    escapeCsvCell('Total Qty'),
  ].join(',');

  const bodyRows = matrix.rows.map((row) =>
    [
      escapeCsvCell(row.skuName),
      ...matrix.parties.map((p) => row.quantitiesByPartyKey[p.partyKey] || 0),
      row.totalQuantity,
    ].join(',')
  );

  const totalRow = [
    escapeCsvCell('TOTAL QTY'),
    ...matrix.parties.map((p) => p.totalQuantity),
    matrix.grandTotalQuantity,
  ].join(',');

  return [headerRow, ...bodyRows, totalRow].join('\n');
}

const PLACEHOLDER_SUPERVISOR_NAMES = new Set([
  '',
  'supervisor',
  'no supervisor',
  'n/a',
  'na',
  'unassigned',
  'none',
]);

export function isPlaceholderSupervisor(name?: string | null): boolean {
  const normalized = String(name || '').trim().toLowerCase();
  return PLACEHOLDER_SUPERVISOR_NAMES.has(normalized);
}

/**
 * Resolves the authoritative supervisor for a Dispatch Point from linked DISPATCHER users
 * (preferring dp.dispatcher_user_id, then any active DISPATCHER assigned to dp.id).
 * Falls back cleanly to 'No Supervisor' rather than showing stale placeholder values.
 */
export function resolveDispatchPointSupervisor(
  dp: DispatchPoint | null | undefined,
  users: User[] = []
): { supervisorName: string; dispatcherUserId?: string; phone: string; isAssignedDispatcher: boolean } {
  if (!dp) {
    return { supervisorName: 'No Supervisor', phone: '', isAssignedDispatcher: false };
  }

  const activeDispatchers = (users || []).filter(
    (u) =>
      u.role === 'DISPATCHER' &&
      u.is_active !== false &&
      (!dp.tenant_id || !u.tenant_id || u.tenant_id === dp.tenant_id)
  );

  const matchedDispatcher =
    (dp.dispatcher_user_id
      ? activeDispatchers.find(
          (u) =>
            u.id === dp.dispatcher_user_id &&
            (!u.dispatch_point_id || u.dispatch_point_id === dp.id)
        )
      : undefined) ||
    activeDispatchers.find((u) => u.dispatch_point_id === dp.id);

  if (matchedDispatcher) {
    return {
      supervisorName: matchedDispatcher.name,
      dispatcherUserId: matchedDispatcher.id,
      phone: matchedDispatcher.mobile_number
        ? `+91 ${matchedDispatcher.mobile_number}`
        : (dp.phone || ''),
      isAssignedDispatcher: true,
    };
  }

  const hasValidExplicitSupervisor =
    !dp.dispatcher_user_id && !isPlaceholderSupervisor(dp.supervisor_name);

  if (hasValidExplicitSupervisor) {
    return {
      supervisorName: dp.supervisor_name.trim(),
      dispatcherUserId: undefined,
      phone: dp.phone || '',
      isAssignedDispatcher: false,
    };
  }

  return {
    supervisorName: 'No Supervisor',
    dispatcherUserId: undefined,
    phone: dp.phone || '',
    isAssignedDispatcher: false,
  };
}

/**
 * Synchronizes DispatchPoint supervisor metadata (`supervisor_name`, `dispatcher_user_id`, `phone`)
 * against the latest list of users (e.g., after Dispatcher creation, warehouse reassignment, or deletion).
 */
export function syncDispatchPointsForUsers(
  dispatchPoints: DispatchPoint[],
  users: User[],
  affectedDpIds?: (string | null | undefined)[]
): { updatedDispatchPoints: DispatchPoint[]; changedDispatchPoints: DispatchPoint[] } {
  const filterSet =
    affectedDpIds && affectedDpIds.length > 0
      ? new Set(affectedDpIds.filter((id): id is string => Boolean(id)))
      : null;

  const changedDispatchPoints: DispatchPoint[] = [];

  const updatedDispatchPoints = (dispatchPoints || []).map((dp) => {
    const isAffected =
      !filterSet ||
      filterSet.has(dp.id) ||
      Boolean(dp.dispatcher_user_id && !users.some((u) => u.id === dp.dispatcher_user_id && u.role === 'DISPATCHER' && u.dispatch_point_id === dp.id));

    if (!isAffected) return dp;

    const resolved = resolveDispatchPointSupervisor(dp, users);
    const nextDp: DispatchPoint = {
      ...dp,
      supervisor_name: resolved.supervisorName,
      dispatcher_user_id: resolved.dispatcherUserId,
      phone: resolved.phone || dp.phone,
    };

    const changed =
      nextDp.supervisor_name !== dp.supervisor_name ||
      nextDp.dispatcher_user_id !== dp.dispatcher_user_id ||
      nextDp.phone !== dp.phone;

    if (changed) {
      changedDispatchPoints.push(nextDp);
    }

    return nextDp;
  });

  return { updatedDispatchPoints, changedDispatchPoints };
}
