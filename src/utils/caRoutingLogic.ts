import { Beat, Order, Retailer, User, WorkflowNotification } from '../types';

/**
 * Result structure returned by credit limit validation calculation
 */
export interface CreditValidationResult {
  isExceeded: boolean;
  creditLimit: number;
  currentOutstanding: number;
  newOrderValue: number;
  totalExposure: number;
  variance: number; // Amount exceeded (totalExposure - creditLimit) or 0
  recommendation: 'APPROVE' | 'FLAG_HIGH_RISK';
}

/**
 * Calculates financial credit exposure for an order:
 * Total Exposure = Current Outstanding Balance + New Order Gross Value
 * 
 * If Total Exposure > Retailer Credit Limit:
 * Flag with High-Risk Red Flag and compute variance.
 */
export function calculateCreditExposure(
  retailer: Retailer | null | undefined,
  newOrderGrossValue: number,
  fallbackCreditLimit: number = 50000
): CreditValidationResult {
  const creditLimit = retailer ? Number(retailer.credit_limit) || 0 : fallbackCreditLimit;
  const currentOutstanding = retailer ? Number(retailer.current_outstanding) || 0 : 0;
  const newOrderValue = Math.max(0, Number(newOrderGrossValue) || 0);
  const totalExposure = currentOutstanding + newOrderValue;
  const isExceeded = totalExposure > creditLimit;
  const variance = isExceeded ? totalExposure - creditLimit : 0;

  return {
    isExceeded,
    creditLimit,
    currentOutstanding,
    newOrderValue,
    totalExposure,
    variance,
    recommendation: isExceeded ? 'FLAG_HIGH_RISK' : 'APPROVE',
  };
}

/**
 * Auto-fetches and applies fixed CA mappings (Assigned BE & DP) to an order.
 * Ensures the CA never has to manually pick these routing endpoints.
 */
export function applyCAMappingsToOrder(
  order: Partial<Order>,
  agentUser: User | null | undefined,
  allUsers: User[],
  defaultDpId: string = 'dp_central'
): {
  dispatch_point_id: string;
  billing_executive_id: string;
  commission_agent_id: string;
  commission_agent_name: string;
} {
  const caId = agentUser?.id || order.commission_agent_id || order.created_by_user_id || 'usr_agent_1';
  const caName = agentUser?.name || order.commission_agent_name || 'Commission Agent';

  // DP lookup: CA profile fixed DP or fallback
  const dpId = agentUser?.dispatch_point_id || order.dispatch_point_id || defaultDpId;

  // BE lookup: CA profile fixed BE, or find active BE in users, or default
  let beId = agentUser?.billing_executive_id || order.billing_executive_id;
  if (!beId) {
    const defaultBE = allUsers.find((u) => u.role === 'BILLING' && u.is_active !== false);
    beId = defaultBE?.id || 'usr_billing_1';
  }

  return {
    dispatch_point_id: dpId,
    billing_executive_id: beId,
    commission_agent_id: caId,
    commission_agent_name: caName,
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
    target_roles: ['AGENT', 'ADMIN'],
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
    target_roles: ['AGENT', 'ADMIN'],
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
 * Strictly verifies that the order was taken by a Commission Agent assigned to this BE,
 * or explicitly tagged with this BE's ID.
 */
export function isOrderAssignedToBE(
  order: Order,
  beId: string,
  allUsers: User[]
): boolean {
  if (!beId) return false;

  // 1. Direct tag match on the order
  if (order.billing_executive_id && order.billing_executive_id === beId) {
    return true;
  }

  // 2. Check the Commission Agent that took or created the order
  const agentId = order.commission_agent_id || order.created_by_user_id;
  if (agentId) {
    const agentUser = allUsers.find((u) => u.id === agentId);
    if (agentUser && agentUser.billing_executive_id === beId) {
      return true;
    }
  }

  // 3. Check matching by commission agent name if IDs were unpopulated
  if (order.commission_agent_name) {
    const agentByName = allUsers.find(
      (u) =>
        u.role === 'AGENT' &&
        u.name.toLowerCase() === order.commission_agent_name?.toLowerCase()
    );
    if (agentByName && agentByName.billing_executive_id === beId) {
      return true;
    }
  }

  return false;
}

/**
 * Returns all Commission Agents assigned to a specific Billing Executive
 */
export function getCommissionAgentsForBE(beId: string, allUsers: User[]): User[] {
  return allUsers.filter((u) => u.role === 'AGENT' && u.billing_executive_id === beId);
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
export function getOrderFinancialSummary(order: Partial<Order> | null | undefined): OrderFinancialSummary {
  if (!order) {
    return { productValue: 0, gstAmount: 0, totalAmountWithGst: 0 };
  }

  // 1. Calculate product value from lines
  let productValue = 0;
  if (order.lines && order.lines.length > 0) {
    productValue = order.lines.reduce((sum, l) => {
      const lineTotal =
        l.total != null && !isNaN(Number(l.total))
          ? Number(l.total)
          : Number(l.quantity || 0) * Number(l.unit_price || 0);
      return sum + lineTotal;
    }, 0);
  } else {
    productValue = Number(order.total_amount) || 0;
  }
  productValue = Math.round(productValue * 100) / 100;

  // 2. Calculate GST amount (18% FMCG standard rate, or use order.tax_amount)
  let gstAmount = 0;
  if (order.tax_amount != null && !isNaN(Number(order.tax_amount)) && Number(order.tax_amount) > 0) {
    gstAmount = Number(order.tax_amount);
  } else {
    gstAmount = Math.round(productValue * 0.18 * 100) / 100;
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

  const caUsers = allUsers.filter((u) => u.role === 'AGENT' && u.billing_executive_id === beId);
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
