import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import { Invoice, InvoiceType, Payment, PaymentMode, Order, Retailer } from '../../types';
import { isOrderAssignedToBE, getOrderFinancialSummary } from '../../utils/caRoutingLogic';
import { isOrderAwaitingPhysicalDispatch } from '../../utils/stockAvailability';
import {
  buildDispatchSkuPartyMatrix,
  doesOrderBelongToDispatchPoint,
  doesOrderLineBelongToDispatchPoint,
  getDispatchPointDisplayLabel,
  getEffectiveLineCompanyId,
  isUnmappedDispatchPointId,
  resolveDispatchPointIdForCompany,
  serializeDispatchMatrixToCsv,
  UNMAPPED_DISPATCH_POINT_ID,
  UNMAPPED_DISPATCH_POINT_LABEL
} from '../../utils/dispatchRouting';
import {
  getTodayISTDateString,
  getTomorrowISTDateString,
  partitionDispatchOrdersForDate,
  getOrderEffectiveDispatchDate
} from '../../utils/dispatchBatching';
import { buildPartyCreditRecords, PartyCreditRecord } from '../../utils/creditLedger';
import { KPICard } from '../common/KPICard';
import { BEVerificationDashboard } from './BEVerificationDashboard';
import {
  Receipt,
  FileText,
  DollarSign,
  AlertOctagon,
  CheckCircle2,
  Plus,
  Search,
  CreditCard,
  Building,
  Printer,
  Eye,
  Edit3,
  Clock,
  Flag,
  X,
  ShieldAlert,
  Calendar,
  Download,
  FileSpreadsheet,
  Lock,
  Unlock,
  ShieldCheck,
  Scale,
  ArrowRight,
  Truck,
  Users,
  UserCheck,
  Package,
  Copy,
  ChevronDown,
  ChevronUp,
  Share2,
  Layers,
  Warehouse,
  Table2
} from 'lucide-react';

export const BillingInvoicing: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    activeRole,
    setActiveRole,
    invoices,
    orders,
    payments,
    retailers,
    distributors = [],
    skus,
    companies,
    dispatchPoints = [],
    stockLedger,
    users,
    currentUser,
    addInvoice,
    addPayment,
    addOrder,
    updateOrderStatus,
    verifyOrderWithParallelAlert,
    updateOrder,
    verifyPayment,
    flagPayment,
    updateRetailerCreditLimit,
    updatePartyCreditLimit,
    updatePaymentDetails,
    updateInvoicePaidAmount,
    issueCreditNoteDiscount,
    toggleLockInvoice,
    updateInvoiceMetadata,
    carryForwardOrdersToDispatchDate,
    finalizeDispatchBatch,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'VERIFY_ORDERS' | 'DISPATCH_SHEET' | 'READY_TO_INVOICE' | 'INVOICES' | 'PAYMENTS'>('VERIFY_ORDERS');

  // Morning Dispatcher Sheet State (Defaults strictly to Tomorrow IST fresh batch)
  const todayIST = getTodayISTDateString();
  const tomorrowIST = getTomorrowISTDateString();
  const [dispatchDateFilter, setDispatchDateFilter] = useState<string>(tomorrowIST);
  const [dispatchGroupBy, setDispatchGroupBy] = useState<'PARTY' | 'AGENT' | 'BEAT'>('PARTY');
  const [dispatchPointFilter, setDispatchPointFilter] = useState<string>('ALL');
  const [dispatchCompanyFilter, setDispatchCompanyFilter] = useState<string>('ALL');
  const [dispatchStatusScope, setDispatchStatusScope] = useState<'CONFIRMED_ONLY' | 'ALL_POST_PO'>('CONFIRMED_ONLY');
  const [dispatchViewMode, setDispatchViewMode] = useState<'MATRIX' | 'GROUPED'>('MATRIX');
  const [dispatchFeedback, setDispatchFeedback] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [showPriorBacklog, setShowPriorBacklog] = useState<boolean>(true);
  const [selectedBacklogOrderIds, setSelectedBacklogOrderIds] = useState<string[]>([]);
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState<boolean>(false);

  // All Invoices Filter States
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterParty, setFilterParty] = useState<string>('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterInvoiceDp, setFilterInvoiceDp] = useState<string>('ALL');
  const [paymentFilterStatus, setPaymentFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Generate Invoice & Credit Note Discount Modal State (Strictly for DELIVERED orders)
  const [invoiceModalOrder, setInvoiceModalOrder] = useState<Order | null>(null);
  const [invModalType, setInvModalType] = useState<InvoiceType>('REGISTERED_GST');
  const [invDiscountType, setInvDiscountType] = useState<'NONE' | 'FLAT' | 'PERCENT'>('NONE');
  const [invDiscountValue, setInvDiscountValue] = useState<string>('');
  const [invCreditNoteNum, setInvCreditNoteNum] = useState<string>('');
  const [invCreditNoteReason, setInvCreditNoteReason] = useState<string>('');

  // Modals
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isPunchOrderOpen, setIsPunchOrderOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<Invoice | null>(null);
  const [selectedInvoiceForDetail, setSelectedInvoiceForDetail] = useState<Invoice | null>(null);
  const [isZohoSyncModalOpen, setIsZohoSyncModalOpen] = useState(false);
  const [isZohoPayloadModalOpen, setIsZohoPayloadModalOpen] = useState(false);
  const [isSyncingZoho, setIsSyncingZoho] = useState(false);
  const [zohoSyncingProgress, setZohoSyncingProgress] = useState(0);
  const [zohoTargetInvoice, setZohoTargetInvoice] = useState<Invoice | null>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<Order | null>(null);
  const [editLines, setEditLines] = useState<{ sku_id: string; quantity: number; unit_price: number }[]>([]);

  // Accounts Executive Payment & Partial Payment Edit State
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState<number>(0);
  const [editPaymentMode, setEditPaymentMode] = useState<PaymentMode>('UPI');
  const [editPaymentRef, setEditPaymentRef] = useState<string>('');
  const [editPaymentNotes, setEditPaymentNotes] = useState<string>('');

  const [editingInvoicePartial, setEditingInvoicePartial] = useState<Invoice | null>(null);
  const [partialPayAmount, setPartialPayAmount] = useState<number>(0);
  const [partialPayMode, setPartialPayMode] = useState<PaymentMode>('CASH');
  const [partialPayRef, setPartialPayRef] = useState<string>('');

  // New Punch Order State
  const [punchRetailerId, setPunchRetailerId] = useState<string>('');
  const [punchCompanyId, setPunchCompanyId] = useState<string>('ALL');
  const [punchSkuId, setPunchSkuId] = useState<string>('');
  const [punchQty, setPunchQty] = useState<number>(50);
  const [punchUnitPrice, setPunchUnitPrice] = useState<number>(0);

  // Flag Payment Modal State
  const [flaggingPayment, setFlaggingPayment] = useState<Payment | null>(null);
  const [flagReasonText, setFlagReasonText] = useState('');

  // Payment Form State
  const [payRetailerId, setPayRetailerId] = useState<string>('');
  const [payAmount, setPayAmount] = useState<number>(10000);
  const [payMode, setPayMode] = useState<PaymentMode>('UPI');
  const [payRef, setPayRef] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [payAutoVerify, setPayAutoVerify] = useState<boolean>(true);

  // Credit Limit Edit State (Unified Party Credit Gate)
  const [editingCreditParty, setEditingCreditParty] = useState<PartyCreditRecord | null>(null);
  const [newCreditLimitVal, setNewCreditLimitVal] = useState<number>(50000);

  // Non-blocking notification banner & Occasional Credit Note Modal State
  const [billingBanner, setBillingBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [creditNoteInvoice, setCreditNoteInvoice] = useState<Invoice | null>(null);
  const [creditNoteAmt, setCreditNoteAmt] = useState<string>('');
  const [creditNoteNum, setCreditNoteNum] = useState<string>('');
  const [creditNoteReason, setCreditNoteReason] = useState<string>('');

  const showBillingBanner = (type: 'success' | 'error' | 'info', message: string) => {
    setBillingBanner({ type, message });
    setTimeout(() => {
      setBillingBanner((prev) => (prev?.message === message ? null : prev));
    }, 5500);
  };

  // Checks for Role Rights
  const isAccountant = activeRole === 'ACCOUNTANT' || activeRole === 'ADMIN';
  const isBillingExec = activeRole === 'BILLING' || activeRole === 'ADMIN';

  // Effective Billing Executive ID
  const effectiveBEId =
    currentUser?.role === 'BILLING'
      ? currentUser.id
      : users.find((u) => u.id === currentUser?.id && u.role === 'BILLING')?.id ||
        users.find((u) => u.role === 'BILLING')?.id ||
        'usr_billing_1';

  // Orders taken by Commission Agents, Sales Reps & Distributors needing Billing Executive Verification
  const pendingVerificationOrders = orders.filter((o) => {
    const isVerified = ['VERIFIED', 'VERIFIED_BY_BILLING', 'CONFIRMED', 'APPROVED', 'PO_GENERATED', 'PUNCHED_TO_PRINCIPAL', 'PRINCIPAL_DISPATCHED'].includes(o.status) || Boolean(o.verified_at);
    const isTerminated = ['CANCELLED', 'INVOICED', 'DISPATCHED', 'DELIVERED'].includes(o.status);
    if (isVerified || isTerminated) return false;
    if (activeRole === 'BILLING' || currentUser?.role === 'BILLING') {
      return isOrderAssignedToBE(o, effectiveBEId, users, distributors);
    }
    return true;
  });

  // Orders confirmed via Principal PO or Depot Stock Fast-Track (un-dispatched active queue)
  const confirmedOrders = orders.filter(
    (o) =>
      !o.dispatched_at &&
      (o.status === 'CONFIRMED' ||
        o.status === 'PUNCHED_TO_PRINCIPAL' ||
        o.status === 'APPROVED' ||
        o.status === 'INVOICED')
  );

  // Orders ready for Final Invoicing (Strictly locked until status === 'DELIVERED')
  const readyToInvoiceOrders = orders.filter((o) => {
    if (o.status !== 'DELIVERED') return false;
    if (activeRole === 'BILLING' || currentUser?.role === 'BILLING') {
      return isOrderAssignedToBE(o, effectiveBEId, users, distributors);
    }
    return true;
  });

  // Scope orders first by Dispatch Point & Principal Company filters
  const dpAndCompanyScopedOrders = orders.filter((o) => {
    if (dispatchPointFilter !== 'ALL' && !doesOrderBelongToDispatchPoint(o, dispatchPointFilter, companies, skus)) {
      return false;
    }
    if (dispatchCompanyFilter !== 'ALL') {
      const matchesOrderCompany =
        o.company_id === dispatchCompanyFilter ||
        (o.company_ids || []).includes(dispatchCompanyFilter) ||
        (o.lines || []).some((l) => getEffectiveLineCompanyId(l, o, skus) === dispatchCompanyFilter);
      if (!matchesOrderCompany) return false;
    }
    return true;
  });

  // Strictly partition confirmed orders by selected Dispatch Batch Date (Tomorrow IST by default)
  // Older un-dispatched orders stay isolated in priorBacklogOrders and never pollute the fresh matrix.
  const {
    freshBatchOrders: freshDispatchOrders,
    priorBacklogOrders,
    dispatchedForDateOrders,
  } = partitionDispatchOrdersForDate(dpAndCompanyScopedOrders, dispatchDateFilter);

  const dispatchManifestOrders =
    dispatchStatusScope === 'CONFIRMED_ONLY'
      ? freshDispatchOrders
      : [...freshDispatchOrders, ...dispatchedForDateOrders];

  // Compute DP-segregated SKU-vs-Party Matrices (each DP strictly pulls only SKUs from its mapped Principal Companies)
  const activeMatrixDispatchPointIds = dispatchPointFilter !== 'ALL'
    ? [dispatchPointFilter]
    : [...dispatchPoints.map((dp) => dp.id), UNMAPPED_DISPATCH_POINT_ID];

  const scopedCompaniesForMatrix = dispatchCompanyFilter === 'ALL'
    ? companies
    : companies.filter((c) => c.id === dispatchCompanyFilter);

  const dispatchPointMatrices = activeMatrixDispatchPointIds
    .map((dpId) =>
      buildDispatchSkuPartyMatrix(
        dispatchManifestOrders,
        dpId,
        scopedCompaniesForMatrix,
        skus,
        users,
        dispatchPoints
      )
    )
    .filter((m) => m.rows.length > 0 || dispatchPointFilter !== 'ALL');

  const downloadCsvFile = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handler: Export SKU-vs-Party Dispatch Sheet CSV (Strictly per Dispatch Point -> Principal Company mapping)
  const handleExportSkuPartyMatrixCsv = (targetDpId?: string) => {
    const dpIdsToExport = targetDpId
      ? [targetDpId]
      : dispatchPointMatrices.filter((m) => m.rows.length > 0).map((m) => m.dispatchPointId);

    if (dpIdsToExport.length === 0) {
      setDispatchFeedback('No confirmed orders match the selected Dispatch Point and Principal Company mapping.');
      return;
    }

    const exportedNames: string[] = [];

    dpIdsToExport.forEach((dpId) => {
      const matrix = buildDispatchSkuPartyMatrix(
        dispatchManifestOrders,
        dpId,
        scopedCompaniesForMatrix,
        skus,
        users,
        dispatchPoints
      );
      if (matrix.rows.length === 0) return;
      const csvContent = serializeDispatchMatrixToCsv(matrix);
      const safeCode = (matrix.dispatchPointCode || dpId).replace(/[^A-Za-z0-9_-]/g, '_');
      const filename = `Dispatch_Matrix_${safeCode}_${dispatchDateFilter}.csv`;
      downloadCsvFile(csvContent, filename);
      exportedNames.push(`${matrix.dispatchPointName} (${filename})`);
    });

    if (exportedNames.length > 0) {
      setDispatchFeedback(`Exported SKU-vs-Party Dispatch Matrix (${dispatchDateFilter}): ${exportedNames.join(', ')}`);
    } else {
      setDispatchFeedback('No SKU rows available for the selected Dispatch Point.');
    }
  };

  // Handler: Export Morning Dispatcher Sheet CSV (Detailed flat log)
  const handleExportMorningDispatcherSheetCsv = () => {
    if (dispatchManifestOrders.length === 0) {
      setDispatchFeedback('No orders available in current morning dispatch selection.');
      return;
    }

    const headers = [
      'Dispatch Point',
      'Commission Agent / Rep',
      'Sub-Distributor / Retail Outlet',
      'Beat / Delivery Route',
      'Principal Company',
      'Order Number',
      'Order Date',
      'Order Status',
      'SKU Code',
      'SKU Description',
      'Pack Size',
      'Quantity (Pcs)',
      'Unit Rate (INR)',
      'Line Total (INR)'
    ];

    const rows: string[] = [];

    dispatchManifestOrders.forEach((o) => {
      const agentName = o.commission_agent_name || users.find((u) => u.id === o.commission_agent_id)?.name || o.commission_agent_id || 'GT Field Rep';

      (o.lines || []).forEach((l) => {
        if (dispatchPointFilter !== 'ALL' && !doesOrderLineBelongToDispatchPoint(l, o, dispatchPointFilter, companies, skus)) {
          return;
        }
        const compId = getEffectiveLineCompanyId(l, o, skus);
        if (dispatchCompanyFilter !== 'ALL' && compId !== dispatchCompanyFilter) {
          return;
        }
        const comp = companies.find((c) => c.id === compId);
        const dpId = resolveDispatchPointIdForCompany(compId, companies, dispatchPoints);
        const dpObj = dpId !== UNMAPPED_DISPATCH_POINT_ID ? dispatchPoints.find((d) => d.id === dpId) : undefined;
        const dpName = dpObj?.name || UNMAPPED_DISPATCH_POINT_LABEL;
        const skuObj = skus.find((s) => s.id === l.sku_id);
        rows.push(
          [
            `"${dpName.replace(/"/g, '""')}"`,
            `"${agentName.replace(/"/g, '""')}"`,
            `"${o.retailer_name_raw.replace(/"/g, '""')}"`,
            `"${o.beat_name.replace(/"/g, '""')}"`,
            `"${(comp?.name || 'Company').replace(/"/g, '""')}"`,
            `"${o.order_number}"`,
            `"${o.order_date}"`,
            `"${o.status}"`,
            `"${skuObj?.code || 'SKU-00'}"`,
            `"${l.sku_name.replace(/"/g, '""')}"`,
            `"${skuObj?.pack_size || '1x12'}"`,
            l.quantity,
            l.unit_price,
            l.total
          ].join(',')
        );
      });
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const filename = `Morning_Dispatcher_Consignment_Sheet_${dispatchDateFilter}.csv`;
    downloadCsvFile(csvContent, filename);
    setDispatchFeedback(`Generated detailed load sheet (${filename}) with ${rows.length} line items.`);
  };

  // Finalize Selected Dispatch Date Batch (Marks pending orders DISPATCHED & adjusts Depot Stock ledger)
  const handleFinalizeSelectedDateBatch = () => {
    const targetIds = freshDispatchOrders.map((o) => o.id);
    if (targetIds.length === 0) {
      setDispatchFeedback(`No pending un-dispatched orders in batch ${dispatchDateFilter} to finalize.`);
      setConfirmFinalizeOpen(false);
      return;
    }
    const res = finalizeDispatchBatch(targetIds, currentUser?.name || 'Dispatch Manager');
    setConfirmFinalizeOpen(false);
    setDispatchFeedback(res.message);
  };

  // Carry Forward Prior Backlog Orders to Tomorrow's Fresh Batch
  const handleCarryForwardBacklog = (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    const res = carryForwardOrdersToDispatchDate(
      orderIds,
      tomorrowIST,
      currentUser?.name || 'Dispatch Manager'
    );
    setSelectedBacklogOrderIds((prev) => prev.filter((id) => !orderIds.includes(id)));
    setDispatchFeedback(res.message);
  };

  // Clear / Mark Dispatched Prior Backlog Orders
  const handleClearBacklogAsDispatched = (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    const res = finalizeDispatchBatch(orderIds, currentUser?.name || 'Dispatch Manager');
    setSelectedBacklogOrderIds((prev) => prev.filter((id) => !orderIds.includes(id)));
    setDispatchFeedback(res.message);
  };

  // Automated Dispatch Sync Info (CONFIRMED orders auto-populate MobileDispatcherApp)
  const handleSendManifestToDispatcher = () => {
    setDispatchFeedback(
      `Dispatch Batch ${dispatchDateFilter} is synced with Mobile Dispatcher App for ${freshDispatchOrders.length} fresh order(s). (${priorBacklogOrders.length} prior backlog order(s) isolated.)`
    );
  };

  // Helper: Copy party-wise summary to clipboard
  const handleCopyPartyConsignmentText = (partyName: string, partyOrders: Order[]) => {
    const skuMap: Record<string, { code: string; name: string; quantity: number; unit_price: number; total: number }> = {};

    partyOrders.forEach((o) => {
      (o.lines || []).forEach((l) => {
        const skuObj = skus.find((s) => s.id === l.sku_id);
        if (!skuMap[l.sku_id]) {
          skuMap[l.sku_id] = {
            code: skuObj?.code || 'SKU-00',
            name: l.sku_name,
            quantity: 0,
            unit_price: Number(l.unit_price) || 0,
                          total: 0,
                        };
                      }
                      const qty = Number(l.quantity) || 0;
                      const tot = Number(l.total) != null && !isNaN(Number(l.total)) ? Number(l.total) : qty * (Number(l.unit_price) || 0);
                      skuMap[l.sku_id].quantity += qty;
                      skuMap[l.sku_id].total += tot;
      });
    });

    const linesText = Object.values(skuMap)
      .map((r) => `- ${r.code} | ${r.name} | Qty: ${r.quantity} pcs | Rate: ₹${r.unit_price} | Total: ₹${r.total}`)
      .join('\n');

    const totalQty = Object.values(skuMap).reduce((s, r) => s + r.quantity, 0);
    const totalVal = Object.values(skuMap).reduce((s, r) => s + r.total, 0);

    const fullText = `=== MORNING DISPATCH CONSIGNMENT MANIFEST ===\nParty / Retailer: ${partyName}\nOrders Included: ${partyOrders.map((o) => o.order_number).join(', ')}\nBeat: ${partyOrders[0]?.beat_name || 'N/A'}\n------------------------------------------------\n${linesText}\n------------------------------------------------\nTOTAL CONSIGNMENT QUANTITY: ${totalQty} pcs\nTOTAL CONSIGNMENT GROSS VALUE: ₹${(totalVal || 0).toLocaleString('en-IN')}\n================================================`;

    navigator.clipboard.writeText(fullText);
    showBillingBanner('success', `Copied morning consignment manifest for ${partyName} to clipboard.`);
  };

  // Helper: Categorize Invoice Settlement Payment Mode (Cash vs Online vs Mixed)
  const getInvoicePaymentInfo = (inv: Invoice) => {
    const linkedPayments = payments.filter(
      (p) => p.matched_invoice_id === inv.id || (p.allocations && p.allocations.some((a) => a.invoice_id === inv.id))
    );

    const hasCash = linkedPayments.some((p) => p.payment_mode === 'CASH') || inv.invoice_type === 'CASH_NON_GST';
    const hasOnline = linkedPayments.some((p) => p.payment_mode === 'UPI' || p.payment_mode === 'NEFT_RTGS' || p.payment_mode === 'CHEQUE');

    let category: 'CASH' | 'ONLINE' | 'MIXED' | 'CREDIT' = 'CREDIT';
    if (hasCash && hasOnline) category = 'MIXED';
    else if (hasCash) category = 'CASH';
    else if (hasOnline) category = 'ONLINE';
    else if (inv.paid_amount > 0) category = 'CASH';

    return {
      category,
      linkedPayments,
      primaryMode: linkedPayments[0]?.payment_mode || (inv.invoice_type === 'CASH_NON_GST' ? 'CASH' : 'CREDIT')
    };
  };

  const getInvoiceNetTotal = (inv: Invoice): number => {
    if (inv.gross_amount !== undefined) {
      return Math.max(0, Number(inv.total_amount) || 0);
    }
    const cn = inv.is_credit_note_discount ? Number(inv.credit_note_discount_amount) || 0 : 0;
    return Math.max(0, (Number(inv.total_amount) || 0) - cn);
  };

  // Distinct parties for All Invoices Party filter
  const invoicePartyNames = Array.from(
    new Set(invoices.map((i) => i.retailer_name).filter(Boolean))
  ).sort();

  // Filtered Invoices (All Invoices Permanent Register)
  const filteredInvoices = invoices.filter((inv) => {
    const payInfo = getInvoicePaymentInfo(inv);

    if (filterType === 'REGISTERED_GST' && inv.invoice_type !== 'REGISTERED_GST') return false;
    if (filterType === 'CASH_NON_GST' && inv.invoice_type !== 'CASH_NON_GST') return false;
    if (filterType === 'CASH' && payInfo.category !== 'CASH') return false;
    if (filterType === 'ONLINE' && payInfo.category !== 'ONLINE' && payInfo.category !== 'MIXED') return false;
    if (filterType === 'UNPAID' && inv.status === 'PAID') return false;
    if (filterType === 'WITH_CREDIT_NOTE' && !inv.is_credit_note_discount) return false;
    if (filterType === 'ZOHO_PENDING' && inv.zoho_synced) return false;

    if (filterStatus !== 'ALL' && inv.status !== filterStatus) return false;
    if (filterParty !== 'ALL' && inv.retailer_name !== filterParty) return false;
    if (filterInvoiceDp !== 'ALL' && inv.dispatch_point_id !== filterInvoiceDp) return false;
    if (filterDateFrom && inv.invoice_date < filterDateFrom) return false;
    if (filterDateTo && inv.invoice_date > filterDateTo) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (inv.invoice_number || '').toLowerCase().includes(q) ||
        (inv.retailer_name || '').toLowerCase().includes(q) ||
        (inv.credit_note_number || '').toLowerCase().includes(q) ||
        (inv.e_way_bill_no || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtered Payments
  const filteredPayments = payments.filter((p) => {
    if (paymentFilterStatus !== 'ALL' && p.status !== paymentFilterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (p.payment_number || '').toLowerCase().includes(q) ||
        (p.retailer_name || '').toLowerCase().includes(q) ||
        (p.reference_number || '').toLowerCase().includes(q) ||
        (p.collector_name ? p.collector_name.toLowerCase().includes(q) : false)
      );
    }
    return true;
  });

  // Live Party Credit Gate records across Retailers, Distributors & CFS
  const partyCreditRecords = buildPartyCreditRecords({
    retailers,
    distributors,
    users,
    orders,
    invoices,
    payments,
    defaultCreditLimit: activeTenantSettings?.credit_limit_default || 50000,
  });

  // Calculate Metrics
  const totalInvoicedValue = invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const totalCollectedValue = invoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0);
  const totalOutstandingValue = partyCreditRecords.reduce((sum, p) => sum + p.total_liability, 0);

  const gstInvoicesCount = invoices.filter((i) => i.invoice_type === 'REGISTERED_GST').length;
  const cashInvoicesCount = invoices.filter((i) => i.invoice_type === 'CASH_NON_GST').length;
  const lockedInvoicesCount = invoices.filter((i) => i.is_locked).length;

  const cashSettledInvoices = invoices.filter((i) => getInvoicePaymentInfo(i).category === 'CASH');
  const onlineSettledInvoices = invoices.filter((i) => {
    const cat = getInvoicePaymentInfo(i).category;
    return cat === 'ONLINE' || cat === 'MIXED';
  });
  const cashInvoicedValue = cashSettledInvoices.reduce((sum, i) => sum + i.total_amount, 0);
  const onlineInvoicedValue = onlineSettledInvoices.reduce((sum, i) => sum + i.total_amount, 0);
  const zohoSyncedCount = invoices.filter((i) => i.zoho_synced).length;

  const pendingPaymentsCount = payments.filter((p) => p.status === 'PENDING').length;
  const verifiedPaymentsCount = payments.filter((p) => p.status === 'VERIFIED').length;

  // Zoho JSON API Payload Builder
  const generateZohoInvoicesJsonPayload = (targetInv?: Invoice | null) => {
    const list = targetInv ? [targetInv] : invoices;
    const payload = {
      organization_id: activeTenant?.id || 'ORGANIZATION',
      generated_at: new Date().toISOString(),
      total_records: list.length,
      invoices: list.map((inv) => {
        const payInfo = getInvoicePaymentInfo(inv);
        const ord = orders.find((o) => o.id === inv.order_id);
        const ret = retailers.find((r) => r.id === inv.retailer_id);
        const dist = distributors.find((d) => d.id === inv.retailer_id);
        const partyGstin = ret?.gstin || dist?.gstin || '';
        return {
          invoice_number: inv.invoice_number,
          invoice_type: inv.invoice_type,
          customer_id: inv.retailer_id || '',
          customer_name: inv.retailer_name,
          customer_gstin: partyGstin || (inv.invoice_type === 'REGISTERED_GST' ? 'PENDING_GSTIN' : 'URP_UNREGISTERED'),
          invoice_date: inv.invoice_date,
          due_date: inv.due_date,
          settlement_payment_mode: payInfo.category,
          primary_payment_mode: payInfo.primaryMode,
          zoho_sync_status: inv.zoho_synced ? 'SYNCED' : 'PENDING_PUSH',
          financial_summary: {
            subtotal_taxable_inr: inv.subtotal,
            cgst_9_percent_inr: inv.cgst,
            sgst_9_percent_inr: inv.sgst,
            igst_inr: inv.igst,
            total_amount_inr: inv.total_amount,
            paid_amount_inr: inv.paid_amount,
            credit_note_discount_inr: inv.is_credit_note_discount ? inv.credit_note_discount_amount || 0 : 0,
            outstanding_balance_inr: Math.max(0, inv.total_amount - inv.paid_amount - (inv.is_credit_note_discount ? inv.credit_note_discount_amount || 0 : 0)),
            is_locked_and_reconciled: !!inv.is_locked,
          },
          compliance: {
            e_way_bill_no: inv.e_way_bill_no || null,
            irn_no: inv.irn_no || null,
          },
          linked_payments: payInfo.linkedPayments.map((p) => ({
            payment_number: p.payment_number,
            payment_mode: p.payment_mode,
            reference_utr: p.reference_number,
            amount_inr: p.amount,
            payment_date: p.payment_date,
            status: p.status,
            collector: p.collector_name || 'N/A',
          })),
          line_items: ord
            ? (ord.lines || []).map((l) => ({
                sku_code: skus.find((s) => s.id === l.sku_id)?.code || l.sku_id,
                sku_name: l.sku_name,
                quantity: l.quantity,
                unit_price_inr: l.unit_price,
                line_total_inr: l.total,
                is_below_cost_claim: l.is_below_cost,
              }))
            : [],
        };
      }),
    };
    return JSON.stringify(payload, null, 2);
  };

  // Batch Push All Unsynced Data to Zoho Books
  const handleExecuteBatchZohoPush = () => {
    setIsSyncingZoho(true);
    setZohoSyncingProgress(15);

    let progress = 15;
    const interval = setInterval(() => {
      progress += 25;
      setZohoSyncingProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        invoices.forEach((inv) => {
          if (!inv.zoho_synced) {
            updateInvoiceMetadata(inv.id, { zoho_synced: true });
          }
        });
        setIsSyncingZoho(false);
        showBillingBanner('success', `Zoho Books Batch Sync Complete! Marked ${invoices.length} invoice(s) as synced.`);
      }
    }, 200);
  };

  // Push Single Invoice to Zoho Books
  const handlePushSingleInvoiceToZoho = (inv: Invoice) => {
    updateInvoiceMetadata(inv.id, { zoho_synced: true });
    showBillingBanner('success', `Invoice ${inv.invoice_number} pushed & synced with Zoho Books.`);
  };

  // Parties Exceeding Approved Credit Limit (Fund Shortage > 0)
  const creditExceededParties = partyCreditRecords.filter((p) => p.fund_shortage > 0);

  // Open Invoice Modal for a DELIVERED Order
  const handleOpenInvoiceModal = (ord: Order) => {
    if (ord.status !== 'DELIVERED') {
      showBillingBanner(
        'error',
        `Invoicing Blocked: Order ${ord.order_number} is currently "${ord.status}". Stock must be marked DELIVERED first.`
      );
      return;
    }
    setInvoiceModalOrder(ord);
    setInvModalType(ord.order_invoicing_type === 'UNREGISTERED_CASH' ? 'CASH_NON_GST' : 'REGISTERED_GST');
    setInvDiscountType('NONE');
    setInvDiscountValue('');
    setInvCreditNoteNum(`CN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setInvCreditNoteReason('');
  };

  // Generate Invoice Handler (Strictly gated to DELIVERED orders; supports Flat/Percent Discount -> Auto Credit Note)
  const handleCreateInvoiceFromOrder = (
    ord: Order,
    type: InvoiceType,
    discountOpts?: {
      discountType: 'NONE' | 'FLAT' | 'PERCENT';
      discountValue: number;
      creditNoteNumber?: string;
      creditNoteReason?: string;
    }
  ) => {
    if (ord.status !== 'DELIVERED') {
      showBillingBanner(
        'error',
        `Invoicing Blocked: Order ${ord.order_number} is in "${ord.status}" status. Mark it DELIVERED first.`
      );
      return;
    }

    const fin = getOrderFinancialSummary(ord, skus);
    const subtotal = fin.productValue || Math.round(ord.total_amount);
    const tax = type === 'REGISTERED_GST' ? fin.gstAmount : 0;
    const grossTotal = type === 'REGISTERED_GST' ? fin.totalAmountWithGst : subtotal;

    let discountAmt = 0;
    const dType = discountOpts?.discountType || 'NONE';
    const dVal = Math.max(0, Number(discountOpts?.discountValue) || 0);
    if (dType === 'FLAT') {
      discountAmt = Math.min(grossTotal, Math.round(dVal * 100) / 100);
    } else if (dType === 'PERCENT') {
      discountAmt = Math.min(grossTotal, Math.round(((grossTotal * dVal) / 100) * 100) / 100);
    }
    const netTotal = Math.max(0, Math.round((grossTotal - discountAmt) * 100) / 100);
    const hasCN = discountAmt > 0;
    const cnNumber = hasCN
      ? discountOpts?.creditNoteNumber?.trim() || `CN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      : null;

    const newInv: Invoice = {
      id: `inv_${Date.now()}`,
      tenant_id: activeTenant.id,
      invoice_number:
        type === 'REGISTERED_GST'
          ? `INV-GST-${Math.floor(1000 + Math.random() * 9000)}`
          : `INV-CASH-${Math.floor(1000 + Math.random() * 9000)}`,
      invoice_type: type,
      order_id: ord.id,
      company_id: ord.company_id,
      retailer_id: ord.retailer_id || '',
      retailer_name: ord.retailer_name_raw,
      dispatch_point_id: ord.dispatch_point_id,
      subtotal,
      cgst: type === 'REGISTERED_GST' ? Math.round((tax / 2) * 100) / 100 : 0,
      sgst: type === 'REGISTERED_GST' ? Math.round((tax / 2) * 100) / 100 : 0,
      igst: 0,
      gross_amount: grossTotal,
      discount_type: dType,
      discount_value: dVal,
      total_amount: netTotal,
      paid_amount: 0,
      status: netTotal === 0 ? 'PAID' : 'UNPAID',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + activeTenantSettings.credit_days_threshold * 86400000).toISOString().split('T')[0],
      e_way_bill_no: type === 'REGISTERED_GST' ? `EWB-2710-${Math.floor(100000 + Math.random() * 900000)}` : undefined,
      irn_no: type === 'REGISTERED_GST' ? `irn_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}` : undefined,
      is_locked: false,
      verified_by: currentUser?.name || 'Billing Executive',
      verified_at: new Date().toISOString(),
      is_credit_note_discount: hasCN,
      credit_note_discount_amount: discountAmt,
      credit_note_number: cnNumber,
      credit_note_reason: hasCN ? discountOpts?.creditNoteReason?.trim() || 'Invoice Discount Credit Note' : null,
    };

    const res = addInvoice(newInv);
    if (res && !res.success) {
      showBillingBanner('error', res.error || 'Failed to generate invoice.');
      return;
    }

    setInvoiceModalOrder(null);
    showBillingBanner(
      'success',
      hasCN
        ? `Invoice ${newInv.invoice_number} (Net ₹${netTotal.toLocaleString('en-IN')}) & Credit Note #${cnNumber} (-₹${discountAmt.toLocaleString('en-IN')}) posted! Visible in All Invoices & Party Ledger.`
        : `Invoice ${newInv.invoice_number} (₹${netTotal.toLocaleString('en-IN')}) generated and added to All Invoices.`
    );
  };

  // Open Edit Order Modal
  const handleOpenEditOrder = (ord: Order) => {
    setSelectedOrderForEdit(ord);
    setEditLines(
      (ord.lines || []).map((l) => ({
        sku_id: l.sku_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      }))
    );
  };

  // Save Edited Order
  const handleSaveEditedOrder = () => {
    if (!selectedOrderForEdit) return;

    if (editLines.length === 0) {
      showBillingBanner('error', 'Order must contain at least one SKU line.');
      return;
    }

    let newTotal = 0;
    let calculatedTax = 0;
    let hasBelowCost = false;

    const existingLines = selectedOrderForEdit.lines || [];
    const updatedOrderLines = editLines.map((line, idx) => {
      const skuObj = skus.find((s) => s.id === line.sku_id) || skus[0];
      const lineTot = line.quantity * line.unit_price;
      newTotal += lineTot;
      const taxRate = skuObj?.tax_rate !== undefined ? Number(skuObj.tax_rate) : 18;
      calculatedTax += lineTot * (taxRate / 100);
      const isBelow = line.unit_price < skuObj.landing_price;
      if (isBelow) hasBelowCost = true;

      return {
        id: existingLines[idx]?.id || `ol_${Date.now()}_${idx}`,
        tenant_id: activeTenant.id,
        order_id: selectedOrderForEdit.id,
        sku_id: skuObj.id,
        sku_name: skuObj.name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        landing_price: skuObj.landing_price,
        total: lineTot,
        is_below_cost: isBelow,
        expected_claim_total: isBelow ? (skuObj.landing_price - line.unit_price) * line.quantity : 0,
      };
    });

    const computedTax = Math.round(calculatedTax * 100) / 100;
    const updatedOrder: Order = {
      ...selectedOrderForEdit,
      total_amount: Math.round((newTotal + computedTax) * 100) / 100,
      tax_amount: computedTax,
      lines: updatedOrderLines,
      has_below_cost_lines: hasBelowCost,
    };

    updateOrder(selectedOrderForEdit.id, updatedOrder);
    setSelectedOrderForEdit(null);
    showBillingBanner('success', `Order ${updatedOrder.order_number} line items and live credit liability updated.`);
  };

  // Record Payment Submit Handler (Billing / Agent Field Collection)
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const ret = retailers.find((r) => r.id === payRetailerId) || retailers[0];
    if (!ret) return;

    const matchedInv = selectedInvoiceForPayment;
    const isAutoSettle = payAutoVerify || !!matchedInv || isAccountant;

    const newPayment: Payment = {
      id: `pmt_${Date.now()}`,
      tenant_id: activeTenant.id,
      payment_number: `PAY-${Math.floor(10000 + Math.random() * 90000)}`,
      retailer_id: ret.id,
      retailer_name: ret.name,
      amount: payAmount,
      payment_mode: payMode,
      reference_number: payRef || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      payment_date: new Date().toISOString().split('T')[0],
      matched_invoice_id: matchedInv ? matchedInv.id : null,
      status: isAutoSettle ? 'VERIFIED' : 'PENDING',
      collector_name: isBillingExec ? 'Billing Executive' : 'Field Sales Agent',
      cash_status: payMode === 'CASH' ? 'IN_SAFE' : undefined,
      notes: payNotes,
    };

    addPayment(newPayment);
    setIsRecordPaymentOpen(false);
    setSelectedInvoiceForPayment(null);
    setPayNotes('');
    setPayRef('');

    if (isAutoSettle) {
      showBillingBanner('success', `Payment ${newPayment.payment_number} (₹${(payAmount || 0).toLocaleString('en-IN')}) recorded & VERIFIED. Party credit updated.`);
    } else {
      showBillingBanner('info', `Collection Entry ${newPayment.payment_number} recorded as PENDING for Accounts Executive reconciliation.`);
    }
  };

  // Maker-Checker Verify Payment Handler (Accounts Executive)
  const handleVerifyPayment = (pmt: Payment) => {
    if (!isAccountant) {
      showBillingBanner('error', 'Maker-Checker Control: Accounts Executive approval is required to settle collection entries.');
      return;
    }
    verifyPayment(pmt.id);
    showBillingBanner('success', `Payment ${pmt.payment_number} (₹${(pmt.amount || 0).toLocaleString('en-IN')}) verified & credited in live Party Ledger.`);
  };

  // Flag Payment Handler
  const handleConfirmFlagPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flaggingPayment) return;
    if (!flagReasonText.trim()) {
      showBillingBanner('error', 'Please specify a valid reason for flagging this payment.');
      return;
    }
    flagPayment(flaggingPayment.id, flagReasonText);
    setFlaggingPayment(null);
    setFlagReasonText('');
    showBillingBanner('info', `Payment ${flaggingPayment.payment_number} flagged for audit investigation.`);
  };

  // Open Edit Existing Payment
  const handleOpenEditPayment = (pmt: Payment) => {
    if (pmt.status === 'VERIFIED') {
      showBillingBanner('error', 'Verified payments are permanently locked to preserve bank ledger integrity.');
      return;
    }

    if (pmt.status === 'FLAGGED' && activeRole !== 'ADMIN') {
      showBillingBanner('error', 'Admin Access Required: Only an Admin can edit flagged payment entries.');
      return;
    }

    if (pmt.status === 'PENDING' && activeRole !== 'ADMIN') {
      showBillingBanner('error', 'Accounts Executive cannot edit payment figures directly; Reconcile or Flag mismatch.');
      return;
    }

    setEditingPayment(pmt);
    setEditPaymentAmount(pmt.amount);
    setEditPaymentMode(pmt.payment_mode);
    setEditPaymentRef(pmt.reference_number || '');
    setEditPaymentNotes(pmt.notes || '');
  };

  // Save Edited Payment Details (ADMIN ONLY for FLAGGED / PENDING)
  const handleSaveEditPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;

    if (editingPayment.status === 'VERIFIED') {
      showBillingBanner('error', 'Verified payments are permanently locked and cannot be edited.');
      return;
    }

    if (activeRole !== 'ADMIN') {
      showBillingBanner('error', 'Admin Access Required to modify pending or flagged payment entries.');
      return;
    }

    const amt = Number(editPaymentAmount) || 0;
    if (amt <= 0) {
      showBillingBanner('error', 'Please enter a valid payment amount greater than zero.');
      return;
    }

    const isFlagged = editingPayment.status === 'FLAGGED';

    updatePaymentDetails(editingPayment.id, {
      amount: amt,
      payment_mode: editPaymentMode,
      reference_number: editPaymentRef,
      notes: editPaymentNotes,
      status: isFlagged ? 'VERIFIED' : editingPayment.status,
    });

    if (isFlagged) {
      showBillingBanner('success', `Admin Resolution: Payment ${editingPayment.payment_number} updated to ₹${amt.toLocaleString('en-IN')} and VERIFIED.`);
    } else {
      showBillingBanner('success', `Payment ${editingPayment.payment_number} updated to ₹${amt.toLocaleString('en-IN')}.`);
    }

    setEditingPayment(null);
  };

  // Open Mark Partial Payment Modal on Invoice
  const handleOpenPartialPayInvoice = (inv: Invoice) => {
    setEditingInvoicePartial(inv);
    setPartialPayAmount(inv.paid_amount > 0 ? inv.paid_amount : Math.round(inv.total_amount * 0.5));
    setPartialPayMode('CASH');
    setPartialPayRef(`PARTIAL-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  // Save Partial Payment Amount on Invoice
  const handleSavePartialPayInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoicePartial) return;

    const amt = Number(partialPayAmount) || 0;
    updateInvoicePaidAmount(editingInvoicePartial.id, amt, partialPayMode, partialPayRef);

    const remaining = Math.max(0, editingInvoicePartial.total_amount - amt);
    const newStatus = amt >= editingInvoicePartial.total_amount ? 'PAID' : amt > 0 ? 'PARTIAL' : 'UNPAID';

    showBillingBanner(
      'success',
      `Invoice ${editingInvoicePartial.invoice_number} updated (${newStatus}). Remaining Balance: ₹${remaining.toLocaleString('en-IN')}.`
    );
    setEditingInvoicePartial(null);
  };

  // Toggle Lock Invoice (Accountant Only)
  const handleToggleLockInvoice = (inv: Invoice) => {
    if (!isAccountant) {
      showBillingBanner('error', 'Only Accounts Executive or Admin can lock/unlock reconciled invoices.');
      return;
    }
    toggleLockInvoice(inv.id, isBillingExec ? 'Billing Exec' : 'Accounts Exec');
    const newState = !inv.is_locked;
    showBillingBanner('info', `Invoice ${inv.invoice_number} is now ${newState ? 'LOCKED & RECONCILED' : 'UNLOCKED for editing'}.`);
  };

  // Export Payments formatted for Zoho Books / Zoho Finance
  const handleExportZohoPayments = () => {
    const headers = [
      'Payment Date',
      'Payment Number',
      'Customer Name',
      'Payment Mode',
      'Amount (INR)',
      'Reference Number',
      'Invoice Number',
      'Deposit Account',
      'Verification Status',
      'Collector Name',
      'Notes'
    ];

    const rows = payments.map((p) => {
      const matchedInv = invoices.find((inv) => inv.id === p.matched_invoice_id);
      return [
        `"${p.payment_date}"`,
        `"${p.payment_number}"`,
        `"${p.retailer_name?.replace(/"/g, '""') || 'Direct Outlet'}"`,
        `"${p.payment_mode}"`,
        p.amount,
        `"${p.reference_number || ''}"`,
        `"${matchedInv ? matchedInv.invoice_number : ''}"`,
        `"${p.payment_mode === 'CASH' ? 'Undeposited Cash Safe' : 'Main Bank Account'}"`,
        `"${p.status}"`,
        `"${p.collector_name || ''}"`,
        `"${(p.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Zoho_Finance_Payments_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Sales Invoices Register (respecting All Invoices active filters when non-empty)
  const handleExportZohoSalesRegister = () => {
    const sourceList = filteredInvoices.length > 0 ? filteredInvoices : invoices;
    const headers = [
      'Invoice Date',
      'Invoice Number',
      'Customer Name',
      'GSTIN',
      'Invoice Type',
      'Subtotal / Taxable (INR)',
      'CGST (9%)',
      'SGST (9%)',
      'IGST (18%)',
      'Gross Amount (INR)',
      'Credit Note Discount (INR)',
      'Credit Note Number',
      'Net Payable Total (INR)',
      'Paid Amount (INR)',
      'Outstanding Balance (INR)',
      'Invoice Status',
      'E-Way Bill No',
      'IRN / e-Invoice No',
      'Reconciled & Locked'
    ];

    const rows = sourceList.map((inv) => {
      const ret = retailers.find((r) => r.id === inv.retailer_id);
      const dist = distributors.find((d) => d.id === inv.retailer_id);
      const partyGstin = ret?.gstin || dist?.gstin || '';
      const gstin = partyGstin || (inv.invoice_type === 'REGISTERED_GST' ? 'PENDING_GSTIN' : 'URP (Unregistered)');
      const cnAmt = inv.is_credit_note_discount ? Number(inv.credit_note_discount_amount) || 0 : 0;
      const grossAmt = inv.gross_amount ?? inv.total_amount;
      const netAmt = getInvoiceNetTotal(inv);
      const remaining = Math.max(0, netAmt - inv.paid_amount);

      return [
        `"${inv.invoice_date}"`,
        `"${inv.invoice_number}"`,
        `"${inv.retailer_name.replace(/"/g, '""')}"`,
        `"${gstin}"`,
        `"${inv.invoice_type}"`,
        inv.subtotal,
        inv.cgst,
        inv.sgst,
        inv.igst,
        grossAmt,
        cnAmt,
        `"${inv.credit_note_number || ''}"`,
        netAmt,
        inv.paid_amount,
        remaining,
        `"${inv.status}"`,
        `"${inv.e_way_bill_no || ''}"`,
        `"${inv.irn_no || ''}"`,
        `"${inv.is_locked ? 'YES' : 'NO'}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `All_Invoices_Register_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open Punch Order Modal
  const handleOpenPunchOrder = () => {
    const firstRet = retailers[0];
    const firstComp = companies[0];
    const compSkus = firstComp ? skus.filter((s) => s.company_id === firstComp.id) : skus;
    const firstSku = compSkus[0] || skus[0];
    setPunchRetailerId(firstRet ? firstRet.id : '');
    setPunchCompanyId(firstComp ? firstComp.id : 'ALL');
    setPunchSkuId(firstSku ? firstSku.id : '');
    setPunchQty(50);
    setPunchUnitPrice(firstSku ? firstSku.selling_price : 100);
    setIsPunchOrderOpen(true);
  };

  // Submit Punch Store Order
  const handleCreatePunchOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const ret = retailers.find((r) => r.id === punchRetailerId) || retailers[0];
    const targetSku = skus.find((s) => s.id === punchSkuId) || skus[0];
    if (!ret || !targetSku) return;

    const qty = Math.max(1, Number(punchQty) || 1);
    const rate = Math.max(0, Number(punchUnitPrice) || targetSku.selling_price);
    const landing = targetSku.landing_price;
    const isBelow = rate < landing;
    const lineTotal = qty * rate;

    const newOrder: Order = {
      id: `ord_punch_${Date.now()}`,
      tenant_id: activeTenant.id,
      order_number: `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      channel: ret.channel || 'GT',
      company_id: targetSku.company_id,
      retailer_id: ret.id,
      retailer_name_raw: ret.name,
      beat_name: ret.beat_name || 'Central Beat',
      dispatch_point_id: resolveDispatchPointIdForCompany(targetSku.company_id, companies, dispatchPoints),
      created_by_user_id: currentUser?.id || 'usr_billing_1',
      commission_agent_id: (ret as any).commission_agent_id || users?.find((u) => u.role === 'COMMISSION_AGENT')?.id || 'usr_agent_1',
      commission_agent_name: (ret as any).commission_agent_id
        ? (users?.find((u) => u.id === (ret as any).commission_agent_id)?.name || 'Commission Agent')
        : (users?.find((u) => u.role === 'COMMISSION_AGENT')?.name || 'Commission Agent'),
      order_date: new Date().toISOString().split('T')[0],
      delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      status: 'PUNCHED',
      total_amount: lineTotal,
      tax_amount: Math.round(lineTotal * 0.18),
      has_below_cost_lines: isBelow,
      lines: [
        {
          id: `ol_punch_${Date.now()}_1`,
          tenant_id: activeTenant.id,
          order_id: `ord_punch_${Date.now()}`,
          sku_id: targetSku.id,
          sku_name: targetSku.name,
          quantity: qty,
          unit_price: rate,
          landing_price: landing,
          total: lineTotal,
          is_below_cost: isBelow,
          expected_claim_total: isBelow ? (landing - rate) * qty : 0,
        },
      ],
    };

    addOrder(newOrder);
    setIsPunchOrderOpen(false);
    showBillingBanner('success', `New Store Order ${newOrder.order_number} punched for ${ret.name} & added to Billing Queue.`);
  };

  return (
    <div className="space-y-6">
      {billingBanner && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            billingBanner.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
              : billingBanner.type === 'error'
                ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                : 'bg-blue-950/70 border-blue-500/40 text-blue-200'
          }`}
        >
          <span>{billingBanner.message}</span>
          <button
            type="button"
            onClick={() => setBillingBanner(null)}
            className="text-xs font-bold opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Module Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Receipt className="text-blue-500" size={24} />
            Billing, Invoicing & Financial Accounting Console
          </h1>
          <p className="text-xs text-slate-400">
            GST Billing Engine, Agent Collections Audit Queue, Ledger Reconciliation, and Zoho/Tally Finance Integration.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportZohoSalesRegister}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            title="Export GST Sales Register CSV formatted for Zoho Books or Tally ERP 9"
          >
            <FileSpreadsheet size={15} className="text-emerald-400" /> Sales Register (Zoho/Tally)
          </button>
          <button
            onClick={handleExportZohoPayments}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            title="Export Payment Receipts CSV formatted for Zoho Finance"
          >
            <Download size={15} /> Export Payments (Zoho)
          </button>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Invoiced Value"
          value={`₹${(totalInvoicedValue || 0).toLocaleString('en-IN')}`}
          subtitle={`${gstInvoicesCount} GST | ${cashInvoicesCount} Cash Invoices`}
          icon={FileText}
          status="info"
        />
        <KPICard
          title="Reconciled Bank Collections"
          value={`₹${(totalCollectedValue || 0).toLocaleString('en-IN')}`}
          subtitle={`${verifiedPaymentsCount} Verified | ${pendingPaymentsCount} Pending Reconciliation`}
          icon={CheckCircle2}
          status="success"
        />
        <KPICard
          title="Accounts Receivable (Outstanding)"
          value={`₹${(totalOutstandingValue || 0).toLocaleString('en-IN')}`}
          subtitle={`${creditExceededParties.length} Parties with Fund Shortage`}
          icon={DollarSign}
          status={totalOutstandingValue > 100000 ? 'warning' : 'neutral'}
        />
        <KPICard
          title="Reconciled & Locked Invoices"
          value={`${lockedInvoicesCount} / ${invoices.length}`}
          subtitle={`${lockedInvoicesCount} Invoices Secured against tampering`}
          icon={Lock}
          status="success"
        />
      </div>

      {/* Tab Navigation Bar */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('VERIFY_ORDERS')}
          className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'VERIFY_ORDERS'
              ? 'border-purple-500 text-purple-400 bg-purple-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckCircle2 size={15} /> Verify Orders ({pendingVerificationOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('DISPATCH_SHEET')}
          className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'DISPATCH_SHEET'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Truck size={15} /> Dispatch Sheet ({confirmedOrders.length})
          {confirmedOrders.length > 0 && (
            <span className="bg-indigo-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
              {confirmedOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('READY_TO_INVOICE')}
          className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'READY_TO_INVOICE'
              ? 'border-amber-500 text-amber-300 bg-amber-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt size={15} /> Ready to Invoice ({readyToInvoiceOrders.length})
          {readyToInvoiceOrders.length > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
              {readyToInvoiceOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('INVOICES')}
          className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'INVOICES'
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText size={15} /> All Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`px-4 py-2.5 font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'PAYMENTS'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <DollarSign size={15} /> Payments &amp; UTRs ({payments.length})
          {pendingPaymentsCount > 0 && (
            <span className="bg-amber-500 text-black text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
              {pendingPaymentsCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: ORDER VERIFICATION QUEUE (BILLING EXECUTIVE PRIMARY) */}
      {activeTab === 'VERIFY_ORDERS' && (
        <div className="space-y-6">
          <BEVerificationDashboard />
        </div>
      )}

      {/* TAB: READY TO INVOICE (STRICTLY DELIVERED ORDERS ONLY) */}
      {activeTab === 'READY_TO_INVOICE' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt size={17} className="text-amber-400" />
                Ready to Invoice — Delivered Orders Only ({readyToInvoiceOrders.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Orders unlock here only after physical delivery is recorded in <strong className="text-white">Dispatch &amp; Depot &rarr; Delivery Entry</strong> or the <strong className="text-white">Dispatcher Mobile App</strong>. You can apply an optional flat (₹) or percentage (%) discount during invoice creation — it deducts directly from the invoice total and posts an automatic Credit Note to the Party Ledger.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('INVOICES')}
              className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-xs flex items-center gap-1.5"
            >
              <FileText size={14} /> View All Invoices ({invoices.length}) &rarr;
            </button>
          </div>

          {readyToInvoiceOrders.length === 0 ? (
            <div className="p-10 text-center bg-slate-900 border border-dashed border-slate-800 rounded-2xl space-y-2 text-xs text-slate-400">
              <CheckCircle2 size={28} className="mx-auto text-slate-600" />
              <div className="text-sm font-bold text-slate-200">No Delivered Orders Awaiting Invoicing</div>
              <p className="max-w-lg mx-auto text-slate-400">
                Once Confirmed or Dispatched orders are marked <strong className="text-emerald-300">DELIVERED</strong> (either offline by BE/Office in <em>Dispatch &amp; Depot</em> or online by Dispatcher), they will immediately appear here ready for final GST/Cash invoicing.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Order # &amp; Delivery Date</th>
                      <th className="py-3 px-4">Party / Outlet</th>
                      <th className="py-3 px-4">Dispatch Point &amp; Source</th>
                      <th className="py-3 px-4">Delivery Proof / By</th>
                      <th className="py-3 px-4 text-center">Billing Type</th>
                      <th className="py-3 px-4 text-right">Order Gross Value</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {readyToInvoiceOrders.map((ord) => {
                      const fin = getOrderFinancialSummary(ord, skus);
                      const dpObj = dispatchPoints.find((d) => d.id === ord.dispatch_point_id);
                      const isCash = ord.order_invoicing_type === 'UNREGISTERED_CASH';

                      return (
                        <tr key={ord.id} className="hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <div className="font-mono font-bold text-white">{ord.order_number}</div>
                            <div className="text-[10px] text-emerald-400">
                              Delivered: {ord.delivered_at ? ord.delivered_at.split('T')[0] : ord.order_date}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{ord.retailer_name_raw}</div>
                            <div className="text-[10px] text-slate-400">{ord.channel} • {(ord.lines || []).length} SKUs</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-200 font-medium">{dpObj?.name || 'Dispatch Point'}</div>
                            <span
                              className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                                ord.fulfillment_source === 'DEPOT_STOCK'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                              }`}
                            >
                              {ord.fulfillment_source === 'DEPOT_STOCK' ? 'DEPOT STOCK' : 'PRINCIPAL PO'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-200">{ord.delivered_by || 'Dispatcher / Office'}</div>
                            {ord.delivery_proof_ref && (
                              <div className="text-[10px] font-mono text-slate-400">Ref: {ord.delivery_proof_ref}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isCash
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              }`}
                            >
                              {isCash ? 'Cash Non-GST' : 'Registered GST'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            ₹{(isCash ? fin.productValue : fin.totalAmountWithGst).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenInvoiceModal(ord)}
                              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
                            >
                              <Receipt size={13} /> Generate Invoice
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: MORNING DISPATCHER CONSIGNMENTS & SKU-vs-PARTY MATRIX */}
      {activeTab === 'DISPATCH_SHEET' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3 max-w-3xl">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 mt-0.5">
                <Truck size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  Daily Fresh Dispatch Batch ({dispatchDateFilter})
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Dispatch Point Segregated SKU-vs-Party Matrix & Consolidated Load Sheet
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Orders verified &amp; confirmed today (00:00–23:59 IST) automatically queue for Tomorrow ({tomorrowIST}). Prior un-dispatched orders stay isolated below.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleExportSkuPartyMatrixCsv()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
                title="Export SKU-vs-Party Dispatch Sheet Matrix CSV (strictly scoped per Dispatch Point -> Principal Company mapping)"
              >
                <FileSpreadsheet size={14} /> Export SKU-vs-Party Matrix (CSV)
              </button>
              <button
                type="button"
                onClick={handleExportMorningDispatcherSheetCsv}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-900/30"
                title="Download flat order-line morning dispatcher load sheet as CSV"
              >
                <Download size={14} /> Export Flat Load Sheet (CSV)
              </button>
              <button
                type="button"
                disabled={freshDispatchOrders.length === 0}
                onClick={() => setConfirmFinalizeOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-900/30"
                title="Mark all pending orders on the selected dispatch date as Dispatched and close this batch"
              >
                <CheckCircle2 size={14} /> Mark Selected Date Dispatched / Finalize Batch ({freshDispatchOrders.length})
              </button>
              <button
                type="button"
                onClick={handleSendManifestToDispatcher}
                className="px-3.5 py-2 rounded-xl bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-1.5"
                title="CONFIRMED orders for the active dispatch date are live in the Dispatcher Mobile App"
              >
                <CheckCircle2 size={14} /> Auto-Synced ({freshDispatchOrders.length})
              </button>
            </div>
          </div>

          {/* Inline Batch Finalization Confirmation Banner */}
          {confirmFinalizeOpen && (
            <div className="p-3.5 bg-amber-950/60 border border-amber-500/40 rounded-xl text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertOctagon size={16} className="text-amber-400 shrink-0" />
                <span>
                  Finalize Dispatch Batch <strong>{dispatchDateFilter}</strong>? This will mark{' '}
                  <strong>{freshDispatchOrders.length}</strong> pending order(s) as{' '}
                  <strong>DISPATCHED</strong>, auto-adjust depot inventory for Depot Stock orders, and clear them from the fresh load sheet.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmFinalizeOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeSelectedDateBatch}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                >
                  Confirm &amp; Finalize Batch
                </button>
              </div>
            </div>
          )}

          {dispatchFeedback && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                {dispatchFeedback}
              </span>
              <button
                type="button"
                onClick={() => setDispatchFeedback(null)}
                className="text-emerald-400 hover:text-white p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* View Mode, Batch Date, Dispatch Point & Filter Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setDispatchViewMode('MATRIX')}
                  className={`px-3 py-1.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-colors ${
                    dispatchViewMode === 'MATRIX'
                      ? 'bg-emerald-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Table2 size={13} /> SKU-vs-Party Matrix
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchViewMode('GROUPED')}
                  className={`px-3 py-1.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-colors ${
                    dispatchViewMode === 'GROUPED'
                      ? 'bg-indigo-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers size={13} /> Grouped Load Cards
                </button>
              </div>

              {/* Dispatch Date Quick Presets & Date Picker */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setDispatchDateFilter(tomorrowIST)}
                  className={`px-2.5 py-1 rounded-md font-semibold text-xs flex items-center gap-1 transition-colors ${
                    dispatchDateFilter === tomorrowIST
                      ? 'bg-emerald-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Calendar size={12} /> Tomorrow ({tomorrowIST})
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchDateFilter(todayIST)}
                  className={`px-2.5 py-1 rounded-md font-semibold text-xs transition-colors ${
                    dispatchDateFilter === todayIST
                      ? 'bg-blue-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Today ({todayIST})
                </button>
                <input
                  type="date"
                  value={dispatchDateFilter}
                  onChange={(e) => e.target.value && setDispatchDateFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-white font-mono"
                  aria-label="Dispatch batch date"
                />
              </div>

              {dispatchViewMode === 'GROUPED' && (
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDispatchGroupBy('PARTY')}
                    className={`px-2.5 py-1 rounded-md font-semibold text-xs flex items-center gap-1 transition-colors ${
                      dispatchGroupBy === 'PARTY'
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Building size={12} /> Party
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchGroupBy('AGENT')}
                    className={`px-2.5 py-1 rounded-md font-semibold text-xs flex items-center gap-1 transition-colors ${
                      dispatchGroupBy === 'AGENT'
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users size={12} /> Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchGroupBy('BEAT')}
                    className={`px-2.5 py-1 rounded-md font-semibold text-xs flex items-center gap-1 transition-colors ${
                      dispatchGroupBy === 'BEAT'
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Truck size={12} /> Beat
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <Warehouse size={13} className="text-cyan-400" /> Dispatch Point:
                </span>
                <select
                  value={dispatchPointFilter}
                  onChange={(e) => setDispatchPointFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ALL">All Dispatch Points (Segregated Sheets)</option>
                  {dispatchPoints.map((dp) => {
                    const mappedCount = companies.filter((c) => c.dispatch_point_id === dp.id).length;
                    return (
                      <option key={dp.id} value={dp.id}>
                        {dp.name} ({dp.code}) — {mappedCount} Co.
                      </option>
                    );
                  })}
                  <option value={UNMAPPED_DISPATCH_POINT_ID}>⚠ Unmapped Dispatch Point</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">Order Scope:</span>
                <select
                  value={dispatchStatusScope}
                  onChange={(e) => setDispatchStatusScope(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="CONFIRMED_ONLY">Fresh Un-dispatched ({freshDispatchOrders.length})</option>
                  <option value="ALL_POST_PO">Include Dispatched on Date ({freshDispatchOrders.length + dispatchedForDateOrders.length})</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">Company:</span>
                <select
                  value={dispatchCompanyFilter}
                  onChange={(e) => setDispatchCompanyFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ALL">All Mapped Companies</option>
                  {companies
                    .filter((c) => dispatchPointFilter === 'ALL' || c.dispatch_point_id === dispatchPointFilter)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* VIEW 1: SKU-vs-PARTY MATRIX PER DISPATCH POINT */}
          {dispatchViewMode === 'MATRIX' ? (
            dispatchPointMatrices.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-900 border border-dashed border-slate-800 rounded-2xl text-xs space-y-2">
                <Table2 size={28} className="mx-auto text-emerald-500/50" />
                <div className="text-slate-300 font-semibold text-sm">No SKU-vs-Party matrix entries found</div>
                <p className="text-slate-400">
                  Submit a Principal PO or fast-track confirm from existing Depot Stock in Order Capture to transition VERIFIED orders to CONFIRMED.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {dispatchPointMatrices.map((matrix) => (
                  <div
                    key={matrix.dispatchPointId}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Warehouse
                            size={16}
                            className={matrix.dispatchPointId === UNMAPPED_DISPATCH_POINT_ID ? 'text-rose-400' : 'text-cyan-400'}
                          />
                          <h4
                            className={`text-sm font-bold ${
                              matrix.dispatchPointId === UNMAPPED_DISPATCH_POINT_ID ? 'text-rose-300' : 'text-white'
                            }`}
                          >
                            {matrix.dispatchPointName}{' '}
                            <span
                              className={`font-mono text-xs ${
                                matrix.dispatchPointId === UNMAPPED_DISPATCH_POINT_ID ? 'text-amber-300' : 'text-cyan-400'
                              }`}
                            >
                              ({matrix.dispatchPointCode})
                            </span>
                          </h4>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                            {matrix.rows.length} SKUs × {matrix.parties.length} Parties
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono font-bold">
                            {matrix.grandTotalQuantity.toLocaleString()} Total Pcs
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {matrix.dispatchPointId === UNMAPPED_DISPATCH_POINT_ID ? (
                            <span className="text-amber-300 font-semibold">
                              Exception: Map Principal Company ➔ Dispatch Point in Setup to route these SKUs to an active hub.
                            </span>
                          ) : (
                            <>
                              Mapped Principal Companies:{' '}
                              <span className="text-slate-200 font-semibold">
                                {matrix.mappedCompanyNames.length > 0
                                  ? matrix.mappedCompanyNames.join(', ')
                                  : 'None mapped'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleExportSkuPartyMatrixCsv(matrix.dispatchPointId)}
                        disabled={matrix.rows.length === 0}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5"
                      >
                        <Download size={13} /> Export {matrix.dispatchPointCode} Matrix CSV
                      </button>
                    </div>

                    {matrix.rows.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                        No confirmed order lines for companies mapped to {matrix.dispatchPointName}.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 font-semibold">
                              <th className="py-2.5 px-3 sticky left-0 bg-slate-950 z-10 border-r border-slate-800 min-w-[220px]">
                                SKU Name (Column A)
                              </th>
                              {matrix.parties.map((party) => (
                                <th
                                  key={party.partyKey}
                                  className="py-2.5 px-3 text-right border-r border-slate-800/60 min-w-[140px]"
                                  title={`Beat: ${party.beatName || 'N/A'} | Orders: ${party.orderNumbers.join(', ')}`}
                                >
                                  <div className="text-white font-bold leading-tight">{party.partyName}</div>
                                  <div className="text-[10px] text-cyan-400 font-normal">
                                    {party.raiserRoleLabel}
                                    {party.raiserName && party.raiserName !== party.partyName ? `: ${party.raiserName}` : ''}
                                  </div>
                                </th>
                              ))}
                              <th className="py-2.5 px-3 text-right bg-slate-950 font-bold text-amber-300 min-w-[100px]">
                                Total Qty
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-200">
                            {matrix.rows.map((row) => (
                              <tr key={row.skuId || row.skuName} className="hover:bg-slate-800/40">
                                <td className="py-2 px-3 sticky left-0 bg-slate-900 border-r border-slate-800">
                                  <div className="font-semibold text-white">{row.skuName}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {row.companyCode} • {row.skuCode} • {row.packSize}
                                  </div>
                                </td>
                                {matrix.parties.map((party) => {
                                  const cellQty = row.quantitiesByPartyKey[party.partyKey] || 0;
                                  return (
                                    <td
                                      key={party.partyKey}
                                      className={`py-2 px-3 text-right font-mono border-r border-slate-800/60 ${
                                        cellQty > 0 ? 'text-white font-bold' : 'text-slate-600'
                                      }`}
                                    >
                                      {cellQty > 0 ? cellQty : '—'}
                                    </td>
                                  );
                                })}
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                                  {row.totalQuantity.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-950 border-t-2 border-slate-700 font-mono font-bold text-xs">
                              <td className="py-2.5 px-3 sticky left-0 bg-slate-950 border-r border-slate-800 text-amber-300">
                                TOTAL QTY
                              </td>
                              {matrix.parties.map((party) => (
                                <td
                                  key={party.partyKey}
                                  className="py-2.5 px-3 text-right border-r border-slate-800/60 text-cyan-300"
                                >
                                  {party.totalQuantity.toLocaleString()}
                                </td>
                              ))}
                              <td className="py-2.5 px-3 text-right text-emerald-400">
                                {matrix.grandTotalQuantity.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : dispatchManifestOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-slate-900 border border-dashed border-slate-800 rounded-2xl text-xs space-y-2">
              <Truck size={28} className="mx-auto text-indigo-500/50" />
              <div className="text-slate-300 font-semibold text-sm">No morning dispatch orders found</div>
              <p className="text-slate-400">
                Submit a Principal PO or fast-track confirm from existing Depot Stock in Order Capture to transition VERIFIED orders to CONFIRMED for next-day dispatch.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Calculate Grouped Data */}
              {(() => {
                // Grouping Map
                const groups: Record<
                  string,
                  { key: string; label: string; sublabel: string; orders: Order[] }
                > = {};

                dispatchManifestOrders.forEach((o) => {
                  let groupKey = '';
                  let groupLabel = '';
                  let groupSub = '';

                  if (dispatchGroupBy === 'PARTY') {
                    groupKey = o.retailer_name_raw || 'Unknown Party';
                    groupLabel = o.retailer_name_raw;
                    groupSub = `Beat: ${o.beat_name} | Channel: ${o.channel}`;
                  } else if (dispatchGroupBy === 'AGENT') {
                    const caName = o.commission_agent_name || users.find((u) => u.id === o.commission_agent_id)?.name || 'Commission Agent';
                    groupKey = o.commission_agent_id || 'GT Field Rep';
                    groupLabel = `Commission Agent: ${caName}`;
                    groupSub = `Beat: ${o.beat_name}`;
                  } else {
                    groupKey = o.beat_name || 'General Route';
                    groupLabel = `Route / Beat: ${o.beat_name}`;
                    groupSub = `Channel: ${o.channel}`;
                  }

                  if (!groups[groupKey]) {
                    groups[groupKey] = {
                      key: groupKey,
                      label: groupLabel,
                      sublabel: groupSub,
                      orders: [],
                    };
                  }
                  groups[groupKey].orders.push(o);
                });

                const groupList = Object.values(groups);

                return groupList.map((grp) => {
                  // Build SKU line items aggregation for this group (strictly filtered by DP & Company)
                  const skuMap: Record<
                    string,
                    { code: string; name: string; pack: string; quantity: number; unit_price: number; total: number }
                  > = {};

                  grp.orders.forEach((ord) => {
                    (ord.lines || []).forEach((l) => {
                      if (dispatchPointFilter !== 'ALL' && !doesOrderLineBelongToDispatchPoint(l, ord, dispatchPointFilter, companies, skus)) {
                        return;
                      }
                      if (dispatchCompanyFilter !== 'ALL' && getEffectiveLineCompanyId(l, ord, skus) !== dispatchCompanyFilter) {
                        return;
                      }
                      const skuObj = skus.find((s) => s.id === l.sku_id);
                      if (!skuMap[l.sku_id]) {
                        skuMap[l.sku_id] = {
                          code: skuObj?.code || 'SKU-00',
                          name: l.sku_name,
                          pack: skuObj?.pack_size || '1x12',
                          quantity: 0,
                          unit_price: Number(l.unit_price) || 0,
                          total: 0,
                        };
                      }
                      const qty = Number(l.quantity) || 0;
                      const tot = Number(l.total) != null && !isNaN(Number(l.total)) ? Number(l.total) : qty * (Number(l.unit_price) || 0);
                      skuMap[l.sku_id].quantity += qty;
                      skuMap[l.sku_id].total += tot;
                    });
                  });

                  const skuLines = Object.values(skuMap);
                  if (skuLines.length === 0) return null;
                  const groupTotalQty = skuLines.reduce((s, r) => s + r.quantity, 0);
                  const groupTotalVal = skuLines.reduce((s, r) => s + r.total, 0);
                  const isGroupExpanded = expandedGroupKey === grp.key;

                  return (
                    <div
                      key={grp.key}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                            {dispatchGroupBy === 'PARTY' ? <Building size={18} /> : dispatchGroupBy === 'AGENT' ? <Users size={18} /> : <Truck size={18} />}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                              {grp.label}
                              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                                {grp.orders.length} Order(s)
                              </span>
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {grp.sublabel} | <span className="text-emerald-400 font-bold">{(groupTotalQty || 0).toLocaleString()} Pcs</span> | Total Value: <span className="text-white font-semibold">₹{(groupTotalVal || 0).toLocaleString('en-IN')}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopyPartyConsignmentText(grp.label, grp.orders)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5"
                            title="Copy formatted manifest text for WhatsApp/Email sharing with dispatcher"
                          >
                            <Copy size={13} /> Copy Manifest
                          </button>
                          <button
                            onClick={() => setExpandedGroupKey(isGroupExpanded ? null : grp.key)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1"
                          >
                            {isGroupExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {isGroupExpanded ? 'Hide Lines' : 'View Detailed SKUs'}
                          </button>
                        </div>
                      </div>

                      {/* Detailed SKU Breakdown Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                              <th className="py-2 px-3">SKU Code</th>
                              <th className="py-2 px-3">Product Description</th>
                              <th className="py-2 px-3">Pack Size</th>
                              <th className="py-2 px-3 text-right">Quantity (Pcs)</th>
                              <th className="py-2 px-3 text-right">Unit Rate (₹)</th>
                              <th className="py-2 px-3 text-right">Gross Total (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-200">
                            {skuLines.map((line, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40 font-mono text-[11px]">
                                <td className="py-2 px-3 font-bold text-indigo-400">{line.code}</td>
                                <td className="py-2 px-3 font-sans font-semibold text-white">{line.name}</td>
                                <td className="py-2 px-3 font-sans text-slate-400">{line.pack}</td>
                                <td className="py-2 px-3 text-right font-bold text-amber-300">{(line.quantity || 0).toLocaleString()}</td>
                                <td className="py-2 px-3 text-right text-slate-300">₹{line.unit_price}</td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-400">₹{(line.total || 0).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Expanded Orders Included View */}
                      {isGroupExpanded && (
                        <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl space-y-2 mt-2">
                          <div className="text-xs font-bold text-slate-300">
                            Orders Included in this Manifest ({grp.orders.length}):
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {grp.orders.map((ord, idx) => (
                              <div
                                key={`${ord.id || ord.order_number}_${idx}`}
                                className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs"
                              >
                                <div>
                                  <div className="font-mono font-bold text-indigo-400 flex items-center gap-1.5">
                                    {ord.order_number}
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                                      {ord.status}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {ord.retailer_name_raw} ({ord.beat_name})
                                  </div>
                                </div>
                                <div className="text-right font-mono">
                                  <div className="text-slate-300 text-[11px]">
                                    {(ord.lines || []).length} SKUs
                                  </div>
                                  <div className="font-bold text-emerald-400 text-xs">
                                    ₹{(ord.total_amount || 0).toLocaleString('en-IN')}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* COLLAPSIBLE PRIOR UN-DISPATCHED BACKLOG SECTION (STRICTLY ISOLATED FROM TOMORROW'S MATRIX) */}
          {priorBacklogOrders.length > 0 && (
            <div className="bg-slate-900 border border-amber-500/35 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-amber-950/25 border-b border-amber-500/20 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowPriorBacklog((prev) => !prev)}
                  className="flex items-center gap-2.5 text-left"
                >
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Clock size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-amber-200">
                        Prior Un-dispatched Backlog ({priorBacklogOrders.length})
                      </h4>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                        ISOLATED FROM {dispatchDateFilter} FRESH MATRIX
                      </span>
                      {showPriorBacklog ? (
                        <ChevronUp size={15} className="text-amber-300" />
                      ) : (
                        <ChevronDown size={15} className="text-amber-300" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Confirmed orders scheduled before {dispatchDateFilter} that have not been marked Dispatched yet. Carry them forward to Tomorrow or mark them Dispatched/Cleared.
                    </p>
                  </div>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCarryForwardBacklog(
                        selectedBacklogOrderIds.length > 0
                          ? selectedBacklogOrderIds
                          : priorBacklogOrders.map((o) => o.id)
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <ArrowRight size={13} />
                    {selectedBacklogOrderIds.length > 0
                      ? `Carry Forward Selected (${selectedBacklogOrderIds.length}) to Tomorrow`
                      : `Carry Forward All (${priorBacklogOrders.length}) to Tomorrow`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleClearBacklogAsDispatched(
                        selectedBacklogOrderIds.length > 0
                          ? selectedBacklogOrderIds
                          : priorBacklogOrders.map((o) => o.id)
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={13} />
                    {selectedBacklogOrderIds.length > 0
                      ? `Mark Selected (${selectedBacklogOrderIds.length}) Dispatched / Clear`
                      : `Mark All (${priorBacklogOrders.length}) Dispatched / Clear`}
                  </button>
                </div>
              </div>

              {showPriorBacklog && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={
                              priorBacklogOrders.length > 0 &&
                              priorBacklogOrders.every((o) => selectedBacklogOrderIds.includes(o.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBacklogOrderIds(priorBacklogOrders.map((o) => o.id));
                              } else {
                                setSelectedBacklogOrderIds([]);
                              }
                            }}
                            aria-label="Select all prior backlog orders"
                          />
                        </th>
                        <th className="py-2.5 px-3">Order #</th>
                        <th className="py-2.5 px-3">Scheduled Date</th>
                        <th className="py-2.5 px-3">Party / Outlet</th>
                        <th className="py-2.5 px-3">Dispatch Point</th>
                        <th className="py-2.5 px-3">Source</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3 text-right">Backlog Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-slate-200">
                      {priorBacklogOrders.map((ord) => {
                        const dpObj = dispatchPoints.find((d) => d.id === ord.dispatch_point_id);
                        const effDispatchDate = getOrderEffectiveDispatchDate(ord);
                        const isSelected = selectedBacklogOrderIds.includes(ord.id);
                        return (
                          <tr key={ord.id} className="hover:bg-slate-800/40">
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedBacklogOrderIds((prev) => [...prev, ord.id]);
                                  } else {
                                    setSelectedBacklogOrderIds((prev) => prev.filter((id) => id !== ord.id));
                                  }
                                }}
                                aria-label={`Select backlog order ${ord.order_number}`}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-300">{ord.order_number}</td>
                            <td className="py-2.5 px-3 font-mono text-amber-300">{effDispatchDate}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-white">{ord.retailer_name_raw}</div>
                              <div className="text-[10px] text-slate-400">{ord.beat_name}</div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {isUnmappedDispatchPointId(ord.dispatch_point_id, dispatchPoints) ? (
                                <span className="px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-500/40 font-semibold text-[10px]">
                                  {UNMAPPED_DISPATCH_POINT_LABEL}
                                </span>
                              ) : (
                                getDispatchPointDisplayLabel(ord.dispatch_point_id, dispatchPoints)
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                  ord.fulfillment_source === 'DEPOT_STOCK'
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                }`}
                              >
                                {ord.fulfillment_source === 'DEPOT_STOCK' ? 'DEPOT STOCK' : 'PRINCIPAL PO'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-bold text-[10px]">
                                {ord.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                              ₹{(ord.total_amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCarryForwardBacklog([ord.id])}
                                  className="px-2 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white font-bold text-[10px]"
                                >
                                  Carry Forward to Tomorrow
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleClearBacklogAsDispatched([ord.id])}
                                  className="px-2 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-[10px]"
                                >
                                  Mark Dispatched / Clear
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INVOICES LEDGER (SHARED / ACCOUNTANT RECONCILIATION & LOCKING) */}
      {activeTab === 'INVOICES' && (
        <div className="space-y-4">
          {/* KPI Summary Grid for Financial Transparency */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Invoices</div>
              <div className="text-base font-extrabold text-white font-mono mt-1">
                ₹{(totalInvoicedValue || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{invoices.length} total generated</div>
            </div>

            <div className="bg-slate-900 border border-emerald-500/20 p-3 rounded-2xl bg-emerald-950/10">
              <div className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider flex items-center justify-between">
                <span>Cash Settlement</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">CASH</span>
              </div>
              <div className="text-base font-extrabold text-emerald-300 font-mono mt-1">
                ₹{(cashInvoicedValue || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-emerald-400/80 font-semibold mt-0.5">{cashSettledInvoices.length} cash invoices</div>
            </div>

            <div className="bg-slate-900 border border-indigo-500/20 p-3 rounded-2xl bg-indigo-950/10">
              <div className="text-[10px] text-indigo-400 font-medium uppercase tracking-wider flex items-center justify-between">
                <span>Online / Bank</span>
                <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold">UPI/NEFT</span>
              </div>
              <div className="text-base font-extrabold text-indigo-300 font-mono mt-1">
                ₹{(onlineInvoicedValue || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-indigo-400/80 font-semibold mt-0.5">{onlineSettledInvoices.length} bank invoices</div>
            </div>

            <div className="bg-slate-900 border border-amber-500/20 p-3 rounded-2xl bg-amber-950/10">
              <div className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">Total Balance Due</div>
              <div className="text-base font-extrabold text-amber-300 font-mono mt-1">
                ₹{(totalOutstandingValue || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-amber-400/80 font-semibold mt-0.5">Uncollected credit</div>
            </div>

            <div className="bg-slate-900 border border-purple-500/20 p-3 rounded-2xl bg-purple-950/10 col-span-2 md:col-span-1">
              <div className="text-[10px] text-purple-400 font-medium uppercase tracking-wider">Zoho Books Sync</div>
              <div className="text-base font-extrabold text-purple-300 font-mono mt-1">
                {zohoSyncedCount} / {invoices.length} Synced
              </div>
              <div className="text-[10px] text-purple-400/80 font-semibold mt-0.5">
                {invoices.length - zohoSyncedCount > 0 ? `${invoices.length - zohoSyncedCount} pending push` : 'All synced'}
              </div>
            </div>
          </div>

          {/* All Invoices Comprehensive Filter Toolbar */}
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-white flex items-center gap-2 text-sm">
                <FileText size={16} className="text-blue-400" />
                All Invoices Data Register ({filteredInvoices.length} of {invoices.length})
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportZohoSalesRegister}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                >
                  <FileSpreadsheet size={13} /> Export Register (CSV)
                </button>
                <button
                  onClick={() => setIsZohoSyncModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Share2 size={13} /> Push Zoho
                </button>
                <button
                  onClick={() => {
                    setZohoTargetInvoice(null);
                    setIsZohoPayloadModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                >
                  <Layers size={13} /> JSON Payload
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-800">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Inv #, CN #, E-Way..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-white text-xs"
                />
              </div>

              <select
                value={filterParty}
                onChange={(e) => setFilterParty(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
              >
                <option value="ALL">All Parties ({invoicePartyNames.length})</option>
                {invoicePartyNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
              >
                <option value="ALL">All Statuses</option>
                <option value="UNPAID">UNPAID</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="PAID">PAID</option>
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-semibold text-xs"
              >
                <option value="ALL">All Types &amp; CNs</option>
                <option value="REGISTERED_GST">GST Tax Invoices ({gstInvoicesCount})</option>
                <option value="CASH_NON_GST">Cash Non-GST ({cashInvoicesCount})</option>
                <option value="WITH_CREDIT_NOTE">Discount / Credit Note Applied</option>
                <option value="CASH">Cash Settled ({cashSettledInvoices.length})</option>
                <option value="ONLINE">Online / Bank ({onlineSettledInvoices.length})</option>
                <option value="UNPAID">Pending Due</option>
                <option value="ZOHO_PENDING">Pending Zoho Push</option>
              </select>

              <select
                value={filterInvoiceDp}
                onChange={(e) => setFilterInvoiceDp(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
              >
                <option value="ALL">All Dispatch Points</option>
                {dispatchPoints.map((dp) => (
                  <option key={dp.id} value={dp.id}>
                    {dp.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-1/2 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-white text-[11px] font-mono"
                  title="Invoice Date From"
                />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-1/2 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-white text-[11px] font-mono"
                  title="Invoice Date To"
                />
              </div>
            </div>

            {(filterType !== 'ALL' || filterStatus !== 'ALL' || filterParty !== 'ALL' || filterInvoiceDp !== 'ALL' || filterDateFrom || filterDateTo || searchQuery) && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setFilterType('ALL');
                    setFilterStatus('ALL');
                    setFilterParty('ALL');
                    setFilterInvoiceDp('ALL');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                    setSearchQuery('');
                  }}
                  className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold"
                >
                  Clear All Invoice Filters
                </button>
              </div>
            )}
          </div>

          {/* All Invoices Permanent Data Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Invoice # &amp; Date</th>
                    <th className="py-3 px-4">Party / Dispatch Point</th>
                    <th className="py-3 px-4">Type &amp; Credit Note</th>
                    <th className="py-3 px-4 text-center">Settlement</th>
                    <th className="py-3 px-4 text-right">Net Payable (Gross / Disc)</th>
                    <th className="py-3 px-4 text-right">Paid Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Lock</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400 font-sans">
                        No invoices match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const netTotal = getInvoiceNetTotal(inv);
                      const grossTotal = inv.gross_amount ?? inv.total_amount;
                      const discountAmt = inv.is_credit_note_discount ? Number(inv.credit_note_discount_amount) || 0 : 0;
                      const remaining = Math.max(0, netTotal - inv.paid_amount);
                      const payInfo = getInvoicePaymentInfo(inv);
                      const dpObj = dispatchPoints.find((d) => d.id === inv.dispatch_point_id);

                      return (
                        <tr key={inv.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{inv.invoice_number}</div>
                            <div className="text-[10px] text-slate-500">{inv.invoice_date}</div>
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <div className="font-semibold text-white">{inv.retailer_name}</div>
                            <div className="text-[10px] text-slate-400">{dpObj?.name || 'Dispatch Point'}</div>
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                inv.invoice_type === 'REGISTERED_GST'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {inv.invoice_type === 'REGISTERED_GST' ? 'GST Tax Inv' : 'Cash Non-GST'}
                            </span>
                            {discountAmt > 0 && (
                              <div className="mt-1">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                                  {inv.credit_note_number || 'CN'} (-₹{discountAmt.toLocaleString('en-IN')})
                                </span>
                              </div>
                            )}
                            {inv.e_way_bill_no && (
                              <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                                E-Way: {inv.e_way_bill_no}
                              </div>
                            )}
                          </td>

                          {/* Settlement Mode Tag */}
                          <td className="py-3 px-4 text-center font-sans">
                            {payInfo.category === 'CASH' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                                CASH
                              </span>
                            )}
                            {payInfo.category === 'ONLINE' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-flex items-center gap-1">
                                {payInfo.primaryMode}
                              </span>
                            )}
                            {payInfo.category === 'MIXED' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1">
                                MIXED
                              </span>
                            )}
                            {payInfo.category === 'CREDIT' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                                CREDIT DUE
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="font-bold text-white">₹{netTotal.toLocaleString('en-IN')}</div>
                            {discountAmt > 0 && (
                              <div className="text-[9px] text-slate-400">
                                Gross ₹{grossTotal.toLocaleString('en-IN')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-emerald-400">
                            ₹{(inv.paid_amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-center font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                inv.status === 'PAID'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : inv.status === 'PARTIAL'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {inv.status}
                            </span>
                            {remaining > 0 && inv.status !== 'UNPAID' && (
                              <div className="text-[9px] text-rose-400 mt-0.5 font-mono">
                                Due: ₹{remaining.toLocaleString('en-IN')}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center font-sans">
                            {inv.is_locked ? (
                              <button
                                onClick={() => handleToggleLockInvoice(inv)}
                                className="px-2 py-1 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold inline-flex items-center gap-1 hover:bg-emerald-900/60"
                                title="Locked & Reconciled. Click to unlock."
                              >
                                <Lock size={12} /> Locked
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleLockInvoice(inv)}
                                className="px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold inline-flex items-center gap-1 hover:bg-slate-700 hover:text-white"
                                title="Click to Lock & Reconcile invoice"
                              >
                                <Unlock size={12} /> Open
                              </button>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right space-x-1.5 font-sans whitespace-nowrap">
                            <button
                              onClick={() => setSelectedInvoiceForDetail(inv)}
                              className="px-2 py-1 rounded bg-indigo-900/50 text-indigo-200 border border-indigo-500/40 hover:bg-indigo-800/70 text-[10px] font-bold inline-flex items-center gap-1"
                            >
                              <Eye size={12} /> View
                            </button>

                            <button
                              onClick={() => setSelectedInvoiceForPrint(inv)}
                              className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 text-[10px] font-semibold inline-flex items-center gap-1"
                            >
                              <Printer size={12} /> Print
                            </button>

                            <button
                              onClick={() => handleOpenPartialPayInvoice(inv)}
                              className="px-2 py-1 rounded bg-blue-900/40 text-blue-300 border border-blue-500/30 hover:bg-blue-800/60 text-[10px] font-semibold inline-flex items-center gap-1"
                            >
                              <Edit3 size={12} /> Partial Pay
                            </button>

                            {inv.status !== 'PAID' && (
                              <>
                                <button
                                  onClick={() => {
                                    setCreditNoteInvoice(inv);
                                    setCreditNoteAmt('');
                                    setCreditNoteNum(`CN-${Date.now().toString().slice(-5)}`);
                                    setCreditNoteReason('');
                                  }}
                                  className="px-2 py-1 rounded bg-purple-900/50 hover:bg-purple-800/70 text-purple-200 border border-purple-500/30 text-[10px] font-semibold inline-flex items-center gap-1"
                                  title="Issue additional Credit Note discount"
                                >
                                  Credit Note
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedInvoiceForPayment(inv);
                                    setPayRetailerId(inv.retailer_id || '');
                                    setPayAmount(remaining);
                                    setIsRecordPaymentOpen(true);
                                  }}
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold inline-flex items-center gap-1"
                                >
                                  <Plus size={12} /> Record Pay
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AGENT COLLECTIONS & BANK STATEMENT RECONCILIATION (MAKER-CHECKER) */}
      {activeTab === 'PAYMENTS' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <span className="text-white flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-400" />
                Maker-Checker Field Collections Audit & Bank Settlement Ledger
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono">
                  {pendingPaymentsCount} Pending Verification
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Field collection receipts entered by Commission Agents or Billing Executives. Reconcile entries against bank UTR / Cheque clearance before crediting outlet balances.
            </p>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Filter Status:</span>
              <select
                value={paymentFilterStatus}
                onChange={(e) => setPaymentFilterStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-semibold"
              >
                <option value="ALL">All Payments ({payments.length})</option>
                <option value="PENDING">Pending Audit ({pendingPaymentsCount})</option>
                <option value="VERIFIED">Verified & Bank Credited ({verifiedPaymentsCount})</option>
                <option value="FLAGGED">Flagged Discrepancies</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportZohoPayments}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-all text-xs"
                title="Export all payment records formatted for Zoho Books / Zoho Finance"
              >
                <FileSpreadsheet size={14} /> Export for Zoho Finance (CSV)
              </button>
              <button
                onClick={() => {
                  setSelectedInvoiceForPayment(null);
                  setIsRecordPaymentOpen(true);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1 text-xs"
              >
                <Plus size={14} /> Record & Credit Payment
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Receipt # & Date</th>
                    <th className="py-3 px-4">Retailer Outlet</th>
                    <th className="py-3 px-4">Mode & Ref/UTR</th>
                    <th className="py-3 px-4">Collected By</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Reconciliation Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {filteredPayments.map((pmt) => {
                    const isPending = pmt.status === 'PENDING';
                    const isFlagged = pmt.status === 'FLAGGED';
                    return (
                      <tr key={pmt.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{pmt.payment_number}</div>
                          <div className="text-[10px] text-slate-500">{pmt.payment_date}</div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold text-white">{pmt.retailer_name}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-200 font-bold">
                            {pmt.payment_mode}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5">{pmt.reference_number}</div>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-300">
                          {pmt.collector_name || 'Commission Agent'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          ₹{(pmt.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              pmt.status === 'VERIFIED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : isFlagged
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {pmt.status}
                          </span>
                          {isFlagged && pmt.flag_reason && (
                            <div className="text-[9px] text-rose-400 truncate max-w-[150px] mt-0.5">
                              {pmt.flag_reason}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 font-sans">
                          {pmt.status === 'VERIFIED' && (
                            <span
                              className="px-2.5 py-1 rounded bg-slate-950 text-slate-500 border border-slate-800 text-[10px] font-bold inline-flex items-center gap-1 cursor-not-allowed"
                              title="🔒 VERIFIED & CREDITED: Payment details are permanently locked against editing to preserve bank ledger audit integrity."
                            >
                              <Lock size={11} className="text-emerald-500" /> Locked (Verified)
                            </span>
                          )}

                          {isFlagged && (
                            <>
                              {activeRole === 'ADMIN' ? (
                                <>
                                  <button
                                    onClick={() => handleOpenEditPayment(pmt)}
                                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold inline-flex items-center gap-1 shadow-sm"
                                    title="Admin Discrepancy Resolution: Modify payment details and resolve flag"
                                  >
                                    <ShieldAlert size={12} /> Resolve & Edit
                                  </button>
                                  <button
                                    onClick={() => handleVerifyPayment(pmt)}
                                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold inline-flex items-center gap-1 shadow-sm"
                                    title="Approve & Verify Flagged Payment directly into bank ledger"
                                  >
                                    <CheckCircle2 size={12} /> Verify
                                  </button>
                                </>
                              ) : (
                                <span
                                  className="px-2.5 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-500/30 text-[10px] font-semibold inline-flex items-center gap-1"
                                  title="Flagged Discrepancy: AE cannot edit flagged entries. Only Admin has authority to edit or resolve flagged payments."
                                >
                                  <ShieldAlert size={12} className="text-rose-400" /> Flagged (Admin Edit Only)
                                </span>
                              )}
                            </>
                          )}

                          {isPending && (
                            <>
                              {activeRole === 'ADMIN' ? (
                                <button
                                  onClick={() => handleOpenEditPayment(pmt)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-semibold inline-flex items-center gap-1"
                                  title="Admin Edit Access"
                                >
                                  <Edit3 size={12} /> Edit
                                </button>
                              ) : (
                                <span
                                  className="px-2 py-1 rounded bg-slate-900 text-slate-500 border border-slate-800 text-[10px] font-medium inline-flex items-center gap-1"
                                  title="AE Anti-Manipulation Guard: Accounts Executive cannot edit payment details directly. Reconcile or Flag mismatch."
                                >
                                  <Lock size={11} className="text-slate-600" /> Read-Only (AE)
                                </span>
                              )}

                              <button
                                onClick={() => handleVerifyPayment(pmt)}
                                className={`px-2 py-1 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                                  isAccountant
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                                title={isAccountant ? 'Approve & Reconcile into Bank Account' : 'Maker-Checker Security: Requires Accounts Executive Approval'}
                              >
                                <CheckCircle2 size={12} /> Reconcile
                              </button>
                              <button
                                onClick={() => setFlaggingPayment(pmt)}
                                className="px-2 py-1 rounded bg-rose-900/40 text-rose-300 border border-rose-500/30 hover:bg-rose-800/60 text-[10px] font-semibold inline-flex items-center gap-1"
                                title="Flag payment mismatch (Amount discrepancy, missing UTR, or invalid receipt)"
                              >
                                <Flag size={12} /> Flag Issue
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DUPLICATE CREDIT_AUDIT TAB REMOVED (Canonical Credit Gate lives in Credit > Party Ledger & Credit Gate) */}

      {/* PRINT / VIEW GST TAX INVOICE MODAL */}
      {selectedInvoiceForPrint && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Printer size={18} className="text-blue-400" />
                  Official GST Tax Invoice ({selectedInvoiceForPrint.invoice_number})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Compliant with Central Goods & Services Tax (CGST) Rules 2017
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoiceForPrint(null)}
                className="text-slate-400 hover:text-white font-bold text-xs bg-slate-800 px-2.5 py-1 rounded-lg"
              >
                ✕ Close
              </button>
            </div>

            {/* Printable Invoice Card */}
            <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-slate-200 space-y-4 font-sans text-xs">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                  <div className="text-lg font-black text-white">{activeTenant.name}</div>
                  <div className="text-slate-400 font-mono">GSTIN: {activeTenant.gstin || 'Unregistered / Not Set'}</div>
                  <div className="text-slate-400">{activeTenant.address || ''}</div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-sm font-bold text-blue-400">{selectedInvoiceForPrint.invoice_number}</div>
                  <div className="text-slate-400">Date: {selectedInvoiceForPrint.invoice_date}</div>
                  <div className="text-slate-400">Due: {selectedInvoiceForPrint.due_date}</div>
                  {selectedInvoiceForPrint.e_way_bill_no && (
                    <div className="text-emerald-400 font-bold mt-1">E-Way Bill #: {selectedInvoiceForPrint.e_way_bill_no}</div>
                  )}
                </div>
              </div>

              {/* Bill To */}
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Billed To Outlet:</span>
                <div className="text-sm font-bold text-white">{selectedInvoiceForPrint.retailer_name}</div>
              </div>

              {/* Tax & Discount Breakup Summary */}
              <div className="space-y-1.5 font-mono text-xs pt-2">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal (Taxable Value):</span>
                  <span>₹{(selectedInvoiceForPrint.subtotal || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>CGST (9%):</span>
                  <span>₹{(selectedInvoiceForPrint.cgst || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>SGST (9%):</span>
                  <span>₹{(selectedInvoiceForPrint.sgst || 0).toLocaleString('en-IN')}</span>
                </div>
                {selectedInvoiceForPrint.is_credit_note_discount && (selectedInvoiceForPrint.credit_note_discount_amount || 0) > 0 && (
                  <>
                    <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/70">
                      <span>Gross Invoice Total:</span>
                      <span>₹{(selectedInvoiceForPrint.gross_amount ?? selectedInvoiceForPrint.total_amount).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-purple-300 font-semibold">
                      <span>
                        Credit Note Discount ({selectedInvoiceForPrint.credit_note_number || 'CN'}):
                      </span>
                      <span>- ₹{(selectedInvoiceForPrint.credit_note_discount_amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-white font-bold text-sm pt-2 border-t border-slate-800">
                  <span>Net Payable Invoice Value:</span>
                  <span className="text-emerald-400">₹{getInvoiceNetTotal(selectedInvoiceForPrint).toLocaleString('en-IN')}</span>
                </div>
              </div>

              {selectedInvoiceForPrint.is_locked && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-center text-emerald-300 font-bold text-xs flex items-center justify-center gap-2">
                  <Lock size={14} /> Certified, Reconciled & Locked in Financial Ledger
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
              >
                <Printer size={14} /> Print / Save as PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {isRecordPaymentOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus size={16} className="text-emerald-400" />
                Record Field Collection Entry
              </h2>
              <button onClick={() => setIsRecordPaymentOpen(false)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              {selectedInvoiceForPayment && (
                <div className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-xl space-y-1">
                  <div className="text-[10px] text-blue-300 font-bold uppercase tracking-wide">
                    Linked Tax Invoice
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">{selectedInvoiceForPayment.invoice_number}</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      Due: ₹{((selectedInvoiceForPayment.total_amount || 0) - (selectedInvoiceForPayment.paid_amount || 0)).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1">Select Retail Outlet</label>
                <select
                  value={payRetailerId}
                  onChange={(e) => setPayRetailerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  required
                >
                  <option value="">-- Choose Outlet --</option>
                  {retailers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (Outstanding: ₹{(r.current_outstanding || 0).toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Collection Amount (₹)</label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono font-bold"
                    min={1}
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Payment Mode</label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-semibold"
                  >
                    <option value="UPI">UPI / QR Code</option>
                    <option value="NEFT">NEFT / RTGS Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash Deposit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Reference / UTR / Cheque #</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                  placeholder="e.g. UTR92038102391"
                  required
                />
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-200 font-semibold">
                  <input
                    type="checkbox"
                    checked={payAutoVerify}
                    onChange={(e) => setPayAutoVerify(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Settle & Verify Immediately in Bank Ledger</span>
                </label>
                <p className="text-[10px] text-slate-400">
                  {payAutoVerify
                    ? '⚡ Fast Track: Immediately updates invoice paid status and reduces retailer outstanding balance.'
                    : '🛡️ Maker-Checker Queue: Payment will be logged in PENDING state for Accounts Executive review.'}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRecordPaymentOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-bold"
                >
                  Submit Collection Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PUNCH NEW STORE ORDER MODAL */}
      {isPunchOrderOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus size={16} className="text-purple-400" />
                Punch New Store Order
              </h2>
              <button onClick={() => setIsPunchOrderOpen(false)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePunchOrder} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Select Retail Outlet</label>
                <select
                  value={punchRetailerId}
                  onChange={(e) => setPunchRetailerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                >
                  {retailers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} | Beat: {r.beat_name || 'Central'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Principal Company</label>
                <select
                  id="select-punch-principal-company"
                  value={punchCompanyId}
                  onChange={(e) => {
                    const compId = e.target.value;
                    setPunchCompanyId(compId);
                    const filtered = compId === 'ALL' ? skus : skus.filter((s) => s.company_id === compId);
                    if (filtered.length > 0) {
                      setPunchSkuId(filtered[0].id);
                      setPunchUnitPrice(filtered[0].selling_price);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs font-semibold focus:border-purple-500 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Principal Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Select Principal SKU Product</label>
                <select
                  id="select-punch-sku-product"
                  value={punchSkuId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPunchSkuId(id);
                    const selected = skus.find((s) => s.id === id);
                    if (selected) setPunchUnitPrice(selected.selling_price);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs cursor-pointer"
                >
                  {(punchCompanyId === 'ALL'
                    ? skus
                    : skus.filter((s) => s.company_id === punchCompanyId)
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Billing ₹{s.selling_price} | Landing ₹{s.landing_price})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={punchQty}
                    onChange={(e) => setPunchQty(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                    min={1}
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Unit Billing Rate (₹)</label>
                  <input
                    type="number"
                    value={punchUnitPrice}
                    onChange={(e) => setPunchUnitPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                    min={0}
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                <span className="text-slate-400 font-medium">Calculated Total:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  ₹{(punchQty * punchUnitPrice).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPunchOrderOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-purple-600 text-white rounded-lg font-bold"
                >
                  Punch Order to Queue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACCOUNTS EXECUTIVE / ADMIN EDIT PAYMENT MODAL */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 size={16} className="text-blue-400" />
                Admin Edit Payment Record ({editingPayment.payment_number})
              </h2>
              <button onClick={() => setEditingPayment(null)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>

            {editingPayment.status === 'FLAGGED' && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl space-y-1">
                <div className="text-[11px] font-bold text-rose-300 flex items-center gap-1">
                  <Flag size={12} /> AE Flagged Discrepancy Reason:
                </div>
                <p className="text-xs text-rose-200/90 italic font-sans">
                  "{editingPayment.flag_reason || 'No specific reason provided'}"
                </p>
                <div className="text-[10px] text-amber-300/80 mt-1 font-sans">
                  ⚡ Updating details will resolve the discrepancy and automatically VERIFY & settle this payment into the bank ledger.
                </div>
              </div>
            )}

            <form onSubmit={handleSaveEditPayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Retailer Outlet</label>
                <input
                  type="text"
                  disabled
                  value={editingPayment.retailer_name}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-400 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Payment Amount (₹)</label>
                  <input
                    type="number"
                    value={editPaymentAmount}
                    onChange={(e) => setEditPaymentAmount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono font-bold"
                    min={1}
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Payment Mode</label>
                  <select
                    value={editPaymentMode}
                    onChange={(e) => setEditPaymentMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-semibold"
                  >
                    <option value="UPI">UPI / QR Code</option>
                    <option value="NEFT">NEFT / RTGS</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Reference / UTR / Cheque #</label>
                <input
                  type="text"
                  value={editPaymentRef}
                  onChange={(e) => setEditPaymentRef(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Accounting Notes</label>
                <textarea
                  value={editPaymentNotes}
                  onChange={(e) => setEditPaymentNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white h-16"
                  placeholder="Reason for payment edit..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold"
                >
                  {editingPayment.status === 'FLAGGED' ? 'Resolve & Verify Payment' : 'Save Payment & Sync Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MARK / EDIT PARTIAL PAYMENT MODAL */}
      {editingInvoicePartial && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-400" />
                Record Partial Payment ({editingInvoicePartial.invoice_number})
              </h2>
              <button onClick={() => setEditingInvoicePartial(null)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePartialPayInvoice} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Retailer Outlet:</span>
                  <span className="font-semibold text-white">{editingInvoicePartial.retailer_name}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Invoice Total Amount:</span>
                  <span className="font-mono font-bold text-white">₹{(editingInvoicePartial.total_amount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Current Paid Amount:</span>
                  <span className="font-mono font-bold text-emerald-400">₹{(editingInvoicePartial.paid_amount || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Accumulated Paid Amount (₹)</label>
                <input
                  type="number"
                  value={partialPayAmount}
                  onChange={(e) => setPartialPayAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono font-bold text-base"
                  min={0}
                  max={editingInvoicePartial.total_amount}
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Remaining Due: <strong className="text-rose-400 font-mono">₹{Math.max(0, (editingInvoicePartial.total_amount || 0) - (partialPayAmount || 0)).toLocaleString('en-IN')}</strong>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Payment Mode</label>
                  <select
                    value={partialPayMode}
                    onChange={(e) => setPartialPayMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-semibold"
                  >
                    <option value="CASH">Cash Deposit</option>
                    <option value="UPI">UPI / QR Code</option>
                    <option value="NEFT">NEFT / RTGS Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Reference / UTR #</label>
                  <input
                    type="text"
                    value={partialPayRef}
                    onChange={(e) => setPartialPayRef(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                    placeholder="e.g. UTR10293812"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingInvoicePartial(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
                >
                  Save & Settle Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST CREDIT LIMIT MODAL */}
      {editingCreditParty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">
                Adjust Approved Credit Limit ({editingCreditParty.name})
              </h2>
              <button onClick={() => setEditingCreditParty(null)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await updatePartyCreditLimit(editingCreditParty.partyKind, editingCreditParty.id, newCreditLimitVal, {
                  linkedUserId: editingCreditParty.linkedUserId,
                  linkedDistributorId: editingCreditParty.linkedDistributorId,
                });
                const updatedName = editingCreditParty.name;
                setEditingCreditParty(null);
                showBillingBanner('success', `Approved credit limit for ${updatedName} updated to ₹${newCreditLimitVal.toLocaleString('en-IN')} in Firestore.`);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-300 mb-1">New Approved Credit Limit (₹)</label>
                <input
                  type="number"
                  value={newCreditLimitVal}
                  onChange={(e) => setNewCreditLimitVal(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono font-bold"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCreditParty(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 text-white rounded-lg font-bold"
                >
                  Save Credit Limit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FLAG PAYMENT REASON MODAL */}
      {flaggingPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Flag size={16} className="text-rose-400" />
                Flag Payment Discrepancy ({flaggingPayment.payment_number})
              </h2>
              <button onClick={() => setFlaggingPayment(null)} className="text-slate-400 text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmFlagPayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Discrepancy / Audit Reason</label>
                <textarea
                  value={flagReasonText}
                  onChange={(e) => setFlagReasonText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white h-20"
                  placeholder="e.g. UTR mismatch with bank statement, bounced cheque, or unverified cash collection"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setFlaggingPayment(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 text-white rounded-lg font-bold"
                >
                  Flag Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT INVOICE DETAILS & CASH/ONLINE SETTLEMENT MODAL */}
      {selectedInvoiceForDetail && (() => {
        const inv = selectedInvoiceForDetail;
        const payInfo = getInvoicePaymentInfo(inv);
        const linkedOrder = orders.find((o) => o.id === inv.order_id);
        const retailerObj = retailers.find((r) => r.id === inv.retailer_id);

        return (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 text-slate-200 space-y-5 my-8 max-h-[90vh] overflow-y-auto shadow-2xl">
              {/* Modal Header */}
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Receipt size={20} className="text-indigo-400" />
                      Invoice Inspector: {inv.invoice_number}
                    </h2>
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-extrabold ${
                        inv.invoice_type === 'REGISTERED_GST'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {inv.invoice_type === 'REGISTERED_GST' ? 'GST TAX INVOICE' : 'CASH NON-GST INVOICE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Invoice Date: <strong className="text-slate-200">{inv.invoice_date}</strong> | Payment Due Date: <strong className="text-slate-200">{inv.due_date}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {inv.zoho_synced ? (
                    <span className="px-3 py-1 rounded-lg bg-purple-950 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-purple-400" /> Synced to Zoho
                    </span>
                  ) : (
                    <button
                      onClick={() => handlePushSingleInvoiceToZoho(inv)}
                      className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Share2 size={13} /> Push to Zoho Books
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedInvoiceForDetail(null)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Outlet & Settlement Information Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Outlet Info */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="font-bold text-indigo-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Building size={14} /> Party / Outlet Details
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{inv.retailer_name}</div>
                    <div className="text-slate-400 mt-0.5">{retailerObj?.address || linkedOrder?.beat_name || 'Address on file'}</div>
                    <div className="text-slate-400 mt-0.5">Contact: <span className="text-slate-200 font-medium">{retailerObj?.contact_person || inv.retailer_name} {retailerObj?.phone ? `(${retailerObj.phone})` : ''}</span></div>
                  </div>
                  <div className="pt-2 border-t border-slate-900 grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">GSTIN / URP</span>
                      <span className="font-bold text-slate-200">{retailerObj?.gstin || (inv.invoice_type === 'REGISTERED_GST' ? 'Pending GSTIN' : 'URP (Unregistered)')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">E-Way Bill #</span>
                      <span className="font-bold text-slate-200">{inv.e_way_bill_no || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Settlement & Payment Mode Audit */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="font-bold text-emerald-400 text-xs uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><CreditCard size={14} /> Settlement Mode Audit</span>
                    {payInfo.category === 'CASH' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        💵 CASH SETTLEMENT
                      </span>
                    )}
                    {payInfo.category === 'ONLINE' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        🏦 ONLINE ({payInfo.primaryMode})
                      </span>
                    )}
                    {payInfo.category === 'MIXED' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        🔄 MIXED (CASH + ONLINE)
                      </span>
                    )}
                    {payInfo.category === 'CREDIT' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        ⏳ UNPAID / CREDIT
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-slate-400 text-xs">
                      <span>Total Invoice Amount:</span>
                      <span className="font-mono font-bold text-white">₹{(inv.total_amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-xs">
                      <span>Reconciled Paid Amount:</span>
                      <span className="font-mono font-bold text-emerald-400">₹{(inv.paid_amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-xs">
                      <span>Outstanding Balance Due:</span>
                      <span className="font-mono font-bold text-rose-400">₹{Math.max(0, (inv.total_amount || 0) - (inv.paid_amount || 0)).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Linked Receipts Table */}
                  <div className="pt-2 border-t border-slate-900">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Matched Collection Receipts ({payInfo.linkedPayments.length}):
                    </div>
                    {payInfo.linkedPayments.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic">No receipt entries matched yet. Status: Pending collection.</div>
                    ) : (
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {payInfo.linkedPayments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between bg-slate-900 p-1.5 rounded border border-slate-800 text-[11px] font-mono">
                            <div>
                              <span className="font-bold text-white">{p.payment_number}</span>
                              <span className="text-slate-400 text-[10px] ml-1.5">({p.payment_mode})</span>
                              <div className="text-[9px] text-slate-500">Ref: {p.reference_number || 'N/A'} | {p.payment_date}</div>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-emerald-400">₹{(p.amount || 0).toLocaleString('en-IN')}</span>
                              <div className="text-[9px] text-slate-400">{p.status}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SKU Itemization Lines Table */}
              <div className="space-y-2">
                <div className="font-bold text-xs text-white uppercase tracking-wider flex items-center justify-between">
                  <span>SKU Itemization & Line Breakdowns</span>
                  <span className="text-xs text-slate-400 font-mono font-normal">
                    Order Reference: <strong className="text-indigo-400">{linkedOrder?.order_number || 'N/A'}</strong>
                  </span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">SKU Code & Name</th>
                        <th className="py-2.5 px-3">HSN</th>
                        <th className="py-2.5 px-3 text-right">Pack Size</th>
                        <th className="py-2.5 px-3 text-right">Quantity</th>
                        <th className="py-2.5 px-3 text-right">PTR Rate (₹)</th>
                        <th className="py-2.5 px-3 text-right">Tax Rate</th>
                        <th className="py-2.5 px-3 text-right">Line Total (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                      {linkedOrder?.lines && linkedOrder.lines.length > 0 ? (
                        linkedOrder.lines.map((line, idx) => {
                          const skuObj = skus.find((s) => s.id === line.sku_id);
                          return (
                            <tr key={line.id || idx} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3">
                                <div className="font-bold text-white">{line.sku_name}</div>
                                <div className="text-[9px] text-slate-500">{skuObj?.code || line.sku_id}</div>
                              </td>
                              <td className="py-2 px-3 text-slate-400">{skuObj?.hsn_code || '19053100'}</td>
                              <td className="py-2 px-3 text-right text-slate-400">{skuObj?.pack_size || 'Std Case'}</td>
                              <td className="py-2 px-3 text-right font-bold text-white">{line.quantity}</td>
                              <td className="py-2 px-3 text-right text-slate-200">₹{(line.unit_price || 0).toFixed(2)}</td>
                              <td className="py-2 px-3 text-right text-slate-400">{skuObj?.tax_rate || 18}%</td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-400">
                                ₹{(line.total || 0).toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                            Order SKU line details generated from consolidated billing manifest.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals Summary Bar */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
                <div className="space-y-0.5 text-slate-400 text-[11px]">
                  <div>Taxable Subtotal: <strong className="text-slate-200">₹{(inv.subtotal || 0).toLocaleString('en-IN')}</strong></div>
                  <div>GST Tax Component (CGST 9% + SGST 9%): <strong className="text-slate-200">₹{((inv.cgst || 0) + (inv.sgst || 0)).toLocaleString('en-IN')}</strong></div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans">Grand Total Invoiced</div>
                  <div className="text-xl font-extrabold text-white">₹{(inv.total_amount || 0).toLocaleString('en-IN')}</div>
                  <div className="text-[11px] text-emerald-400">
                    Paid: ₹{(inv.paid_amount || 0).toLocaleString('en-IN')} | Outstanding: ₹{Math.max(0, (inv.total_amount || 0) - (inv.paid_amount || 0)).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setZohoTargetInvoice(inv);
                      setIsZohoPayloadModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs inline-flex items-center gap-1.5"
                  >
                    <Layers size={13} /> View Zoho API Payload
                  </button>

                  <button
                    onClick={() => {
                      setSelectedInvoiceForDetail(null);
                      setSelectedInvoiceForPrint(inv);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs inline-flex items-center gap-1.5"
                  >
                    <Printer size={13} /> Print GST Invoice
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {!inv.zoho_synced && (
                    <button
                      onClick={() => handlePushSingleInvoiceToZoho(inv)}
                      className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Share2 size={13} /> Push to Zoho Books Now
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedInvoiceForDetail(null)}
                    className="px-4 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Close Inspector
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ZOHO BATCH DATA PUSH CENTER MODAL */}
      {isZohoSyncModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Share2 size={18} className="text-purple-400" />
                Zoho Books Data Integration & Batch Push Center
              </h2>
              <button onClick={() => setIsZohoSyncModalOpen(false)} className="text-slate-400 text-xs hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl space-y-1.5">
                <div className="font-bold text-purple-300">Ready for Live Zoho Books / Finance Export</div>
                <p className="text-[11px] text-slate-300">
                  This process compiles all invoice records, retailer GSTINs, SKU itemization lines, and payment receipt settlement references (Cash/Online UTRs) into standard Zoho Books API payload formats.
                </p>
              </div>

              {/* Data Summary Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Invoices Records</div>
                  <div className="text-base font-extrabold text-white mt-0.5">{invoices.length} Invoices</div>
                  <div className="text-[10px] text-purple-400">{invoices.length - zohoSyncedCount} pending push</div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Payment Receipts</div>
                  <div className="text-base font-extrabold text-emerald-400 mt-0.5">{payments.length} Payments</div>
                  <div className="text-[10px] text-slate-400">Cash & Bank UTRs</div>
                </div>
              </div>

              {/* Progress Bar when syncing */}
              {isSyncingZoho && (
                <div className="space-y-1.5 p-3 bg-slate-950 rounded-xl border border-purple-500/30">
                  <div className="flex justify-between text-xs font-bold text-purple-300">
                    <span>Syncing with Zoho Books API...</span>
                    <span>{zohoSyncingProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-500 h-full transition-all duration-300"
                      style={{ width: `${zohoSyncingProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsZohoSyncModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBatchZohoPush}
                  disabled={isSyncingZoho}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Share2 size={13} /> {isSyncingZoho ? 'Pushing Data...' : 'Execute Push to Zoho Books'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ZOHO JSON API PAYLOAD INSPECTOR MODAL */}
      {isZohoPayloadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 text-slate-200 space-y-4 my-8 max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers size={18} className="text-indigo-400" />
                Zoho Books API Push Payload Viewer
                {zohoTargetInvoice && <span className="text-xs text-indigo-300">({zohoTargetInvoice.invoice_number})</span>}
              </h2>
              <button onClick={() => setIsZohoPayloadModalOpen(false)} className="text-slate-400 text-xs hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Below is the raw JSON API payload formatted for direct integration with the Zoho Books Invoices API Endpoint (<code className="text-indigo-300">/api/v3/invoices</code>).
            </p>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex-1 overflow-y-auto font-mono text-[11px] text-emerald-400 whitespace-pre">
              {generateZohoInvoicesJsonPayload(zohoTargetInvoice)}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generateZohoInvoicesJsonPayload(zohoTargetInvoice));
                  showBillingBanner('success', 'Zoho API JSON payload copied to clipboard.');
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Copy size={13} /> Copy JSON Payload
              </button>

              <button
                type="button"
                onClick={() => setIsZohoPayloadModalOpen(false)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCCASIONAL CREDIT NOTE DISCOUNT MODAL (EXPLICIT ONLY) */}
      {creditNoteInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-purple-400 uppercase font-bold">
                  Occasional Credit Note Discount
                </span>
                <h2 className="text-sm font-bold text-white">
                  {creditNoteInvoice.invoice_number} — {creditNoteInvoice.retailer_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCreditNoteInvoice(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(creditNoteAmt);
                if (!amt || amt <= 0) {
                  showBillingBanner('error', 'Credit discount amount must be greater than zero.');
                  return;
                }
                const res = issueCreditNoteDiscount({
                  invoiceId: creditNoteInvoice.id,
                  discountAmount: amt,
                  creditNoteNumber: creditNoteNum,
                  reason: creditNoteReason || 'Occasional Credit Note Discount',
                  issuedByUserId: currentUser?.id,
                  issuedByName: currentUser?.name || 'Billing Executive',
                });
                if (!res.success) {
                  showBillingBanner('error', res.error || 'Failed to apply credit note.');
                  return;
                }
                showBillingBanner('success', `Credit Note ${creditNoteNum} (-₹${amt.toLocaleString('en-IN')}) issued and synced to Firestore Party Ledger.`);
                setCreditNoteInvoice(null);
              }}
              className="space-y-3 text-xs"
            >
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Invoice Total:</span>
                  <strong>₹{creditNoteInvoice.total_amount.toLocaleString('en-IN')}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Paid So Far:</span>
                  <strong className="text-emerald-400">₹{creditNoteInvoice.paid_amount.toLocaleString('en-IN')}</strong>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Credit Note Number *</label>
                <input
                  type="text"
                  required
                  value={creditNoteNum}
                  onChange={(e) => setCreditNoteNum(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Credit Discount Amount (₹) *</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, creditNoteInvoice.total_amount - creditNoteInvoice.paid_amount)}
                  required
                  value={creditNoteAmt}
                  onChange={(e) => setCreditNoteAmt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Reason for Discount *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Short supply / damaged goods claim"
                  value={creditNoteReason}
                  onChange={(e) => setCreditNoteReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreditNoteInvoice(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold"
                >
                  Issue Credit Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERATE INVOICE & DISCOUNT / AUTO CREDIT NOTE MODAL (STRICT DELIVERED ORDERS) */}
      {invoiceModalOrder && (() => {
        const fin = getOrderFinancialSummary(invoiceModalOrder, skus);
        const subtotal = fin.productValue || Math.round(invoiceModalOrder.total_amount);
        const tax = invModalType === 'REGISTERED_GST' ? fin.gstAmount : 0;
        const grossTotal = invModalType === 'REGISTERED_GST' ? fin.totalAmountWithGst : subtotal;
        const rawDiscountVal = Math.max(0, Number(invDiscountValue) || 0);
        const computedDiscountAmt =
          invDiscountType === 'FLAT'
            ? Math.min(grossTotal, Math.round(rawDiscountVal * 100) / 100)
            : invDiscountType === 'PERCENT'
            ? Math.min(grossTotal, Math.round(((grossTotal * rawDiscountVal) / 100) * 100) / 100)
            : 0;
        const netPayable = Math.max(0, Math.round((grossTotal - computedDiscountAmt) * 100) / 100);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-lg p-6 text-slate-200 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">
                    Delivered Order &rarr; Generate Final Invoice
                  </span>
                  <h2 className="text-sm font-bold text-white">
                    {invoiceModalOrder.order_number} — {invoiceModalOrder.retailer_name_raw}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setInvoiceModalOrder(null)}
                  className="text-slate-400 hover:text-white text-xs bg-slate-800 px-2 py-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateInvoiceFromOrder(invoiceModalOrder, invModalType, {
                    discountType: invDiscountType,
                    discountValue: rawDiscountVal,
                    creditNoteNumber: invCreditNoteNum,
                    creditNoteReason: invCreditNoteReason,
                  });
                }}
                className="space-y-4 text-xs"
              >
                {/* Invoice Type Switch */}
                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Invoice Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInvModalType('REGISTERED_GST')}
                      className={`py-2 px-3 rounded-xl font-bold border text-xs ${
                        invModalType === 'REGISTERED_GST'
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Registered GST Tax Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvModalType('CASH_NON_GST')}
                      className={`py-2 px-3 rounded-xl font-bold border text-xs ${
                        invModalType === 'CASH_NON_GST'
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Cash Non-GST Invoice
                    </button>
                  </div>
                </div>

                {/* Optional Discount / Automatic Credit Note */}
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300">Optional Invoice Discount &amp; Auto Credit Note</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      {(['NONE', 'FLAT', 'PERCENT'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setInvDiscountType(mode);
                            if (mode === 'NONE') setInvDiscountValue('');
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold ${
                            invDiscountType === mode
                              ? 'bg-purple-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {mode === 'NONE' ? 'No Discount' : mode === 'FLAT' ? 'Flat (₹)' : 'Percent (%)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {invDiscountType !== 'NONE' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {invDiscountType === 'FLAT' ? 'Discount Amount (₹)' : 'Discount Percentage (%)'}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={invDiscountType === 'PERCENT' ? 100 : grossTotal}
                          step="0.01"
                          value={invDiscountValue}
                          onChange={(e) => setInvDiscountValue(e.target.value)}
                          placeholder={invDiscountType === 'FLAT' ? 'e.g. 500' : 'e.g. 2.5'}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Auto Credit Note #</label>
                        <input
                          type="text"
                          value={invCreditNoteNum}
                          onChange={(e) => setInvCreditNoteNum(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                          required
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-400 mb-1">Discount / Credit Note Reason</label>
                        <input
                          type="text"
                          value={invCreditNoteReason}
                          onChange={(e) => setInvCreditNoteReason(e.target.value)}
                          placeholder="e.g. Trade scheme / short supply / cash discount"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Calculation Breakdown */}
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span className="font-sans">Taxable Subtotal:</span>
                    <span>₹{subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  {invModalType === 'REGISTERED_GST' && (
                    <div className="flex justify-between text-slate-400">
                      <span className="font-sans">GST (CGST + SGST):</span>
                      <span>₹{tax.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-200 font-semibold">
                    <span className="font-sans">Gross Invoice Total:</span>
                    <span>₹{grossTotal.toLocaleString('en-IN')}</span>
                  </div>
                  {computedDiscountAmt > 0 && (
                    <div className="flex justify-between text-purple-300 font-semibold">
                      <span className="font-sans">Credit Note Discount ({invCreditNoteNum}):</span>
                      <span>- ₹{computedDiscountAmt.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white font-extrabold text-sm pt-2 border-t border-slate-800">
                    <span className="font-sans">Final Net Payable Invoice:</span>
                    <span className="text-emerald-400">₹{netPayable.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setInvoiceModalOrder(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-purple-900/40"
                  >
                    <CheckCircle2 size={14} /> Confirm &amp; Post Invoice
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
