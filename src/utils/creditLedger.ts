import {
  DistributorInstitution,
  Invoice,
  Order,
  Payment,
  Retailer,
  User,
  UserRole,
} from '../types';

export type CreditPartyKind = 'RETAILER' | 'DISTRIBUTOR_INSTITUTION' | 'USER';
export type CreditPartyCategory = 'RETAILER' | 'DISTRIBUTOR' | 'CFS';

export interface PartyCreditBreakdown {
  nonCancelledOrdersCount: number;
  nonCancelledOrdersTotal: number;
  standaloneInvoicesTotal: number;
  creditNoteDiscountsTotal: number;
  verifiedPaymentsTotal: number;
  totalLiability: number;
  creditLimit: number;
  remainingCredit: number;
  fundShortage: number;
  hasAnyTransactionHistory: boolean;
}

export interface PartyCreditRecord {
  id: string;
  partyKind: CreditPartyKind;
  category: CreditPartyCategory;
  categoryLabel: 'Retailer' | 'Distributor' | 'CFS';
  name: string;
  code: string;
  routeOrLocation: string;
  mobileOrPhone?: string;
  role?: UserRole;
  credit_limit: number;
  current_outstanding: number; // Alias for Total Liability / Utilized Credit
  utilized_credit: number;
  total_liability: number;
  available_credit: number; // Alias for Remaining Credit = Max(0, Limit - Total Liability)
  remaining_credit: number;
  over_limit_amount: number; // Alias for Fund Shortage = Max(0, Total Liability - Limit)
  fund_shortage: number;
  non_cancelled_orders_total: number;
  verified_payments_total: number;
  credit_note_discounts_total: number;
  is_credit_blocked: boolean;
  linkedUserId?: string;
  linkedDistributorId?: string;
  firestoreDocId?: string;
  matchIds: string[];
  matchNames: string[];
}

export interface PartyCreditProfile {
  userId: string;
  name: string;
  role: UserRole;
  partyKind: 'USER' | 'DISTRIBUTOR_INSTITUTION';
  linkedDistributorId?: string;
  credit_limit: number;
  current_outstanding: number;
  utilized_credit: number;
  total_liability: number;
  available_credit: number;
  remaining_credit: number;
  over_limit_amount: number;
  fund_shortage: number;
  is_credit_blocked: boolean;
  syncedAt: string;
}

export interface OrderCreditExposureSummary {
  partyId: string | null;
  partyKind: CreditPartyKind | 'UNLINKED';
  partyName: string;
  creditLimit: number;
  priorUnpaidOrders: number;
  newOrderValue: number;
  totalLiability: number;
  remainingCredit: number;
  fundShortage: number;
  isExceeded: boolean;
  recommendation: 'APPROVE' | 'FLAG_HIGH_RISK';
}

export function sanitizeCreditPhone(phone?: string | null): string {
  if (!phone) return '';
  return String(phone).replace(/[\s\-\(\)\+]/g, '').slice(-10);
}

function normalizePartyName(name?: string | null): string {
  return String(name || '').trim().toLowerCase();
}

export function doesOrderBelongToParty(
  ord: Order,
  idSet: Set<string>,
  nameSet: Set<string>,
  includeDirectUserDistributorOrdersForUserId?: string
): boolean {
  if (ord.retailer_id && idSet.has(ord.retailer_id)) {
    return true;
  }
  const norm = normalizePartyName(ord.retailer_name_raw);
  if (norm && nameSet.has(norm)) {
    return true;
  }
  if (
    includeDirectUserDistributorOrdersForUserId &&
    ord.created_by_user_id === includeDirectUserDistributorOrdersForUserId &&
    (ord.channel === 'DISTRIBUTOR' || ord.order_source_role === 'DISTRIBUTOR')
  ) {
    return true;
  }
  return false;
}

/**
 * Computes real-time Credit Utilization / Total Liability breakdown:
 *   Total Liability = Sum(All Non-Cancelled Orders, including PENDING_VERIFICATION, VERIFIED,
 *                     CONFIRMED, INVOICED, DISPATCHED, DELIVERED)
 *                   + Sum(Standalone Unmatched Invoices without an order record)
 *                   - Sum(Verified Payments)
 *                   - Sum(Explicit BE-issued Credit Note Discounts)
 *   Remaining Credit = Max(0, Credit Limit - Total Liability)
 *   Fund Shortage    = Max(0, Total Liability - Credit Limit)
 */
export function calculatePartyCreditBreakdown(options: {
  matchIds: string[];
  matchNames: string[];
  creditLimit?: number;
  fallbackOutstanding?: number;
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  includeDirectUserDistributorOrdersForUserId?: string;
  excludeOrderId?: string;
}): PartyCreditBreakdown {
  const idSet = new Set(options.matchIds.filter(Boolean));
  const nameSet = new Set(options.matchNames.map((n) => normalizePartyName(n)).filter(Boolean));

  const matchesIdOrName = (entityId?: string | null, entityName?: string | null): boolean => {
    if (entityId && idSet.has(entityId)) return true;
    const norm = normalizePartyName(entityName);
    return Boolean(norm && nameSet.has(norm));
  };

  // 1. All orders for this party (both non-cancelled and cancelled)
  const matchedAllOrders = (options.orders || []).filter((ord) => {
    if (options.excludeOrderId && ord.id === options.excludeOrderId) return false;
    return doesOrderBelongToParty(
      ord,
      idSet,
      nameSet,
      options.includeDirectUserDistributorOrdersForUserId
    );
  });

  const nonCancelledOrders = matchedAllOrders.filter((ord) => ord.status !== 'CANCELLED');
  const matchedOrderIds = new Set(matchedAllOrders.map((o) => o.id));

  // 2. Matched invoices for this party
  const matchedInvoices = (options.invoices || []).filter((inv) =>
    matchesIdOrName(inv.retailer_id, inv.retailer_name)
  );

  let creditNoteDiscountsTotal = 0;

  // Sum all non-cancelled orders (reserves PENDING_VERIFICATION immediately through DELIVERED/INVOICED)
  const nonCancelledOrdersTotal = nonCancelledOrders.reduce((sum, ord) => {
    const linkedInv = matchedInvoices.find((inv) => inv.order_id === ord.id);
    const explicitCreditNote = Math.max(
      ord.is_credit_note_discount ? Number(ord.credit_note_discount_amount) || 0 : 0,
      linkedInv?.is_credit_note_discount ? Number(linkedInv.credit_note_discount_amount) || 0 : 0
    );
    creditNoteDiscountsTotal += explicitCreditNote;
    const gross = Number(ord.total_amount) || 0;
    return sum + Math.max(0, gross);
  }, 0);

  // Include standalone invoices ONLY if their order_id is not present in matchedAllOrders (avoids double counting)
  const standaloneInvoices = matchedInvoices.filter(
    (inv) => !inv.order_id || !matchedOrderIds.has(inv.order_id)
  );
  const standaloneInvoicesTotal = standaloneInvoices.reduce((sum, inv) => {
    const explicitCreditNote = inv.is_credit_note_discount
      ? Number(inv.credit_note_discount_amount) || 0
      : 0;
    creditNoteDiscountsTotal += explicitCreditNote;
    const grossInv = Number(inv.gross_amount ?? inv.total_amount) || 0;
    return sum + Math.max(0, grossInv);
  }, 0);

  // 3. Verified Payments
  const matchedVerifiedPayments = (options.payments || []).filter(
    (pay) =>
      pay.status === 'VERIFIED' &&
      matchesIdOrName(pay.retailer_id, pay.retailer_name)
  );
  const explicitVerifiedPaymentsTotal = matchedVerifiedPayments.reduce(
    (sum, pay) => sum + Math.max(0, Number(pay.amount) || 0),
    0
  );

  // Guard for standalone pre-seeded invoices that carry paid_amount without a Payment doc
  const areAllVerifiedPaymentsExplicitlyAllocated =
    matchedVerifiedPayments.length === 0 ||
    matchedVerifiedPayments.every(
      (p) => Boolean(p.matched_invoice_id) || (Array.isArray(p.allocations) && p.allocations.length > 0)
    );

  const unlinkedStandalonePaid = areAllVerifiedPaymentsExplicitlyAllocated
    ? standaloneInvoices.reduce((sum, inv) => {
        const hasLinkedPayment = matchedVerifiedPayments.some(
          (p) =>
            p.matched_invoice_id === inv.id ||
            (Array.isArray(p.allocations) && p.allocations.some((a) => a.invoice_id === inv.id))
        );
        return hasLinkedPayment ? sum : sum + Math.max(0, Number(inv.paid_amount) || 0);
      }, 0)
    : 0;

  const verifiedPaymentsTotal = explicitVerifiedPaymentsTotal + unlinkedStandalonePaid;

  const hasAnyTransactionHistory =
    matchedAllOrders.length > 0 ||
    matchedInvoices.length > 0 ||
    matchedVerifiedPayments.length > 0;

  const computedLiability = Math.max(
    0,
    Math.round(
      (nonCancelledOrdersTotal +
        standaloneInvoicesTotal -
        verifiedPaymentsTotal -
        creditNoteDiscountsTotal) *
        100
    ) / 100
  );

  const totalLiability = hasAnyTransactionHistory
    ? computedLiability
    : Math.max(0, Number(options.fallbackOutstanding) || 0);

  const creditLimit = Math.max(0, Number(options.creditLimit) || 0);
  const remainingCredit = Math.max(0, Math.round((creditLimit - totalLiability) * 100) / 100);
  const fundShortage = Math.max(0, Math.round((totalLiability - creditLimit) * 100) / 100);

  return {
    nonCancelledOrdersCount: nonCancelledOrders.length,
    nonCancelledOrdersTotal: Math.round(nonCancelledOrdersTotal * 100) / 100,
    standaloneInvoicesTotal: Math.round(standaloneInvoicesTotal * 100) / 100,
    creditNoteDiscountsTotal: Math.round(creditNoteDiscountsTotal * 100) / 100,
    verifiedPaymentsTotal: Math.round(verifiedPaymentsTotal * 100) / 100,
    totalLiability,
    creditLimit,
    remainingCredit,
    fundShortage,
    hasAnyTransactionHistory,
  };
}

export function calculatePartyLiveOutstanding(options: {
  matchIds: string[];
  matchNames: string[];
  fallbackOutstanding?: number;
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  includeDirectUserDistributorOrdersForUserId?: string;
}): number {
  return calculatePartyCreditBreakdown(options).totalLiability;
}

/**
 * Finds the matching DistributorInstitution for a DISTRIBUTOR user account (if both exist).
 */
export function findLinkedDistributorForUser(
  user: User,
  distributors: DistributorInstitution[] = []
): DistributorInstitution | undefined {
  if (!user || user.role !== 'DISTRIBUTOR') return undefined;
  const userPhone = sanitizeCreditPhone(user.mobile_number);
  const userNormName = normalizePartyName(user.name);

  return (
    distributors.find((d) => user.distributor_id && d.id === user.distributor_id) ||
    distributors.find((d) => userPhone && sanitizeCreditPhone(d.phone) === userPhone) ||
    distributors.find((d) => userNormName && normalizePartyName(d.name) === userNormName)
  );
}

/**
 * Builds the unified list of all Credit Gate parties across:
 * 1. Institutional / Sub-Distributors (DistributorInstitution[])
 * 2. Active Distributors & CFS (Commission Agent) users from Users & Roles
 * 3. Retailers (Retailer[])
 */
export function buildPartyCreditRecords(params: {
  retailers: Retailer[];
  distributors: DistributorInstitution[];
  users: User[];
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  defaultCreditLimit?: number;
}): PartyCreditRecord[] {
  const defaultLimit =
    typeof params.defaultCreditLimit === 'number' && params.defaultCreditLimit >= 0
      ? params.defaultCreditLimit
      : 50000;

  const records: PartyCreditRecord[] = [];
  const consumedUserIds = new Set<string>();

  const distributorUsers = (params.users || []).filter(
    (u) => u.role === 'DISTRIBUTOR' && u.is_active !== false && u.credit_gate_enabled !== false
  );

  // 1. Institutional / Registered Distributors
  (params.distributors || []).forEach((dist) => {
    if (dist.phase_status === 'BLOCKED') return;

    const distPhone = sanitizeCreditPhone(dist.phone);
    const distNormName = normalizePartyName(dist.name);
    const linkedUser = distributorUsers.find(
      (u) =>
        u.distributor_id === dist.id ||
        (distPhone && sanitizeCreditPhone(u.mobile_number) === distPhone) ||
        (distNormName && normalizePartyName(u.name) === distNormName)
    );

    if (linkedUser) {
      consumedUserIds.add(linkedUser.id);
    }

    const matchIds = [dist.id, ...(linkedUser ? [linkedUser.id] : [])];
    const matchNames = [dist.name, ...(linkedUser ? [linkedUser.name] : [])];

    const creditLimit =
      typeof dist.credit_limit === 'number'
        ? Math.max(0, dist.credit_limit)
        : typeof linkedUser?.credit_limit === 'number'
          ? Math.max(0, linkedUser.credit_limit)
          : defaultLimit;

    const breakdown = calculatePartyCreditBreakdown({
      matchIds,
      matchNames,
      creditLimit,
      fallbackOutstanding:
        linkedUser?.current_outstanding !== undefined
          ? Math.max(Number(dist.current_outstanding) || 0, Number(linkedUser.current_outstanding) || 0)
          : dist.current_outstanding,
      orders: params.orders,
      invoices: params.invoices,
      payments: params.payments,
      includeDirectUserDistributorOrdersForUserId: linkedUser?.id,
    });

    records.push({
      id: dist.id,
      partyKind: 'DISTRIBUTOR_INSTITUTION',
      category: 'DISTRIBUTOR',
      categoryLabel: 'Distributor',
      name: dist.name,
      code: dist.code || 'DIST',
      routeOrLocation: dist.beat_name || dist.city || 'Institutional / Direct',
      mobileOrPhone: dist.phone || linkedUser?.mobile_number,
      role: 'DISTRIBUTOR',
      credit_limit: creditLimit,
      current_outstanding: breakdown.totalLiability,
      utilized_credit: breakdown.totalLiability,
      total_liability: breakdown.totalLiability,
      available_credit: breakdown.remainingCredit,
      remaining_credit: breakdown.remainingCredit,
      over_limit_amount: breakdown.fundShortage,
      fund_shortage: breakdown.fundShortage,
      non_cancelled_orders_total: breakdown.nonCancelledOrdersTotal,
      verified_payments_total: breakdown.verifiedPaymentsTotal,
      credit_note_discounts_total: breakdown.creditNoteDiscountsTotal,
      is_credit_blocked: breakdown.totalLiability > creditLimit,
      linkedUserId: linkedUser?.id,
      linkedDistributorId: dist.id,
      firestoreDocId: dist.id,
      matchIds,
      matchNames,
    });
  });

  // 2. Active Distributors & CFS Users from Users collection (not already merged above)
  (params.users || []).forEach((user) => {
    if (user.role !== 'DISTRIBUTOR' && user.role !== 'COMMISSION_AGENT') return;
    if (user.is_active === false || user.credit_gate_enabled === false) return;
    if (consumedUserIds.has(user.id)) return;

    const isDistributor = user.role === 'DISTRIBUTOR';
    const matchIds = [user.id];
    const matchNames = [user.name];

    const creditLimit =
      typeof user.credit_limit === 'number' ? Math.max(0, user.credit_limit) : defaultLimit;

    const breakdown = calculatePartyCreditBreakdown({
      matchIds,
      matchNames,
      creditLimit,
      fallbackOutstanding: user.current_outstanding,
      orders: params.orders,
      invoices: params.invoices,
      payments: params.payments,
      includeDirectUserDistributorOrdersForUserId: isDistributor ? user.id : undefined,
    });

    const cleanPhone = sanitizeCreditPhone(user.mobile_number);

    records.push({
      id: user.id,
      partyKind: 'USER',
      category: isDistributor ? 'DISTRIBUTOR' : 'CFS',
      categoryLabel: isDistributor ? 'Distributor' : 'CFS',
      name: user.name,
      code: `${isDistributor ? 'DIST' : 'CFS'}-${cleanPhone ? cleanPhone.slice(-4) : user.id.slice(-4).toUpperCase()}`,
      routeOrLocation: user.beat_name || (isDistributor ? 'Direct Distributor Network' : 'Field CFS Territory'),
      mobileOrPhone: user.mobile_number,
      role: user.role,
      credit_limit: creditLimit,
      current_outstanding: breakdown.totalLiability,
      utilized_credit: breakdown.totalLiability,
      total_liability: breakdown.totalLiability,
      available_credit: breakdown.remainingCredit,
      remaining_credit: breakdown.remainingCredit,
      over_limit_amount: breakdown.fundShortage,
      fund_shortage: breakdown.fundShortage,
      non_cancelled_orders_total: breakdown.nonCancelledOrdersTotal,
      verified_payments_total: breakdown.verifiedPaymentsTotal,
      credit_note_discounts_total: breakdown.creditNoteDiscountsTotal,
      is_credit_blocked: breakdown.totalLiability > creditLimit,
      linkedUserId: user.id,
      firestoreDocId: user.firestore_doc_id || user.id,
      matchIds,
      matchNames,
    });
  });

  // 3. Retail Outlets
  (params.retailers || []).forEach((ret) => {
    if (ret.phase_status === 'BLOCKED') return;

    const matchIds = [ret.id];
    const matchNames = [ret.name];

    const creditLimit =
      typeof ret.credit_limit === 'number' ? Math.max(0, ret.credit_limit) : defaultLimit;

    const breakdown = calculatePartyCreditBreakdown({
      matchIds,
      matchNames,
      creditLimit,
      fallbackOutstanding: ret.current_outstanding,
      orders: params.orders,
      invoices: params.invoices,
      payments: params.payments,
    });

    records.push({
      id: ret.id,
      partyKind: 'RETAILER',
      category: 'RETAILER',
      categoryLabel: 'Retailer',
      name: ret.name,
      code: ret.code || 'RET',
      routeOrLocation: ret.beat_name || ret.city || 'Unassigned Beat',
      mobileOrPhone: ret.phone,
      credit_limit: creditLimit,
      current_outstanding: breakdown.totalLiability,
      utilized_credit: breakdown.totalLiability,
      total_liability: breakdown.totalLiability,
      available_credit: breakdown.remainingCredit,
      remaining_credit: breakdown.remainingCredit,
      over_limit_amount: breakdown.fundShortage,
      fund_shortage: breakdown.fundShortage,
      non_cancelled_orders_total: breakdown.nonCancelledOrdersTotal,
      verified_payments_total: breakdown.verifiedPaymentsTotal,
      credit_note_discounts_total: breakdown.creditNoteDiscountsTotal,
      is_credit_blocked: breakdown.totalLiability > creditLimit,
      firestoreDocId: ret.id,
      matchIds,
      matchNames,
    });
  });

  return records;
}

/**
 * Computes the live credit profile for a mobile Distributor or CFS User directly
 * from Firestore/store user, distributor, invoice, order, and payment records.
 */
export function computeUserLiveCreditProfile(
  user: User,
  params: {
    distributors: DistributorInstitution[];
    orders: Order[];
    invoices: Invoice[];
    payments: Payment[];
    defaultCreditLimit?: number;
  }
): PartyCreditProfile {
  const defaultLimit =
    typeof params.defaultCreditLimit === 'number' && params.defaultCreditLimit >= 0
      ? params.defaultCreditLimit
      : 50000;

  const linkedDist = findLinkedDistributorForUser(user, params.distributors);
  const matchIds = [user.id, ...(linkedDist ? [linkedDist.id] : [])];
  const matchNames = [user.name, ...(linkedDist ? [linkedDist.name] : [])];

  const creditLimit =
    typeof user.credit_limit === 'number'
      ? Math.max(0, user.credit_limit)
      : typeof linkedDist?.credit_limit === 'number'
        ? Math.max(0, linkedDist.credit_limit)
        : defaultLimit;

  const breakdown = calculatePartyCreditBreakdown({
    matchIds,
    matchNames,
    creditLimit,
    fallbackOutstanding:
      user.current_outstanding !== undefined
        ? user.current_outstanding
        : linkedDist?.current_outstanding,
    orders: params.orders,
    invoices: params.invoices,
    payments: params.payments,
    includeDirectUserDistributorOrdersForUserId:
      user.role === 'DISTRIBUTOR' ? user.id : undefined,
  });

  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    partyKind: linkedDist ? 'DISTRIBUTOR_INSTITUTION' : 'USER',
    linkedDistributorId: linkedDist?.id,
    credit_limit: creditLimit,
    current_outstanding: breakdown.totalLiability,
    utilized_credit: breakdown.totalLiability,
    total_liability: breakdown.totalLiability,
    available_credit: breakdown.remainingCredit,
    remaining_credit: breakdown.remainingCredit,
    over_limit_amount: breakdown.fundShortage,
    fund_shortage: breakdown.fundShortage,
    is_credit_blocked: breakdown.totalLiability > creditLimit,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Resolves the live credit party record for any Order (Retailer, Distributor, or CFS user)
 * and computes exact Prior Unpaid Orders + New Order Value = Total Liability, Remaining Credit,
 * and Fund Shortage. Works both when the order already exists in `orders` and for a new draft order.
 */
export function resolveOrderCreditExposure(params: {
  order: Pick<Order, 'id' | 'retailer_id' | 'retailer_name_raw' | 'created_by_user_id' | 'channel' | 'order_source_role' | 'total_amount' | 'status'>;
  overrideOrderValue?: number;
  retailers: Retailer[];
  distributors: DistributorInstitution[];
  users: User[];
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  defaultCreditLimit?: number;
}): OrderCreditExposureSummary {
  const defaultLimit =
    typeof params.defaultCreditLimit === 'number' && params.defaultCreditLimit >= 0
      ? params.defaultCreditLimit
      : 50000;

  const partyRecords = buildPartyCreditRecords({
    retailers: params.retailers,
    distributors: params.distributors,
    users: params.users,
    orders: params.orders,
    invoices: params.invoices,
    payments: params.payments,
    defaultCreditLimit: defaultLimit,
  });

  const ord = params.order;
  const ordNormName = normalizePartyName(ord.retailer_name_raw);

  // Match party by retailer_id -> normalized name -> distributor creator user
  let matchedParty =
    (ord.retailer_id
      ? partyRecords.find((p) => p.matchIds.includes(ord.retailer_id!))
      : undefined) ||
    (ordNormName
      ? partyRecords.find((p) => p.matchNames.some((n) => normalizePartyName(n) === ordNormName))
      : undefined);

  if (
    !matchedParty &&
    ord.created_by_user_id &&
    (ord.channel === 'DISTRIBUTOR' || ord.order_source_role === 'DISTRIBUTOR')
  ) {
    matchedParty = partyRecords.find((p) => p.matchIds.includes(ord.created_by_user_id));
  }

  const effectiveOrderVal = Math.max(
    0,
    params.overrideOrderValue !== undefined ? Number(params.overrideOrderValue) || 0 : Number(ord.total_amount) || 0
  );

  if (!matchedParty) {
    const totalLiability = ord.status === 'CANCELLED' ? 0 : effectiveOrderVal;
    const remainingCredit = Math.max(0, defaultLimit - totalLiability);
    const fundShortage = Math.max(0, totalLiability - defaultLimit);
    return {
      partyId: ord.retailer_id || null,
      partyKind: 'UNLINKED',
      partyName: ord.retailer_name_raw || 'Direct Party',
      creditLimit: defaultLimit,
      priorUnpaidOrders: 0,
      newOrderValue: effectiveOrderVal,
      totalLiability,
      remainingCredit,
      fundShortage,
      isExceeded: fundShortage > 0,
      recommendation: fundShortage > 0 ? 'FLAG_HIGH_RISK' : 'APPROVE',
    };
  }

  const orderAlreadyInList = Boolean(
    ord.id && (params.orders || []).some((o) => o.id === ord.id)
  );

  const effectiveOrdersForAll =
    orderAlreadyInList && params.overrideOrderValue !== undefined
      ? (params.orders || []).map((o) =>
          o.id === ord.id ? { ...o, total_amount: effectiveOrderVal } : o
        )
      : params.orders;

  const breakdownAll = calculatePartyCreditBreakdown({
    matchIds: matchedParty.matchIds,
    matchNames: matchedParty.matchNames,
    creditLimit: matchedParty.credit_limit,
    orders: effectiveOrdersForAll,
    invoices: params.invoices,
    payments: params.payments,
    includeDirectUserDistributorOrdersForUserId:
      matchedParty.role === 'DISTRIBUTOR' ? matchedParty.linkedUserId : undefined,
  });

  const withoutThis = orderAlreadyInList
    ? calculatePartyCreditBreakdown({
        matchIds: matchedParty.matchIds,
        matchNames: matchedParty.matchNames,
        creditLimit: matchedParty.credit_limit,
        orders: params.orders,
        invoices: params.invoices,
        payments: params.payments,
        includeDirectUserDistributorOrdersForUserId:
          matchedParty.role === 'DISTRIBUTOR' ? matchedParty.linkedUserId : undefined,
        excludeOrderId: ord.id,
      })
    : breakdownAll;

  const priorUnpaidOrders = withoutThis.totalLiability;

  const totalLiability = orderAlreadyInList
    ? breakdownAll.totalLiability
    : ord.status === 'CANCELLED'
      ? priorUnpaidOrders
      : calculatePartyCreditBreakdown({
          matchIds: matchedParty.matchIds,
          matchNames: matchedParty.matchNames,
          creditLimit: matchedParty.credit_limit,
          orders: [
            ...(params.orders || []),
            {
              ...(ord as Order),
              total_amount: effectiveOrderVal,
            },
          ],
          invoices: params.invoices,
          payments: params.payments,
          includeDirectUserDistributorOrdersForUserId:
            matchedParty.role === 'DISTRIBUTOR' ? matchedParty.linkedUserId : undefined,
        }).totalLiability;

  const remainingCredit = Math.max(
    0,
    Math.round((matchedParty.credit_limit - totalLiability) * 100) / 100
  );
  const fundShortage = Math.max(
    0,
    Math.round((totalLiability - matchedParty.credit_limit) * 100) / 100
  );

  return {
    partyId: matchedParty.id,
    partyKind: matchedParty.partyKind,
    partyName: matchedParty.name,
    creditLimit: matchedParty.credit_limit,
    priorUnpaidOrders,
    newOrderValue: effectiveOrderVal,
    totalLiability,
    remainingCredit,
    fundShortage,
    isExceeded: fundShortage > 0,
    recommendation: fundShortage > 0 ? 'FLAG_HIGH_RISK' : 'APPROVE',
  };
}
