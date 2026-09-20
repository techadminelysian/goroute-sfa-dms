import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../data/store';
import {
  StockLedgerEntry,
  StockEntryType,
  RecipientType,
  AckStatus,
  AckType,
  Order,
  ReturnableAssetLedgerEntry,
  DEFAULT_CRATE_DEPOSIT_VALUE,
  CRATE_AGING_WARNING_DAYS,
  CRATE_AGING_CRITICAL_DAYS,
  CRATE_HIGH_DEFICIT_THRESHOLD,
} from '../../types';
import { KPICard } from '../common/KPICard';
import {
  Boxes,
  Warehouse,
  Plus,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  Truck,
  FileText,
  PenTool,
  Key,
  Camera,
  CheckSquare,
  XCircle,
  AlertTriangle,
  UserCheck,
  MapPin,
  Building2,
  Users,
  QrCode,
  RefreshCw,
  Layers,
  Filter,
  Eye,
  Info,
  Clock,
  Shield,
  Send,
  FileCheck,
  Package,
  Store,
  RotateCcw,
  AlertOctagon,
} from 'lucide-react';
import { CrateTrackingSection } from './CrateTrackingSection';

export const InventoryTally: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    dispatchPoints,
    companies,
    skus,
    stockLedger,
    orders,
    retailers,
    users,
    purchaseOrders,
    workflowNotifications,
    addStockLedgerEntry,
    updateStockLedgerAck,
    updateOrderStatus,
    inwardPOStock,
    markNotificationAsRead,
    returnableAssetLedger,
    recordHubCrateTransfer,
    getCrateAgingInfo,
    checkRetailerCrateAlert,
  } = useAppStore();

  // Active Dispatch Point / Location Filter (Defaults to first DP e.g. Central Warehouse)
  const [selectedDpId, setSelectedDpId] = useState<string>(dispatchPoints[0]?.id || 'dp_central');

  // Module Sub-Tab View: 'SNAPSHOT' | 'INWARD' | 'OUTWARD' | 'HISTORY' | 'CRATES'
  const [activeSubTab, setActiveSubTab] = useState<'SNAPSHOT' | 'INWARD' | 'OUTWARD' | 'HISTORY' | 'CRATES'>('SNAPSHOT');

  // Principle PO Inward Docking Modal State
  const [inwardingPO, setInwardingPO] = useState<any | null>(null);
  const [poDockChallan, setPoDockChallan] = useState('');
  const [poDockVehicle, setPoDockVehicle] = useState('');
  const [poDockNotes, setPoDockNotes] = useState('');

  // Search & Filters for History
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilterType, setHistoryFilterType] = useState<string>('ALL');
  const [historyFilterCompany, setHistoryFilterCompany] = useState<string>('ALL');
  const [historyFilterAck, setHistoryFilterAck] = useState<string>('ALL');
  const [snapshotCompanyFilter, setSnapshotCompanyFilter] = useState<string>('ALL');

  // Modals & Active Selections
  const [selectedEntryForAckModal, setSelectedEntryForAckModal] = useState<StockLedgerEntry | null>(null);
  const [ackModalMode, setAckModalMode] = useState<'SIGNATURE' | 'OTP' | 'PHOTO'>('SIGNATURE');

  // Signature canvas ref & state
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('');
  const [otpInput, setOtpInput] = useState('');
  const [receiverNameInput, setReceiverNameInput] = useState('');
  const [paperPhotoInput, setPaperPhotoInput] = useState('');

  // Dispute Modal State
  const [disputingEntry, setDisputingEntry] = useState<StockLedgerEntry | null>(null);
  const [disputeReasonText, setDisputeReasonText] = useState('');

  // --- FORM STATE: INWARD CAPTURE ---
  const [inwardCompanyId, setInwardCompanyId] = useState<string>(companies[0]?.id || 'comp_brit');
  const [inwardSkuId, setInwardSkuId] = useState<string>(skus[0]?.id || 'sku_brit_1');
  const [inwardActualQty, setInwardActualQty] = useState<number>(1000);
  const [inwardExpectedQty, setInwardExpectedQty] = useState<number>(1000);
  const [inwardChallanRef, setInwardChallanRef] = useState<string>('CH-BRIT-2025-102');
  const [inwardVehicleNo, setInwardVehicleNo] = useState<string>('HR-38-X-9012');
  const [inwardNotes, setInwardNotes] = useState<string>('Physical consignment count verified at dock.');

  // --- FORM STATE: OUTWARD CAPTURE ---
  const [outwardRecipientType, setOutwardRecipientType] = useState<RecipientType>('COMMISSION_AGENT');
  const [outwardRecipientId, setOutwardRecipientId] = useState<string>(retailers[0]?.id || '');
  const [outwardRecipientCustomName, setOutwardRecipientCustomName] = useState<string>('Agent Amit Kumar (Route 01)');
  const [outwardCompanyId, setOutwardCompanyId] = useState<string>(companies[0]?.id || 'comp_brit');
  const [outwardSkuId, setOutwardSkuId] = useState<string>(skus[0]?.id || 'sku_brit_1');
  const [outwardQty, setOutwardQty] = useState<number>(200);
  const [outwardVehicleNo, setOutwardVehicleNo] = useState<string>('DL-1L-AA-4411');
  const [outwardLinkedOrderId, setOutwardLinkedOrderId] = useState<string>('');
  const [outwardRefDocId, setOutwardRefDocId] = useState<string>('DISP-GATE-2025-881');
  const [outwardNotes, setOutwardNotes] = useState<string>('Stock handed over for GT route distribution.');

  // Current effective SKU selections
  const effectiveInwardSkuId =
    (skus.find((s) => s.id === inwardSkuId && s.company_id === inwardCompanyId)?.id) ||
    (skus.find((s) => s.company_id === inwardCompanyId)?.id) ||
    skus[0]?.id ||
    '';

  const effectiveOutwardSkuId =
    (skus.find((s) => s.id === outwardSkuId && s.company_id === outwardCompanyId)?.id) ||
    (skus.find((s) => s.company_id === outwardCompanyId)?.id) ||
    skus[0]?.id ||
    '';

  // Current Active Depot Object
  const currentDepot = dispatchPoints.find((d) => d.id === selectedDpId) || dispatchPoints[0];

  // Current Stock Ledger for this Depot
  const depotLedger = stockLedger.filter((s) => s.dispatch_point_id === selectedDpId);

  // Today's Date String (YYYY-MM-DD)
  const todayStr = new Date().toISOString().split('T')[0];

  // Stock Balance Calculations per SKU at Selected Depot
  const stockBalanceMap: Record<string, number> = {};
  const inwardTodayMap: Record<string, number> = {};
  const outwardTodayMap: Record<string, number> = {};

  depotLedger.forEach((st) => {
    const isToday = st.timestamp.startsWith(todayStr);
    const curr = stockBalanceMap[st.sku_id] || 0;

    if (st.entry_type === 'INWARD' || st.entry_type === 'RETURN') {
      stockBalanceMap[st.sku_id] = curr + st.quantity;
      if (isToday) {
        inwardTodayMap[st.sku_id] = (inwardTodayMap[st.sku_id] || 0) + st.quantity;
      }
    } else {
      stockBalanceMap[st.sku_id] = Math.max(0, curr - st.quantity);
      if (isToday) {
        outwardTodayMap[st.sku_id] = (outwardTodayMap[st.sku_id] || 0) + st.quantity;
      }
    }
  });

  // KPI Summaries
  const totalInwardTodayQty = Object.values(inwardTodayMap).reduce((a, b) => a + b, 0);
  const totalOutwardTodayQty = Object.values(outwardTodayMap).reduce((a, b) => a + b, 0);
  const totalClosingStockUnits = Object.values(stockBalanceMap).reduce((a, b) => a + b, 0);

  const totalStockValuation = skus.reduce((sum, s) => {
    const qty = stockBalanceMap[s.id] || 0;
    return sum + qty * s.landing_price;
  }, 0);

  const pendingAcksCount = depotLedger.filter(
    (st) => st.entry_type === 'DISPATCH_OUT' && st.ack_status === 'PENDING'
  ).length;

  const totalVariancesCount = depotLedger.filter((st) => (st.variance_quantity || 0) !== 0).length;

  // Pending Orders assigned to this Depot awaiting Hard Gate dispatch
  const pendingDispatchOrders = orders.filter(
    (o) => o.dispatch_point_id === selectedDpId && (o.status === 'PUNCHED' || o.status === 'APPROVED')
  );

  // Filtered History Entries
  const filteredHistory = depotLedger.filter((st) => {
    if (historyFilterType !== 'ALL' && st.entry_type !== historyFilterType) return false;
    if (historyFilterCompany !== 'ALL' && st.company_id !== historyFilterCompany) return false;
    if (historyFilterAck !== 'ALL' && st.ack_status !== historyFilterAck) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const sku = skus.find((s) => s.id === st.sku_id);
      return (
        st.reference_doc_id.toLowerCase().includes(q) ||
        (st.vehicle_number || '').toLowerCase().includes(q) ||
        (st.recipient_name || '').toLowerCase().includes(q) ||
        (sku?.name || '').toLowerCase().includes(q) ||
        st.notes.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // --- HANDLER: SUBMIT INWARD ---
  const handleInwardSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let effectiveSkuId = inwardSkuId;
    let targetSku = skus.find((s) => s.id === inwardSkuId);

    // Fallback if targetSku is missing or from another company
    if (!targetSku || targetSku.company_id !== inwardCompanyId) {
      const compSkus = skus.filter((s) => s.company_id === inwardCompanyId);
      if (compSkus.length > 0) {
        effectiveSkuId = compSkus[0].id;
        targetSku = compSkus[0];
      } else {
        alert('No SKUs registered for the selected Principal Company.');
        return;
      }
    }

    const variance = Number(inwardActualQty) - Number(inwardExpectedQty);

    const newEntry: StockLedgerEntry = {
      id: `stk_in_${Date.now()}`,
      tenant_id: activeTenant.id,
      dispatch_point_id: selectedDpId,
      company_id: inwardCompanyId,
      sku_id: effectiveSkuId,
      entry_type: 'INWARD',
      quantity: Number(inwardActualQty) || 0,
      expected_quantity: Number(inwardExpectedQty) || Number(inwardActualQty),
      variance_quantity: variance,
      reference_doc_type: 'INWARD_CHALLAN',
      reference_doc_id: inwardChallanRef || `CH-${Math.floor(1000 + Math.random() * 9000)}`,
      vehicle_number: inwardVehicleNo || 'TRUCK-01',
      timestamp: new Date().toISOString(),
      performed_by_user_id: 'usr_dispatcher',
      dispatcher_name: currentDepot.supervisor_name,
      notes: inwardNotes || 'Inward consignment logged at depot dock',
      ack_status: 'RECEIVED',
      ack_type: 'PAPER_PHOTO',
      ack_by_user_name: currentDepot.supervisor_name,
      ack_timestamp: new Date().toISOString(),
    };

    addStockLedgerEntry(newEntry);
    alert(
      `Inward consignment logged!\n${targetSku?.name} (+${newEntry.quantity} units) added to ${currentDepot.name} ledger.`
    );

    // Reset Form
    setInwardActualQty(1000);
    setInwardExpectedQty(1000);
    setInwardNotes('');
    setActiveSubTab('SNAPSHOT');
  };

  // --- HANDLER: SUBMIT OUTWARD ---
  const handleOutwardSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let effectiveSkuId = outwardSkuId;
    let targetSku = skus.find((s) => s.id === outwardSkuId);

    if (!targetSku || targetSku.company_id !== outwardCompanyId) {
      const compSkus = skus.filter((s) => s.company_id === outwardCompanyId);
      if (compSkus.length > 0) {
        effectiveSkuId = compSkus[0].id;
        targetSku = compSkus[0];
      } else {
        alert('No SKUs registered for the selected Principal Company.');
        return;
      }
    }

    let rName = outwardRecipientCustomName;

    if (outwardRecipientId) {
      const ret = retailers.find((r) => r.id === outwardRecipientId);
      if (ret) rName = ret.name;
    }

    const availableStock = stockBalanceMap[effectiveSkuId] || 0;
    if (outwardQty > availableStock) {
      if (
        !confirm(
          `Warning: Outward quantity (${outwardQty}) exceeds available depot stock (${availableStock}). Proceed with stock allocation?`
        )
      ) {
        return;
      }
    }

    const newEntry: StockLedgerEntry = {
      id: `stk_out_${Date.now()}`,
      tenant_id: activeTenant.id,
      dispatch_point_id: selectedDpId,
      company_id: outwardCompanyId,
      sku_id: effectiveSkuId,
      entry_type: 'DISPATCH_OUT',
      quantity: Number(outwardQty) || 0,
      reference_doc_type: outwardLinkedOrderId ? 'ORDER' : 'TRANSFER_NOTE',
      reference_doc_id: outwardRefDocId || `DISP-${Math.floor(1000 + Math.random() * 9000)}`,
      vehicle_number: outwardVehicleNo || 'VAN-01',
      recipient_type: outwardRecipientType,
      recipient_id: outwardRecipientId || null as any,
      recipient_name: rName || 'Recipient',
      linked_order_id: outwardLinkedOrderId || undefined,
      timestamp: new Date().toISOString(),
      performed_by_user_id: 'usr_dispatcher',
      dispatcher_name: currentDepot.supervisor_name,
      notes: outwardNotes || 'Outward stock allocated and handed over.',
      ack_status: 'PENDING', // Receiver must confirm receipt
      ack_type: 'DIGITAL_SIGNATURE',
    };

    addStockLedgerEntry(newEntry);

    // Hard Gate logic: if linked to order, mark order DISPATCHED
    if (outwardLinkedOrderId) {
      updateOrderStatus(outwardLinkedOrderId, 'DISPATCHED');
    }

    // Automatically prompt for acknowledgment handoff
    setSelectedEntryForAckModal(newEntry);
    setReceiverNameInput(rName);

    alert(`Outward entry created! Please capture receiver acknowledgment signature or PIN.`);
  };

  // --- HANDLER: HARD GATE DISPATCH FOR ORDER ---
  const handleGateOrderDispatch = (order: Order) => {
    // Generate Outward entries for all lines in the order
    (order.lines || []).forEach((line) => {
      const sku = skus.find((s) => s.id === line.sku_id);

      addStockLedgerEntry({
        id: `stk_gate_${Date.now()}_${line.id}`,
        tenant_id: activeTenant.id,
        dispatch_point_id: selectedDpId,
        company_id: sku?.company_id || order.company_id,
        sku_id: line.sku_id,
        entry_type: 'DISPATCH_OUT',
        quantity: line.quantity,
        reference_doc_type: 'ORDER',
        reference_doc_id: order.order_number,
        vehicle_number: 'VAN-DELIVERY',
        recipient_type: 'COMMISSION_AGENT',
        recipient_name: order.retailer_name_raw,
        linked_order_id: order.id,
        timestamp: new Date().toISOString(),
        performed_by_user_id: 'usr_dispatcher',
        dispatcher_name: currentDepot.supervisor_name,
        notes: `Hard Gate Verified: Order ${order.order_number} loaded & dispatched from ${currentDepot.name}`,
        ack_status: 'PENDING',
        ack_type: 'DIGITAL_SIGNATURE',
      });
    });

    updateOrderStatus(order.id, 'DISPATCHED');
    alert(`Hard Gate Passed! Order #${order.order_number} converted to stock ledger entry & marked DISPATCHED.`);
  };

  // --- HANDLER: SAVE ACKNOWLEDGMENT ---
  const handleSaveAck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryForAckModal) return;

    let proofUrl = '';
    let sigSvg = '';

    if (ackModalMode === 'SIGNATURE') {
      sigSvg = signatureDataUrl || 'SVG_SIGNATURE_CAPTURED';
    } else if (ackModalMode === 'PHOTO') {
      proofUrl = paperPhotoInput || 'PAPER_SLIP_PHOTO_REF_88192.jpg';
    }

    updateStockLedgerAck(
      selectedEntryForAckModal.id,
      'RECEIVED',
      ackModalMode === 'SIGNATURE' ? 'DIGITAL_SIGNATURE' : ackModalMode === 'OTP' ? 'OTP_PIN' : 'PAPER_PHOTO',
      receiverNameInput || 'Receiver Staff',
      proofUrl,
      sigSvg
    );

    setSelectedEntryForAckModal(null);
    setSignatureDataUrl('');
    setOtpInput('');
    setPaperPhotoInput('');
    alert(`Receiver acknowledgment captured! Ledger entry ${selectedEntryForAckModal.reference_doc_id} marked RECEIVED.`);
  };

  // --- HANDLER: DISPUTE ENTRY ---
  const handleConfirmDispute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputingEntry) return;

    updateStockLedgerAck(
      disputingEntry.id,
      'DISPUTED',
      undefined,
      undefined,
      undefined,
      undefined,
      disputeReasonText || 'Quantity discrepancy reported by receiver.'
    );

    setDisputingEntry(null);
    setDisputeReasonText('');
    alert(`Stock movement marked DISPUTED! Flagged in audit history.`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Role Scope Callout */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <Warehouse size={16} /> Dispatcher Depot Control Hub — Location: {currentDepot.name}
          </div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            Physical Carton Movements, Depot Inventory Ledger & Hard Gate Dispatches
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
            Dispatcher owns physical stock truth at this depot location. Logs every Inward factory shipment and Outward stock allocation with proof of receiver acknowledgment.
          </p>
        </div>

        {/* Depot / Dispatch Point Selector */}
        <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
          <MapPin size={16} className="text-blue-400" />
          <span className="text-xs text-slate-400 font-medium">Select Location:</span>
          <select
            value={selectedDpId}
            onChange={(e) => setSelectedDpId(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-blue-500"
          >
            {dispatchPoints.map((dp) => (
              <option key={dp.id} value={dp.id}>
                {dp.name} ({dp.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* DISPATCHER PARALLEL WORKFLOW NOTIFICATIONS BANNER */}
      {workflowNotifications.filter((n) => !n.is_read && ((n.target_roles as string[]).includes('DISPATCHER') || (n.target_roles as string[]).includes('ALL'))).length > 0 && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border border-emerald-500/40 rounded-2xl p-4 space-y-2 shadow-lg animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Dispatcher Parallel Inward & Outward Alerts ({workflowNotifications.filter((n) => !n.is_read && ((n.target_roles as string[]).includes('DISPATCHER') || (n.target_roles as string[]).includes('ALL'))).length} Active)
            </div>
            <button
              onClick={() => {
                workflowNotifications
                  .filter((n) => !n.is_read && ((n.target_roles as string[]).includes('DISPATCHER') || (n.target_roles as string[]).includes('ALL')))
                  .forEach((n) => markNotificationAsRead(n.id));
              }}
              className="text-[11px] text-slate-400 hover:text-white underline font-semibold"
            >
              Acknowledge All Alerts
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {workflowNotifications
              .filter((n) => !n.is_read && ((n.target_roles as string[]).includes('DISPATCHER') || (n.target_roles as string[]).includes('ALL')))
              .map((notif) => (
                <div
                  key={notif.id}
                  className="bg-slate-950/90 border border-slate-800 p-3 rounded-xl flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{notif.title}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(notif.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-snug">{notif.message}</p>
                    {notif.related_entity_id && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono font-bold text-[10px]">
                        Ref #{notif.related_entity_id}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {(notif.type === 'PRINCIPLE_DISPATCH' || (notif.type as string) === 'PRINCIPLE_DISPATCHED') && (
                      <button
                        onClick={() => {
                          setActiveSubTab('INWARD');
                          markNotificationAsRead(notif.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]"
                      >
                        Dock Inward
                      </button>
                    )}
                    {(notif.type === 'VERIFIED_PARALLEL_ALERT' || (notif.type as string) === 'BILLING_ORDER_VERIFIED') && (
                      <button
                        onClick={() => {
                          setActiveSubTab('OUTWARD');
                          markNotificationAsRead(notif.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px]"
                      >
                        Prepare Outward
                      </button>
                    )}
                    <button
                      onClick={() => markNotificationAsRead(notif.id)}
                      className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white text-[10px]"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Dispatcher Boundary Notice Box */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 text-xs space-y-2 bg-gradient-to-r from-emerald-950/20 via-slate-900 to-blue-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <ShieldCheck size={16} className="text-emerald-400" />
            Depot Boundary: Physical Cartons → Trusted Ledger Entries
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Supervisor: <span className="text-white font-bold">{currentDepot.supervisor_name}</span> ({currentDepot.phone})
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-300">
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <span className="font-bold text-emerald-400 block mb-0.5">1. Inward Verification</span>
            Match factory truck challan with physical cartons. Log variance & LR reference.
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <span className="font-bold text-blue-400 block mb-0.5">2. Outward Allocation</span>
            Allocate to Sub-distributors, Commission Agents, or Reps. Reduce depot stock.
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <span className="font-bold text-purple-400 block mb-0.5">3. Receiver Proof</span>
            Capture digital signature, secret OTP, or paper slip photo before route loading.
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Stock Inventory Valuation"
          value={`₹${totalStockValuation.toLocaleString('en-IN')}`}
          delta={{ value: `${totalClosingStockUnits.toLocaleString('en-IN')} units`, isPositive: true, label: 'at landing cost' }}
          icon={Boxes}
          subtext={`Depot ${currentDepot.code} stock asset`}
          accentColor="#059669"
        />
        <KPICard
          title="Inward Consignments Today"
          value={`+${totalInwardTodayQty.toLocaleString('en-IN')} units`}
          delta={{ value: 'Fresh Stock', isPositive: true, label: 'received at dock' }}
          icon={ArrowDownRight}
          subtext="From principal companies"
          accentColor="#10b981"
        />
        <KPICard
          title="Outward Distributed Today"
          value={`-${totalOutwardTodayQty.toLocaleString('en-IN')} units`}
          delta={{ value: 'Route Allocation', isPositive: true, label: 'issued to recipients' }}
          icon={ArrowUpRight}
          subtext="To agents, reps & institutions"
          accentColor="#3b82f6"
        />
        <KPICard
          title="Pending Receiver Proofs"
          value={pendingAcksCount}
          delta={{ value: totalVariancesCount > 0 ? `${totalVariancesCount} Variances` : '0 Variances', isPositive: false, label: 'proof required' }}
          icon={Clock}
          subtext="Signature / OTP / Photo queue"
          badge={pendingAcksCount > 0 ? 'Pending Proof' : 'All Clear'}
          accentColor="#f59e0b"
        />
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('SNAPSHOT')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeSubTab === 'SNAPSHOT'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Layers size={15} />
          5.1 Depot Inventory Snapshot & Hard Gate
        </button>

        <button
          onClick={() => setActiveSubTab('INWARD')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeSubTab === 'INWARD'
              ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ArrowDownRight size={15} />
          5.2 (A) Log Inward Stock (Principal Arrival)
        </button>

        <button
          onClick={() => setActiveSubTab('OUTWARD')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeSubTab === 'OUTWARD'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ArrowUpRight size={15} />
          5.2 (B) Log Outward Allocation & Proof
        </button>

        <button
          onClick={() => setActiveSubTab('HISTORY')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeSubTab === 'HISTORY'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileText size={15} />
          5.3 Movement History & Audit Trail ({depotLedger.length})
        </button>

        <button
          onClick={() => setActiveSubTab('CRATES')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeSubTab === 'CRATES'
              ? 'bg-amber-600 text-white font-bold shadow-md shadow-amber-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Package size={15} />
          5.4 Returnable Assets (Crates & Leakage)
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 5.1: DEPOT INVENTORY SNAPSHOT & HARD GATE */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'SNAPSHOT' && (
        <div className="space-y-6">
          {/* HARD GATE ORDERS PENDING DISPATCH */}
          {pendingDispatchOrders.length > 0 && (
            <div className="p-4 bg-slate-900 border border-blue-500/40 rounded-2xl space-y-3 shadow-sm bg-gradient-to-r from-blue-950/40 to-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                  <ShieldCheck size={16} className="text-blue-400" />
                  Hard Gate Dispatch Verification Active ({pendingDispatchOrders.length} Orders Awaiting Gate Entry)
                </div>
                <span className="text-[10px] text-slate-400">
                  System blocks order dispatch completion until matching outward entry is created
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingDispatchOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-white flex items-center gap-2">
                        {ord.order_number}
                        <span className="text-[10px] font-sans text-slate-400 font-normal">
                          ({ord.retailer_name_raw})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Amount: <span className="text-emerald-400 font-mono font-bold">₹{ord.total_amount.toLocaleString('en-IN')}</span> | Lines: {(ord.lines || []).length}
                      </div>
                    </div>

                    <button
                      onClick={() => handleGateOrderDispatch(ord)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm"
                    >
                      <CheckCircle2 size={14} /> Pass Gate & Dispatch
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DEPOT LIVE STOCK TABLE PER SKU & COMPANY */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Warehouse size={18} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Live Stock Breakdown at {currentDepot.name} ({currentDepot.code})
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 font-medium">Filter Company:</span>
                  <select
                    value={snapshotCompanyFilter}
                    onChange={(e) => setSnapshotCompanyFilter(e.target.value)}
                    className="bg-slate-900 text-white font-bold text-xs rounded border border-slate-700 px-2 py-0.5 focus:outline-none"
                  >
                    <option value="ALL">-- All Companies --</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                  Formula: Closing Stock = Opening + Inward - Outward
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-2.5 px-3">Company & SKU Product</th>
                    <th className="py-2.5 px-3">SKU Code</th>
                    <th className="py-2.5 px-3 text-right">Landing Cost (₹)</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400">Inward Today</th>
                    <th className="py-2.5 px-3 text-right text-blue-400">Outward Today</th>
                    <th className="py-2.5 px-3 text-right font-bold text-white">Available Closing Stock</th>
                    <th className="py-2.5 px-3 text-right">Valuation (₹)</th>
                    <th className="py-2.5 px-3 text-center">Status Alert</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {(snapshotCompanyFilter === 'ALL'
                    ? skus
                    : skus.filter((s) => s.company_id === snapshotCompanyFilter)
                  ).map((s) => {
                    const comp = companies.find((c) => c.id === s.company_id);
                    const currStock = stockBalanceMap[s.id] || 0;
                    const inToday = inwardTodayMap[s.id] || 0;
                    const outToday = outwardTodayMap[s.id] || 0;
                    const valuation = currStock * s.landing_price;
                    const isLow = currStock < 50;

                    return (
                      <tr key={s.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-semibold text-white">
                          {s.name}
                          <div className="text-[10px] text-slate-500">{comp?.name || 'Principal'}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{s.code}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-300">₹{s.landing_price}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                          {inToday > 0 ? `+${inToday}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-400">
                          {outToday > 0 ? `-${outToday}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-white">
                          {currStock.toLocaleString('en-IN')} units
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                          ₹{valuation.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isLow ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                              <AlertTriangle size={10} /> Low Stock
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                              <CheckCircle2 size={10} /> Reconciled
                            </span>
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

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 5.2 (A): LOG INWARD STOCK (PRINCIPAL ARRIVAL) */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'INWARD' && (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* SECTION 1: INCOMING PRINCIPLE PURCHASE ORDERS (FACTORY SHIPMENTS) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Truck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Incoming Principle Factory Shipments (POs)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Purchase Orders submitted to Principal Companies (Britannia, Marico, Parle, etc.). Verify truck arrival at dock and 1-click Inward into depot stock.
                  </p>
                </div>
              </div>
            </div>

            {purchaseOrders.filter((po) => po.status !== 'INWARDED_AT_DEPOT').length === 0 ? (
              <div className="p-6 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                No pending factory truck shipments awaiting docking. All submitted POs have been inwarded into depot stock.
              </div>
            ) : (
              <div className="space-y-3">
                {purchaseOrders
                  .filter((po) => po.status !== 'INWARDED_AT_DEPOT')
                  .map((po) => (
                    <div
                      key={po.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-400 text-sm">{po.po_number}</span>
                          <span className="font-bold text-white">({po.company_name})</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              po.status === 'DISPATCHED_BY_PRINCIPLE'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 animate-pulse'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {po.status === 'DISPATCHED_BY_PRINCIPLE' ? '🚚 Factory Dispatched — Truck In-Transit' : '⏳ Submitted to Principle'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {po.items.length} SKUs | Total Demanded: <strong className="text-amber-300 font-mono">{po.total_quantity.toLocaleString()} pcs</strong> | Landing Value: <strong className="text-emerald-400 font-mono">₹{po.total_amount.toLocaleString('en-IN')}</strong>
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setInwardingPO(po);
                          setPoDockChallan(`CH-${po.company_code}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                          setPoDockVehicle('HR-38-T-4912');
                          setPoDockNotes(`Dock inwarded at ${currentDepot.name} with seal intact.`);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-900/30 flex items-center gap-1.5"
                      >
                        <ArrowDownRight size={15} /> Receive & Dock Factory PO
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* SECTION 2: MANUAL SINGLE-SKU INWARD LOG */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <ArrowDownRight size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Manual Ad-Hoc Inward Entry (Single SKU)
                </h3>
                <p className="text-xs text-slate-400">
                  Log direct manual inward receipts or returns from manufacturers into {currentDepot.name}.
                </p>
              </div>
            </div>

            <form onSubmit={handleInwardSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Select Principal Company */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Principal Company Supplier
                </label>
                <select
                  value={inwardCompanyId}
                  onChange={(e) => {
                    const newCompId = e.target.value;
                    setInwardCompanyId(newCompId);
                    const compSkus = skus.filter((s) => s.company_id === newCompId);
                    if (compSkus.length > 0) {
                      setInwardSkuId(compSkus[0].id);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-medium"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - GST: {c.gstin}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select SKU Product */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  SKU Product Received
                </label>
                <select
                  value={inwardSkuId}
                  onChange={(e) => setInwardSkuId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-medium"
                >
                  {skus
                    .filter((s) => !inwardCompanyId || s.company_id === inwardCompanyId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) [Pack: {s.pack_size}]
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Expected Quantity */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Expected Qty (as per Challan)
                </label>
                <input
                  type="number"
                  value={inwardExpectedQty}
                  onChange={(e) => setInwardExpectedQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                  required
                />
              </div>

              {/* Actual Physical Counted Quantity */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold text-emerald-400">
                  Actual Physical Counted Qty
                </label>
                <input
                  type="number"
                  value={inwardActualQty}
                  onChange={(e) => setInwardActualQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl p-2.5 text-white font-mono font-bold text-sm"
                  required
                />
              </div>

              {/* Calculated Variance */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                  Transit Variance (Actual - Expected)
                </label>
                <div
                  className={`w-full p-2.5 rounded-xl font-mono font-bold text-sm border flex items-center justify-between ${
                    inwardActualQty - inwardExpectedQty < 0
                      ? 'bg-rose-950/40 text-rose-400 border-rose-500/40'
                      : 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  <span>{inwardActualQty - inwardExpectedQty} units</span>
                  {inwardActualQty - inwardExpectedQty < 0 && (
                    <span className="text-[10px] uppercase font-sans">Shortage</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* LR / Challan Number */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Factory Delivery Challan / LR #
                </label>
                <input
                  type="text"
                  placeholder="e.g. CH-BRIT-2025-102"
                  value={inwardChallanRef}
                  onChange={(e) => setInwardChallanRef(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  required
                />
              </div>

              {/* Vehicle Number */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Transporter Vehicle #
                </label>
                <input
                  type="text"
                  placeholder="e.g. HR-38-X-9012"
                  value={inwardVehicleNo}
                  onChange={(e) => setInwardVehicleNo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                Inward Audit Notes & Dock Inspection Comments
              </label>
              <textarea
                rows={2}
                value={inwardNotes}
                onChange={(e) => setInwardNotes(e.target.value)}
                placeholder="Note any damaged outer cartons or seal verification..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveSubTab('SNAPSHOT')}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-900/30"
              >
                <CheckCircle2 size={16} /> Log Inward & Update Depot Ledger
              </button>
            </div>
          </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 5.2 (B): LOG OUTWARD ALLOCATION & PROOF */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'OUTWARD' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm max-w-4xl mx-auto">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
              <ArrowUpRight size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Log Outward Stock Allocation to Recipients
              </h3>
              <p className="text-xs text-slate-400">
                Allocate stock from {currentDepot.name} pool to Sub-distributors, Commission Agents, Field Reps, or Delivery Vans with explicit proof of receipt.
              </p>
            </div>
          </div>

          <form onSubmit={handleOutwardSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Recipient Type */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Recipient Category / Type
                </label>
                <select
                  value={outwardRecipientType}
                  onChange={(e) => setOutwardRecipientType(e.target.value as RecipientType)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-bold"
                >
                  <option value="COMMISSION_AGENT">Commission Agent (GT Route Loading)</option>
                  <option value="SUB_DISTRIBUTOR">Sub-distributor / Wholesale Hub</option>
                  <option value="INSTITUTION">Institutional Direct Buyer</option>
                  <option value="FIELD_SALES_REP">Field Sales Executive (Spot / Sampling)</option>
                  <option value="DELIVERY_VAN">Delivery Van Team</option>
                </select>
              </div>

              {/* Recipient Selection */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Select Specific Recipient
                </label>
                <select
                  value={outwardRecipientId}
                  onChange={(e) => {
                    setOutwardRecipientId(e.target.value);
                    const ret = retailers.find((r) => r.id === e.target.value);
                    if (ret) setOutwardRecipientCustomName(ret.name);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-medium"
                >
                  <option value="">-- Custom / Walk-in Recipient --</option>
                  {retailers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.beat_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom Recipient Name if not picked from list */}
            {!outwardRecipientId && (
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Recipient Name / Agent Name
                </label>
                <input
                  type="text"
                  value={outwardRecipientCustomName}
                  onChange={(e) => setOutwardRecipientCustomName(e.target.value)}
                  placeholder="e.g. Agent Amit Kumar (GT Route 01)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-medium"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Select Company */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Principal Company
                </label>
                <select
                  value={outwardCompanyId}
                  onChange={(e) => {
                    const newCompId = e.target.value;
                    setOutwardCompanyId(newCompId);
                    const compSkus = skus.filter((s) => s.company_id === newCompId);
                    if (compSkus.length > 0) {
                      setOutwardSkuId(compSkus[0].id);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select SKU Product */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  SKU Product to Issue
                </label>
                <select
                  value={outwardSkuId}
                  onChange={(e) => setOutwardSkuId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                >
                  {skus
                    .filter((s) => !outwardCompanyId || s.company_id === outwardCompanyId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} [Depot Bal: {stockBalanceMap[s.id] || 0} units]
                      </option>
                    ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold text-blue-400">
                  Outward Quantity (Cartons / Units)
                </label>
                <input
                  type="number"
                  value={outwardQty}
                  onChange={(e) => setOutwardQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-blue-500/50 rounded-xl p-2.5 text-white font-mono font-bold text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Reference Doc / Pass # */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Gate Pass / Transfer Note #
                </label>
                <input
                  type="text"
                  value={outwardRefDocId}
                  onChange={(e) => setOutwardRefDocId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  required
                />
              </div>

              {/* Delivery Van / Vehicle # */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Delivery Van / Route Vehicle #
                </label>
                <input
                  type="text"
                  value={outwardVehicleNo}
                  onChange={(e) => setOutwardVehicleNo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                />
              </div>

              {/* Optional Link to Order */}
              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  Link Originating Order # (Optional)
                </label>
                <select
                  value={outwardLinkedOrderId}
                  onChange={(e) => setOutwardLinkedOrderId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                >
                  <option value="">-- Direct Stock Issue (No Order) --</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} ({o.retailer_name_raw})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                Allocation Notes
              </label>
              <textarea
                rows={2}
                value={outwardNotes}
                onChange={(e) => setOutwardNotes(e.target.value)}
                placeholder="Mention route name, agent instructions..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveSubTab('SNAPSHOT')}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-900/30"
              >
                <Send size={16} /> Save Outward & Capture Receiver Proof
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 5.3: MOVEMENT HISTORY & AUDIT TRAIL */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'HISTORY' && (
        <div className="space-y-4">
          {/* History Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Filter Movement Type */}
              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-slate-400" />
                <span className="text-slate-400 font-medium">Type:</span>
                <select
                  value={historyFilterType}
                  onChange={(e) => setHistoryFilterType(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-medium"
                >
                  <option value="ALL">All Movements (Inward & Outward)</option>
                  <option value="INWARD">INWARD (From Principal)</option>
                  <option value="DISPATCH_OUT">DISPATCH OUT (Allocations)</option>
                </select>
              </div>

              {/* Filter Company */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Company:</span>
                <select
                  value={historyFilterCompany}
                  onChange={(e) => setHistoryFilterCompany(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-medium"
                >
                  <option value="ALL">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Ack Status */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Proof Status:</span>
                <select
                  value={historyFilterAck}
                  onChange={(e) => setHistoryFilterAck(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-semibold"
                >
                  <option value="ALL">All Proof Statuses</option>
                  <option value="RECEIVED">RECEIVED (Acknowledged)</option>
                  <option value="PENDING">PENDING (Proof Required)</option>
                  <option value="DISPUTED">DISPUTED (Flagged)</option>
                </select>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search ref #, vehicle, recipient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* Movement History Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-3 px-4">Date & Ref #</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4">Company & SKU</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4">Transporter / Vehicle #</th>
                    <th className="py-3 px-4">Recipient / Source</th>
                    <th className="py-3 px-4">Receiver Proof / Ack</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No stock ledger entries found for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((st) => {
                      const sku = skus.find((s) => s.id === st.sku_id);
                      const comp = companies.find((c) => c.id === (st.company_id || sku?.company_id));
                      const isInward = st.entry_type === 'INWARD' || st.entry_type === 'RETURN';

                      return (
                        <tr
                          key={st.id}
                          className={`hover:bg-slate-800/60 transition-colors ${
                            st.ack_status === 'DISPUTED' ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            {st.reference_doc_id}
                            <div className="text-[10px] text-slate-500 font-sans">
                              {new Date(st.timestamp).toLocaleDateString('en-IN')}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                                isInward
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}
                            >
                              {isInward ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                              {st.entry_type}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-semibold text-slate-200">
                            {sku?.name || 'FMCG Product'}
                            <div className="text-[10px] text-slate-500">{comp?.name || 'Principal'}</div>
                          </td>

                          <td
                            className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                              isInward ? 'text-emerald-400' : 'text-blue-400'
                            }`}
                          >
                            {isInward ? `+${st.quantity}` : `-${st.quantity}`}
                            {st.variance_quantity ? (
                              <div className="text-[10px] text-rose-400 font-normal">
                                Var: {st.variance_quantity}
                              </div>
                            ) : null}
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-300">
                            {st.vehicle_number || 'Depot Dock'}
                          </td>

                          <td className="py-3 px-4 font-medium text-slate-300">
                            {st.recipient_name || 'Principal Factory'}
                            {st.recipient_type && (
                              <div className="text-[10px] text-slate-500 uppercase">{st.recipient_type}</div>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-block w-max ${
                                  st.ack_status === 'RECEIVED'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : st.ack_status === 'DISPUTED'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {st.ack_status || 'RECEIVED'}
                              </span>

                              {st.ack_type && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Via: {st.ack_type}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right space-x-1">
                            {st.entry_type === 'DISPATCH_OUT' && st.ack_status === 'PENDING' && (
                              <button
                                onClick={() => {
                                  setSelectedEntryForAckModal(st);
                                  setReceiverNameInput(st.recipient_name || '');
                                }}
                                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shadow-sm"
                              >
                                Capture Proof
                              </button>
                            )}

                            {st.ack_status !== 'DISPUTED' && (
                              <button
                                onClick={() => {
                                  setDisputingEntry(st);
                                  setDisputeReasonText('');
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-200 border border-slate-700 text-[10px] font-semibold"
                              >
                                Flag Dispute
                              </button>
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

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 5.4: RETURNABLE ASSETS (CRATE TRACKING & LEAKAGE)     */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'CRATES' && (
        <CrateTrackingSection selectedDpId={selectedDpId} />
      )}

      {/* ============================================================= */}
      {/* MODAL 1: CAPTURE RECEIVER ACKNOWLEDGMENT PROOF */}
      {/* ============================================================= */}
      {selectedEntryForAckModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">
                  Stock Handoff Proof
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck size={18} className="text-emerald-400" /> Receiver Proof of Stock Acceptance
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntryForAckModal(null)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Ref / Gate Pass #:</span>
                <span className="font-mono font-bold text-white">{selectedEntryForAckModal.reference_doc_id}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Recipient:</span>
                <span className="font-bold text-emerald-400">{selectedEntryForAckModal.recipient_name}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Allocated Quantity:</span>
                <span className="font-mono font-bold text-blue-400">{selectedEntryForAckModal.quantity} units</span>
              </div>
            </div>

            {/* Select Ack Mode */}
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAckModalMode('SIGNATURE')}
                className={`flex-1 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 ${
                  ackModalMode === 'SIGNATURE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <PenTool size={14} /> Screen Signature
              </button>
              <button
                type="button"
                onClick={() => setAckModalMode('OTP')}
                className={`flex-1 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 ${
                  ackModalMode === 'OTP' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Key size={14} /> Secret OTP / PIN
              </button>
              <button
                type="button"
                onClick={() => setAckModalMode('PHOTO')}
                className={`flex-1 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 ${
                  ackModalMode === 'PHOTO' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera size={14} /> Paper Slip Photo
              </button>
            </div>

            <form onSubmit={handleSaveAck} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-medium">Name of Person Accepting Stock</label>
                <input
                  type="text"
                  value={receiverNameInput}
                  onChange={(e) => setReceiverNameInput(e.target.value)}
                  placeholder="e.g. Commission Agent Amit Kumar / Authorized Rep"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  required
                />
              </div>

              {/* MODE A: DIGITAL SIGNATURE */}
              {ackModalMode === 'SIGNATURE' && (
                <div className="space-y-2">
                  <label className="block text-[11px] text-slate-400 font-medium">
                    Sign on Screen below (Receiver Signature)
                  </label>
                  <div className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-center">
                    <div
                      onClick={() => setSignatureDataUrl('SIG_SVG_ACCEPTED_BY_RECEIVER')}
                      className={`h-24 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                        signatureDataUrl ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-700 hover:border-blue-500'
                      }`}
                    >
                      {signatureDataUrl ? (
                        <div className="text-emerald-400 font-mono font-bold flex items-center gap-2">
                          <CheckCircle2 size={18} /> Digital Signature Captured & Timestamped
                        </div>
                      ) : (
                        <div className="text-slate-500 flex flex-col items-center gap-1">
                          <PenTool size={20} />
                          <span>Click or touch here to record receiver signature</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* MODE B: SECRET OTP / PIN */}
              {ackModalMode === 'OTP' && (
                <div className="space-y-2">
                  <label className="block text-[11px] text-slate-400 font-medium">
                    Enter Receiver 4-Digit Confirmation PIN / OTP
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    placeholder="e.g. 8812"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-lg font-mono font-bold tracking-widest text-emerald-400"
                    required
                  />
                  <p className="text-[10px] text-slate-500 text-center">
                    PIN sent to recipient mobile app / registered phone number.
                  </p>
                </div>
              )}

              {/* MODE C: PAPER SLIP PHOTO */}
              {ackModalMode === 'PHOTO' && (
                <div className="space-y-2">
                  <label className="block text-[11px] text-slate-400 font-medium">
                    Signed Paper Slip Reference / Photo Attachment
                  </label>
                  <input
                    type="text"
                    value={paperPhotoInput}
                    onChange={(e) => setPaperPhotoInput(e.target.value)}
                    placeholder="e.g. Signed_Challan_Slip_8819.jpg"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-400 flex flex-col items-center gap-1">
                    <Camera size={18} className="text-blue-400" />
                    <span>Camera capture active on mobile device.</span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEntryForAckModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
                >
                  <CheckCircle2 size={16} /> Confirm Receiver Acknowledgment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 2: FLAG DISPUTE */}
      {/* ============================================================= */}
      {disputingEntry && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
                <AlertTriangle size={18} /> Flag Movement Dispute
              </h3>
              <button onClick={() => setDisputingEntry(null)} className="text-slate-400 font-bold text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDispute} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Reason for Dispute / Shortage Complaint</label>
                <textarea
                  rows={3}
                  value={disputeReasonText}
                  onChange={(e) => setDisputeReasonText(e.target.value)}
                  placeholder="Describe quantity mismatch, damaged carton, or receiver refusal..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDisputingEntry(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold"
                >
                  Confirm Dispute
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ============================================================= */}
      {/* MODAL 3: INWARD PRINCIPLE PURCHASE ORDER AT DOCK */}
      {/* ============================================================= */}
      {inwardingPO && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 text-slate-200 space-y-5 shadow-2xl shadow-emerald-950/60">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  <ArrowDownRight size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Dock Inward Factory Shipment — {inwardingPO.po_number}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Principal Supplier: <strong className="text-white">{inwardingPO.company_name}</strong> | Location: <strong className="text-emerald-400">{currentDepot.name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInwardingPO(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* SKU Breakdown Table */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Factory Consignment Line Items ({inwardingPO.items.length} SKUs):
              </div>
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-3">SKU Code</th>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3 text-right">Inward Qty</th>
                      <th className="py-2.5 px-3 text-right">Landing Rate</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {inwardingPO.items.map((it: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40 text-[11px] font-mono">
                        <td className="py-2 px-3 font-bold text-blue-400">{it.sku_code}</td>
                        <td className="py-2 px-3 font-sans font-semibold text-white">{it.sku_name}</td>
                        <td className="py-2 px-3 text-right font-bold text-amber-300">{it.demanded_quantity.toLocaleString()} pcs</td>
                        <td className="py-2 px-3 text-right text-slate-300">₹{it.master_landing_price}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-400">₹{it.total_amount.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dock Receipt Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Factory Delivery Challan / LR #</label>
                <input
                  type="text"
                  value={poDockChallan}
                  onChange={(e) => setPoDockChallan(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Transporter Truck / Vehicle #</label>
                <input
                  type="text"
                  value={poDockVehicle}
                  onChange={(e) => setPoDockVehicle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                  required
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block text-slate-400 mb-1 font-semibold">Dock Inspection & Seal Verification Notes</label>
              <textarea
                rows={2}
                value={poDockNotes}
                onChange={(e) => setPoDockNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400">Total Inward Units: </span>
                <strong className="text-amber-300 font-mono text-sm">{inwardingPO.total_quantity.toLocaleString()} pcs</strong>
              </div>
              <div>
                <span className="text-slate-400">Total Depot Stock Asset Value: </span>
                <strong className="text-emerald-400 font-mono text-sm">₹{inwardingPO.total_amount.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInwardingPO(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  inwardPOStock(
                    inwardingPO.id,
                    selectedDpId,
                    poDockChallan || `CH-${inwardingPO.company_code}-DOCK`,
                    poDockVehicle || 'TRUCK-INWARD',
                    poDockNotes || 'Dock inward verified and inspected.'
                  );
                  alert(`✅ Purchase Order ${inwardingPO.po_number} successfully inwarded!\n\n• ${inwardingPO.items.length} SKUs credited to Depot ${currentDepot.name}\n• ${inwardingPO.total_quantity.toLocaleString()} units added to ledger\n• Status updated to INWARDED_AT_DEPOT.`);
                  setInwardingPO(null);
                  setActiveSubTab('SNAPSHOT');
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/40 flex items-center gap-2"
              >
                <CheckCircle2 size={15} /> Confirm Physical Inward & Update Depot Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
