import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../data/store';
import { Order, Retailer, User, DispatchPoint, OrderInvoicingType } from '../../types';
import { calculateCreditExposure, isOrderAssignedToBE } from '../../utils/caRoutingLogic';
import { TestRunnerModal } from '../common/TestRunnerModal';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit3,
  Building,
  UserCheck,
  Truck,
  DollarSign,
  Search,
  Filter,
  Users,
  Lock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileSpreadsheet,
  Check,
  RefreshCw,
  Send,
  FileCheck,
  Coins,
  Receipt,
} from 'lucide-react';

interface BEVerificationDashboardProps {
  onOrderProcessed?: () => void;
}

export const BEVerificationDashboard: React.FC<BEVerificationDashboardProps> = ({ onOrderProcessed }) => {
  const {
    orders = [],
    users = [],
    retailers = [],
    dispatchPoints = [],
    currentUser,
    activeRole,
    verifyAndApproveOrderByBilling,
    cancelOrderByBilling,
    updateCAAssignments,
    setOrderInvoicingType,
  } = useAppStore();

  // State
  const [statusFilter, setStatusFilter] = useState<'PENDING_VERIFICATION' | 'ALL' | 'VERIFIED' | 'CANCELLED'>('PENDING_VERIFICATION');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDPFilter, setSelectedDPFilter] = useState<string>('ALL');

  // Amendment & Partial Approval Modal
  const [activeAmendingOrder, setActiveAmendingOrder] = useState<Order | null>(null);
  const [amendedQuantities, setAmendedQuantities] = useState<Record<string, number>>({});
  const [approvalReason, setApprovalReason] = useState<string>('Approved within verified credit parameters');
  const [amendingInvoicingType, setAmendingInvoicingType] = useState<OrderInvoicingType>('REGISTERED_GST');

  // Direct Approval Modal (requires Invoicing Type selection if not already marked)
  const [activeApprovingOrder, setActiveApprovingOrder] = useState<Order | null>(null);
  const [selectedInvoicingTypeForApproval, setSelectedInvoicingTypeForApproval] = useState<OrderInvoicingType | null>(null);

  // Cancellation Modal
  const [activeCancellingOrder, setActiveCancellingOrder] = useState<Order | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('Credit limit exposure exceeded');

  // Bulk CA Re-assignment Modal (BE Absence Re-route)
  const [isReassignmentModalOpen, setIsReassignmentModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedAgentsForReassign, setSelectedAgentsForReassign] = useState<string[]>([]);
  const [targetBEForReassign, setTargetBEForReassign] = useState<string>('');
  const [targetDPForReassign, setTargetDPForReassign] = useState<string>('');

  // Identify Billing Executives
  const billingExecutives = useMemo(() => {
    return users.filter((u) => u.role === 'BILLING' || u.role === 'ADMIN');
  }, [users]);

  // Identify Commission Agents
  const commissionAgents = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT');
  }, [users]);

  // Current BE Profile & ID
  const effectiveCurrentBEUser = useMemo(() => {
    if (currentUser?.role === 'BILLING') {
      return currentUser;
    }
    const matched = users.find((u) => u.id === currentUser?.id && u.role === 'BILLING');
    if (matched) return matched;
    return billingExecutives.find((u) => u.role === 'BILLING') || billingExecutives[0];
  }, [currentUser, users, billingExecutives]);

  const effectiveCurrentBEId = effectiveCurrentBEUser?.id || 'usr_billing_1';
  const effectiveCurrentBEName = effectiveCurrentBEUser?.name || 'Priya Verma (BE-1)';

  // Commission Agents assigned to this Billing Executive
  const assignedCAs = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT' && u.billing_executive_id === effectiveCurrentBEId);
  }, [users, effectiveCurrentBEId]);

  // Filter Orders: strictly to current Billing Executive's assigned Commission Agents
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. BE Filter: Strictly orders taken by this BE's assigned Commission Agents
      if (!isOrderAssignedToBE(o, effectiveCurrentBEId, users)) return false;

      // 2. DP Filter
      if (selectedDPFilter !== 'ALL') {
        if (o.dispatch_point_id !== selectedDPFilter) return false;
      }

      // 3. Status Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'VERIFIED') {
          if (o.status !== 'VERIFIED' && o.status !== 'VERIFIED_BY_BILLING') return false;
        } else if (statusFilter === 'PENDING_VERIFICATION') {
          if (o.status !== 'PENDING_VERIFICATION' && o.status !== 'PUNCHED' && o.status !== 'FLAGGED') return false;
        } else if (o.status !== statusFilter) {
          return false;
        }
      }

      // 4. Search Query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const retName = (o.retailer_name_raw || '').toLowerCase();
        const ordNo = (o.order_number || '').toLowerCase();
        const agentName = (o.commission_agent_name || '').toLowerCase();
        const beatName = (o.beat_name || '').toLowerCase();
        if (!retName.includes(q) && !ordNo.includes(q) && !agentName.includes(q) && !beatName.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, effectiveCurrentBEId, users, selectedDPFilter, statusFilter, searchTerm]);

  // Handle Opening Partial Approval / Amendment Modal
  const handleOpenAmendmentModal = (order: Order) => {
    setActiveAmendingOrder(order);
    const initialQtyMap: Record<string, number> = {};
    (order.lines || []).forEach((line) => {
      initialQtyMap[line.sku_id] = line.verified_quantity ?? line.quantity;
    });
    setAmendedQuantities(initialQtyMap);
    setApprovalReason(order.be_approval_reason || 'Verified and approved with partial quantity amendment');

    const ret = retailers.find((r) => r.id === order.retailer_id);
    const defaultType: OrderInvoicingType =
      order.order_invoicing_type || (ret?.gstin ? 'REGISTERED_GST' : 'UNREGISTERED_CASH');
    setAmendingInvoicingType(defaultType);
  };

  // Submit Partial Approval
  const handleSubmitApproval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAmendingOrder) return;

    const amendedLines = Object.entries(amendedQuantities).map(([skuId, qty]) => ({
      sku_id: skuId,
      verified_quantity: qty,
    }));

    verifyAndApproveOrderByBilling(
      activeAmendingOrder.id,
      effectiveCurrentBEId,
      approvalReason,
      amendedLines,
      amendingInvoicingType
    );

    setActiveAmendingOrder(null);
    if (onOrderProcessed) onOrderProcessed();
  };

  // Direct Full Approval
  const handleDirectFullApproval = (order: Order) => {
    // If invoicing type already marked by BE on card
    if (order.order_invoicing_type) {
      const retailer = retailers.find((r) => r.id === order.retailer_id);
      const exposure = calculateCreditExposure(retailer, order.total_amount);

      const reason = exposure.isExceeded
        ? `Approved with Credit Limit Override (Variance: ₹${exposure.variance.toLocaleString('en-IN')})`
        : 'Approved in Full';

      verifyAndApproveOrderByBilling(
        order.id,
        effectiveCurrentBEId,
        reason,
        undefined,
        order.order_invoicing_type
      );
      if (onOrderProcessed) onOrderProcessed();
    } else {
      // Must mark type before approving! Prompt BE in modal
      setActiveApprovingOrder(order);
      const retailer = retailers.find((r) => r.id === order.retailer_id);
      setSelectedInvoicingTypeForApproval(retailer?.gstin ? 'REGISTERED_GST' : 'UNREGISTERED_CASH');
    }
  };

  // Confirm Approval from Invoicing Type Modal
  const handleConfirmApprovalWithInvoicingType = () => {
    if (!activeApprovingOrder || !selectedInvoicingTypeForApproval) return;
    const retailer = retailers.find((r) => r.id === activeApprovingOrder.retailer_id);
    const exposure = calculateCreditExposure(retailer, activeApprovingOrder.total_amount);

    const reason = exposure.isExceeded
      ? `Approved with Credit Limit Override (Variance: ₹${exposure.variance.toLocaleString('en-IN')})`
      : 'Approved in Full';

    verifyAndApproveOrderByBilling(
      activeApprovingOrder.id,
      effectiveCurrentBEId,
      reason,
      undefined,
      selectedInvoicingTypeForApproval
    );
    setActiveApprovingOrder(null);
    if (onOrderProcessed) onOrderProcessed();
  };

  // Submit Cancellation
  const handleSubmitCancellation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCancellingOrder) return;

    cancelOrderByBilling(activeCancellingOrder.id, effectiveCurrentBEId, cancellationReason);
    setActiveCancellingOrder(null);
    if (onOrderProcessed) onOrderProcessed();
  };

  // Bulk Re-assignment Submit
  const handleBulkReassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAgentsForReassign.length === 0) {
      alert('Please select at least one Commission Agent to reassign.');
      return;
    }

    updateCAAssignments(
      selectedAgentsForReassign,
      targetBEForReassign || undefined,
      targetDPForReassign || undefined
    );

    setIsReassignmentModalOpen(false);
    setSelectedAgentsForReassign([]);
    alert('Successfully updated Commission Agent routing assignments!');
  };

  // Calculate live preview totals in amendment modal
  const amendmentStats = useMemo(() => {
    if (!activeAmendingOrder) return { newProductValue: 0, newTaxAmount: 0, newTotal: 0, difference: 0, hasReductions: false };
    let newProductValue = 0;
    let hasReductions = false;

    (activeAmendingOrder.lines || []).forEach((line) => {
      const q = amendedQuantities[line.sku_id] !== undefined ? amendedQuantities[line.sku_id] : line.quantity;
      newProductValue += q * line.unit_price;
      if (q < line.quantity) hasReductions = true;
    });

    const newTaxAmount = Math.round(newProductValue * 0.18 * 100) / 100;
    const newTotal = Math.round((newProductValue + newTaxAmount) * 100) / 100;
    const diff = activeAmendingOrder.total_amount - newTotal;
    return { newProductValue, newTaxAmount, newTotal, difference: diff, hasReductions };
  }, [activeAmendingOrder, amendedQuantities]);

  return (
    <div className="space-y-6">
      {/* Top Header & Overview Banner */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-purple-600/20 text-purple-400 rounded-xl border border-purple-500/30">
            <UserCheck size={22} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
              CA-to-BE Mapping & Routing Engine
            </div>
            <h2 className="text-base font-bold text-white mt-0.5">
              Billing Executive Order Verification & Credit Exposure Dashboard
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Orders placed by Commission Agents are automatically tagged to their fixed Billing Executive and Dispatch Point.
              Review credit limits, amend quantities for partial approval, or cancel high-risk orders with real-time CA push alerts.
            </p>
          </div>
        </div>

        {/* Action buttons: Test Suite & BE Absence Bulk Re-assignment */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTestModalOpen(true)}
            className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
            title="Run positive & negative automated verification test scenarios"
          >
            <FileCheck size={14} className="text-purple-400" />
            Verification Test Suite
          </button>
          <button
            onClick={() => setIsReassignmentModalOpen(true)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Users size={14} className="text-purple-400" />
            Manage CA Mappings & Absence Route
          </button>
        </div>
      </div>

      {/* Filter and Switcher Bar */}
      <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by store, CA agent, beat, or order #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Desk Queue Indicator (No redundant BE selector) */}
          <div className="flex items-center gap-1.5 bg-purple-950/50 border border-purple-800/60 rounded-xl px-3 py-1.5 text-xs text-purple-200">
            <UserCheck size={13} className="text-purple-400 shrink-0" />
            <span>
              <strong className="text-white font-semibold">Desk: {effectiveCurrentBEName}</strong>
              <span className="text-purple-300/80 ml-1.5 text-[11px]">
                ({assignedCAs.length} {assignedCAs.length === 1 ? 'Assigned Agent' : 'Assigned Agents'})
              </span>
            </span>
          </div>

          {/* DP Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-semibold">Dispatch Point:</span>
            <select
              value={selectedDPFilter}
              onChange={(e) => setSelectedDPFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-purple-500"
            >
              <option value="ALL">All Dispatch Points</option>
              {dispatchPoints.map((dp) => (
                <option key={dp.id} value={dp.id}>
                  {dp.name} ({dp.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-purple-500"
            >
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="ALL">All Statuses</option>
              <option value="VERIFIED">Verified & Approved</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <CheckCircle2 size={36} className="mx-auto text-purple-400/50" />
          <div className="text-slate-300 font-bold text-sm">No orders matching current filter criteria.</div>
          <div className="text-xs text-slate-500">
            No pending orders found in {effectiveCurrentBEName}&apos;s assigned Commission Agent queue.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredOrders.map((ord) => {
            const retailer = retailers.find((r) => r.id === ord.retailer_id);
            const dp = dispatchPoints.find((d) => d.id === ord.dispatch_point_id);
            const assignedBE = users.find((u) => u.id === ord.billing_executive_id);
            const exposure = calculateCreditExposure(retailer, ord.total_amount);
            const isVerified = ord.status === 'VERIFIED' || ord.status === 'VERIFIED_BY_BILLING';
            const isCancelled = ord.status === 'CANCELLED';

            return (
              <div
                key={ord.id}
                className={`p-4 rounded-2xl border transition-all space-y-3.5 bg-slate-900 ${
                  exposure.isExceeded && !isVerified && !isCancelled
                    ? 'border-rose-500/50 shadow-rose-950/20 shadow-lg'
                    : isVerified
                    ? 'border-emerald-500/40 bg-slate-900/90'
                    : isCancelled
                    ? 'border-slate-800 opacity-60'
                    : 'border-slate-800 hover:border-purple-500/30'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{ord.order_number}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isVerified
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : isCancelled
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            : exposure.isExceeded
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                            : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        }`}
                      >
                        {ord.status}
                      </span>
                      {ord.order_invoicing_type && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                            ord.order_invoicing_type === 'REGISTERED_GST'
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {ord.order_invoicing_type === 'REGISTERED_GST' ? (
                            <>
                              <FileSpreadsheet size={10} /> Registered GST
                            </>
                          ) : (
                            <>
                              <Coins size={10} /> Unregistered Cash
                            </>
                          )}
                        </span>
                      )}
                      {ord.is_locked && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[10px] flex items-center gap-1">
                          <Lock size={10} className="text-emerald-400" /> Locked
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 font-semibold mt-1 flex items-center gap-1.5">
                      <Building size={13} className="text-blue-400" />
                      {ord.retailer_name_raw}
                      <span className="text-slate-500 font-normal">({ord.beat_name || 'General Beat'})</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-mono font-bold text-white">
                      ₹{ord.total_amount.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Incl. 18% GST
                    </div>
                    {ord.original_total_amount && ord.original_total_amount !== ord.total_amount && (
                      <div className="text-[10px] text-amber-400 line-through">
                        Orig: ₹{ord.original_total_amount.toLocaleString('en-IN')}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500">{ord.order_date}</div>
                  </div>
                </div>

                {/* Routing & Assignment Info Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Commission Agent</span>
                    <span className="font-semibold text-slate-200 truncate block">
                      {ord.commission_agent_name || 'CA Assigned'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Assigned BE</span>
                    <span className="font-semibold text-purple-300 truncate block">
                      {assignedBE?.name || 'Priya Verma (BE-1)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Dispatch Point</span>
                    <span className="font-semibold text-blue-300 truncate block">
                      {dp?.name || 'Central Warehouse'}
                    </span>
                  </div>
                </div>

                {/* Credit Exposure Warning Box */}
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    exposure.isExceeded
                      ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                      : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold">
                      {exposure.isExceeded ? (
                        <>
                          <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                          <span className="text-rose-300">Credit Limit Exceeded (High Risk)</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          <span className="text-emerald-300">Credit Limit Safe</span>
                        </>
                      )}
                    </div>
                    {exposure.isExceeded && (
                      <span className="font-mono font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded text-[11px]">
                        +₹{exposure.variance.toLocaleString('en-IN')} Over
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-slate-800/60 font-mono">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Credit Limit:</span>
                      <strong>₹{exposure.creditLimit.toLocaleString('en-IN')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Current Debt:</span>
                      <strong>₹{exposure.currentOutstanding.toLocaleString('en-IN')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Exposure:</span>
                      <strong className={exposure.isExceeded ? 'text-rose-300' : 'text-emerald-300'}>
                        ₹{exposure.totalExposure.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Line Items Preview */}
                <div className="space-y-1 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80 text-xs font-mono">
                  <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-1">
                    Ordered SKU Line Items ({(ord.lines || []).length}):
                  </div>
                  {(ord.lines || []).map((line) => (
                    <div key={line.id} className="flex justify-between items-center text-slate-300 py-0.5">
                      <span className="truncate max-w-[200px] text-[11px]">{line.sku_name}</span>
                      <div className="flex items-center gap-2">
                        {line.is_amended && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded">Amended</span>
                        )}
                        <span className="text-[11px]">
                          {line.verified_quantity !== undefined && line.verified_quantity !== line.quantity ? (
                            <>
                              <span className="text-slate-500 line-through mr-1">{line.quantity}</span>
                              <span className="text-emerald-400 font-bold">{line.verified_quantity}</span>
                            </>
                          ) : (
                            <span>{line.quantity}</span>
                          )}{' '}
                          x ₹{line.unit_price} = <strong className="text-white">₹{line.total}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* BE Invoicing Type Selection (Mandatory before Approval) */}
                {!isVerified && !isCancelled && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                        <FileCheck size={13} className="text-purple-400" />
                        Order Invoicing Type <span className="text-rose-400 font-bold">*</span>
                      </span>
                      {retailer?.gstin ? (
                        <span className="text-[10px] text-blue-400 font-mono">GSTIN: {retailer.gstin}</span>
                      ) : (
                        <span className="text-[10px] text-amber-400">Retailer: No GSTIN on file</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setOrderInvoicingType(ord.id, 'UNREGISTERED_CASH')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                          ord.order_invoicing_type === 'UNREGISTERED_CASH'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm ring-1 ring-amber-500'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <Coins size={13} className={ord.order_invoicing_type === 'UNREGISTERED_CASH' ? 'text-amber-400' : 'text-slate-500'} />
                        Unregistered Cash
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderInvoicingType(ord.id, 'REGISTERED_GST')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                          ord.order_invoicing_type === 'REGISTERED_GST'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500 shadow-sm ring-1 ring-blue-500'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <FileSpreadsheet size={13} className={ord.order_invoicing_type === 'REGISTERED_GST' ? 'text-blue-400' : 'text-slate-500'} />
                        Registered GST
                      </button>
                    </div>

                    {!ord.order_invoicing_type && (
                      <div className="text-[10px] text-amber-400/90 flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                        <AlertCircle size={10} className="shrink-0 text-amber-400" />
                        BE must mark invoicing classification before approving
                      </div>
                    )}
                  </div>
                )}

                {/* BE Action Panel */}
                {!isVerified && !isCancelled && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                    {/* Action 1: Cancel Order (Red) */}
                    <button
                      onClick={() => {
                        setActiveCancellingOrder(ord);
                        setCancellationReason(`Credit limit exceeded by ₹${exposure.variance.toLocaleString('en-IN')}`);
                      }}
                      className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 rounded-xl font-bold flex items-center gap-1.5 transition-all"
                    >
                      <XCircle size={13} /> Cancel Order
                    </button>

                    <div className="flex items-center gap-2">
                      {/* Action 2: Partial Approval / Amend Quantities (Amber) */}
                      <button
                        onClick={() => handleOpenAmendmentModal(ord)}
                        className="px-3 py-1.5 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 rounded-xl font-bold flex items-center gap-1.5 transition-all"
                      >
                        <Edit3 size={13} /> Amend & Approve
                      </button>

                      {/* Action 3: Direct Full Approval (Emerald) */}
                      <button
                        onClick={() => handleDirectFullApproval(ord)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <CheckCircle2 size={13} /> Approve Full
                      </button>
                    </div>
                  </div>
                )}

                {/* Audit notes if already verified or cancelled */}
                {isVerified && (
                  <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      <span>
                        Verified & Locked as{' '}
                        <strong className="text-white underline decoration-emerald-500/50">
                          {ord.order_invoicing_type === 'REGISTERED_GST' ? 'Registered GST' : 'Unregistered Cash'}
                        </strong>{' '}
                        by BE {ord.verified_by_user_id || 'Priya V.'}
                      </span>
                    </div>
                    {ord.be_approval_reason && (
                      <span className="italic text-slate-400 max-w-[200px] truncate">
                        "{ord.be_approval_reason}"
                      </span>
                    )}
                  </div>
                )}

                {isCancelled && (
                  <div className="p-2 bg-rose-950/20 border border-rose-500/30 rounded-xl text-[11px] text-rose-300 flex items-center justify-between">
                    <span>✕ Cancelled by Billing Executive</span>
                    {ord.cancelled_reason && (
                      <span className="italic text-slate-400 max-w-[200px] truncate">
                        "{ord.cancelled_reason}"
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: PARTIAL APPROVAL & LINE-ITEM QUANTITY AMENDMENT */}
      {/* ------------------------------------------------------------- */}
      {activeAmendingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 text-slate-200 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 size={18} className="text-amber-400" />
                  Amend Line Items & Partial Approval
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Order #{activeAmendingOrder.order_number} for {activeAmendingOrder.retailer_name_raw}
                </p>
              </div>
              <button
                onClick={() => setActiveAmendingOrder(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitApproval} className="space-y-4 text-xs">
              {/* Product SKU adjustment table */}
              <div className="space-y-2">
                <div className="text-slate-300 font-semibold">Adjust quantities to fit retailer credit limit:</div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(activeAmendingOrder.lines || []).map((line) => {
                    const currentVal = amendedQuantities[line.sku_id] ?? line.quantity;
                    const lineTot = currentVal * line.unit_price;

                    return (
                      <div
                        key={line.id}
                        className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="flex-1">
                          <div className="font-bold text-white">{line.sku_name}</div>
                          <div className="text-[11px] text-slate-400">
                            Unit Price: ₹{line.unit_price} | Original: {line.quantity} units
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-24">
                            <label className="text-[10px] text-slate-500 block">Verified Qty</label>
                            <input
                              type="number"
                              min="0"
                              max={line.quantity}
                              value={currentVal}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setAmendedQuantities((prev) => ({
                                  ...prev,
                                  [line.sku_id]: val,
                                }));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div className="w-20 text-right font-mono">
                            <span className="text-[10px] text-slate-500 block">Total</span>
                            <strong className="text-white">₹{lineTot.toLocaleString('en-IN')}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live revised totals */}
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Original Order Value (Incl. GST):</span>
                  <span>₹{activeAmendingOrder.total_amount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Revised Product Subtotal:</span>
                  <span>₹{amendmentStats.newProductValue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Revised GST (18%):</span>
                  <span>+₹{amendmentStats.newTaxAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-amber-300 font-bold pt-1 border-t border-slate-800">
                  <span>Revised Total (GST Included):</span>
                  <span>₹{amendmentStats.newTotal.toLocaleString('en-IN')}</span>
                </div>
                {amendmentStats.difference > 0 && (
                  <div className="flex justify-between text-emerald-400 text-[11px]">
                    <span>Credit Exposure Reduced By:</span>
                    <span>-₹{amendmentStats.difference.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              {/* Invoicing Classification Selection (Mandatory for BE) */}
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                    <FileCheck size={14} className="text-purple-400" />
                    Invoicing Classification *
                  </label>
                  <span className="text-[10px] text-slate-400">Mandatory for BE Approval</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAmendingInvoicingType('UNREGISTERED_CASH')}
                    className={`p-2.5 rounded-xl text-left border transition-all ${
                      amendingInvoicingType === 'UNREGISTERED_CASH'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm ring-1 ring-amber-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Coins size={14} className={amendingInvoicingType === 'UNREGISTERED_CASH' ? 'text-amber-400' : 'text-slate-500'} />
                      Unregistered Cash
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Cash retail sale. No B2B tax credit.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmendingInvoicingType('REGISTERED_GST')}
                    className={`p-2.5 rounded-xl text-left border transition-all ${
                      amendingInvoicingType === 'REGISTERED_GST'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-200 shadow-sm ring-1 ring-blue-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <FileSpreadsheet size={14} className={amendingInvoicingType === 'REGISTERED_GST' ? 'text-blue-400' : 'text-slate-500'} />
                      Registered GST
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      B2B Tax Invoice with 18% GST credit pass-through.
                    </div>
                  </button>
                </div>
              </div>

              {/* Approval Reason */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Reason for Amendment / Approval Note *
                </label>
                <input
                  type="text"
                  required
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  placeholder="e.g. Reduced quantity to match available credit limit"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Notice */}
              <div className="p-2.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-200 flex items-start gap-2">
                <Send size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <span>
                  Approving with amended quantities will automatically trigger a push notification to Commission Agent{' '}
                  <strong>{activeAmendingOrder.commission_agent_name}</strong> and lock the order for Dispatch Point consolidation.
                </span>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAmendingOrder(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                  <Check size={14} /> Confirm & Approve Amended Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: ORDER CANCELLATION WITH CA ALERT */}
      {/* ------------------------------------------------------------- */}
      {activeCancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400 pb-3 border-b border-slate-800">
              <div className="p-2 bg-rose-500/20 rounded-xl border border-rose-500/30">
                <XCircle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Cancel Order #{activeCancellingOrder.order_number}</h3>
                <p className="text-xs text-rose-300">Credit Limit & Exposure Rejection</p>
              </div>
            </div>

            <form onSubmit={handleSubmitCancellation} className="space-y-4 text-xs">
              <p className="text-slate-300">
                Are you sure you want to cancel the order for <strong>{activeCancellingOrder.retailer_name_raw}</strong> (Gross: ₹{activeCancellingOrder.total_amount.toLocaleString('en-IN')})?
              </p>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Cancellation Reason (Will be sent to Commission Agent) *
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveCancellingOrder(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
                >
                  Dismiss
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                  <XCircle size={14} /> Cancel Order & Send Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2.5: MARK INVOICING TYPE & FULL APPROVAL */}
      {/* ------------------------------------------------------------- */}
      {activeApprovingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-lg w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base">
                <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
                  <CheckCircle2 size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Mark Invoicing Type & Approve</h3>
                  <p className="text-xs text-slate-400 font-normal">
                    Order #{activeApprovingOrder.order_number} • {activeApprovingOrder.retailer_name_raw}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveApprovingOrder(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Order Amount:</span>
                <span className="font-mono font-bold text-white text-sm">
                  ₹{activeApprovingOrder.total_amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Customer GSTIN:</span>
                {(() => {
                  const ret = retailers.find((r) => r.id === activeApprovingOrder.retailer_id);
                  return ret?.gstin ? (
                    <span className="font-mono text-emerald-400 font-semibold">{ret.gstin} (Registered)</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">Not Registered / No GSTIN</span>
                  );
                })()}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Select Invoicing Type <span className="text-rose-400">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedInvoicingTypeForApproval('UNREGISTERED_CASH')}
                  className={`p-3 rounded-2xl text-left border transition-all ${
                    selectedInvoicingTypeForApproval === 'UNREGISTERED_CASH'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/50 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
                    <Coins size={16} />
                    Unregistered Cash
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Commercial / Form-08 bill. For un-registered or cash retail accounts.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedInvoicingTypeForApproval('REGISTERED_GST')}
                  className={`p-3 rounded-2xl text-left border transition-all ${
                    selectedInvoicingTypeForApproval === 'REGISTERED_GST'
                      ? 'bg-blue-500/20 border-blue-500 text-blue-200 ring-2 ring-blue-500/50 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-blue-300">
                    <FileSpreadsheet size={16} />
                    Registered GST
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Standard B2B Tax Invoice. Generates tax breakup with 18% GST credit.
                  </p>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveApprovingOrder(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedInvoicingTypeForApproval}
                onClick={handleConfirmApprovalWithInvoicingType}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 size={15} />
                Approve as {selectedInvoicingTypeForApproval === 'UNREGISTERED_CASH' ? 'Unregistered Cash' : 'Registered GST'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: BULK CA RE-ASSIGNMENT (BE ABSENCE / ROSTER MAPPING) */}
      {/* ------------------------------------------------------------- */}
      {isReassignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 text-slate-200 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users size={18} className="text-purple-400" />
                  Commission Agent Mapping & BE Absence Re-routing
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Many-to-one mapping: Assign Commission Agents to specific Billing Executives and Dispatch Points.
                </p>
              </div>
              <button
                onClick={() => setIsReassignmentModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleBulkReassignSubmit} className="space-y-4 text-xs">
              {/* Select CAs */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-300 font-semibold">Select Commission Agents to Re-route:</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAgentsForReassign.length === commissionAgents.length) {
                        setSelectedAgentsForReassign([]);
                      } else {
                        setSelectedAgentsForReassign(commissionAgents.map((a) => a.id));
                      }
                    }}
                    className="text-[11px] text-purple-400 hover:underline"
                  >
                    {selectedAgentsForReassign.length === commissionAgents.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {commissionAgents.map((agent) => {
                    const currentBE = users.find((u) => u.id === agent.billing_executive_id);
                    const currentDP = dispatchPoints.find((d) => d.id === agent.dispatch_point_id);
                    const isSelected = selectedAgentsForReassign.includes(agent.id);

                    return (
                      <div
                        key={agent.id}
                        onClick={() => {
                          setSelectedAgentsForReassign((prev) =>
                            isSelected ? prev.filter((id) => id !== agent.id) : [...prev, agent.id]
                          );
                        }}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                          isSelected
                            ? 'bg-purple-950/40 border-purple-500/50 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Controlled by parent div click
                            className="rounded border-slate-700 text-purple-600 focus:ring-0"
                          />
                          <div>
                            <div className="font-bold">{agent.name}</div>
                            <div className="text-[10px] text-slate-400">{agent.mobile_number || 'No mobile'}</div>
                          </div>
                        </div>

                        <div className="text-right text-[10px]">
                          <span className="text-slate-500 block">Current Mapping:</span>
                          <span className="text-purple-300 font-semibold">{currentBE?.name || 'Default BE'}</span>
                          <span className="text-slate-400"> | {currentDP?.name || 'Central DP'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Target BE & DP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Assign to Billing Executive:
                  </label>
                  <select
                    value={targetBEForReassign}
                    onChange={(e) => setTargetBEForReassign(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">-- Leave Unchanged --</option>
                    {billingExecutives.map((be) => (
                      <option key={be.id} value={be.id}>
                        {be.name} ({be.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Assign to Dispatch Point:
                  </label>
                  <select
                    value={targetDPForReassign}
                    onChange={(e) => setTargetDPForReassign(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">-- Leave Unchanged --</option>
                    {dispatchPoints.map((dp) => (
                      <option key={dp.id} value={dp.id}>
                        {dp.name} ({dp.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReassignmentModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedAgentsForReassign.length === 0}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
                >
                  <RefreshCw size={14} /> Update Mapping for {selectedAgentsForReassign.length} Agent(s)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Runner Modal */}
      <TestRunnerModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />
    </div>
  );
};
