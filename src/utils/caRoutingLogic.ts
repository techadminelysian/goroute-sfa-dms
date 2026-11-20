import { Beat, Order, Retailer, User, WorkflowNotification, DistributorInstitution, SKU } from '../types';

/**
 * Result structure returned by credit limit validation calculation
 */
export interface CreditValidationResult {
  isExceeded: boolean;
  creditLimit: number;
  currentOutstanding: number;
  newOrderValue: number;
  totalExposure: number;
  remainingCredit: number;
  fundShortage: number;
  variance: number; // Alias for fundShortage = Max(0, totalExposure - creditLimit)
  recommendation: 'APPROVE' | 'FLAG_HIGH_RISK';
}

/**
 * Calculates financial credit exposure for an order:
 * Total Liability = Current Unpaid Orders + New Order Value
 * Remaining Credit = Max(0, Credit Limit - Total Liability)
 * Fund Shortage = Max(0, Total Liability - Credit Limit)
 */
export function calculateCreditExposure(
  retailer: Pick<Retailer, 'credit_limit' | 'current_outstanding'> | null | undefined,
  newOrderGrossValue: number,
  fallbackCreditLimit: number = 50000
): CreditValidationResult {
  const creditLimit = retailer ? Math.max(0, Number(retailer.credit_limit) || 0) : fallbackCreditLimit;
  const currentOutstanding = retailer ? Math.max(0, Number(retailer.current_outstanding) || 0) : 0;
  const newOrderValue = Math.max(0, Number(newOrderGrossValue) || 0);
  const totalExposure = Math.round((currentOutstanding + newOrderValue) * 100) / 100;
  const remainingCredit = Math.max(0, Math.round((creditLimit - totalExposure) * 100) / 100);
  const fundShortage = Math.max(0, Math.round((totalExposure - creditLimit) * 100) / 100);
  const isExceeded = fundShortage > 0;

  return {
    isExceeded,
    creditLimit,
    currentOutstanding,
    newOrderValue,
    totalExposure,
    remainingCredit,
    fundShortage,
    variance: fundShortage,
    recommendation: isExceeded ? 'FLAG_HIGH_RISK' : 'APPROVE',
  };
}

/**
 * Auto-fetches and applies fixed BE mappings (Assigned BE) to an order.
 * Supports Commission Agents (CFS), Sales Executives, and Distributors in a Many-to-One mapping to BE.
 */
export function applyCAMappingsToOrder(
  order: Partial<Order>,
  agentUser: User | null | undefined,
  allUsers: User[],
  defaultDpId: string = '',
  clientDistributor?: DistributorInstitution | null
): {
  dispatch_point_id: string;
  billing_executive_id: string | null;
  commission_agent_id: string;
  commission_agent_name: string;
  order_source_role?: string;
  order_raiser_name?: string;
} {
  const isCA = !agentUser || agentUser.role === 'COMMISSION_AGENT';
  const isSE = agentUser?.role === 'SALES_EXECUTIVE';
  const isDist = agentUser?.role === 'DISTRIBUTOR';

  const raiserId = agentUser?.id || order.created_by_user_id || order.commission_agent_id || 'usr_agent_1';
  const raiserName = agentUser?.name || order.order_raiser_name || order.commission_agent_name || (isSE ? 'Sales Executive' : isDist ? 'Distributor' : 'Commission Agent');

  // DP lookup: order DP or agent DP or supplied default (never a hardcoded fake DP ID; Principal Company -> DP resolves on split)
  const dpId = order.dispatch_point_id || agentUser?.dispatch_point_id || defaultDpId || '';

  // Strict BE lookup: User profile fixed BE, or distributor mapped BE, or explicit order BE (no fallback to primary BE)
  const beId = agentUser?.billing_executive_id || clientDistributor?.billing_executive_id || order.billing_executive_id || null;

  const roleTag = isSE ? 'SALES_EXECUTIVE' : isDist ? 'DISTRIBUTOR' : 'COMMISSION_AGENT';

  return {
    dispatch_point_id: dpId,
    billing_executive_id: beId,
    commission_agent_id: isCA ? raiserId : (order.commission_agent_id || ''),
    commission_agent_name: isCA ? raiserName : (order.commission_agent_name || ''),
    order_source_role: roleTag,
    order_raiser_name: raiserName,
  };
}

/**
 * Creates push notification payload for Commission Agent on order cancellation
 * Format: "Order #1024 for Retailer X has been cancelled by billing due to credit limit exposure."
 */
export function createOrderCancelledAlert(
  order: Order,
  reason: string,
  retailerName: string
): WorkflowNotification {
  return {
    id: `notif_cancel_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    tenant_id: order.tenant_id,
    title: `Order ${order.order_number} Cancelled`,
    message: `Order #${order.order_number} for ${retailerName} has been cancelled by billing due to credit limit exposure. Reason: ${reason}`,
    type: 'ORDER_CANCELLED_CREDIT_LIMIT',
    target_roles: ['COMMISSION_AGENT', 'ADMIN'],
    target_user_id: order.commission_agent_id || order.created_by_user_id,
    related_entity_id: order.id,
    related_entity_type: 'ORDER',
    order_id: order.id,
    order_number: order.order_number,
    retailer_name: retailerName,
    is_read: false,
    metadata: {
      cancelled_reason: reason,
      previous_status: order.status,
    },
  };
}

/**
 * Creates push notification payload for Commission Agent on line-item quantity amendment (Partial Approval)
 * Format: "Order #1024 for Retailer X has been amended. [SKU Name] reduced from [X] to [Y] boxes to match credit limits. Click to view updated dispatch totals."
 */
export function createOrderAmendedAlert(
  order: Order,
  retailerName: string,
  amendedItems: { skuName: string; originalQty: number; verifiedQty: number }[]
): WorkflowNotification {
  const itemsText = amendedItems
    .map((item) => `${item.skuName} reduced from ${item.originalQty} to ${item.verifiedQty} units`)
    .join(', ');

  return {
    id: `notif_amend_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    tenant_id: order.tenant_id,
    title: `Order ${order.order_number} Amended & Approved`,
    message: `Order #${order.order_number} for ${retailerName} has been amended. ${itemsText} to match credit limits. Click to view updated dispatch totals.`,
    type: 'ORDER_AMENDED_PARTIAL_APPROVAL',
    target_roles: ['COMMISSION_AGENT', 'ADMIN'],
    target_user_id: order.commission_agent_id || order.created_by_user_id,
    related_entity_id: order.id,
    related_entity_type: 'ORDER',
    order_id: order.id,
    order_number: order.order_number,
    retailer_name: retailerName,
    is_read: false,
    metadata: {
      amended_lines: amendedItems,
      new_total: order.total_amount,
      original_total: order.original_total_amount,
    },
  };
}

/**
 * Checks whether an order belongs to the designated Billing Executive's queue.
 * Strictly verifies that the order was raised by a Commission Agent (CFS), Sales Executive,
 * or Distributor assigned to this BE, or explicitly tagged with this BE's ID.
 */
export function isOrderAssignedToBE(
  order: Order,
  beId: string,
  allUsers: User[],
  allDistributors: DistributorInstitution[] = []
): boolean {
  if (!beId) return false;

  // 1. Direct tag match on the order
  if (order.billing_executive_id && order.billing_executive_id === beId) {
    return true;
  }

  // 2. Check the creator / raiser user (CFS / Sales Executive / Distributor)
  const creatorId = order.created_by_user_id || order.commission_agent_id;
  if (creatorId) {
    const creatorUser = allUsers.find((u) => u.id === creatorId);
    if (creatorUser && creatorUser.billing_executive_id === beId) {
      return true;
    }
  }

  // 3. Check if order.retailer_id references a Distributor entity OR a mobile User profile with mapped BE
  if (order.retailer_id) {
    const matchedDistributor = allDistributors.find((d) => d.id === order.retailer_id);
    if (matchedDistributor && matchedDistributor.billing_executive_id === beId) {
      return true;
    }
    const matchedUserByRetailerId = allUsers.find((u) => u.id === order.retailer_id);
    if (matchedUserByRetailerId && matchedUserByRetailerId.billing_executive_id === beId) {
      return true;
    }
  }

  // 4. Check matching by raiser / agent name if IDs were unpopulated
  const checkName = (order.order_raiser_name || order.commission_agent_name || '').trim().toLowerCase();
  if (checkName) {
    const userByName = allUsers.find(
      (u) =>
        (u.role === 'COMMISSION_AGENT' || u.role === 'SALES_EXECUTIVE' || u.role === 'DISTRIBUTOR') &&
        u.name.toLowerCase() === checkName
    );
    if (userByName && userByName.billing_executive_id === beId) {
      return true;
    }
  }

  return false;
}

/**
 * Identifies unmapped/orphaned orders that do not resolve to any active Billing Executive.
 * These orders are routed strictly to the Admin / Sub-Admin Unassigned Exception Queue.
 */
export function isOrderUnassignedToAnyBE(
  order: Order,
  allUsers: User[],
  allDistributors: DistributorInstitution[] = []
): boolean {
  const activeBEs = allUsers.filter((u) => u.role === 'BILLING' && u.is_active !== false);
  if (activeBEs.length === 0) return true;
  return !activeBEs.some((be) => isOrderAssignedToBE(order, be.id, allUsers, allDistributors));
}

/**
 * Returns all Commission Agents (CFS) assigned to a specific Billing Executive
 */
export function getCommissionAgentsForBE(beId: string, allUsers: User[]): User[] {
  return allUsers.filter((u) => u.role === 'COMMISSION_AGENT' && u.billing_executive_id === beId);
}

/**
 * Returns all Sales Executives assigned to a specific Billing Executive
 */
export function getSalesExecutivesForBE(beId: string, allUsers: User[]): User[] {
  return allUsers.filter((u) => u.role === 'SALES_EXECUTIVE' && u.billing_executive_id === beId);
}

/**
 * Returns all Distributors assigned to a specific Billing Executive
 */
export function getDistributorsForBE(
  beId: string,
  allUsers: User[],
  allDistributors: DistributorInstitution[] = []
): { users: User[]; clients: DistributorInstitution[] } {
  const users = allUsers.filter((u) => u.role === 'DISTRIBUTOR' && u.billing_executive_id === beId);
  const clients = allDistributors.filter((d) => d.billing_executive_id === beId);
  return { users, clients };
}

/**
 * Returns all mapped Order Raisers (CFS, Sales Executives, and Distributors) for a Billing Executive
 */
export function getMappedRaisersForBE(
  beId: string,
  allUsers: User[],
  allDistributors: DistributorInstitution[] = []
): {
  commissionAgents: User[];
  salesExecutives: User[];
  distributorUsers: User[];
  distributorClients: DistributorInstitution[];
  totalRaisers: number;
} {
  const commissionAgents = getCommissionAgentsForBE(beId, allUsers);
  const salesExecutives = getSalesExecutivesForBE(beId, allUsers);
  const { users: distributorUsers, clients: distributorClients } = getDistributorsForBE(beId, allUsers, allDistributors);

  return {
    commissionAgents,
    salesExecutives,
    distributorUsers,
    distributorClients,
    totalRaisers: commissionAgents.length + salesExecutives.length + distributorUsers.length + distributorClients.length,
  };
}

export interface OrderFinancialSummary {
  productValue: number; // Subtotal of all lines (Product value)
  gstAmount: number;    // Applicable GST (18%)
  totalAmountWithGst: number; // Total order value with GST included
}

/**
 * Single source of truth for calculating order financial breakdown:
 * - Product Value (Sum of line items)
 * - Applicable GST (18%)
 * - Total Order Amount (Product Value + GST)
 */
export function getOrderFinancialSummary(
  order: Partial<Order> | null | undefined,
  skus: SKU[] = []
): OrderFinancialSummary {
  if (!order) {
    return { productValue: 0, gstAmount: 0, totalAmountWithGst: 0 };
  }

  // 1. Calculate product value from lines
  let productValue = 0;
  let computedLineTax = 0;
  if (order.lines && order.lines.length > 0) {
    productValue = order.lines.reduce((sum, l) => {
      const lineTotal =
        l.total != null && !isNaN(Number(l.total))
          ? Number(l.total)
          : Number(l.quantity || 0) * Number(l.unit_price || 0);
      const matchedSku = skus.find((s) => s.id === l.sku_id);
      const taxRate = matchedSku?.tax_rate !== undefined ? Number(matchedSku.tax_rate) : 18;
      computedLineTax += lineTotal * (taxRate / 100);
      return sum + lineTotal;
    }, 0);
  } else {
    productValue = Number(order.total_amount) || 0;
    computedLineTax = productValue * 0.18;
  }
  productValue = Math.round(productValue * 100) / 100;

  // 2. Calculate GST amount (use order.tax_amount if present, otherwise itemized SKU tax)
  let gstAmount = 0;
  if (order.tax_amount != null && !isNaN(Number(order.tax_amount)) && Number(order.tax_amount) > 0) {
    gstAmount = Number(order.tax_amount);
  } else {
    gstAmount = Math.round(computedLineTax * 100) / 100;
  }
  gstAmount = Math.round(gstAmount * 100) / 100;

  // 3. Final Total with GST
  let totalAmountWithGst = productValue + gstAmount;
  if (order.total_amount != null && Number(order.total_amount) > productValue + gstAmount * 0.5) {
    totalAmountWithGst = Number(order.total_amount);
  }
  totalAmountWithGst = Math.round(totalAmountWithGst * 100) / 100;

  return {
    productValue,
    gstAmount,
    totalAmountWithGst,
  };
}

/**
 * Resolves all Beats assigned to a specific Commission Agent.
 * Checks:
 * 1. user.assigned_beat_ids (array)
 * 2. user.beat_id (legacy single beat)
 * 3. beat.assigned_agent_id === user.id
 */
export function getAgentAssignedBeats(
  agentUser: User | null | undefined,
  allBeats: Beat[] = []
): Beat[] {
  if (!agentUser) return [];

  return allBeats.filter((b) => {
    const hasAssignedId = Array.isArray(agentUser.assigned_beat_ids) && agentUser.assigned_beat_ids.includes(b.id);
    const hasSingleBeatId = Boolean(agentUser.beat_id && agentUser.beat_id === b.id);
    const hasAssignedAgentId = Boolean(b.assigned_agent_id && b.assigned_agent_id === agentUser.id);

    return hasAssignedId || hasSingleBeatId || hasAssignedAgentId;
  });
}

/**
 * Resolves all Retail Stores belonging to a Commission Agent's assigned beats.
 * If the agent has no beats assigned, returns an empty array.
 */
export function getAgentAssignedStores(
  agentUser: User | null | undefined,
  allRetailers: Retailer[] = [],
  allBeats: Beat[] = []
): Retailer[] {
  if (!agentUser) return [];

  const assignedBeats = getAgentAssignedBeats(agentUser, allBeats);
  if (assignedBeats.length === 0) return [];

  const assignedBeatIds = new Set(assignedBeats.map((b) => b.id));
  const assignedBeatNames = new Set(
    assignedBeats.map((b) => b.name.trim().toLowerCase())
  );
  const beatRetailerIds = new Set<string>();
  assignedBeats.forEach((b) => {
    if (Array.isArray(b.retailer_ids)) {
      b.retailer_ids.forEach((id) => beatRetailerIds.add(id));
    }
  });

  return allRetailers.filter((r) => {
    if (r.beat_id && assignedBeatIds.has(r.beat_id)) return true;
    if (r.beat_name && assignedBeatNames.has(r.beat_name.trim().toLowerCase())) return true;
    if (beatRetailerIds.has(r.id)) return true;
    return false;
  });
}

/**
 * Validates whether an Order belongs to the Commission Agent's assigned beats/stores.
 * Always follows the beat.
 */
export function isOrderInAgentBeats(
  order: Order,
  assignedStoreIds: Set<string>,
  assignedBeatIds: Set<string>,
  assignedBeatNames: Set<string>
): boolean {
  if (assignedBeatIds.size === 0) return false;

  if (order.retailer_id && assignedStoreIds.has(order.retailer_id)) {
    return true;
  }
  if (order.beat_id && assignedBeatIds.has(order.beat_id)) {
    return true;
  }
  if (order.beat_name && assignedBeatNames.has(order.beat_name.trim().toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Resolves all Beats under all Commission Agents mapped to a specific Billing Executive (BE).
 * Used when a BE is onboarding new stores, giving full visibility into their assigned CAs' beats.
 */
export function getBeatsForBE(
  beId: string,
  allUsers: User[],
  allBeats: Beat[]
): Beat[] {
  if (!beId) return [];

  const caUsers = allUsers.filter((u) => u.role === 'COMMISSION_AGENT' && u.billing_executive_id === beId);
  if (caUsers.length === 0) {
    return [];
  }

  const assignedBeatIdSet = new Set<string>();
  caUsers.forEach((agent) => {
    const beatsForAgent = getAgentAssignedBeats(agent, allBeats);
    beatsForAgent.forEach((b) => assignedBeatIdSet.add(b.id));
  });

  return allBeats.filter((b) => assignedBeatIdSet.has(b.id));
}

export const FIELD_ACCESS_SCOPED_ROLES: ReadonlyArray<User['role']> = [
  'COMMISSION_AGENT',
  'SALES_EXECUTIVE',
  'DISTRIBUTOR',
];

export function isFieldScopedRole(role?: User['role'] | string | null): boolean {
  if (!role) return false;
  return FIELD_ACCESS_SCOPED_ROLES.includes(role as User['role']);
}

/**
 * Returns Principal Companies visible to a user under Zero-Trust Access Matrix rules.
 * - Field roles (COMMISSION_AGENT, SALES_EXECUTIVE, DISTRIBUTOR): strictly restricted to user.company_scope.
 *   If company_scope is empty/undefined, returns [] (0 companies).
 * - Office/Admin roles: returns all provided companies.
 */
export function getAllowedCompaniesForUser<T extends { id: string }>(
  user: User | null | undefined,
  companies: T[] = []
): T[] {
  if (!user || !isFieldScopedRole(user.role)) {
    return companies;
  }
  const scope = Array.isArray(user.company_scope) ? user.company_scope : [];
  if (scope.length === 0) return [];
  const scopeSet = new Set(scope);
  return companies.filter((c) => scopeSet.has(c.id));
}

/**
 * Returns SKUs visible to a user based on their allowed Principal Companies (Zero-Trust).
 */
export function getAllowedSkusForUser(
  user: User | null | undefined,
  companies: { id: string }[] = [],
  skus: SKU[] = []
): SKU[] {
  if (!user || !isFieldScopedRole(user.role)) {
    return skus;
  }
  const allowedCompanies = getAllowedCompaniesForUser(user, companies);
  const allowedIds = new Set(allowedCompanies.map((c) => c.id));
  if (allowedIds.size === 0) return [];
  return skus.filter((s) => allowedIds.has(s.company_id));
}

export function isFieldUserAccessLocked(user: User | null | undefined): boolean {
  if (!user || !isFieldScopedRole(user.role)) return false;
  return !Array.isArray(user.company_scope) || user.company_scope.length === 0;
}

