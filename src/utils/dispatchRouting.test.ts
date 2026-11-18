import {
  buildDispatchSkuPartyMatrix,
  doesOrderBelongToDispatchPoint,
  getDispatchPickupBreakdown,
  resolveDispatchPointSupervisor,
  serializeDispatchMatrixToCsv,
  splitOrderByDispatchPoint,
  syncDispatchPointsForUsers,
} from './dispatchRouting';
import {
  MOBILE_ONLY_ROLES,
  WEB_PORTAL_ALLOWED_ROLES,
  getPlatformForRole,
  getWebPortalBlockedMessage,
  hashClientPassword,
  isMobileOnlyRole,
  isWebPortalAllowedRole,
} from './authClient';
import {
  checkRateLimit,
  clearInMemorySessionCacheForTest,
  clearRateLimit,
  createSession,
  getSession,
  hashPassword,
  invalidateAllUserSessions,
  invalidateSession,
  recordFailedAttempt,
  verifyPassword,
} from '../../server/authService';
import {
  buildPartyCreditRecords,
  calculatePartyCreditBreakdown,
  computeUserLiveCreditProfile,
  resolveOrderCreditExposure,
} from './creditLedger';
import { calculateCreditExposure } from './caRoutingLogic';
import { normalizeFirestoreUser } from '../firebase/firestoreService';
import { Company, DispatchPoint, DistributorInstitution, Invoice, Order, Payment, Retailer, SKU, User } from '../types';

export function runDispatchRoutingTestSuite() {
  const results: { test: string; passed: boolean; message?: string }[] = [];

  function assert(testName: string, condition: boolean, failMessage?: string) {
    results.push({
      test: testName,
      passed: condition,
      message: condition ? 'PASSED' : failMessage || 'FAILED',
    });
  }

  const dispatchPoints: DispatchPoint[] = [
    {
      id: 'dp_a',
      tenant_id: 't1',
      name: 'Depot A - North Hub',
      code: 'DP-A',
      address: 'Plot 12, North Industrial Estate',
      supervisor_name: 'Suresh',
      phone: '9800000001',
    },
    {
      id: 'dp_b',
      tenant_id: 't1',
      name: 'Depot B - South Hub',
      code: 'DP-B',
      address: 'Sector 45, South Logistics Park',
      supervisor_name: 'Rakesh',
      phone: '9800000002',
    },
  ];

  const companies: Company[] = [
    {
      id: 'comp_x',
      tenant_id: 't1',
      name: 'Company X Foods',
      code: 'CMPX',
      relationship_type: 'SS',
      gstin: '27AAACX1234A1Z1',
      dispatch_point_id: 'dp_a',
      contact_person: 'A',
      email: 'a@cmpx.test',
      phone: '9000000001',
    },
    {
      id: 'comp_y',
      tenant_id: 't1',
      name: 'Company Y Dairy',
      code: 'CMPY',
      relationship_type: 'SS',
      gstin: '27AAACY1234A1Z2',
      dispatch_point_id: 'dp_b',
      contact_person: 'B',
      email: 'b@cmpy.test',
      phone: '9000000002',
    },
  ];

  const skus: SKU[] = [
    {
      id: 'sku_x1',
      tenant_id: 't1',
      company_id: 'comp_x',
      code: 'X-BISC-10',
      name: 'Crisp Biscuit 100g',
      category: 'Biscuits',
      hsn_code: '1905',
      pack_size: '1x24',
      mrp: 120,
      selling_price: 100,
      landing_price: 85,
      tax_rate: 18,
      below_cost_flag: false,
      expected_claim_per_unit: 0,
    },
    {
      id: 'sku_y1',
      tenant_id: 't1',
      company_id: 'comp_y',
      code: 'Y-MILK-0',
      name: 'Pure Cow Milk 1L',
      category: 'Dairy',
      hsn_code: '0401',
      pack_size: '1x12',
      mrp: 70,
      selling_price: 60,
      landing_price: 52,
      tax_rate: 0,
      below_cost_flag: false,
      expected_claim_per_unit: 0,
    },
  ];

  const users: User[] = [
    {
      id: 'usr_cfs_1',
      tenant_id: 't1',
      name: 'Vikram CFS',
      mobile_number: '9911000001',
      role: 'COMMISSION_AGENT',
      company_scope: ['comp_x', 'comp_y'],
      dispatch_point_id: 'dp_a',
      platform: 'MOBILE',
      is_active: true,
      billing_executive_id: 'usr_be_1',
    },
    {
      id: 'usr_sr_1',
      tenant_id: 't1',
      name: 'Amit SR',
      mobile_number: '9911000002',
      role: 'SALES_EXECUTIVE',
      company_scope: ['comp_x'],
      dispatch_point_id: 'dp_a',
      platform: 'MOBILE',
      is_active: true,
      billing_executive_id: 'usr_be_1',
    },
    {
      id: 'usr_dist_1',
      tenant_id: 't1',
      name: 'Metro Traders',
      mobile_number: '9911000003',
      role: 'DISTRIBUTOR',
      company_scope: ['comp_y'],
      dispatch_point_id: 'dp_b',
      platform: 'MOBILE',
      is_active: true,
      billing_executive_id: 'usr_be_1',
    },
  ];

  // Scenario A: CFS submits combined order containing SKUs from Company X (DP A) and Company Y (DP B)
  const mixedCfsOrder: Order = {
    id: 'ord_cfs_mixed_1',
    tenant_id: 't1',
    order_number: 'ORD-GT-9001',
    channel: 'GT',
    company_id: 'MULTI',
    company_ids: ['comp_x', 'comp_y'],
    retailer_id: 'ret_party_alpha',
    retailer_name_raw: 'Alpha Supermart',
    beat_name: 'Beat North',
    dispatch_point_id: 'dp_a',
    billing_executive_id: 'usr_be_1',
    created_by_user_id: 'usr_cfs_1',
    commission_agent_id: 'usr_cfs_1',
    commission_agent_name: 'Vikram CFS',
    order_source_role: 'COMMISSION_AGENT',
    order_date: '2026-11-14',
    delivery_date: '2026-11-15',
    status: 'CONFIRMED',
    total_amount: 1780,
    tax_amount: 180,
    has_below_cost_lines: false,
    lines: [
      {
        id: 'ol_1',
        tenant_id: 't1',
        order_id: 'ord_cfs_mixed_1',
        sku_id: 'sku_x1',
        sku_name: 'Crisp Biscuit 100g',
        quantity: 10,
        unit_price: 100,
        landing_price: 85,
        total: 1000,
        is_below_cost: false,
        expected_claim_total: 0,
        company_id: 'comp_x',
        company_name: 'Company X Foods',
      },
      {
        id: 'ol_2',
        tenant_id: 't1',
        order_id: 'ord_cfs_mixed_1',
        sku_id: 'sku_y1',
        sku_name: 'Pure Cow Milk 1L',
        quantity: 10,
        unit_price: 60,
        landing_price: 52,
        total: 600,
        is_below_cost: false,
        expected_claim_total: 0,
        company_id: 'comp_y',
        company_name: 'Company Y Dairy',
      },
    ],
  };

  const splitOrders = splitOrderByDispatchPoint(mixedCfsOrder, companies, skus, dispatchPoints);
  const dpAOrder = splitOrders.find((o) => o.dispatch_point_id === 'dp_a');
  const dpBOrder = splitOrders.find((o) => o.dispatch_point_id === 'dp_b');

  assert(
    'Multi-DP CFS Order Dynamically Splits into 2 Child Orders',
    splitOrders.length === 2 &&
      Boolean(dpAOrder && dpBOrder) &&
      dpAOrder?.parent_order_id === 'ord_cfs_mixed_1' &&
      dpBOrder?.parent_order_id === 'ord_cfs_mixed_1',
    `Expected 2 child orders for dp_a & dp_b, got ${splitOrders.length}`
  );

  assert(
    'Split Child Orders Route Exclusively & Preserve BE + GST Calculation',
    Boolean(
      dpAOrder &&
        dpBOrder &&
        dpAOrder.lines.length === 1 &&
        dpAOrder.lines[0].sku_id === 'sku_x1' &&
        dpAOrder.tax_amount === 180 &&
        dpAOrder.total_amount === 1180 &&
        dpAOrder.billing_executive_id === 'usr_be_1' &&
        dpBOrder.lines.length === 1 &&
        dpBOrder.lines[0].sku_id === 'sku_y1' &&
        dpBOrder.tax_amount === 0 &&
        dpBOrder.total_amount === 600 &&
        doesOrderBelongToDispatchPoint(dpAOrder, 'dp_a', companies, skus) &&
        !doesOrderBelongToDispatchPoint(dpAOrder, 'dp_b', companies, skus) &&
        doesOrderBelongToDispatchPoint(dpBOrder, 'dp_b', companies, skus) &&
        !doesOrderBelongToDispatchPoint(dpBOrder, 'dp_a', companies, skus)
    ),
    `DP-A total=${dpAOrder?.total_amount}, DP-B total=${dpBOrder?.total_amount}`
  );

  const pickups = getDispatchPickupBreakdown(splitOrders, companies, skus, dispatchPoints);
  assert(
    'Pickup Breakdown Exposes Both Dispatch Point Locations & Addresses to CFS',
    pickups.length === 2 &&
      pickups.some((p) => p.dispatchPointId === 'dp_a' && p.dispatchPointName === 'Depot A - North Hub' && p.address.includes('North Industrial')) &&
      pickups.some((p) => p.dispatchPointId === 'dp_b' && p.dispatchPointName === 'Depot B - South Hub' && p.address.includes('South Logistics')),
    `Got pickup locations: ${JSON.stringify(pickups.map((p) => p.dispatchPointName))}`
  );

  // Scenario B: Single-DP order should NOT split awkwardly into -DP1
  const singleDpOrder: Order = {
    ...mixedCfsOrder,
    id: 'ord_sr_single_1',
    order_number: 'ORD-SR-5001',
    commission_agent_id: null,
    commission_agent_name: undefined,
    created_by_user_id: 'usr_sr_1',
    order_raiser_name: 'Amit SR',
    order_source_role: 'SALES_EXECUTIVE',
    retailer_id: 'ret_party_beta',
    retailer_name_raw: 'Beta Provision Store',
    company_id: 'comp_x',
    company_ids: ['comp_x'],
    lines: [mixedCfsOrder.lines[0]],
  };

  const singleResult = splitOrderByDispatchPoint(singleDpOrder, companies, skus, dispatchPoints);
  assert(
    'Single-DP Order Remains Unsplit & Preserves Order Number',
    singleResult.length === 1 && singleResult[0].order_number === 'ORD-SR-5001' && singleResult[0].dispatch_point_id === 'dp_a',
    `Got ${singleResult.length} orders: ${singleResult.map((o) => o.order_number).join(', ')}`
  );

  // Scenario C: Distributor order in DP B
  const distOrder: Order = {
    ...mixedCfsOrder,
    id: 'ord_dist_1',
    order_number: 'ORD-DIST-7001',
    channel: 'DISTRIBUTOR',
    commission_agent_id: null,
    commission_agent_name: undefined,
    created_by_user_id: 'usr_dist_1',
    order_raiser_name: 'Metro Traders',
    order_source_role: 'DISTRIBUTOR',
    retailer_id: 'dist_metro',
    retailer_name_raw: 'Metro Traders',
    dispatch_point_id: 'dp_b',
    company_id: 'comp_y',
    company_ids: ['comp_y'],
    lines: [{ ...mixedCfsOrder.lines[1], quantity: 25, total: 1500 }],
  };

  const allConfirmedOrders = [...splitOrders, ...singleResult, distOrder];

  // Matrix Check for Dispatch Point A (Company X ONLY)
  const matrixA = buildDispatchSkuPartyMatrix(allConfirmedOrders, 'dp_a', companies, skus, users, dispatchPoints);
  const csvA = serializeDispatchMatrixToCsv(matrixA);
  const csvALines = csvA.split('\n');

  assert(
    'DP-A SKU-vs-Party Matrix Pulls ONLY Company X SKUs & Shows Party Columns in Row 1',
    matrixA.rows.length === 1 &&
      matrixA.rows[0].skuName === 'Crisp Biscuit 100g' &&
      !matrixA.rows.some((r) => r.companyId === 'comp_y') &&
      matrixA.parties.length === 2 &&
      csvALines[0].startsWith('"SKU Name"') &&
      csvALines[0].includes('Alpha Supermart') &&
      csvALines[0].includes('Beta Provision Store') &&
      !csvALines[0].includes('Metro Traders') &&
      csvALines[1].includes('"Crisp Biscuit 100g",10,10,20') &&
      matrixA.grandTotalQuantity === 20,
    `DP-A CSV:\n${csvA}`
  );

  // Matrix Check for Dispatch Point B (Company Y ONLY)
  const matrixB = buildDispatchSkuPartyMatrix(allConfirmedOrders, 'dp_b', companies, skus, users, dispatchPoints);
  const csvB = serializeDispatchMatrixToCsv(matrixB);
  const csvBLines = csvB.split('\n');

  assert(
    'DP-B SKU-vs-Party Matrix Pulls ONLY Company Y SKUs & Excludes Company X SKUs',
    matrixB.rows.length === 1 &&
      matrixB.rows[0].skuName === 'Pure Cow Milk 1L' &&
      !matrixB.rows.some((r) => r.companyId === 'comp_x') &&
      matrixB.parties.length === 2 &&
      csvBLines[0].includes('Alpha Supermart') &&
      csvBLines[0].includes('Metro Traders') &&
      !csvBLines[0].includes('Beta Provision Store') &&
      matrixB.grandTotalQuantity === 35,
    `DP-B CSV:\n${csvB}`
  );

  // Scenario D: Lockout policy check (3 failed attempts -> 30 minutes lockout)
  const testKey = '127.0.0.99_7677681227';
  clearRateLimit(testKey);
  const attempt1 = recordFailedAttempt(testKey);
  const attempt2 = recordFailedAttempt(testKey);
  const attempt3 = recordFailedAttempt(testKey);
  const lockState = checkRateLimit(testKey);
  clearRateLimit(testKey);

  assert(
    'Auth Lockout Triggers on 3rd Failed Attempt for 30 Minutes',
    !attempt1.isNowLocked &&
      !attempt2.isNowLocked &&
      attempt3.isNowLocked &&
      attempt3.lockDurationMinutes === 30 &&
      lockState.isLocked &&
      (lockState.remainingLockSeconds || 0) > 29 * 60,
    `Got attempt1=${JSON.stringify(attempt1)}, attempt3=${JSON.stringify(attempt3)}, lock=${JSON.stringify(lockState)}`
  );

  // Scenario E: Dispatch Point / Hub Supervisor Sync (Create, Reassign, Delete Dispatcher)
  const initialHubs: DispatchPoint[] = [
    {
      id: 'dp_hub_1',
      tenant_id: 't1',
      name: 'Central Hub',
      code: 'DP-C1',
      address: 'NH-8 Warehouse Complex',
      supervisor_name: 'No Supervisor',
      phone: '',
    },
    {
      id: 'dp_hub_2',
      tenant_id: 't1',
      name: 'West Hub',
      code: 'DP-W2',
      address: 'West Zone Logistics',
      supervisor_name: 'Supervisor',
      phone: '',
    },
  ];

  const newDispatcher: User = {
    id: 'usr_disp_1',
    tenant_id: 't1',
    name: 'Manoj Kumar',
    mobile_number: '9876501234',
    role: 'DISPATCHER',
    company_scope: [],
    dispatch_point_id: 'dp_hub_1',
    platform: getPlatformForRole('DISPATCHER'),
    is_active: true,
  };

  const syncAfterCreate = syncDispatchPointsForUsers(initialHubs, [newDispatcher], ['dp_hub_1']);
  const createdHub1 = syncAfterCreate.updatedDispatchPoints.find((dp) => dp.id === 'dp_hub_1');
  const resolvedHub2Placeholder = resolveDispatchPointSupervisor(
    syncAfterCreate.updatedDispatchPoints.find((dp) => dp.id === 'dp_hub_2'),
    [newDispatcher]
  );

  assert(
    'Creating Dispatcher Syncs Warehouse Supervisor Name, ID & Phone and Ignores Placeholder Supervisor',
    createdHub1?.supervisor_name === 'Manoj Kumar' &&
      createdHub1?.dispatcher_user_id === 'usr_disp_1' &&
      createdHub1?.phone === '+91 9876501234' &&
      syncAfterCreate.changedDispatchPoints.length === 1 &&
      resolvedHub2Placeholder.supervisorName === 'No Supervisor' &&
      resolvedHub2Placeholder.isAssignedDispatcher === false,
    `Created Hub 1: ${JSON.stringify(createdHub1)}, Hub 2 resolved: ${JSON.stringify(resolvedHub2Placeholder)}`
  );

  const reassignedDispatcher: User = { ...newDispatcher, dispatch_point_id: 'dp_hub_2' };
  const syncAfterReassign = syncDispatchPointsForUsers(
    syncAfterCreate.updatedDispatchPoints,
    [reassignedDispatcher],
    ['dp_hub_1', 'dp_hub_2']
  );
  const reassignedHub1 = syncAfterReassign.updatedDispatchPoints.find((dp) => dp.id === 'dp_hub_1');
  const reassignedHub2 = syncAfterReassign.updatedDispatchPoints.find((dp) => dp.id === 'dp_hub_2');

  assert(
    'Reassigning Dispatcher Clears Previous Hub to No Supervisor and Updates New Hub',
    reassignedHub1?.supervisor_name === 'No Supervisor' &&
      reassignedHub1?.dispatcher_user_id === undefined &&
      reassignedHub2?.supervisor_name === 'Manoj Kumar' &&
      reassignedHub2?.dispatcher_user_id === 'usr_disp_1' &&
      reassignedHub2?.phone === '+91 9876501234' &&
      syncAfterReassign.changedDispatchPoints.length === 2,
    `After reassign Hub1=${JSON.stringify(reassignedHub1)}, Hub2=${JSON.stringify(reassignedHub2)}`
  );

  const syncAfterDelete = syncDispatchPointsForUsers(
    syncAfterReassign.updatedDispatchPoints,
    [],
    ['dp_hub_2']
  );
  const deletedHub2 = syncAfterDelete.updatedDispatchPoints.find((dp) => dp.id === 'dp_hub_2');

  assert(
    'Deleting Dispatcher Reverts Assigned Hub Back to No Supervisor',
    deletedHub2?.supervisor_name === 'No Supervisor' &&
      deletedHub2?.dispatcher_user_id === undefined &&
      syncAfterDelete.changedDispatchPoints.length === 1,
    `After delete Hub2=${JSON.stringify(deletedHub2)}`
  );

  // Scenario F: Web Portal RBAC vs Mobile-Only Roles
  const expectedMobileOnlyRoles = [
    'DISPATCHER',
    'DISTRIBUTOR',
    'SALES_EXECUTIVE',
    'COMMISSION_AGENT',
    'DELIVERY_VAN_EXECUTIVE',
  ] as const;

  const expectedWebRoles = [
    'ADMIN',
    'SUB_ADMIN',
    'BILLING',
    'ORDER_PUNCHER',
    'ACCOUNTANT',
  ] as const;

  const allMobileBlockedCorrectly = expectedMobileOnlyRoles.every((role) => {
    const msg = getWebPortalBlockedMessage(role);
    return (
      MOBILE_ONLY_ROLES.includes(role) &&
      isMobileOnlyRole(role) === true &&
      isWebPortalAllowedRole(role) === false &&
      getPlatformForRole(role) === 'MOBILE' &&
      msg.includes('mobile application')
    );
  });

  const allWebAllowedCorrectly = expectedWebRoles.every((role) => {
    return (
      WEB_PORTAL_ALLOWED_ROLES.includes(role) &&
      isMobileOnlyRole(role) === false &&
      isWebPortalAllowedRole(role) === true &&
      getPlatformForRole(role) === 'WEB'
    );
  });

  assert(
    'All 5 Mobile-Only Roles Strictly Blocked from Web Portal & Mapped to MOBILE Platform',
    allMobileBlockedCorrectly && MOBILE_ONLY_ROLES.length === 5,
    `Mobile roles check failed: ${JSON.stringify(MOBILE_ONLY_ROLES)}`
  );

  assert(
    'All 5 Web Console Roles Allowed on Web Portal & Mapped to WEB Platform',
    allWebAllowedCorrectly && WEB_PORTAL_ALLOWED_ROLES.length === 5,
    `Web roles check failed: ${JSON.stringify(WEB_PORTAL_ALLOWED_ROLES)}`
  );

  // Scenario G: Signed Admin Session Persistence, Tamper Rejection & Targeted Reset Revocation
  const adminUserForTest: User = {
    id: 'usr_admin_sec_test',
    tenant_id: 't1',
    name: 'Prashant Admin',
    mobile_number: '9811000001',
    role: 'ADMIN',
    company_scope: [],
    dispatch_point_id: null,
    platform: 'WEB',
    is_active: true,
  };
  const staffUserForTest: User = {
    id: 'usr_staff_sec_test',
    tenant_id: 't1',
    name: 'Ramesh Billing',
    mobile_number: '9811000002',
    role: 'BILLING',
    company_scope: ['comp_x'],
    dispatch_point_id: null,
    platform: 'WEB',
    is_active: true,
  };

  const adminSession = createSession(adminUserForTest);
  const staffSession = createSession(staffUserForTest);

  // Simulate server restart / in-memory session cache wipe
  clearInMemorySessionCacheForTest();
  const recoveredAdminSession = getSession(adminSession.token);
  const tamperedParts = adminSession.token.split('.');
  const tamperedToken = `${tamperedParts[0]}.${tamperedParts[1]}.tampered_sig_xyz`;
  const rejectedTampered = getSession(tamperedToken);

  assert(
    'Signed Admin Token Survives Server Memory Cache Clear & Rejects Tampered Signature',
    adminSession.token.startsWith('sess_v1.') &&
      recoveredAdminSession !== null &&
      recoveredAdminSession.userId === adminUserForTest.id &&
      recoveredAdminSession.role === 'ADMIN' &&
      rejectedTampered === null,
    `recovered=${JSON.stringify(recoveredAdminSession)}, tampered=${JSON.stringify(rejectedTampered)}`
  );

  // Simulate Admin resetting Staff password -> only Staff session invalidated, Admin remains active
  invalidateAllUserSessions(staffUserForTest.id);
  const adminAfterStaffReset = getSession(adminSession.token);
  const staffAfterReset = getSession(staffSession.token);

  assert(
    'Password Reset Revokes Only Target Staff Sessions While Preserving Admin Active Session',
    adminAfterStaffReset !== null &&
      adminAfterStaffReset.userId === adminUserForTest.id &&
      staffAfterReset === null,
    `adminAfter=${Boolean(adminAfterStaffReset)}, staffAfter=${Boolean(staffAfterReset)}`
  );

  // Explicit logout revokes Admin token even across stateless verification
  invalidateSession(adminSession.token);
  const adminAfterLogout = getSession(adminSession.token);
  assert(
    'Admin Logout Strictly Revokes Signed Session Token',
    adminAfterLogout === null,
    `Expected null after logout, got ${JSON.stringify(adminAfterLogout)}`
  );

  // PBKDF2 + Legacy Client Hash safe verification without timingSafeEqual crash
  const pbkdf2Creds = hashPassword('CustomPass@2026');
  const legacySalt = 'salt_legacy_test';
  const legacyHash = hashClientPassword('LegacyPass@123', legacySalt);

  assert(
    'Server verifyPassword Validates Both PBKDF2 Reset Passwords & Legacy Client Hashes Safely',
    verifyPassword('CustomPass@2026', pbkdf2Creds.hash, pbkdf2Creds.salt) === true &&
      verifyPassword('WrongPass@2026', pbkdf2Creds.hash, pbkdf2Creds.salt) === false &&
      verifyPassword('LegacyPass@123', legacyHash, legacySalt) === true &&
      verifyPassword('WrongLegacy@123', legacyHash, legacySalt) === false,
    'Password verification failed on PBKDF2 or legacy client hash'
  );

  // Scenario I: Party Ledger & Credit Gate Aggregation + Live Mobile Credit Sync
  const creditRetailers: Retailer[] = [
    {
      id: 'ret_credit_1',
      tenant_id: 't1',
      name: 'Alpha Supermart',
      code: 'RET-001',
      channel: 'GT',
      beat_name: 'Beat North',
      address: 'Main Market',
      contact_person: 'Ramesh',
      phone: '9876500001',
      phase_status: 'ACTIVE',
      credit_limit: 100000,
      current_outstanding: 40000,
    },
  ];

  const creditDistributors: DistributorInstitution[] = [
    {
      id: 'dist_inst_1',
      tenant_id: 't1',
      name: 'Metro Traders',
      code: 'DIST-01',
      channel: 'DISTRIBUTOR',
      address: 'Hub Road',
      contact_person: 'Metro Owner',
      phone: '9911000003',
      phase_status: 'ACTIVE',
      credit_limit: 250000,
      current_outstanding: 90000,
    },
  ];

  const creditUsers: User[] = [
    {
      id: 'usr_cfs_credit',
      tenant_id: 't1',
      name: 'Vikram CFS',
      mobile_number: '9911000001',
      role: 'COMMISSION_AGENT',
      company_scope: ['comp_x'],
      dispatch_point_id: 'dp_a',
      platform: 'MOBILE',
      is_active: true,
      credit_limit: 120000,
      current_outstanding: 35000,
      credit_gate_enabled: true,
    },
    {
      id: 'usr_dist_linked',
      tenant_id: 't1',
      name: 'Metro Traders',
      mobile_number: '9911000003',
      role: 'DISTRIBUTOR',
      company_scope: ['comp_y'],
      dispatch_point_id: 'dp_b',
      platform: 'MOBILE',
      is_active: true,
      credit_limit: 250000,
      credit_gate_enabled: true,
    },
    {
      id: 'usr_dist_standalone',
      tenant_id: 't1',
      name: 'Apex Direct Distributor',
      mobile_number: '9911000099',
      role: 'DISTRIBUTOR',
      company_scope: ['comp_x'],
      dispatch_point_id: 'dp_a',
      platform: 'MOBILE',
      is_active: true,
      credit_limit: 150000,
      credit_gate_enabled: true,
    },
    {
      id: 'usr_cfs_removed',
      tenant_id: 't1',
      name: 'Removed CFS Agent',
      mobile_number: '9911000088',
      role: 'COMMISSION_AGENT',
      company_scope: [],
      dispatch_point_id: null,
      platform: 'MOBILE',
      is_active: true,
      credit_gate_enabled: false,
    },
  ];

  const creditInvoices: Invoice[] = [
    {
      id: 'inv_cfs_1',
      tenant_id: 't1',
      invoice_number: 'INV-CFS-1',
      invoice_type: 'REGISTERED_GST',
      order_id: 'ord_cfs_inv_1',
      retailer_id: 'usr_cfs_credit',
      retailer_name: 'Vikram CFS',
      company_id: 'comp_x',
      dispatch_point_id: 'dp_a',
      subtotal: 45000,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total_amount: 45000,
      paid_amount: 10000,
      due_date: '2026-12-01',
      status: 'PARTIAL',
      invoice_date: '2026-11-15',
    },
  ];

  const creditPayments: Payment[] = [];

  const aggregatedParties = buildPartyCreditRecords({
    retailers: creditRetailers,
    distributors: creditDistributors,
    users: creditUsers,
    orders: [],
    invoices: creditInvoices,
    payments: creditPayments,
    defaultCreditLimit: 50000,
  });

  const cfsPartyRow = aggregatedParties.find((p) => p.id === 'usr_cfs_credit');
  const apexDistRow = aggregatedParties.find((p) => p.id === 'usr_dist_standalone');
  const linkedDistRow = aggregatedParties.find((p) => p.id === 'dist_inst_1');

  assert(
    'Party Ledger & Credit Gate Auto-Populates Active Distributors & CFS Without Duplication and Excludes Removed Parties',
    aggregatedParties.length === 4 &&
      Boolean(cfsPartyRow && cfsPartyRow.category === 'CFS' && cfsPartyRow.current_outstanding === 35000) &&
      Boolean(apexDistRow && apexDistRow.category === 'DISTRIBUTOR' && apexDistRow.credit_limit === 150000) &&
      Boolean(linkedDistRow && linkedDistRow.linkedUserId === 'usr_dist_linked') &&
      !aggregatedParties.some((p) => p.id === 'usr_cfs_removed'),
    `Parties=${JSON.stringify(aggregatedParties.map((p) => ({ id: p.id, cat: p.category, out: p.current_outstanding })))}`
  );

  const liveCfsCreditProfile = computeUserLiveCreditProfile(creditUsers[0], {
    distributors: creditDistributors,
    orders: [],
    invoices: creditInvoices,
    payments: creditPayments,
    defaultCreditLimit: 50000,
  });

  assert(
    'Mobile App Live Credit Profile Computes Credit Limit, Live Outstanding & Available Credit',
    liveCfsCreditProfile.credit_limit === 120000 &&
      liveCfsCreditProfile.current_outstanding === 35000 &&
      liveCfsCreditProfile.available_credit === 85000 &&
      liveCfsCreditProfile.is_credit_blocked === false,
    `Got profile=${JSON.stringify(liveCfsCreditProfile)}`
  );

  const normalizedCreditUser = normalizeFirestoreUser('doc_u_99', {
    id: 'usr_99',
    tenant_id: 't1',
    name: 'Normalized Distributor',
    role: 'DISTRIBUTOR',
    credit_limit: '180000',
    current_outstanding: 25000,
    credit_gate_enabled: true,
  });

  assert(
    'normalizeFirestoreUser Preserves Numeric Credit Limit, Outstanding & Credit Gate Flag',
    normalizedCreditUser.credit_limit === 180000 &&
      normalizedCreditUser.current_outstanding === 25000 &&
      normalizedCreditUser.credit_gate_enabled === true,
    `Got=${JSON.stringify(normalizedCreditUser)}`
  );

  // Scenario J: Real-Time Credit Utilization, Pending Order Reservation, BE Cancellation & Partial Amendment, Over-Limit Fund Shortage, Verified Payments & Explicit Credit Notes
  const scPartyUser: User = {
    id: 'usr_sc_dist',
    tenant_id: 't1',
    name: 'Shakti Distributors',
    mobile_number: '9988776655',
    role: 'DISTRIBUTOR',
    company_scope: ['comp_x'],
    dispatch_point_id: 'dp_a',
    platform: 'MOBILE',
    is_active: true,
    credit_limit: 100000,
    current_outstanding: 57000, // Stale cached figure should be overridden whenever transaction history exists
    credit_gate_enabled: true,
  };

  const makeCreditTestOrder = (id: string, num: string, amount: number, status: Order['status']): Order => ({
    ...mixedCfsOrder,
    id,
    order_number: num,
    channel: 'DISTRIBUTOR',
    retailer_id: 'usr_sc_dist',
    retailer_name_raw: 'Shakti Distributors',
    created_by_user_id: 'usr_sc_dist',
    commission_agent_id: null,
    status,
    total_amount: amount,
    original_total_amount: amount,
    tax_amount: 0,
    lines: [],
  });

  // J1: ₹1,00,000 limit + ₹57,000 PENDING_VERIFICATION order => Utilized = 57,000, Remaining = 43,000
  const pendingOrd1 = makeCreditTestOrder('ord_j1', 'ORD-J1', 57000, 'PENDING_VERIFICATION');
  const profileAfter57k = computeUserLiveCreditProfile(scPartyUser, {
    distributors: [],
    orders: [pendingOrd1],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  });

  // J2: Second ₹15,000 PENDING_VERIFICATION order => Utilized = 72,000, Remaining = 28,000
  const pendingOrd2 = makeCreditTestOrder('ord_j2', 'ORD-J2', 15000, 'PENDING_VERIFICATION');
  const profileAfter72k = computeUserLiveCreditProfile(scPartyUser, {
    distributors: [],
    orders: [pendingOrd1, pendingOrd2],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  });

  assert(
    'Real-Time Pending Order Credit Reservation Reserves 57k -> 43k Remaining and 57k+15k -> 28k Remaining',
    profileAfter57k.utilized_credit === 57000 &&
      profileAfter57k.remaining_credit === 43000 &&
      profileAfter72k.utilized_credit === 72000 &&
      profileAfter72k.remaining_credit === 28000,
    `57k=${JSON.stringify(profileAfter57k)}, 72k=${JSON.stringify(profileAfter72k)}`
  );

  // J3: BE Cancels ord_j1 => Remaining restored to 85,000; Cancel both => 1,00,000 Remaining (must NOT revert to stale 57k debt!)
  const cancelledOrd1: Order = { ...pendingOrd1, status: 'CANCELLED' };
  const cancelledOrd2: Order = { ...pendingOrd2, status: 'CANCELLED' };
  const profileAfterCancelOne = computeUserLiveCreditProfile(scPartyUser, {
    distributors: [],
    orders: [cancelledOrd1, pendingOrd2],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  });
  const profileAfterCancelAll = computeUserLiveCreditProfile(scPartyUser, {
    distributors: [],
    orders: [cancelledOrd1, cancelledOrd2],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  });

  assert(
    'BE Cancellation Immediately Releases Reserved Order Value & Restores Remaining Credit to 1,00,000',
    profileAfterCancelOne.utilized_credit === 15000 &&
      profileAfterCancelOne.remaining_credit === 85000 &&
      profileAfterCancelAll.utilized_credit === 0 &&
      profileAfterCancelAll.remaining_credit === 100000 &&
      profileAfterCancelAll.fund_shortage === 0,
    `CancelOne=${JSON.stringify(profileAfterCancelOne)}, CancelAll=${JSON.stringify(profileAfterCancelAll)}`
  );

  // J4: BE Partial Approval / Quantity Amendment adjusts Utilized Credit to amended order total
  const partiallyApprovedOrd1: Order = { ...pendingOrd1, status: 'VERIFIED', total_amount: 32000 };
  const exposureDuringAmendment = resolveOrderCreditExposure({
    order: pendingOrd1,
    overrideOrderValue: 32000,
    retailers: [],
    distributors: [],
    users: [scPartyUser],
    orders: [pendingOrd1, pendingOrd2],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  });
  const profilePostAmendment = computeUserLiveCreditProfile(scPartyUser, {
    distributors: [],
    orders: [partiallyApprovedOrd1, pendingOrd2],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  });

  assert(
    'BE Partial Approval Adjusts Utilized Credit Live to Amended Order Total (32k + 15k = 47k)',
    exposureDuringAmendment.totalLiability === 47000 &&
      exposureDuringAmendment.remainingCredit === 53000 &&
      profilePostAmendment.utilized_credit === 47000 &&
      profilePostAmendment.remaining_credit === 53000,
    `Exposure=${JSON.stringify(exposureDuringAmendment)}, Post=${JSON.stringify(profilePostAmendment)}`
  );

  // J5: Over-Limit Liability & Fund Shortage Example Scenario (25k + 71k existing unpaid + 24k new on 1,00,000 limit)
  const existing25k = makeCreditTestOrder('ord_ex_25k', 'ORD-25K', 25000, 'DELIVERED');
  const existing71k = makeCreditTestOrder('ord_ex_71k', 'ORD-71K', 71000, 'INVOICED');
  const new24k = makeCreditTestOrder('ord_new_24k', 'ORD-24K', 24000, 'PENDING_VERIFICATION');

  const exposureOnBEQueue = resolveOrderCreditExposure({
    order: new24k,
    retailers: [],
    distributors: [],
    users: [scPartyUser],
    orders: [existing25k, existing71k, new24k],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  });
  const partyLedgerRowOverLimit = buildPartyCreditRecords({
    retailers: [],
    distributors: [],
    users: [scPartyUser],
    orders: [existing25k, existing71k, new24k],
    invoices: [],
    payments: [],
    defaultCreditLimit: 50000,
  })[0];
  const helperCreditExp = calculateCreditExposure(
    { credit_limit: 100000, current_outstanding: 96000 },
    24000,
    100000
  );

  assert(
    'Over-Limit Liability Computes Total Liability ₹1,20,000, Remaining Credit ₹0 & Fund Shortage ₹20,000',
    exposureOnBEQueue.priorUnpaidOrders === 96000 &&
      exposureOnBEQueue.newOrderValue === 24000 &&
      exposureOnBEQueue.totalLiability === 120000 &&
      exposureOnBEQueue.remainingCredit === 0 &&
      exposureOnBEQueue.fundShortage === 20000 &&
      exposureOnBEQueue.isExceeded === true &&
      partyLedgerRowOverLimit.total_liability === 120000 &&
      partyLedgerRowOverLimit.remaining_credit === 0 &&
      partyLedgerRowOverLimit.fund_shortage === 20000 &&
      helperCreditExp.remainingCredit === 0 &&
      helperCreditExp.fundShortage === 20000,
    `BEExposure=${JSON.stringify(exposureOnBEQueue)}, Ledger=${JSON.stringify(partyLedgerRowOverLimit)}`
  );

  // J6: Pending vs Verified Payment & Explicit-Only Credit Note Discount
  const pendingPayment: Payment = {
    id: 'pay_pend',
    tenant_id: 't1',
    payment_number: 'PAY-PEND-1',
    retailer_id: 'usr_sc_dist',
    retailer_name: 'Shakti Distributors',
    amount: 30000,
    payment_mode: 'NEFT_RTGS',
    reference_number: 'UTR-PEND-1',
    payment_date: '2026-11-18',
    matched_invoice_id: null,
    status: 'PENDING',
  };
  const verifiedPayment: Payment = {
    ...pendingPayment,
    id: 'pay_ver',
    payment_number: 'PAY-VER-2',
    reference_number: 'UTR-VER-2',
    status: 'VERIFIED',
  };
  const normalOrderWithNoDefaultFlag = { ...new24k };
  const explicitCreditNoteOrder: Order = {
    ...existing71k,
    is_credit_note_discount: true,
    credit_note_discount_amount: 5000,
    credit_note_number: 'CN-2026-01',
    credit_note_reason: 'Occasional scheme settlement',
  };

  const breakdownWithPendingPay = calculatePartyCreditBreakdown({
    matchIds: ['usr_sc_dist'],
    matchNames: ['Shakti Distributors'],
    creditLimit: 100000,
    orders: [existing25k, existing71k, normalOrderWithNoDefaultFlag],
    invoices: [],
    payments: [pendingPayment],
  });
  const breakdownWithVerifiedPayAndCN = calculatePartyCreditBreakdown({
    matchIds: ['usr_sc_dist'],
    matchNames: ['Shakti Distributors'],
    creditLimit: 100000,
    orders: [existing25k, explicitCreditNoteOrder, normalOrderWithNoDefaultFlag],
    invoices: [],
    payments: [verifiedPayment],
  });

  assert(
    'Pending Payment Ignored, Verified Payment & Explicit BE Credit Note Reduce Liability & Default Orders Lack Credit-Note Flags',
    normalOrderWithNoDefaultFlag.is_credit_note_discount === undefined &&
      breakdownWithPendingPay.totalLiability === 120000 &&
      breakdownWithPendingPay.creditNoteDiscountsTotal === 0 &&
      breakdownWithVerifiedPayAndCN.verifiedPaymentsTotal === 30000 &&
      breakdownWithVerifiedPayAndCN.creditNoteDiscountsTotal === 5000 &&
      breakdownWithVerifiedPayAndCN.totalLiability === 85000 &&
      breakdownWithVerifiedPayAndCN.remainingCredit === 15000 &&
      breakdownWithVerifiedPayAndCN.fundShortage === 0,
    `PendingPay=${JSON.stringify(breakdownWithPendingPay)}, VerifiedAndCN=${JSON.stringify(breakdownWithVerifiedPayAndCN)}`
  );

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n========================================`);
  console.log(`DISPATCH ROUTING & LOCKOUT TEST RESULTS: ${passedCount}/${results.length} PASSED`);
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

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('dispatchRouting.test')) {
  const res = runDispatchRoutingTestSuite();
  if (!res.allPassed) process.exit(1);
  process.exit(0);
}
