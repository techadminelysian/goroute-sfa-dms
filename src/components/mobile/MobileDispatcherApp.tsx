import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import {
  StockLedgerEntry,
  Order,
  RecipientType
} from '../../types';
import {
  Warehouse,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  Building2,
  Users,
  MapPin,
  PenTool,
  Key,
  Camera,
  AlertTriangle,
  FileText,
  Boxes,
  Send,
  Layers,
  CheckSquare,
  ChevronRight,
  ChevronDown,
  AlertOctagon,
  X,
  Sun,
  Store,
  Building,
  Plus,
  Minus,
  SlidersHorizontal,
  Filter,
  ShieldAlert,
  Edit3,
  Languages
} from 'lucide-react';

export interface DemandSKUItem {
  skuId: string;
  skuName: string;
  companyCode: string;
  companyName: string;
  demandedQty: number;
  unitPrice: number;
  totalValue: number;
}

export interface DemandGroup {
  groupId: string;
  recipientType: 'COMMISSION_AGENT' | 'SUB_DISTRIBUTOR' | 'DELIVERY_EXECUTIVE' | 'INSTITUTION';
  recipientName: string;
  recipientCode: string;
  beatRoute: string;
  taggedOutletsCount: number;
  orders: Order[];
  totalDemandValue: number;
  skuSummary: Record<string, DemandSKUItem>;
}

export const MobileDispatcherApp: React.FC = () => {
  const {
    activeTenant,
    dispatchPoints,
    companies,
    skus,
    stockLedger,
    orders,
    retailers,
    users,
    addStockLedgerEntry,
    updateStockLedgerAck,
    updateOrderStatus,
    language,
    setLanguage
  } = useAppStore();

  // Selected Warehouse / Depot ID (Defaults to first DP e.g. Central Depot)
  const [selectedDpId, setSelectedDpId] = useState<string>(dispatchPoints[0]?.id || 'dp_central');

  // Active Main Navigation Tab:
  // 'CONSOLIDATED_DEMAND' | 'INWARD_DOCK' | 'INSTITUTIONAL_ORDERS' | 'PENDING_PROOFS' | 'WAREHOUSE_STOCK'
  const [activeTab, setActiveTab] = useState<
    'CONSOLIDATED_DEMAND' | 'INWARD_DOCK' | 'INSTITUTIONAL_ORDERS' | 'PENDING_PROOFS' | 'WAREHOUSE_STOCK'
  >('CONSOLIDATED_DEMAND');

  // Filter for Consolidated Demand Recipient Category
  // 'ALL' | 'COMMISSION_AGENT' | 'SUB_DISTRIBUTOR' | 'DELIVERY_EXECUTIVE'
  const [recipientFilter, setRecipientFilter] = useState<string>('ALL');

  // Search filter for demand list
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expanded Accordion state for demand groups
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Shortage / Excess Adjustment Modal State
  const [adjustingGroup, setAdjustingGroup] = useState<DemandGroup | null>(null);
  // Map of sku_id -> pushed quantity
  const [adjustedQtyMap, setAdjustedQtyMap] = useState<Record<string, number>>({});
  // Map of sku_id -> variance reason
  const [varianceReasonMap, setVarianceReasonMap] = useState<Record<string, string>>({});
  const [allocationVehicleNo, setAllocationVehicleNo] = useState<string>('KA-01-EQ-9012');
  const [allocationNotes, setAllocationNotes] = useState<string>('Morning stock demand allocation');

  // Acknowledgment / Gate Pass Proof Modal State
  const [ackEntry, setAckEntry] = useState<StockLedgerEntry | null>(null);
  const [ackMode, setAckMode] = useState<'SIGNATURE' | 'OTP' | 'PHOTO'>('SIGNATURE');
  const [signerName, setSignerName] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [photoRef, setPhotoRef] = useState('');
  const [sigSvg, setSigSvg] = useState('');

  // Form State for Inward Factory Dock GRN Entry
  const [inwardCompanyId, setInwardCompanyId] = useState(companies[0]?.id || '');
  const [inwardSkuId, setInwardSkuId] = useState(skus[0]?.id || '');
  const [inwardExpectedQty, setInwardExpectedQty] = useState(1000);
  const [inwardActualQty, setInwardActualQty] = useState(990);
  const [inwardChallanNo, setInwardChallanNo] = useState('FAC-INV-2026-9041');
  const [inwardTransporter, setInwardTransporter] = useState('VRL Logistics Freight');
  const [inwardVehicleNo, setInwardVehicleNo] = useState('HR-38-X-9012');
  const [inwardDamageReason, setInwardDamageReason] = useState('10 cartons damaged during transit transit transit');
  const [inwardNotes, setInwardNotes] = useState('Spot verification done at warehouse dock. 10 cases damaged, 990 good cases credited.');

  const currentDepot = dispatchPoints.find((dp) => dp.id === selectedDpId) || dispatchPoints[0];

  // Calculate live warehouse stock ledger for selected depot
  const depotLedger = stockLedger.filter((st) => st.dispatch_point_id === selectedDpId);
  const stockBalanceMap: Record<string, number> = {};

  depotLedger.forEach((st) => {
    const curr = stockBalanceMap[st.sku_id] || 0;
    if (st.entry_type === 'INWARD' || st.entry_type === 'RETURN') {
      stockBalanceMap[st.sku_id] = curr + st.quantity;
    } else {
      stockBalanceMap[st.sku_id] = Math.max(0, curr - st.quantity);
    }
  });

  // Pending Receiver Proofs for Outward Movements at this Depot
  const pendingProofEntries = depotLedger.filter(
    (st) => st.entry_type === 'DISPATCH_OUT' && st.ack_status === 'PENDING'
  );

  // Orders assigned to this depot that were verified/punched by Billing Executive
  const pendingOrdersForDepot = orders.filter(
    (o) => o.dispatch_point_id === selectedDpId && (o.status === 'PUNCHED' || o.status === 'VERIFIED_BY_BILLING' || o.status === 'APPROVED')
  );

  // Separate Institutional Direct Orders vs General Beat Orders
  const institutionalOrders = pendingOrdersForDepot.filter(
    (o) => o.channel === 'INSTITUTIONAL' || o.retailer_name_raw.toLowerCase().includes('hotel') || o.retailer_name_raw.toLowerCase().includes('hospital') || o.retailer_name_raw.toLowerCase().includes('canteen')
  );

  const beatDemandOrders = pendingOrdersForDepot.filter(
    (o) => !institutionalOrders.some((io) => io.id === o.id)
  );

  // --------------------------------------------------------------------------
  // Demand Aggregation Engine
  // Consolidates orders pushed by Billing Executive into entity-wise demand groups:
  // - Commission Agents
  // - Sub-Distributors
  // - Delivery Executives (Van Sales Drivers)
  // --------------------------------------------------------------------------
  const demandGroupMap: Record<string, DemandGroup> = {};

  beatDemandOrders.forEach((ord) => {
    let groupKey = 'GRP_GENERAL';
    let recipientType: 'COMMISSION_AGENT' | 'SUB_DISTRIBUTOR' | 'DELIVERY_EXECUTIVE' | 'INSTITUTION' = 'DELIVERY_EXECUTIVE';
    let recipientName = 'Delivery Executive - Route 01';
    let recipientCode = 'DEL-EXEC-01';
    let outletCount = 45;

    if (ord.commission_agent_id) {
      groupKey = `AGT_${ord.commission_agent_id}`;
      recipientType = 'COMMISSION_AGENT';
      const agentUser = (users || []).find((u) => u.id === ord.commission_agent_id);
      const agentDisplayName = ord.commission_agent_name || agentUser?.name || 'Commission Agent Hub';
      recipientName = `Agent ${agentDisplayName}`;
      recipientCode = `AGT-${ord.commission_agent_id.slice(-4).toUpperCase()}`;
      outletCount = 58;
    } else if (
      ord.retailer_name_raw.toLowerCase().includes('agency') ||
      ord.retailer_name_raw.toLowerCase().includes('distributor') ||
      ord.retailer_name_raw.toLowerCase().includes('traders')
    ) {
      groupKey = `SUBD_${ord.retailer_name_raw.replace(/\s+/g, '_')}`;
      recipientType = 'SUB_DISTRIBUTOR';
      recipientName = `${ord.retailer_name_raw} (Sub-Distributor)`;
      recipientCode = 'SUB-DIST-04';
      outletCount = 64;
    } else {
      groupKey = `VAN_${ord.beat_name.replace(/\s+/g, '_') || 'Route_Central'}`;
      recipientType = 'DELIVERY_EXECUTIVE';
      recipientName = `Delivery Executive - ${ord.beat_name || 'Van Beat 02'}`;
      recipientCode = 'VAN-EXEC-02';
      outletCount = 42;
    }

    if (!demandGroupMap[groupKey]) {
      demandGroupMap[groupKey] = {
        groupId: groupKey,
        recipientType: recipientType,
        recipientName: recipientName,
        recipientCode: recipientCode,
        beatRoute: ord.beat_name || 'Central FMCG Route',
        taggedOutletsCount: outletCount,
        orders: [],
        totalDemandValue: 0,
        skuSummary: {}
      };
    }

    const grp = demandGroupMap[groupKey];
    grp.orders.push(ord);
    grp.totalDemandValue += ord.total_amount;

    (ord.lines || []).forEach((l) => {
      const sku = skus.find((s) => s.id === l.sku_id);
      const comp = companies.find((c) => c.id === sku?.company_id);
      const companyCode = comp ? comp.code : 'SKU';
      const companyName = comp ? comp.name : 'Principal';

      if (!grp.skuSummary[l.sku_id]) {
        grp.skuSummary[l.sku_id] = {
          skuId: l.sku_id,
          skuName: l.sku_name,
          companyCode: companyCode,
          companyName: companyName,
          demandedQty: 0,
          unitPrice: l.unit_price,
          totalValue: 0
        };
      }

      grp.skuSummary[l.sku_id].demandedQty += l.quantity;
      grp.skuSummary[l.sku_id].totalValue += l.total;
    });
  });

  const allDemandGroups = Object.values(demandGroupMap);

  // Filter demand groups by recipient type & search query
  const filteredDemandGroups = allDemandGroups.filter((grp) => {
    if (recipientFilter !== 'ALL' && grp.recipientType !== recipientFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = grp.recipientName.toLowerCase().includes(q);
      const matchBeat = grp.beatRoute.toLowerCase().includes(q);
      if (!matchName && !matchBeat) return false;
    }
    return true;
  });

  // Open Shortage / Excess Allocation Modal
  const handleOpenAllocationModal = (group: DemandGroup) => {
    setAdjustingGroup(group);
    const initialQtyMap: Record<string, number> = {};
    const initialReasonMap: Record<string, string> = {};

    Object.entries(group.skuSummary).forEach(([skuId, item]: [string, DemandSKUItem]) => {
      const avail = stockBalanceMap[skuId] || 0;
      // Default pushed quantity is capped at available stock if shortage exists
      const cappedQty = Math.min(item.demandedQty, avail);
      initialQtyMap[skuId] = cappedQty;

      if (item.demandedQty > avail) {
        initialReasonMap[skuId] = 'Factory Supply Shortage';
      } else {
        initialReasonMap[skuId] = 'Full Demand Satisfied';
      }
    });

    setAdjustedQtyMap(initialQtyMap);
    setVarianceReasonMap(initialReasonMap);
    setAllocationVehicleNo(`GATE-PASS-${Math.floor(1000 + Math.random() * 9000)}`);
    setAllocationNotes(`Stock allocation for ${group.recipientName}`);
  };

  // Submit Shortage / Excess Outward Allocation
  const handleConfirmOutwardAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingGroup) return;

    const outpassNo = `OUTPASS-2026-${Math.floor(10000 + Math.random() * 90000)}`;

    // Create stock ledger entries for each SKU
    Object.entries(adjustingGroup.skuSummary).forEach(([skuId, item]: [string, DemandSKUItem]) => {
      const pushedQty = adjustedQtyMap[skuId] !== undefined ? adjustedQtyMap[skuId] : item.demandedQty;
      const variance = pushedQty - item.demandedQty; // Negative = Shortage, Positive = Excess
      const vReason = varianceReasonMap[skuId] || (variance < 0 ? 'Shortage Allocation' : 'Normal');

      const sku = skus.find((s) => s.id === skuId);

      const newEntry: StockLedgerEntry = {
        id: `stk_out_${Date.now()}_${skuId}`,
        tenant_id: activeTenant.id,
        dispatch_point_id: selectedDpId,
        company_id: sku?.company_id,
        sku_id: skuId,
        entry_type: 'DISPATCH_OUT',
        quantity: pushedQty,
        expected_quantity: item.demandedQty,
        variance_quantity: variance,
        variance_reason: vReason,
        reference_doc_type: 'GATE_PASS',
        reference_doc_id: outpassNo,
        vehicle_number: allocationVehicleNo,
        recipient_type: adjustingGroup.recipientType,
        recipient_id: adjustingGroup.groupId,
        recipient_name: adjustingGroup.recipientName,
        timestamp: new Date().toISOString(),
        performed_by_user_id: 'usr_dispatcher',
        dispatcher_name: currentDepot.supervisor_name,
        notes: `${allocationNotes} | Gate Pass: ${outpassNo}`,
        ack_status: 'PENDING',
        ack_type: 'DIGITAL_SIGNATURE'
      };

      addStockLedgerEntry(newEntry);
    });

    // Update status of all linked orders in this group to DISPATCHED
    adjustingGroup.orders.forEach((ord) => {
      updateOrderStatus(ord.id, 'DISPATCHED');
    });

    alert(
      `Outward Stock Gate Pass ${outpassNo} Issued for ${adjustingGroup.recipientName}!\n\n` +
        `Warehouse stock debited. Gate Pass generated for vehicle ${allocationVehicleNo}.\n` +
        `Proof of handover queued for signature / photo verification.`
    );

    setAdjustingGroup(null);
    setActiveTab('PENDING_PROOFS');
  };

  // Direct Institutional Order Dispatch Handler
  const handleDispatchInstitutionalOrder = (order: Order) => {
    let hasStockIssue = false;
    (order.lines || []).forEach((line) => {
      const available = stockBalanceMap[line.sku_id] || 0;
      if (line.quantity > available) {
        hasStockIssue = true;
      }
    });

    if (
      hasStockIssue &&
      !confirm(
        `Warning: Stock for Institutional Order ${order.order_number} exceeds available warehouse balance. Proceed with partial dispatch?`
      )
    ) {
      return;
    }

    const outpassNo = `OUTPASS-INST-${Math.floor(1000 + Math.random() * 9000)}`;

    (order.lines || []).forEach((line) => {
      const sku = skus.find((s) => s.id === line.sku_id);
      const newEntry: StockLedgerEntry = {
        id: `stk_out_inst_${Date.now()}_${line.id}`,
        tenant_id: activeTenant.id,
        dispatch_point_id: selectedDpId,
        company_id: sku?.company_id || order.company_id,
        sku_id: line.sku_id,
        entry_type: 'DISPATCH_OUT',
        quantity: line.quantity,
        expected_quantity: line.quantity,
        variance_quantity: 0,
        reference_doc_type: 'GATE_PASS',
        reference_doc_id: outpassNo,
        vehicle_number: 'INSTITUTIONAL-DIRECT-TRUCK',
        recipient_type: 'INSTITUTION',
        recipient_id: order.retailer_id || undefined,
        recipient_name: order.retailer_name_raw,
        linked_order_id: order.id,
        timestamp: new Date().toISOString(),
        performed_by_user_id: 'usr_dispatcher',
        dispatcher_name: currentDepot.supervisor_name,
        notes: `Direct Institutional Order Dispatch for ${order.retailer_name_raw} (${outpassNo})`,
        ack_status: 'PENDING',
        ack_type: 'DIGITAL_SIGNATURE'
      };

      addStockLedgerEntry(newEntry);
    });

    updateOrderStatus(order.id, 'DISPATCHED');
    alert(`Direct Institutional Order #${order.order_number} Dispatched!\nGate Pass ${outpassNo} issued.`);
    setActiveTab('PENDING_PROOFS');
  };

  // Submit Inward Factory Dock Consignment Entry
  const handleInwardSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const targetSku = skus.find((s) => s.id === inwardSkuId);
    const variance = Number(inwardActualQty) - Number(inwardExpectedQty);

    const newEntry: StockLedgerEntry = {
      id: `stk_in_${Date.now()}`,
      tenant_id: activeTenant.id,
      dispatch_point_id: selectedDpId,
      company_id: inwardCompanyId,
      sku_id: inwardSkuId,
      entry_type: 'INWARD',
      quantity: Number(inwardActualQty),
      expected_quantity: Number(inwardExpectedQty),
      variance_quantity: variance,
      variance_reason: variance < 0 ? inwardDamageReason : 'Factory Over-supply',
      reference_doc_type: 'INWARD_CHALLAN',
      reference_doc_id: inwardChallanNo || `FAC-INV-${Math.floor(1000 + Math.random() * 9000)}`,
      vehicle_number: inwardVehicleNo || 'TRUCK-DOCK-01',
      timestamp: new Date().toISOString(),
      performed_by_user_id: 'usr_dispatcher',
      dispatcher_name: currentDepot.supervisor_name,
      notes: `${inwardNotes} | Transporter: ${inwardTransporter}`,
      ack_status: 'RECEIVED',
      ack_type: 'PAPER_PHOTO',
      ack_by_user_name: currentDepot.supervisor_name,
      ack_timestamp: new Date().toISOString()
    };

    addStockLedgerEntry(newEntry);
    alert(
      `Inward Factory Stock Verified & Credited!\n\n` +
        `${targetSku?.name} (+${newEntry.quantity} pcs) credited into ${currentDepot.name}.\n` +
        `GRN Document ${newEntry.reference_doc_id} created.`
    );
    setActiveTab('WAREHOUSE_STOCK');
  };

  // Save Receiver Acknowledgment Proof
  const handleSaveProof = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackEntry) return;

    updateStockLedgerAck(
      ackEntry.id,
      'RECEIVED',
      ackMode === 'SIGNATURE' ? 'DIGITAL_SIGNATURE' : ackMode === 'OTP' ? 'OTP_PIN' : 'PAPER_PHOTO',
      signerName || 'Receiver Staff',
      photoRef || 'Signed_Outpass_Gate_Slip.jpg',
      sigSvg || 'SVG_SIG_DATA'
    );

    alert(`Gate Pass Handover Proof Captured!\nOutward entry ${ackEntry.reference_doc_id} confirmed RECEIVED.`);
    setAckEntry(null);
    setSignerName('');
    setOtpValue('');
    setPhotoRef('');
    setSigSvg('');
  };

  return (
    <div className="max-w-md mx-auto bg-slate-950 border border-slate-800 rounded-3xl p-4 text-slate-200 shadow-2xl space-y-4">
      {/* Handheld Warehouse Dispatcher Header Banner */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md">
              <Warehouse size={18} />
            </div>
            <div>
              <div className="text-xs font-bold text-white">{activeTenant.name}</div>
              <div className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                <ShieldCheck size={11} /> Warehouse Dispatch Controller
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs shadow-xs">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-0.5 ${
                  language === 'en'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Languages size={10} />
                <span>EN</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                  language === 'hi'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>हिंदी</span>
              </button>
            </div>

            <span className="px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Dock Terminal
            </span>
          </div>
        </div>

        {/* Warehouse Location Switcher */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1 text-[11px]">
            <MapPin size={13} className="text-amber-400" /> Active Warehouse:
          </span>
          <select
            value={selectedDpId}
            onChange={(e) => setSelectedDpId(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold"
          >
            {dispatchPoints.map((dp) => (
              <option key={dp.id} value={dp.id}>
                {dp.name} ({dp.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Role Mandate Notice Callout */}
      <div className="p-2.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-300 flex items-start gap-2">
        <Building2 size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white block font-bold">Warehouse Stock Controller Role:</strong>
          Spot entry factory inward GRNs, fulfill consolidated demand pushed by Billing Exec (Sub-Distributors, Agents, Delivery Executives), adjust shortages/excess, and issue signed Outward Gate Passes.
        </div>
      </div>

      {/* Main Sub-Navigation Tabs */}
      <div className="grid grid-cols-5 gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-[9px] font-bold">
        <button
          onClick={() => setActiveTab('CONSOLIDATED_DEMAND')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'CONSOLIDATED_DEMAND'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Send size={12} />
          <span>{language === 'hi' ? 'जावक मांग' : `Outward (${allDemandGroups.length})`}</span>
        </button>

        <button
          onClick={() => setActiveTab('INWARD_DOCK')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'INWARD_DOCK'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ArrowDownRight size={12} />
          <span>{language === 'hi' ? 'आवक डॉक' : 'Inward Dock'}</span>
        </button>

        <button
          onClick={() => setActiveTab('INSTITUTIONAL_ORDERS')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'INSTITUTIONAL_ORDERS'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building size={12} />
          <span>{language === 'hi' ? 'सीधा' : `Direct (${institutionalOrders.length})`}</span>
        </button>

        <button
          onClick={() => setActiveTab('PENDING_PROOFS')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'PENDING_PROOFS'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Clock size={12} />
          <span>{language === 'hi' ? 'प्रमाण' : `Proofs (${pendingProofEntries.length})`}</span>
        </button>

        <button
          onClick={() => setActiveTab('WAREHOUSE_STOCK')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'WAREHOUSE_STOCK'
              ? 'bg-slate-700 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Boxes size={12} />
          <span>{language === 'hi' ? 'स्टॉक' : 'Inventory'}</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: CONSOLIDATED OUTWARD DEMAND & ALLOCATION (AIRTIGHT) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'CONSOLIDATED_DEMAND' && (
        <div className="space-y-3 text-xs">
          {/* Header Banner & Recipient Category Filters */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs text-amber-300">
                <Sun size={15} className="text-amber-400" /> Billing Exec Verified Demand Sheet
              </span>
              <span className="text-[10px] font-mono text-slate-400 font-semibold">
                {allDemandGroups.length} Allocation Queues
              </span>
            </div>

            <p className="text-[10px] text-slate-400 leading-tight">
              Pushed by Billing Executive from previous-day orders. Company & SKU-wise demand for Sub-Distributors, Agents & Delivery Execs.
            </p>

            {/* Recipient Category Filter Buttons */}
            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[9px] font-bold">
              <button
                type="button"
                onClick={() => setRecipientFilter('ALL')}
                className={`py-1 rounded-lg ${
                  recipientFilter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                All ({allDemandGroups.length})
              </button>
              <button
                type="button"
                onClick={() => setRecipientFilter('COMMISSION_AGENT')}
                className={`py-1 rounded-lg ${
                  recipientFilter === 'COMMISSION_AGENT' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                Agents
              </button>
              <button
                type="button"
                onClick={() => setRecipientFilter('SUB_DISTRIBUTOR')}
                className={`py-1 rounded-lg ${
                  recipientFilter === 'SUB_DISTRIBUTOR' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                Sub-Dists
              </button>
              <button
                type="button"
                onClick={() => setRecipientFilter('DELIVERY_EXECUTIVE')}
                className={`py-1 rounded-lg ${
                  recipientFilter === 'DELIVERY_EXECUTIVE' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                Van Execs
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search recipient name or route..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>
          </div>

          {/* List of Consolidated Recipient Demand Groups */}
          <div className="space-y-3">
            {filteredDemandGroups.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl text-xs">
                No pending outward stock demands for selected filter at {currentDepot.name}.
              </div>
            ) : (
              filteredDemandGroups.map((group) => {
                const isExpanded = expandedGroupId === group.groupId;

                return (
                  <div
                    key={group.groupId}
                    className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-md"
                  >
                    {/* Header Details */}
                    <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-1.5">
                          {group.recipientType === 'COMMISSION_AGENT' && <Users size={14} className="text-amber-400" />}
                          {group.recipientType === 'SUB_DISTRIBUTOR' && <Store size={14} className="text-blue-400" />}
                          {group.recipientType === 'DELIVERY_EXECUTIVE' && <Truck size={14} className="text-emerald-400" />}
                          {group.recipientName}
                        </div>

                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="text-slate-300 font-semibold">{group.beatRoute}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-semibold">{group.taggedOutletsCount} Outlets</span>
                          <span>•</span>
                          <span className="text-blue-300">{group.orders.length} Store Orders</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-bold text-emerald-400 text-xs">
                          ₹{group.totalDemandValue.toLocaleString('en-IN')}
                        </div>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {group.recipientType.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Company & SKU Demand Breakdown */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>SKU Demand (Company-Wise):</span>
                        <span className="text-slate-500 font-mono">Stock Check</span>
                      </div>

                      {Object.entries(group.skuSummary).map(([skuId, item]: [string, DemandSKUItem]) => {
                        const avail = stockBalanceMap[skuId] || 0;
                        const isShort = item.demandedQty > avail;

                        return (
                          <div
                            key={skuId}
                            className="p-2 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-[11px]"
                          >
                            <div>
                              <div className="font-bold text-slate-200 flex items-center gap-1">
                                {item.skuName}
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  {item.companyCode}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Demanded: <strong className="text-white">{item.demandedQty} pcs</strong> | Depot Bal:{' '}
                                <strong className={isShort ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                                  {avail} pcs
                                </strong>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-mono font-bold text-emerald-400">
                                ₹{item.totalValue.toLocaleString('en-IN')}
                              </div>
                              {isShort && (
                                <span className="text-[9px] font-bold text-rose-400 flex items-center gap-0.5 justify-end">
                                  <AlertTriangle size={10} /> Shortage
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expandable Order Breakdown */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedGroupId(isExpanded ? null : group.groupId)}
                        className="w-full py-1.5 px-2 bg-slate-950 border border-slate-800 rounded-xl text-[10px] text-slate-400 hover:text-white flex items-center justify-between"
                      >
                        <span>
                          {isExpanded ? 'Hide' : 'View'} {group.orders.length} Store Orders Breakdown
                        </span>
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-amber-500/40">
                          {group.orders.map((ord) => (
                            <div
                              key={ord.id}
                              className="p-2 bg-slate-950/80 rounded-lg text-[10px] flex items-center justify-between"
                            >
                              <div>
                                <div className="font-bold text-slate-300">{ord.retailer_name_raw}</div>
                                <div className="text-[9px] text-slate-500 font-mono">
                                  Order #{ord.order_number} ({(ord.lines || []).length} lines)
                                </div>
                              </div>
                              <span className="font-mono text-emerald-400 font-bold">
                                ₹{ord.total_amount.toLocaleString('en-IN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Outward Stock Allocation & Shortage/Excess Adjustment Button */}
                    <button
                      onClick={() => handleOpenAllocationModal(group)}
                      className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-900/30"
                    >
                      <SlidersHorizontal size={15} /> Review Demand & Adjust Shortage/Excess
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: INWARD FACTORY DOCK LOGGING (SPOT GRN) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'INWARD_DOCK' && (
        <form onSubmit={handleInwardSubmit} className="space-y-3 text-xs">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
            <h3 className="font-bold text-white flex items-center gap-1.5 text-xs text-emerald-400">
              <ArrowDownRight size={15} /> Factory Inward Consignment Verification
            </h3>
            <p className="text-[10px] text-slate-400">
              Spot entry for stock arriving from manufacturing plant/C&F at {currentDepot.name} dock.
            </p>
          </div>

          <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                Principal FMCG Company
              </label>
              <select
                value={inwardCompanyId}
                onChange={(e) => setInwardCompanyId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                Product SKU
              </label>
              <select
                value={inwardSkuId}
                onChange={(e) => setInwardSkuId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white"
              >
                {skus
                  .filter((s) => !inwardCompanyId || s.company_id === inwardCompanyId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) - Landing ₹{s.landing_price}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Challan / Invoice Qty
                </label>
                <input
                  type="number"
                  value={inwardExpectedQty}
                  onChange={(e) => setInwardExpectedQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono font-bold text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Actual Physical Received
                </label>
                <input
                  type="number"
                  value={inwardActualQty}
                  onChange={(e) => setInwardActualQty(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono font-bold text-emerald-400"
                  required
                />
              </div>
            </div>

            {/* Inward Shortage / Damage Callout */}
            {inwardActualQty < inwardExpectedQty && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-500/30 rounded-xl space-y-1.5">
                <div className="text-[10px] font-bold text-rose-300 flex items-center gap-1">
                  <AlertTriangle size={12} /> Transit Shortage Detected ({inwardExpectedQty - inwardActualQty} pcs)
                </div>
                <input
                  type="text"
                  value={inwardDamageReason}
                  onChange={(e) => setInwardDamageReason(e.target.value)}
                  placeholder="Reason for shortage / transit damage..."
                  className="w-full bg-slate-950 border border-rose-500/40 rounded-lg p-1.5 text-xs text-rose-200"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                Factory Invoice # & Transport Details
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={inwardChallanNo}
                  onChange={(e) => setInwardChallanNo(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white font-mono"
                  placeholder="Challan / LR #"
                  required
                />
                <input
                  type="text"
                  value={inwardVehicleNo}
                  onChange={(e) => setInwardVehicleNo(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white font-mono"
                  placeholder="Truck Vehicle #"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                Transporter Name
              </label>
              <input
                type="text"
                value={inwardTransporter}
                onChange={(e) => setInwardTransporter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                placeholder="Logistics Agency Name"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                Dock Inspection Notes
              </label>
              <textarea
                rows={2}
                value={inwardNotes}
                onChange={(e) => setInwardNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={15} /> Confirm GRN & Credit Warehouse Inventory
            </button>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: INDIVIDUAL & INSTITUTIONAL DIRECT ORDERS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'INSTITUTIONAL_ORDERS' && (
        <div className="space-y-3 text-xs">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
            <h3 className="font-bold text-white flex items-center gap-1.5 text-xs text-purple-400">
              <Building size={15} /> Direct Institutional & Corporate Orders
            </h3>
            <p className="text-[10px] text-slate-400">
              Approved bulk orders (Hotels, Hospitals, Canteens, B2B Clients) pushed directly by Billing Executive.
            </p>
          </div>

          <div className="space-y-2.5">
            {institutionalOrders.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl text-xs">
                No direct institutional orders pending dispatch at {currentDepot.name}.
              </div>
            ) : (
              institutionalOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <div className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Building size={14} className="text-purple-400" />
                        {ord.retailer_name_raw}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Order #{ord.order_number} | Channel: Institutional
                      </div>
                    </div>

                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Approved
                    </span>
                  </div>

                  {/* Line Items */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Bulk Order SKUs:
                    </span>

                    {(ord.lines || []).map((line) => {
                      const sku = skus.find((s) => s.id === line.sku_id);
                      const comp = companies.find((c) => c.id === sku?.company_id);
                      const avail = stockBalanceMap[line.sku_id] || 0;
                      const isShort = line.quantity > avail;

                      return (
                        <div
                          key={line.id}
                          className="p-2 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <div className="font-bold text-slate-200 flex items-center gap-1">
                              {line.sku_name}
                              {comp && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  {comp.code}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Required: <strong className="text-white">{line.quantity} pcs</strong> | Depot Bal:{' '}
                              <strong className={isShort ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                                {avail} pcs
                              </strong>
                            </div>
                          </div>

                          <div className="text-right font-mono font-bold text-emerald-400">
                            ₹{line.total.toLocaleString('en-IN')}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Direct Gate Pass & Outward Button */}
                  <button
                    onClick={() => handleDispatchInstitutionalOrder(ord)}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/30"
                  >
                    <Truck size={15} /> Issue Direct Institutional Gate Pass
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: RECEIVER PROOFS & GATE PASS CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'PENDING_PROOFS' && (
        <div className="space-y-3 text-xs">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5 text-xs text-amber-400">
              <Clock size={15} /> Pending Receiver Handover Proofs
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {pendingProofEntries.length} Gate Passes
            </span>
          </div>

          <div className="space-y-2">
            {pendingProofEntries.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl text-xs">
                All outward movement gate passes have confirmed receiver signatures / proof slips!
              </div>
            ) : (
              pendingProofEntries.map((st) => (
                <div
                  key={st.id}
                  className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <Truck size={14} className="text-amber-400" />
                        {st.recipient_name || 'Sub-Distributor / Agent'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Outpass #: <strong className="text-amber-300">{st.reference_doc_id}</strong> | Vehicle: {st.vehicle_number || 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Quantity: {st.quantity} pcs {st.variance_quantity ? `(Variance: ${st.variance_quantity})` : ''}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setAckEntry(st);
                        setSignerName(st.recipient_name || '');
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md flex items-center gap-1"
                    >
                      <PenTool size={13} /> Capture Proof
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: WAREHOUSE LIVE INVENTORY LEDGER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'WAREHOUSE_STOCK' && (
        <div className="space-y-2.5 text-xs">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs text-emerald-400">
                <Boxes size={15} /> Real-time Warehouse Inventory Ledger
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">
                {currentDepot.name}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Live Stock = Inward GRNs - Dispatched Gate Passes
            </p>
          </div>

          {skus.map((s) => {
            const comp = companies.find((c) => c.id === s.company_id);
            const bal = stockBalanceMap[s.id] || 0;

            return (
              <div
                key={s.id}
                className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between shadow-sm"
              >
                <div>
                  <div className="font-bold text-white text-xs">{s.name}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                    <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                      {comp?.code}
                    </span>
                    <span>Code: {s.code}</span>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className={`font-extrabold text-sm ${bal > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {bal.toLocaleString('en-IN')} pcs
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Val: ₹{(bal * s.landing_price).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: SHORTAGE & EXCESS OUTWARD ALLOCATION ADJUSTMENT */}
      {/* ------------------------------------------------------------- */}
      {adjustingGroup && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-4 text-slate-200 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-xs flex items-center gap-1.5 text-amber-300">
                  <SlidersHorizontal size={15} /> Review Demand & Adjust Allocation
                </h3>
                <div className="text-[10px] text-slate-400">
                  Target: <strong className="text-white">{adjustingGroup.recipientName}</strong>
                </div>
              </div>
              <button
                onClick={() => setAdjustingGroup(null)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-[10px] text-slate-400">
              Enter exact stock being pushed outward against demanded quantities. Adjust for warehouse shortages or buffer excess.
            </p>

            <form onSubmit={handleConfirmOutwardAllocation} className="space-y-3 text-xs">
              {/* SKU-by-SKU Allocation Matrix */}
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {Object.entries(adjustingGroup.skuSummary).map(([skuId, item]: [string, DemandSKUItem]) => {
                  const avail = stockBalanceMap[skuId] || 0;
                  const currentPushed = adjustedQtyMap[skuId] !== undefined ? adjustedQtyMap[skuId] : item.demandedQty;
                  const variance = currentPushed - item.demandedQty;

                  return (
                    <div
                      key={skuId}
                      className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white text-[11px]">{item.skuName}</div>
                          <div className="text-[9px] text-slate-400 font-mono">
                            Demanded: <strong className="text-amber-300">{item.demandedQty} pcs</strong> | Depot Bal: {avail} pcs
                          </div>
                        </div>

                        {/* Live Variance Badge */}
                        <div className="text-right">
                          {variance === 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Exact (100%)
                            </span>
                          ) : variance < 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Shortage ({variance} pcs)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              Excess (+{variance} pcs)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity Input Stepper */}
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div>
                          <label className="block text-[9px] text-slate-400 mb-0.5 font-semibold">
                            Pushed Outward Qty
                          </label>
                          <input
                            type="number"
                            value={currentPushed}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value));
                              setAdjustedQtyMap((prev) => ({ ...prev, [skuId]: val }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs font-mono font-bold text-amber-300 text-center"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] text-slate-400 mb-0.5 font-semibold">
                            Variance Reason
                          </label>
                          <select
                            value={varianceReasonMap[skuId] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setVarianceReasonMap((prev) => ({ ...prev, [skuId]: val }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-[10px] text-slate-200"
                          >
                            <option value="Full Demand Satisfied">Full Demand</option>
                            <option value="Factory Supply Shortage">Factory Shortage</option>
                            <option value="Buffer Stock Pushed">Buffer Excess Pushed</option>
                            <option value="Vehicle Capacity Limit">Vehicle Capacity Limit</option>
                            <option value="Priority Reallocation">Priority Reallocation</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Outpass Vehicle / Gate Reference #
                </label>
                <input
                  type="text"
                  value={allocationVehicleNo}
                  onChange={(e) => setAllocationVehicleNo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Dispatcher Outward Notes
                </label>
                <input
                  type="text"
                  value={allocationNotes}
                  onChange={(e) => setAllocationNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-lg shadow-amber-900/30 flex items-center justify-center gap-1.5"
              >
                <Truck size={15} /> Issue Outpass & Debit Warehouse Stock
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: RECEIVER PROOF & GATE PASS HANDOVER */}
      {/* ------------------------------------------------------------- */}
      {ackEntry && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-4 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                <PenTool size={14} className="text-amber-400" /> Capture Outward Handover Proof
              </h3>
              <button
                onClick={() => setAckEntry(null)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] space-y-1">
              <div>
                Recipient: <strong className="text-white">{ackEntry.recipient_name}</strong>
              </div>
              <div>
                Outpass Gate Doc #: <span className="font-mono text-amber-300 font-bold">{ackEntry.reference_doc_id}</span>
              </div>
            </div>

            {/* Proof Mode Switcher */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setAckMode('SIGNATURE')}
                className={`py-1.5 rounded-lg ${
                  ackMode === 'SIGNATURE' ? 'bg-amber-600 text-white' : 'text-slate-400'
                }`}
              >
                Signature
              </button>
              <button
                type="button"
                onClick={() => setAckMode('OTP')}
                className={`py-1.5 rounded-lg ${
                  ackMode === 'OTP' ? 'bg-amber-600 text-white' : 'text-slate-400'
                }`}
              >
                Secret OTP
              </button>
              <button
                type="button"
                onClick={() => setAckMode('PHOTO')}
                className={`py-1.5 rounded-lg ${
                  ackMode === 'PHOTO' ? 'bg-amber-600 text-white' : 'text-slate-400'
                }`}
              >
                Paper Outpass
              </button>
            </div>

            <form onSubmit={handleSaveProof} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Signer / Receiver Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Agent / Sub-Distributor Staff"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                  required
                />
              </div>

              {ackMode === 'SIGNATURE' && (
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-400 font-semibold">
                    Sign on Screen Box
                  </label>
                  <div
                    onClick={() => setSigSvg('SVG_SIGNATURE_CAPTURED')}
                    className="w-full h-24 bg-slate-950 border border-dashed border-amber-500/50 rounded-xl flex items-center justify-center text-[10px] text-slate-400 cursor-pointer"
                  >
                    {sigSvg ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 size={14} /> Digital Signature Captured
                      </span>
                    ) : (
                      'Tap to Sign Screen'
                    )}
                  </div>
                </div>
              )}

              {ackMode === 'OTP' && (
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                    Enter 4-Digit Receiver OTP
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. 8812"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-center text-sm font-mono font-bold tracking-widest text-emerald-400"
                    required
                  />
                </div>
              )}

              {ackMode === 'PHOTO' && (
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                    Paper Outpass Slip Image Ref
                  </label>
                  <input
                    type="text"
                    value={photoRef}
                    onChange={(e) => setPhotoRef(e.target.value)}
                    placeholder="Signed_Outpass_Photo_901.jpg"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-md shadow-amber-900/30"
              >
                Confirm Gate Pass Handover
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
