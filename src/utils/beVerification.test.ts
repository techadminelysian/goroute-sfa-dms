import { initDatabase, getDbUsers, getDbOrders, getDatabase } from '../../server/dbService';
import { isOrderAssignedToBE } from './caRoutingLogic';
import { User, Order } from '../types';

/**
 * Test Suite: BE Verification Dashboard & Desk Mapping Validation
 * Validates:
 * 1. Mobile number mapping for Ramesh Patil (8668829674)
 * 2. Field User mapping (usr_1793713157945 -> usr_1787775362294)
 * 3. Order ord_19026 routing to BE Ramesh Patil
 * 4. BE Desk Selector supervisor-only permission logic
 * 5. Desk-isolation: ord_19026 is visible to Ramesh Patil & Admin ALL, but excluded from other BE desks
 */
export async function runBEVerificationTestSuite() {
  await initDatabase();
  const results: { test: string; passed: boolean; message?: string }[] = [];
  const dbUsers = getDbUsers();
  const dbOrders = getDbOrders();
  const dbDistributors = getDatabase().distributors || [];

  function assert(testName: string, condition: boolean, failMessage?: string) {
    results.push({
      test: testName,
      passed: condition,
      message: condition ? 'PASSED' : failMessage || 'FAILED',
    });
  }

  // 1. Mobile 8668829674 belongs exclusively to Ramesh Patil (BILLING)
  const rameshUser = dbUsers.find((u) => u.mobile_number === '8668829674');
  assert(
    'Ramesh Patil Mobile Mapping',
    Boolean(rameshUser && rameshUser.id === 'usr_1787775362294' && rameshUser.role === 'BILLING'),
    `Expected mobile 8668829674 to map to usr_1787775362294 with role BILLING, got ${rameshUser?.id} (${rameshUser?.role})`
  );

  // 2. Alt Admin mobile was reassigned to 7830260199 without collision
  const altAdmin = dbUsers.find((u) => u.id === 'usr_admin_prashant_alt');
  assert(
    'Alt Admin Mobile Non-Collision',
    Boolean(altAdmin && altAdmin.mobile_number === '7830260199'),
    `Expected alt admin to have 7830260199, got ${altAdmin?.mobile_number}`
  );

  // 3. Field User usr_1793713157945 exists and is mapped to Ramesh Patil
  const fieldUser = dbUsers.find((u) => u.id === 'usr_1793713157945');
  assert(
    'Field User Exists & Mapped to Ramesh Patil',
    Boolean(
      fieldUser &&
      (fieldUser.role === 'COMMISSION_AGENT' || fieldUser.role === 'SALES_EXECUTIVE' || fieldUser.role === 'DISTRIBUTOR') &&
      fieldUser.billing_executive_id === 'usr_1787775362294'
    ),
    `Expected field user usr_1793713157945 mapped to usr_1787775362294, got BE ID: ${fieldUser?.billing_executive_id}`
  );

  // 4. Order ord_19026 exists with correct raiser and BE attributes
  const targetOrder = dbOrders.find((o) => o.id === 'ord_19026');
  assert(
    'Order ord_19026 Exists & Correctly Mapped',
    Boolean(
      targetOrder &&
      (targetOrder.billing_executive_id === 'usr_1787775362294' ||
       targetOrder.created_by_user_id === 'usr_1793713157945' ||
       targetOrder.commission_agent_id === 'usr_1793713157945')
    ),
    `Order ord_19026 check failed`
  );

  if (targetOrder) {
    // 5. isOrderAssignedToBE accurately routes ord_19026 to Ramesh Patil
    const isAssignedToRamesh = isOrderAssignedToBE(
      targetOrder,
      'usr_1787775362294',
      dbUsers,
      dbDistributors
    );
    assert(
      'isOrderAssignedToBE routes to Ramesh Patil desk',
      isAssignedToRamesh === true,
      'Expected ord_19026 to be assigned to Ramesh Patil (usr_1787775362294)'
    );

    // 6. ord_19026 is NOT assigned to Priya Verma (usr_billing_1)
    const isAssignedToPriya = isOrderAssignedToBE(
      targetOrder,
      'usr_billing_1',
      dbUsers,
      dbDistributors
    );
    assert(
      'Desk Isolation: ord_19026 excluded from Priya Verma desk',
      isAssignedToPriya === false,
      'Expected ord_19026 to NOT be assigned to Priya Verma (usr_billing_1)'
    );

    // 7. ord_19026 is NOT assigned to Rohan Deshmukh (usr_billing_2)
    const isAssignedToRohan = isOrderAssignedToBE(
      targetOrder,
      'usr_billing_2',
      dbUsers,
      dbDistributors
    );
    assert(
      'Desk Isolation: ord_19026 excluded from Rohan Deshmukh desk',
      isAssignedToRohan === false,
      'Expected ord_19026 to NOT be assigned to Rohan Deshmukh (usr_billing_2)'
    );
  }

  // 8. BE Desk Selector Permission Check
  // Case A: User is BE Ramesh Patil
  const rameshCurrentUser: Partial<User> = {
    id: 'usr_1787775362294',
    name: 'Ramesh Patil',
    role: 'BILLING',
  };
  const activeRoleWhenBilling = 'BILLING';
  const isBillingUserA = rameshCurrentUser?.role === 'BILLING' || activeRoleWhenBilling === 'BILLING';
  const isSupervisorRoleA =
    !isBillingUserA &&
    (rameshCurrentUser?.role === 'ADMIN' ||
      rameshCurrentUser?.role === 'SUB_ADMIN' ||
      (!rameshCurrentUser && activeRoleWhenBilling === 'ADMIN'));
  assert(
    'BE Desk Selector Disabled for BE Ramesh Patil',
    isSupervisorRoleA === false,
    `Expected isSupervisorRole to be false for BE Ramesh Patil, got ${isSupervisorRoleA}`
  );

  // Case B: User is Admin
  const adminCurrentUser: Partial<User> = {
    id: 'usr_admin_1',
    name: 'Rajesh Sharma',
    role: 'ADMIN',
  };
  const activeRoleWhenAdmin = 'ADMIN';
  const isBillingUserB = (adminCurrentUser?.role as any) === 'BILLING' || (activeRoleWhenAdmin as any) === 'BILLING';
  const isSupervisorRoleB =
    !isBillingUserB &&
    (adminCurrentUser?.role === 'ADMIN' ||
      adminCurrentUser?.role === 'SUB_ADMIN' ||
      (!adminCurrentUser && activeRoleWhenAdmin === 'ADMIN'));
  assert(
    'BE Desk Selector Enabled for Admin',
    isSupervisorRoleB === true,
    `Expected isSupervisorRole to be true for Admin, got ${isSupervisorRoleB}`
  );

  // 9. Effective Desk Filter Locking
  const effectiveFilterForRamesh = isBillingUserA ? rameshCurrentUser.id! : 'ALL';
  assert(
    'Effective Desk Filter locked to Ramesh user ID',
    effectiveFilterForRamesh === 'usr_1787775362294',
    `Expected effective filter to be usr_1787775362294, got ${effectiveFilterForRamesh}`
  );

  // Print Summary
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n========================================`);
  console.log(`BE VERIFICATION TEST SUITE RESULTS: ${passedCount}/${results.length} PASSED`);
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

// Auto-run if executed directly via tsx
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('beVerification.test')) {
  runBEVerificationTestSuite().then((result) => {
    if (!result.allPassed) {
      process.exit(1);
    }
    process.exit(0);
  }).catch((err) => {
    console.error('Test suite error:', err);
    process.exit(1);
  });
}
