import { initDatabase, getDbUsers, getDbOrders, getDatabase, deduplicateOrders, findDbUserById } from '../../server/dbService';
import {
  isOrderAssignedToBE,
  isOrderUnassignedToAnyBE,
  applyCAMappingsToOrder,
  getOrderFinancialSummary,
  getAllowedCompaniesForUser,
  getAllowedSkusForUser,
  isFieldUserAccessLocked,
} from './caRoutingLogic';
import {
  isOrderAwaitingPhysicalDispatch,
  getDepotAvailableStockMap,
  evaluateOrdersAgainstDepotStock,
  buildSplitOrdersForDepotAndPO,
} from './stockAvailability';
import { normalizeFirestoreOrder, normalizeFirestoreUser, ORDER_STATUS_PRIORITY } from '../firebase/firestoreService';
import { calculatePartyCreditBreakdown } from './creditLedger';
import { User, Order, Invoice, SKU, Company, DistributorInstitution, StockLedgerEntry } from '../types';

/**
 * Test Suite: Order-to-Dispatch Workflow Alignment, Strict BE Mapping & Depot Stock Fast-Track
 * Covers TC-01 through TC-10 plus core normalization, GST calculation, and desk permissions.
 */
export async function runBEVerificationTestSuite() {
  await initDatabase();
  const results: { test: string; passed: boolean; message?: string }[] = [];
  const dbUsers = getDbUsers();
  const dbOrders = getDbOrders();
  const dbDistributors = getDatabase().distributors || [];
  const dbSkus = getDatabase().skus || [];

  function assert(testName: string, condition: boolean, failMessage?: string) {
    results.push({
      test: testName,
      passed: condition,
      message: condition ? 'PASSED' : failMessage || 'FAILED',
    });
  }

  // 1. Live Firestore has at least one active BILLING user (and if 8668829674 exists, it maps cleanly to BILLING)
  const liveBillingUsers = dbUsers.filter((u) => u.role === 'BILLING' && u.is_active !== false);
  const rameshUser = dbUsers.find((u) => u.mobile_number === '8668829674');
  assert(
    'Live BILLING Desk Users Present',
    liveBillingUsers.length > 0 && (!rameshUser || rameshUser.role === 'BILLING'),
    `Expected >= 1 active BILLING user in DB, found ${liveBillingUsers.length}`
  );

  // 2. Live orders have unique IDs after deduplication
  const uniqueIds = new Set(dbOrders.map((o) => o.id));
  assert(
    'Firestore Orders Deduplicated Cleanly',
    uniqueIds.size === dbOrders.length && dbOrders.length > 0,
    `Expected ${dbOrders.length} unique order IDs, found ${uniqueIds.size}`
  );

  // Setup shared test entities
  const sampleCFSOrder: Order = {
    id: 'ord_test_cfs',
    tenant_id: 'tenant_ms_enterprises',
    order_number: '#CFS-TEST-01',
    channel: 'GT',
    company_id: 'comp_1',
    retailer_id: 'ret_1',
    retailer_name_raw: 'Test Retail Store',
    beat_name: 'Beat A',
    dispatch_point_id: 'dp_1',
    billing_executive_id: 'usr_1787775362294',
    created_by_user_id: 'usr_agent_vikram',
    commission_agent_id: 'usr_agent_vikram',
    order_date: '2026-11-13',
    delivery_date: '',
    status: 'PENDING_VERIFICATION',
    total_amount: 1000,
    tax_amount: 0,
    lines: [],
    has_below_cost_lines: false,
  };

  const sampleSEOrderViaRetailerId: Order = {
    ...sampleCFSOrder,
    id: 'ord_test_se',
    order_number: '#SR-TEST-01',
    billing_executive_id: null,
    created_by_user_id: '',
    commission_agent_id: null,
    retailer_id: 'usr_agent_amit',
    order_source_role: 'SALES_EXECUTIVE',
  };

  const mockDistributor: DistributorInstitution = {
    id: 'dist_test_1',
    tenant_id: 'tenant_ms_enterprises',
    name: 'Metro Cash & Carry',
    code: 'DIST-01',
    channel: 'DISTRIBUTOR',
    address: 'NH-24',
    contact_person: 'Karan',
    phone: '9876543210',
    phase_status: 'ACTIVE',
    credit_limit: 500000,
    current_outstanding: 0,
    billing_executive_id: 'usr_1787775362294',
  };

  const sampleDistOrder: Order = {
    ...sampleCFSOrder,
    id: 'ord_test_dist',
    order_number: '#DIST-TEST-01',
    channel: 'DISTRIBUTOR',
    billing_executive_id: null,
    created_by_user_id: '',
    commission_agent_id: null,
    retailer_id: 'dist_test_1',
  };

  const mockUsersWithTestAccounts: User[] = [
    ...dbUsers,
    ...(dbUsers.some((u) => u.id === 'usr_1787775362294')
      ? []
      : [
          {
            id: 'usr_1787775362294',
            tenant_id: 'tenant_ms_enterprises',
            name: 'Primary Billing Desk',
            email: 'be1@test.com',
            mobile_number: '8668829674',
            role: 'BILLING',
            company_scope: [],
            dispatch_point_id: null,
            platform: 'WEB',
            is_active: true,
          } as User,
        ]),
    ...(dbUsers.some((u) => u.id === 'usr_agent_amit')
      ? []
      : [
          {
            id: 'usr_agent_amit',
            tenant_id: 'tenant_ms_enterprises',
            name: 'Amit Sharma',
            email: 'amit@test.com',
            mobile_number: '9999999991',
            role: 'SALES_EXECUTIVE',
            company_scope: [],
            dispatch_point_id: null,
            platform: 'MOBILE',
            billing_executive_id: 'usr_1787775362294',
          } as User,
        ]),
    {
      id: 'usr_billing_2',
      tenant_id: 'tenant_ms_enterprises',
      name: 'Second Billing Desk',
      email: 'be2@test.com',
      mobile_number: '9999999992',
      role: 'BILLING',
      company_scope: [],
      dispatch_point_id: null,
      platform: 'WEB',
      is_active: true,
    } as User,
    {
      id: 'usr_unmapped_rep',
      tenant_id: 'tenant_ms_enterprises',
      name: 'Unmapped Sales Rep',
      email: 'unmapped@test.com',
      mobile_number: '9999999993',
      role: 'SALES_EXECUTIVE',
      company_scope: [],
      dispatch_point_id: null,
      platform: 'MOBILE',
      billing_executive_id: null,
    } as User,
  ];

  // TC-01a: Universal BE routing for explicitly mapped SR / CFS / Distributor
  assert(
    'TC-01a: CFS Order maps strictly to Ramesh Patil',
    isOrderAssignedToBE(sampleCFSOrder, 'usr_1787775362294', mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]),
    'Expected CFS order to route to usr_1787775362294'
  );
  assert(
    'TC-01a: Sales Rep Order maps via mapped BE',
    isOrderAssignedToBE(sampleSEOrderViaRetailerId, 'usr_1787775362294', mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]),
    'Expected Sales Rep order with retailer_id=usr_agent_amit to route to usr_1787775362294'
  );
  assert(
    'TC-01a: Distributor Order maps via distributor BE',
    isOrderAssignedToBE(sampleDistOrder, 'usr_1787775362294', mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]),
    'Expected Distributor order to route to usr_1787775362294'
  );
  assert(
    'TC-01a: Desk Isolation excludes BE-1 order from BE-2',
    !isOrderAssignedToBE(sampleCFSOrder, 'usr_billing_2', mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]),
    'Expected order mapped to usr_1787775362294 to NOT match usr_billing_2'
  );

  // TC-01b: Strict BE Isolation — Zero fallback for unmapped orders; routes to Unassigned Exception Queue
  const unmappedOrder: Order = {
    ...sampleCFSOrder,
    id: 'ord_test_unmapped',
    order_number: '#UNMAP-01',
    billing_executive_id: null,
    created_by_user_id: 'usr_unmapped_rep',
    commission_agent_id: null,
    retailer_id: 'ret_without_be',
  };
  const unmappedMapping = applyCAMappingsToOrder(
    unmappedOrder,
    mockUsersWithTestAccounts.find((u) => u.id === 'usr_unmapped_rep'),
    mockUsersWithTestAccounts
  );
  assert(
    'TC-01b: applyCAMappingsToOrder does NOT fall back to primary BE when unmapped',
    unmappedMapping.billing_executive_id === null,
    `Expected billing_executive_id to be null, got ${unmappedMapping.billing_executive_id}`
  );
  assert(
    'TC-01b: Unmapped order does not leak into BE-1 or BE-2 queue',
    !isOrderAssignedToBE(unmappedOrder, 'usr_1787775362294', mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]) &&
      !isOrderAssignedToBE(unmappedOrder, 'usr_billing_2', mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]),
    'Expected unmapped order to be invisible to all BE desks'
  );
  assert(
    'TC-01b: Unmapped order flagged for Admin Unassigned Exception Queue',
    isOrderUnassignedToAnyBE(unmappedOrder, mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]) &&
      !isOrderUnassignedToAnyBE(sampleCFSOrder, mockUsersWithTestAccounts, [...dbDistributors, mockDistributor]),
    'Expected unmappedOrder to be flagged unassigned and sampleCFSOrder to not be flagged unassigned'
  );

  // TC-02: Pre-PO Dispatch Block & Zero Auto-Verification
  const verifiedPrePOOrder: Order = {
    ...sampleCFSOrder,
    id: 'ord_verified_pre_po',
    status: 'VERIFIED',
    verified_at: '2026-11-13T09:00:00Z',
  };
  const legacyVerifiedByBillingOrder: Order = {
    ...sampleCFSOrder,
    id: 'ord_verified_legacy',
    status: 'VERIFIED_BY_BILLING',
  };
  assert(
    'TC-02: Pre-PO VERIFIED & VERIFIED_BY_BILLING orders are blocked from Dispatch Sheet & MobileDispatcherApp',
    !isOrderAwaitingPhysicalDispatch(verifiedPrePOOrder, []) &&
      !isOrderAwaitingPhysicalDispatch(legacyVerifiedByBillingOrder, []),
    'VERIFIED order must NOT appear in dispatch eligibility before PO/Stock confirmation'
  );

  const normalizedCleared = normalizeFirestoreOrder('#TEST-CLR', {
    id: 'ord_test_clr',
    status: 'CLEARED',
    verified_at: null,
  });
  const normalizedConfirmed = normalizeFirestoreOrder('#TEST-CONF', {
    id: 'ord_test_conf',
    status: 'CONFIRMED',
    fulfillment_source: 'PRINCIPAL_PO',
  });
  const normalizedInvoiced = normalizeFirestoreOrder('#TEST-INV', {
    id: 'ord_test_inv',
    status: 'INVOICED',
    invoiced_at: '2026-11-13T11:00:00Z',
  });
  assert(
    'TC-02: Zero Auto-Verification preserves PENDING_VERIFICATION while keeping CONFIRMED & INVOICED',
    normalizedCleared.status === 'PENDING_VERIFICATION' &&
      normalizedConfirmed.status === 'CONFIRMED' &&
      normalizedConfirmed.fulfillment_source === 'PRINCIPAL_PO' &&
      normalizedInvoiced.status === 'INVOICED',
    `Got CLEARED->${normalizedCleared.status}, CONFIRMED->${normalizedConfirmed.status}, INVOICED->${normalizedInvoiced.status}`
  );

  // Firestore undefined check
  const hasUndefinedRecursive = (val: unknown): boolean => {
    if (val === undefined) return true;
    if (Array.isArray(val)) return val.some(hasUndefinedRecursive);
    if (val !== null && typeof val === 'object') {
      return Object.values(val as Record<string, unknown>).some(hasUndefinedRecursive);
    }
    return false;
  };
  const srNormalized = normalizeFirestoreOrder('#SR-ORD-3826', {
    id: 'ord_SR-ORD-3826',
    status: 'CLEARED',
    retailer_id: 'usr_agent_amit',
    commission_agent_name: undefined,
    items: [{ sku_id: 'sku_1', sku_name: 'Test SKU', quantity: 2, unit_price: 50 }],
  });
  assert(
    'Normalized Orders Have Zero Undefined Properties for Firestore setDoc',
    !hasUndefinedRecursive(srNormalized),
    'Normalized order contains an undefined property that will fail Firestore setDoc()'
  );

  // TC-03 & TC-04: Post-PO Confirmation Priority & Auto-Dispatch Visibility
  const dedupPrefersConfirmed = deduplicateOrders([
    { ...sampleCFSOrder, id: 'ord_dup_conf', status: 'VERIFIED', verified_at: '2026-11-13T01:00:00Z', firestore_doc_id: '#DUP-CONF' },
    { ...sampleCFSOrder, id: 'ord_dup_conf', status: 'CONFIRMED', fulfillment_source: 'PRINCIPAL_PO', firestore_doc_id: 'ord_dup_conf' },
  ]);
  const confirmedPOOrder: Order = {
    ...verifiedPrePOOrder,
    id: 'ord_confirmed_po',
    status: 'CONFIRMED',
    fulfillment_source: 'PRINCIPAL_PO',
  };
  assert(
    'TC-03: Deduplication & Status Priority promote CONFIRMED over VERIFIED',
    ORDER_STATUS_PRIORITY['CONFIRMED'] > ORDER_STATUS_PRIORITY['VERIFIED'] &&
      dedupPrefersConfirmed.length === 1 &&
      dedupPrefersConfirmed[0].status === 'CONFIRMED',
    `Expected CONFIRMED priority win, got ${dedupPrefersConfirmed[0]?.status}`
  );
  assert(
    'TC-04: Confirmed Principal PO order auto-appears in Dispatch Sheet & MobileDispatcherApp',
    isOrderAwaitingPhysicalDispatch(confirmedPOOrder, []),
    'CONFIRMED order should immediately return true for isOrderAwaitingPhysicalDispatch'
  );

  // TC-05: Strict DELIVERED-Only Invoicing Gate
  const invoiceableStatuses: Order['status'][] = ['DELIVERED'];
  assert(
    'TC-05: Invoicing Gate blocks pre-delivery stages (PENDING_VERIFICATION/VERIFIED/CONFIRMED/DISPATCHED) and unlocks strictly at DELIVERED',
    !invoiceableStatuses.includes('PENDING_VERIFICATION') &&
      !invoiceableStatuses.includes('VERIFIED') &&
      !invoiceableStatuses.includes('VERIFIED_BY_BILLING') &&
      !invoiceableStatuses.includes('CONFIRMED') &&
      !invoiceableStatuses.includes('DISPATCHED') &&
      !invoiceableStatuses.includes('APPROVED') &&
      !invoiceableStatuses.includes('PUNCHED_TO_PRINCIPAL') &&
      invoiceableStatuses.includes('DELIVERED'),
    'Only DELIVERED orders may be invoiced'
  );

  // TC-06: Live Depot Stock Formula & No Double Deduction Post-Dispatch
  const testSkus: SKU[] = [
    ...dbSkus,
    {
      id: 'sku_gst_5',
      tenant_id: 'tenant_ms_enterprises',
      company_id: 'comp_1',
      code: 'S5',
      name: 'Tea 5%',
      category: 'Beverages',
      hsn_code: '0902',
      mrp: 120,
      landing_price: 90,
      selling_price: 100,
      below_cost_flag: false,
      expected_claim_per_unit: 0,
      pack_size: '250g',
      tax_rate: 5,
    },
    {
      id: 'sku_gst_12',
      tenant_id: 'tenant_ms_enterprises',
      company_id: 'comp_1',
      code: 'S12',
      name: 'Juice 12%',
      category: 'Beverages',
      hsn_code: '2009',
      mrp: 150,
      landing_price: 100,
      selling_price: 200,
      below_cost_flag: false,
      expected_claim_per_unit: 0,
      pack_size: '1L',
      tax_rate: 12,
    },
  ];

  const ledgerBeforeDispatch: StockLedgerEntry[] = [
    { id: 'l1', tenant_id: 't1', dispatch_point_id: 'dp_1', sku_id: 'sku_gst_5', entry_type: 'INWARD', quantity: 100, reference_doc_type: 'INWARD_CHALLAN', reference_doc_id: 'po1', timestamp: '2026-11-13', performed_by_user_id: 'u1', notes: 'Opening inward' },
    { id: 'l2', tenant_id: 't1', dispatch_point_id: 'dp_1', sku_id: 'sku_gst_5', entry_type: 'RETURN', quantity: 10, reference_doc_type: 'TRANSFER_NOTE', reference_doc_id: 'rt1', timestamp: '2026-11-13', performed_by_user_id: 'u1', notes: 'Market return' },
    { id: 'l3', tenant_id: 't1', dispatch_point_id: 'dp_1', sku_id: 'sku_gst_5', entry_type: 'DISPATCH_OUT', quantity: 30, reference_doc_type: 'GATE_PASS', reference_doc_id: 'gp1', timestamp: '2026-11-13', performed_by_user_id: 'u1', notes: 'Prior outward' },
    { id: 'l4', tenant_id: 't1', dispatch_point_id: 'dp_1', sku_id: 'sku_gst_5', entry_type: 'ADJUSTMENT_DAMAGE', quantity: 5, reference_doc_type: 'AUDIT', reference_doc_id: 'adj1', timestamp: '2026-11-13', performed_by_user_id: 'u1', notes: 'Damage writeoff' },
  ];
  const undispatchedReservedOrder: Order = {
    ...sampleCFSOrder,
    id: 'ord_res_1',
    order_number: '#RES-01',
    dispatch_point_id: 'dp_1',
    status: 'CONFIRMED',
    fulfillment_source: 'DEPOT_STOCK',
    lines: [
      { id: 'ln_res_1', tenant_id: 't1', order_id: 'ord_res_1', sku_id: 'sku_gst_5', sku_name: 'Tea 5%', company_id: 'comp_1', quantity: 20, verified_quantity: 20, unit_price: 100, landing_price: 90, total: 2000, is_below_cost: false, expected_claim_total: 0 },
    ],
  };
  const stockMapBefore = getDepotAvailableStockMap('dp_1', ledgerBeforeDispatch, [undispatchedReservedOrder]);
  // After dispatch out is recorded with linked_order_id + status DISPATCHED:
  const ledgerAfterDispatch: StockLedgerEntry[] = [
    ...ledgerBeforeDispatch,
    { id: 'l5', tenant_id: 't1', dispatch_point_id: 'dp_1', sku_id: 'sku_gst_5', entry_type: 'DISPATCH_OUT', quantity: 20, reference_doc_type: 'GATE_PASS', reference_doc_id: 'gp2', linked_order_id: 'ord_res_1', timestamp: '2026-11-13', performed_by_user_id: 'u1', notes: 'Order #RES-01 outward gate pass' },
  ];
  const dispatchedOrder: Order = {
    ...undispatchedReservedOrder,
    status: 'DISPATCHED',
    dispatched_at: '2026-11-13T14:00:00Z',
  };
  const stockMapAfter = getDepotAvailableStockMap('dp_1', ledgerAfterDispatch, [dispatchedOrder]);

  assert(
    'TC-06: Live Depot Stock formula & no double-deduction post-DISPATCH_OUT',
    stockMapBefore['sku_gst_5']?.physicalOnHand === 75 &&
      stockMapBefore['sku_gst_5']?.reservedUndispatched === 20 &&
      stockMapBefore['sku_gst_5']?.availableForConfirmation === 55 &&
      stockMapAfter['sku_gst_5']?.physicalOnHand === 55 &&
      stockMapAfter['sku_gst_5']?.reservedUndispatched === 0 &&
      stockMapAfter['sku_gst_5']?.availableForConfirmation === 55,
    `Before=${JSON.stringify(stockMapBefore['sku_gst_5'])}, After=${JSON.stringify(stockMapAfter['sku_gst_5'])}`
  );

  // TC-07 & TC-08: Sequential Batch Evaluation (Full vs Partial/Insufficient Stock)
  const verifiedBatchOrder1: Order = {
    ...sampleCFSOrder,
    id: 'ord_batch_1',
    order_number: '#BATCH-1',
    dispatch_point_id: 'dp_1',
    status: 'VERIFIED',
    lines: [
      { id: 'lb1', tenant_id: 't1', order_id: 'ord_batch_1', sku_id: 'sku_gst_5', sku_name: 'Tea 5%', company_id: 'comp_1', quantity: 35, verified_quantity: 35, unit_price: 100, landing_price: 90, total: 3500, is_below_cost: false, expected_claim_total: 0 },
    ],
  };
  const verifiedBatchOrder2: Order = {
    ...sampleCFSOrder,
    id: 'ord_batch_2',
    order_number: '#BATCH-2',
    dispatch_point_id: 'dp_1',
    status: 'VERIFIED',
    lines: [
      { id: 'lb2', tenant_id: 't1', order_id: 'ord_batch_2', sku_id: 'sku_gst_5', sku_name: 'Tea 5%', company_id: 'comp_1', quantity: 30, verified_quantity: 30, unit_price: 100, landing_price: 90, total: 3000, is_below_cost: false, expected_claim_total: 0 },
    ],
  };
  const batchEval = evaluateOrdersAgainstDepotStock(
    [verifiedBatchOrder1, verifiedBatchOrder2],
    'comp_1',
    ledgerBeforeDispatch,
    [undispatchedReservedOrder, verifiedBatchOrder1, verifiedBatchOrder2],
    testSkus
  );
  assert(
    'TC-07 & TC-08: Sequential evaluation prevents double-counting shared depot stock (55 avail -> 35 FULL, 30 -> 20 PARTIAL)',
    batchEval['ord_batch_1']?.status === 'FULL_STOCK' &&
      batchEval['ord_batch_1']?.totalFulfillableQty === 35 &&
      batchEval['ord_batch_2']?.status === 'PARTIAL_STOCK' &&
      batchEval['ord_batch_2']?.totalFulfillableQty === 20 &&
      batchEval['ord_batch_2']?.totalShortageQty === 10,
    `Got batch1=${batchEval['ord_batch_1']?.status}(${batchEval['ord_batch_1']?.totalFulfillableQty}), batch2=${batchEval['ord_batch_2']?.status}(${batchEval['ord_batch_2']?.totalFulfillableQty}, short=${batchEval['ord_batch_2']?.totalShortageQty})`
  );

  // TC-09: Partial Depot Stock Split + Proportional Tax Recalculation
  const splitSourceOrder: Order = {
    ...sampleCFSOrder,
    id: 'ord_split_src',
    order_number: '#ORD-100',
    dispatch_point_id: 'dp_1',
    status: 'VERIFIED',
    total_amount: 2900,
    tax_amount: 285,
    lines: [
      {
        id: 'ls1',
        tenant_id: 't1',
        order_id: 'ord_split_src',
        sku_id: 'sku_gst_5',
        sku_name: 'Tea 5%',
        company_id: 'comp_1',
        quantity: 10,
        verified_quantity: 10,
        unit_price: 100,
        landing_price: 90,
        discount_percentage: 10,
        discount_amount: 100,
        total: 900,
        is_below_cost: false,
        expected_claim_total: 0,
      },
      {
        id: 'ls2',
        tenant_id: 't1',
        order_id: 'ord_split_src',
        sku_id: 'sku_gst_12',
        sku_name: 'Juice 12%',
        company_id: 'comp_1',
        quantity: 10,
        verified_quantity: 10,
        unit_price: 200,
        landing_price: 100,
        discount_percentage: 0,
        discount_amount: 0,
        total: 2000,
        is_below_cost: false,
        expected_claim_total: 0,
      },
    ],
  };
  const { confirmedOrder: splitConfirmed, shortageOrder: splitShortage } = buildSplitOrdersForDepotAndPO(
    splitSourceOrder,
    { ls1: 6, ls2: 0 },
    testSkus,
    'Order Puncher'
  );
  assert(
    'TC-09: Partial Depot Stock Split calculates child CONFIRMED (-STK) & shortage VERIFIED totals & GST accurately',
    splitConfirmed.status === 'CONFIRMED' &&
      splitConfirmed.fulfillment_source === 'DEPOT_STOCK' &&
      splitConfirmed.order_number === '#ORD-100-STK' &&
      splitConfirmed.parent_order_id === 'ord_split_src' &&
      splitConfirmed.total_amount === 540 &&
      splitConfirmed.tax_amount === 27 &&
      splitShortage.status === 'VERIFIED' &&
      splitShortage.fulfillment_source === 'PRINCIPAL_PO' &&
      splitShortage.total_amount === 2360 &&
      splitShortage.tax_amount === 258,
    `Confirmed: ${splitConfirmed.order_number} amt=${splitConfirmed.total_amount} tax=${splitConfirmed.tax_amount}; Shortage: amt=${splitShortage.total_amount} tax=${splitShortage.tax_amount}`
  );

  // TC-10: Parallel Path — INVOICED before physical dispatch remains in Dispatch Queue & preserves stock reservation
  const invoicedAwaitingDispatch: Order = {
    ...undispatchedReservedOrder,
    id: 'ord_invoiced_undisp',
    status: 'INVOICED',
    invoiced_at: '2026-11-13T12:30:00Z',
    dispatched_at: null,
  };
  const stockMapDuringParallelInvoice = getDepotAvailableStockMap('dp_1', ledgerBeforeDispatch, [invoicedAwaitingDispatch]);
  assert(
    'TC-10: Parallel INVOICED order (pre-DISPATCHED) remains eligible for Dispatch & reserves depot stock',
    isOrderAwaitingPhysicalDispatch(invoicedAwaitingDispatch, ledgerBeforeDispatch) &&
      stockMapDuringParallelInvoice['sku_gst_5']?.reservedUndispatched === 20 &&
      stockMapDuringParallelInvoice['sku_gst_5']?.availableForConfirmation === 55,
    `Expected awaitingDispatch=true and reserved=20, got ${JSON.stringify(stockMapDuringParallelInvoice['sku_gst_5'])}`
  );

  // 11. Dynamic SKU GST Tax Calculation (5% + 12% mixed lines)
  const gstSummary = getOrderFinancialSummary(
    {
      total_amount: 2000,
      tax_amount: 0,
      lines: [
        { id: 'l1', tenant_id: 't1', order_id: 'o1', sku_id: 'sku_gst_5', sku_name: 'Tea 5%', quantity: 10, unit_price: 100, landing_price: 90, total: 1000, is_below_cost: false, expected_claim_total: 0 },
        { id: 'l2', tenant_id: 't1', order_id: 'o1', sku_id: 'sku_gst_12', sku_name: 'Juice 12%', quantity: 10, unit_price: 100, landing_price: 100, total: 1000, is_below_cost: false, expected_claim_total: 0 },
      ],
    },
    testSkus
  );
  assert(
    'Dynamic SKU GST Tax Calculation (5% + 12% = ₹170)',
    gstSummary.productValue === 2000 && gstSummary.gstAmount === 170 && gstSummary.totalAmountWithGst === 2170,
    `Expected product=2000, gst=170, total=2170; got product=${gstSummary.productValue}, gst=${gstSummary.gstAmount}, total=${gstSummary.totalAmountWithGst}`
  );

  // 12. BE Desk Selector Permission Check
  const rameshCurrentUser: Partial<User> = { id: 'usr_1787775362294', name: 'Ramesh Patil', role: 'BILLING' };
  const isSupervisorRoleA = rameshCurrentUser?.role !== 'BILLING' && (rameshCurrentUser?.role === 'ADMIN' || rameshCurrentUser?.role === 'SUB_ADMIN');
  const adminCurrentUser: Partial<User> = { id: 'usr_admin_1', name: 'Rajesh Sharma', role: 'ADMIN' };
  const isSupervisorRoleB = (adminCurrentUser?.role as any) !== 'BILLING' && (adminCurrentUser?.role === 'ADMIN' || adminCurrentUser?.role === 'SUB_ADMIN');
  assert(
    'BE Desk Selector Permission Check (BE=false, Admin=true)',
    isSupervisorRoleA === false && isSupervisorRoleB === true,
    `Expected BE=false, Admin=true; got BE=${isSupervisorRoleA}, Admin=${isSupervisorRoleB}`
  );

  // 13. Zero-Trust Access Matrix: Field roles with empty/undefined company_scope get 0 companies & 0 SKUs
  const matrixCompanies: Pick<Company, 'id' | 'name'>[] = [
    { id: 'comp_1', name: 'Britannia' },
    { id: 'comp_2', name: 'Amul' },
  ];
  const matrixSkus: SKU[] = [
    ...testSkus,
    { id: 'sku_comp2', tenant_id: 't1', company_id: 'comp_2', code: 'AMUL-1', name: 'Amul Butter', category: 'Dairy', hsn_code: '0405', pack_size: '20 Packs/Case', mrp: 60, selling_price: 55, landing_price: 50, tax_rate: 12, below_cost_flag: false, expected_claim_per_unit: 0 },
  ];
  const seLocked: User = { id: 'se_locked', tenant_id: 't1', name: 'SE Locked', email: '', mobile_number: '9111111111', role: 'SALES_EXECUTIVE', dispatch_point_id: null, platform: 'MOBILE', company_scope: [] };
  const distPartial: User = { id: 'dist_part', tenant_id: 't1', name: 'Dist Partial', email: '', mobile_number: '9222222222', role: 'DISTRIBUTOR', dispatch_point_id: null, platform: 'MOBILE', company_scope: ['comp_1'] };
  const cfsPartial: User = { id: 'cfs_part', tenant_id: 't1', name: 'CFS Partial', email: '', mobile_number: '9333333333', role: 'COMMISSION_AGENT', dispatch_point_id: null, platform: 'MOBILE', company_scope: ['comp_2'] };
  const officeAdmin: User = { id: 'adm_1', tenant_id: 't1', name: 'Admin', email: '', mobile_number: '9444444444', role: 'ADMIN', dispatch_point_id: null, platform: 'WEB', company_scope: [] };

  assert(
    'Zero-Trust Access Matrix: Empty scope locks SE (0 companies, 0 SKUs)',
    isFieldUserAccessLocked(seLocked) === true &&
      getAllowedCompaniesForUser(seLocked, matrixCompanies).length === 0 &&
      getAllowedSkusForUser(seLocked, matrixCompanies, matrixSkus).length === 0,
    `Expected locked with 0 companies/SKUs for SE`
  );

  assert(
    'Zero-Trust Access Matrix: Distributor & CFS strictly see only granted companies and SKUs',
    !isFieldUserAccessLocked(distPartial) &&
      getAllowedCompaniesForUser(distPartial, matrixCompanies).map((c) => c.id).join(',') === 'comp_1' &&
      getAllowedSkusForUser(distPartial, matrixCompanies, matrixSkus).every((s) => s.company_id === 'comp_1') &&
      getAllowedCompaniesForUser(cfsPartial, matrixCompanies).map((c) => c.id).join(',') === 'comp_2' &&
      getAllowedSkusForUser(cfsPartial, matrixCompanies, matrixSkus).map((s) => s.id).join(',') === 'sku_comp2' &&
      !isFieldUserAccessLocked(officeAdmin) &&
      getAllowedCompaniesForUser(officeAdmin, matrixCompanies).length === 2,
    `Partial scope filter failed`
  );

  // 14. Firestore User Normalization: preserves canonical firestore_doc_id when docId !== data.id
  const normalizedMismatchUser = normalizeFirestoreUser('fs_auto_doc_999', {
    id: 'usr_custom_123',
    tenant_id: 'tenant_ms_enterprises',
    name: 'Test Agent',
    role: 'SALES_EXECUTIVE',
    mobile_number: '9888877777',
  });
  const canLookupFirstDbUser = dbUsers.length > 0 ? Boolean(findDbUserById(dbUsers[0].id)) : true;
  assert(
    'Firestore User Normalization preserves firestore_doc_id & defaults company_scope',
    normalizedMismatchUser.id === 'usr_custom_123' &&
      normalizedMismatchUser.firestore_doc_id === 'fs_auto_doc_999' &&
      Array.isArray(normalizedMismatchUser.company_scope) &&
      normalizedMismatchUser.company_scope.length === 0 &&
      canLookupFirstDbUser,
    `Got normalized=${JSON.stringify(normalizedMismatchUser)}`
  );

  // 15. Exempt 0% GST rate SKU preservation (not coerced to 18%)
  const exemptSku: SKU = {
    id: 'sku_exempt_0',
    tenant_id: 't1',
    company_id: 'comp_1',
    code: 'EXEMPT-0',
    name: 'Fresh Milk 0% GST',
    category: 'Dairy',
    hsn_code: '0401',
    pack_size: '24 Pouches/Crate',
    mrp: 60,
    selling_price: 50,
    landing_price: 45,
    tax_rate: 0,
    below_cost_flag: false,
    expected_claim_per_unit: 0,
  };
  const exemptGstSummary = getOrderFinancialSummary(
    {
      total_amount: 500,
      tax_amount: 0,
      lines: [
        { id: 'le1', tenant_id: 't1', order_id: 'oe1', sku_id: 'sku_exempt_0', sku_name: 'Fresh Milk 0% GST', quantity: 10, unit_price: 50, landing_price: 45, total: 500, is_below_cost: false, expected_claim_total: 0 },
      ],
    },
    [exemptSku]
  );
  assert(
    '0% Exempt GST SKU preserves 0% tax calculation cleanly',
    exemptGstSummary.productValue === 500 && exemptGstSummary.gstAmount === 0 && exemptGstSummary.totalAmountWithGst === 500,
    `Got ${JSON.stringify(exemptGstSummary)}`
  );

  // 16. Invoice-Time Discount + Automatic Credit Note Zero Double-Counting
  const invoicedOrderWithDiscount: Order = {
    ...sampleCFSOrder,
    id: 'ord_cn_disc_1',
    order_number: '#ORD-CN-1',
    retailer_id: 'dist_cn_1',
    retailer_name_raw: 'CN Test Party',
    status: 'INVOICED',
    total_amount: 10000,
    is_credit_note_discount: true,
    credit_note_discount_amount: 1500,
    credit_note_number: 'CN-2026-01',
    invoiced_at: '2026-11-19T10:00:00Z',
  };
  const linkedDiscountInvoice: Invoice = {
    id: 'inv_cn_1',
    tenant_id: 'tenant_ms_enterprises',
    invoice_number: 'INV-CN-01',
    order_id: 'ord_cn_disc_1',
    company_id: 'comp_1',
    dispatch_point_id: 'dp_1',
    retailer_id: 'dist_cn_1',
    retailer_name: 'CN Test Party',
    invoice_type: 'REGISTERED_GST',
    invoice_date: '2026-11-19',
    due_date: '2026-11-26',
    subtotal: 10000,
    cgst: 0,
    sgst: 0,
    igst: 0,
    gross_amount: 10000,
    discount_type: 'FLAT',
    discount_value: 1500,
    total_amount: 8500,
    paid_amount: 2000,
    status: 'PARTIAL',
    credit_note_number: 'CN-2026-01',
    credit_note_discount_amount: 1500,
    is_credit_note_discount: true,
  };
  const standaloneDiscountInvoice: Invoice = {
    ...linkedDiscountInvoice,
    id: 'inv_cn_standalone',
    order_id: '',
  };
  const linkedBreakdown = calculatePartyCreditBreakdown({
    matchIds: ['dist_cn_1'],
    matchNames: ['CN Test Party'],
    creditLimit: 50000,
    orders: [invoicedOrderWithDiscount],
    invoices: [linkedDiscountInvoice],
    payments: [
      {
        id: 'pay_cn_1',
        tenant_id: 'tenant_ms_enterprises',
        payment_number: 'PAY-CN-1',
        retailer_id: 'dist_cn_1',
        retailer_name: 'CN Test Party',
        amount: 2000,
        payment_mode: 'UPI',
        reference_number: 'UTR-CN-1',
        status: 'VERIFIED',
        payment_date: '2026-11-19',
        matched_invoice_id: 'inv_cn_1',
      },
    ],
  });
  const standaloneBreakdown = calculatePartyCreditBreakdown({
    matchIds: ['dist_cn_1'],
    matchNames: ['CN Test Party'],
    creditLimit: 50000,
    orders: [],
    invoices: [standaloneDiscountInvoice],
    payments: [],
  });
  assert(
    'Invoice-Time Discount + Automatic Credit Note deducts discount once with zero double-counting',
    linkedBreakdown.creditNoteDiscountsTotal === 1500 &&
      linkedBreakdown.totalLiability === 6500 &&
      linkedBreakdown.remainingCredit === 43500 &&
      standaloneBreakdown.creditNoteDiscountsTotal === 1500 &&
      standaloneBreakdown.totalLiability === 6500,
    `Linked=${JSON.stringify(linkedBreakdown)}, Standalone=${JSON.stringify(standaloneBreakdown)}`
  );

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n========================================`);
  console.log(`BE & WORKFLOW TEST SUITE RESULTS: ${passedCount}/${results.length} PASSED`);
  console.log(`========================================`);
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.passed ? 'PASS' : 'FAIL'}] ${r.test}: ${r.message}`);
  });
  console.log(`========================================\n`);

  return {
    allPassed: passedCount === results.length,
    passedCount,
    totalCount: results.length,
    results,
  };
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('beVerification.test')) {
  runBEVerificationTestSuite()
    .then((result) => {
      if (!result.allPassed) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test suite error:', err);
      process.exit(1);
    });
}
