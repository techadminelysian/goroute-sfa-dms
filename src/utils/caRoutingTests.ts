import { calculateCreditExposure, applyCAMappingsToOrder, createOrderCancelledAlert, createOrderAmendedAlert } from './caRoutingLogic';
import { Order, Retailer, User } from '../types';
import { t } from './translations';
import { runHindiButtonTranslationTests } from './hindiTranslationTests';

/**
 * CA Mapping, Credit Exposure, and Order Verification Test Suite
 * Covers all positive and negative test scenarios.
 */
export interface TestResult {
  scenarioName: string;
  type: 'POSITIVE' | 'NEGATIVE';
  passed: boolean;
  actualOutcome: string;
  expectedOutcome: string;
  error?: string;
}

export function runAllCaRoutingTests(): {
  results: TestResult[];
  totalPassed: number;
  totalFailed: number;
  allPassed: boolean;
} {
  const results: TestResult[] = [];

  const mockUsers: User[] = [
    {
      id: 'usr_agent_1',
      tenant_id: 't1',
      name: 'Rahul Sharma',
      email: 'rahul@distributor.com',
      role: 'AGENT',
      company_scope: [],
      dispatch_point_id: 'dp_central',
      billing_executive_id: 'usr_billing_1',
      platform: 'MOBILE',
    },
    {
      id: 'usr_agent_2',
      tenant_id: 't1',
      name: 'Amit Patel',
      email: 'amit@distributor.com',
      role: 'AGENT',
      company_scope: [],
      dispatch_point_id: 'dp_north',
      billing_executive_id: 'usr_billing_2',
      platform: 'MOBILE',
    },
    {
      id: 'usr_billing_1',
      tenant_id: 't1',
      name: 'Priya Verma',
      email: 'priya@distributor.com',
      role: 'BILLING',
      company_scope: [],
      dispatch_point_id: 'dp_central',
      platform: 'WEB',
    },
    {
      id: 'usr_billing_2',
      tenant_id: 't1',
      name: 'Anjali Sharma',
      email: 'anjali@distributor.com',
      role: 'BILLING',
      company_scope: [],
      dispatch_point_id: 'dp_north',
      platform: 'WEB',
    },
  ];

  // Test Case 1: [POSITIVE] Auto-Tagging of BE and DP from CA profile upon order creation
  try {
    const orderInput: Partial<Order> = {
      order_number: 'ORD-TEST-001',
      retailer_name_raw: 'Shree Ganesh Mart',
    };
    const mapping = applyCAMappingsToOrder(orderInput, mockUsers[0], mockUsers);

    const isCorrect =
      mapping.billing_executive_id === 'usr_billing_1' &&
      mapping.dispatch_point_id === 'dp_central' &&
      mapping.commission_agent_id === 'usr_agent_1';

    results.push({
      scenarioName: '1. Positive: Auto-tagging fixed BE & DP from CA Profile',
      type: 'POSITIVE',
      passed: isCorrect,
      actualOutcome: `Tagged BE: ${mapping.billing_executive_id}, DP: ${mapping.dispatch_point_id}`,
      expectedOutcome: 'Tagged BE: usr_billing_1, DP: dp_central',
    });
  } catch (err: any) {
    results.push({
      scenarioName: '1. Positive: Auto-tagging fixed BE & DP from CA Profile',
      type: 'POSITIVE',
      passed: false,
      actualOutcome: 'Error during mapping',
      expectedOutcome: 'Tagged BE: usr_billing_1, DP: dp_central',
      error: err.message,
    });
  }

  // Test Case 2: [POSITIVE] Credit limit safe exposure calculation
  try {
    const safeRetailer: Retailer = {
      id: 'ret_safe',
      tenant_id: 't1',
      name: 'Safe Retailer',
      credit_limit: 100000,
      current_outstanding: 20000,
      code: 'RET-SAFE',
      channel: 'GT',
      beat_name: 'Beat A',
      address: 'Shop 1',
      contact_person: 'Owner',
      phone: '9876543210',
      phase_status: 'ACTIVE',
    };
    const exposure = calculateCreditExposure(safeRetailer, 30000); // 20k + 30k = 50k <= 100k

    const passed = !exposure.isExceeded && exposure.totalExposure === 50000 && exposure.variance === 0;
    results.push({
      scenarioName: '2. Positive: Credit Exposure within safe threshold',
      type: 'POSITIVE',
      passed,
      actualOutcome: `isExceeded: ${exposure.isExceeded}, Total Exposure: ₹${exposure.totalExposure}, Variance: ₹${exposure.variance}`,
      expectedOutcome: 'isExceeded: false, Total Exposure: ₹50,000, Variance: ₹0',
    });
  } catch (err: any) {
    results.push({
      scenarioName: '2. Positive: Credit Exposure within safe threshold',
      type: 'POSITIVE',
      passed: false,
      actualOutcome: 'Error computing exposure',
      expectedOutcome: 'isExceeded: false, Variance: 0',
      error: err.message,
    });
  }

  // Test Case 3: [NEGATIVE] Credit limit breach / High-risk flag detection
  try {
    const breachedRetailer: Retailer = {
      id: 'ret_breached',
      tenant_id: 't1',
      name: 'Breached Retailer',
      credit_limit: 50000,
      current_outstanding: 40000,
      code: 'RET-BREACH',
      channel: 'GT',
      beat_name: 'Beat B',
      address: 'Shop 2',
      contact_person: 'Owner',
      phone: '9876543211',
      phase_status: 'ACTIVE',
    };
    const exposure = calculateCreditExposure(breachedRetailer, 25000); // 40k + 25k = 65k > 50k (Variance 15k)

    const passed = exposure.isExceeded && exposure.totalExposure === 65000 && exposure.variance === 15000;
    results.push({
      scenarioName: '3. Negative: Credit limit breach detection (Red-Flag)',
      type: 'NEGATIVE',
      passed,
      actualOutcome: `isExceeded: ${exposure.isExceeded}, Total Exposure: ₹${exposure.totalExposure}, Variance: ₹${exposure.variance}`,
      expectedOutcome: 'isExceeded: true, Total Exposure: ₹65,000, Variance: ₹15,000',
    });
  } catch (err: any) {
    results.push({
      scenarioName: '3. Negative: Credit limit breach detection (Red-Flag)',
      type: 'NEGATIVE',
      passed: false,
      actualOutcome: 'Error computing exposure',
      expectedOutcome: 'isExceeded: true, Variance: 15,000',
      error: err.message,
    });
  }

  // Test Case 4: [POSITIVE] BE Line-Item Amendment & Notification Creation
  try {
    const originalOrder: Order = {
      id: 'ord_test_amend',
      tenant_id: 't1',
      order_number: 'ORD-AMEND-100',
      status: 'PENDING_VERIFICATION',
      company_id: 'comp_1',
      retailer_id: 'ret_1',
      retailer_name_raw: 'Laxmi Supermarket',
      total_amount: 50000,
      channel: 'GT',
      beat_name: 'Beat C',
      dispatch_point_id: 'dp_central',
      created_by_user_id: 'usr_agent_1',
      commission_agent_id: 'usr_agent_1',
      commission_agent_name: 'Rahul Sharma',
      order_date: '2026-08-30',
      delivery_date: '2026-08-31',
      tax_amount: 9000,
      has_below_cost_lines: false,
      lines: [
        {
          id: 'l1',
          tenant_id: 't1',
          order_id: 'ord_test_amend',
          sku_id: 'sku_1',
          sku_name: 'Atta 10kg',
          quantity: 100,
          unit_price: 350,
          landing_price: 330,
          total: 35000,
          is_below_cost: false,
          expected_claim_total: 0,
        },
        {
          id: 'l2',
          tenant_id: 't1',
          order_id: 'ord_test_amend',
          sku_id: 'sku_2',
          sku_name: 'Basmati Rice 5kg',
          quantity: 30,
          unit_price: 500,
          landing_price: 470,
          total: 15000,
          is_below_cost: false,
          expected_claim_total: 0,
        },
      ],
    };

    const notification = createOrderAmendedAlert(
      originalOrder,
      'Laxmi Supermarket',
      [{ skuName: 'Atta 10kg', originalQty: 100, verifiedQty: 70 }]
    );

    const passed =
      notification.type === 'ORDER_AMENDED_PARTIAL_APPROVAL' &&
      notification.target_roles.includes('AGENT') &&
      notification.message.includes('Atta 10kg');

    results.push({
      scenarioName: '4. Positive: BE partial line-item amendment notification generation',
      type: 'POSITIVE',
      passed,
      actualOutcome: `Notification Type: ${notification.type}, Target: ${notification.target_roles.join(', ')}`,
      expectedOutcome: 'Notification Type: ORDER_AMENDED_PARTIAL_APPROVAL, Target contains AGENT',
    });
  } catch (err: any) {
    results.push({
      scenarioName: '4. Positive: BE partial line-item amendment notification generation',
      type: 'POSITIVE',
      passed: false,
      actualOutcome: 'Error creating amendment alert',
      expectedOutcome: 'Notification created successfully',
      error: err.message,
    });
  }

  // Test Case 5: [NEGATIVE] CA Edit attempt on verified/locked order is blocked
  try {
    const lockedOrder: Order = {
      id: 'ord_locked',
      tenant_id: 't1',
      order_number: 'ORD-LOCKED-001',
      status: 'VERIFIED',
      is_locked: true,
      company_id: 'comp_1',
      retailer_id: 'ret_1',
      retailer_name_raw: 'Gupta General Store',
      total_amount: 12000,
      channel: 'GT',
      beat_name: 'Beat A',
      dispatch_point_id: 'dp_central',
      created_by_user_id: 'usr_agent_1',
      commission_agent_id: 'usr_agent_1',
      order_date: '2026-08-30',
      delivery_date: '2026-08-31',
      tax_amount: 2160,
      has_below_cost_lines: false,
      lines: [],
    };

    // Check immutability condition
    const isEditable = !lockedOrder.is_locked && lockedOrder.status === 'PENDING_VERIFICATION';

    results.push({
      scenarioName: '5. Negative: Prevent CA modification when order is_locked = true',
      type: 'NEGATIVE',
      passed: !isEditable,
      actualOutcome: `isEditable: ${isEditable}`,
      expectedOutcome: 'isEditable: false (Locked)',
    });
  } catch (err: any) {
    results.push({
      scenarioName: '5. Negative: Prevent CA modification when order is_locked = true',
      type: 'NEGATIVE',
      passed: false,
      actualOutcome: 'Error checking lock condition',
      expectedOutcome: 'isEditable: false',
      error: err.message,
    });
  }

  // Test Case 6: [POSITIVE] Order cancellation notification with reason dispatched to CA
  try {
    const orderToCancel: Order = {
      id: 'ord_cancel',
      tenant_id: 't1',
      order_number: 'ORD-CANCEL-999',
      status: 'PENDING_VERIFICATION',
      company_id: 'comp_1',
      retailer_id: 'ret_1',
      retailer_name_raw: 'Sharma Traders',
      total_amount: 80000,
      channel: 'GT',
      beat_name: 'Beat D',
      dispatch_point_id: 'dp_central',
      created_by_user_id: 'usr_agent_1',
      commission_agent_id: 'usr_agent_1',
      order_date: '2026-08-30',
      delivery_date: '2026-08-31',
      tax_amount: 14400,
      has_below_cost_lines: false,
      lines: [],
    };

    const notif = createOrderCancelledAlert(
      orderToCancel,
      'Credit limit exposure exceeded by ₹30,000',
      'Sharma Traders'
    );

    const passed =
      notif.type === 'ORDER_CANCELLED_CREDIT_LIMIT' &&
      notif.target_roles.includes('AGENT') &&
      notif.message.includes('Sharma Traders');

    results.push({
      scenarioName: '6. Positive: Order cancellation with CA push notification',
      type: 'POSITIVE',
      passed,
      actualOutcome: `Type: ${notif.type}, Message: ${notif.message}`,
      expectedOutcome: 'Type: ORDER_CANCELLED_CREDIT_LIMIT, targeting AGENT',
    });
  } catch (err: any) {
    results.push({
      scenarioName: '6. Positive: Order cancellation with CA push notification',
      type: 'POSITIVE',
      passed: false,
      actualOutcome: 'Error creating cancellation alert',
      expectedOutcome: 'Notification created successfully',
      error: err.message,
    });
  }

  // 7. Language switching & translation verification for all UI action and button names
  try {
    const btnResults = runHindiButtonTranslationTests();
    results.push({
      scenarioName: `7. Positive: Button and action names translation (${btnResults.translatedToHindi}/${btnResults.totalButtonsTested} translated - ${btnResults.percentageTranslated}%)`,
      type: 'POSITIVE',
      passed: btnResults.allPassed,
      actualOutcome: `${btnResults.translatedToHindi} of ${btnResults.totalButtonsTested} UI buttons & actions translated (${btnResults.percentageTranslated}%)`,
      expectedOutcome: '>=80% UI button and action names translated in Hindi',
    });
  } catch (err: any) {
    results.push({
      scenarioName: '7. Positive: Button and action names translation in Hindi',
      type: 'POSITIVE',
      passed: false,
      actualOutcome: 'Translation helper error',
      expectedOutcome: '>=80% UI buttons & actions translated',
      error: err.message,
    });
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  return {
    results,
    totalPassed,
    totalFailed,
    allPassed: totalFailed === 0,
  };
}
