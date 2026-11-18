import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import { Payment, PaymentMode, PaymentAllocation, Invoice } from '../../types';
import {
  buildPartyCreditRecords,
  CreditPartyCategory,
  PartyCreditRecord,
} from '../../utils/creditLedger';
import { KPICard } from '../common/KPICard';
import {
  AlertTriangle,
  DollarSign,
  ShieldAlert,
  Search,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  Building,
  Filter,
  Plus,
  FileText,
  CheckSquare,
  XCircle,
  Eye,
  Download,
  Layers,
  HelpCircle,
  RefreshCw,
  Wallet,
  Banknote,
  QrCode,
  AlertOctagon,
  Info,
  ArrowRightLeft,
  FileCheck,
  Shield,
  Send,
  UserCheck,
  Trash2,
  Edit2,
  Users,
  Database
} from 'lucide-react';

export const CreditManagement: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    currentUser,
    retailers,
    distributors = [],
    users = [],
    orders,
    invoices,
    payments,
    partyLedger = [],
    addPayment,
    verifyPayment,
    flagPayment,
    unflagPayment,
    markCashBanked,
    issueCreditNoteDiscount,
    syncCreditGateFromFirestore,
    updatePartyCreditLimit,
    removeCreditParty
  } = useAppStore();

  // Active Sub-Tab: 'INBOX' | 'MODE_HELPERS' | 'LEDGER_CREDIT'
  const [activeTab, setActiveTab] = useState<'INBOX' | 'MODE_HELPERS' | 'LEDGER_CREDIT'>('INBOX');

  // Non-blocking feedback banner
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);

  // Sync live party records from Cloud Firestore on mount & tab focus
  useEffect(() => {
    let active = true;
    const runSync = async () => {
      setIsSyncingFirestore(true);
      try {
        await syncCreditGateFromFirestore();
      } finally {
        if (active) setIsSyncingFirestore(false);
      }
    };
    runSync();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters
  const [filterMode, setFilterMode] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOverLimit, setFilterOverLimit] = useState<boolean>(false);
  const [filterPartyCategory, setFilterPartyCategory] = useState<'ALL' | CreditPartyCategory>('ALL');

  // Modals & Active Selections
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(false);
  const [selectedPaymentForProof, setSelectedPaymentForProof] = useState<Payment | null>(null);
  const [selectedPaymentForSplit, setSelectedPaymentForSplit] = useState<Payment | null>(null);
  const [selectedPartyForLedger, setSelectedPartyForLedger] = useState<PartyCreditRecord | null>(null);

  // Adjust Credit Limit & Remove Party Modals
  const [adjustingParty, setAdjustingParty] = useState<PartyCreditRecord | null>(null);
  const [adjustLimitInput, setAdjustLimitInput] = useState<string>('50000');
  const [isSavingCreditLimit, setIsSavingCreditLimit] = useState(false);
  const [removingParty, setRemovingParty] = useState<PartyCreditRecord | null>(null);
  const [isRemovingParty, setIsRemovingParty] = useState(false);

  // Flag Modal State
  const [flaggingPayment, setFlaggingPayment] = useState<Payment | null>(null);
  const [flagReasonInput, setFlagReasonInput] = useState('');

  // Occasional Credit Note Discount Modal State (explicit-only, never applied by default)
  const [creditNoteTargetInvoice, setCreditNoteTargetInvoice] = useState<Invoice | null>(null);
  const [creditNoteAmount, setCreditNoteAmount] = useState<string>('');
  const [creditNoteNumber, setCreditNoteNumber] = useState<string>('');
  const [creditNoteReason, setCreditNoteReason] = useState<string>('');

  // Unified Party Credit Gate Records (Retailers + Distributors + Active CFS Users)
  const partyCreditRecords = useMemo(() => {
    return buildPartyCreditRecords({
      retailers,
      distributors,
      users,
      orders,
      invoices,
      payments,
      defaultCreditLimit: activeTenantSettings?.credit_limit_default || 50000,
    });
  }, [retailers, distributors, users, orders, invoices, payments, activeTenantSettings?.credit_limit_default]);

  // New Payment Form State
  const [newPayRetailerId, setNewPayRetailerId] = useState<string>(partyCreditRecords[0]?.id || retailers[0]?.id || '');
  const [newPayAmount, setNewPayAmount] = useState<number>(10000);
  const [newPayMode, setNewPayMode] = useState<PaymentMode>('NEFT_RTGS');
  const [newPayRef, setNewPayRef] = useState<string>('');
  const [newPayCollector, setNewPayCollector] = useState<string>('Sub-distributor Direct');
  const [newPayBank, setNewPayBank] = useState<string>('State Bank of India');
  const [newPayInvoiceId, setNewPayInvoiceId] = useState<string>('');
  const [newPayNotes, setNewPayNotes] = useState<string>('');

  // Split Allocation State
  const [splitAllocations, setSplitAllocations] = useState<{ invoice_id: string; amount: number }[]>([]);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setStatusBanner({ type, message });
    setTimeout(() => {
      setStatusBanner((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  // Filter Payments Queue
  const filteredPayments = payments.filter((p) => {
    if (filterMode !== 'ALL' && p.payment_mode !== filterMode) return false;
    if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
    if (searchQuery && activeTab === 'INBOX') {
      const q = searchQuery.toLowerCase();
      return (
        p.payment_number.toLowerCase().includes(q) ||
        p.retailer_name.toLowerCase().includes(q) ||
        p.reference_number.toLowerCase().includes(q) ||
        (p.collector_name && p.collector_name.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filter Unified Parties for Party Ledger & Credit Gate View
  const filteredParties = partyCreditRecords.filter((p) => {
    if (filterPartyCategory !== 'ALL' && p.category !== filterPartyCategory) return false;
    if (filterOverLimit && !p.is_credit_blocked) return false;
    if (searchQuery && activeTab === 'LEDGER_CREDIT') {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.routeOrLocation.toLowerCase().includes(q) ||
        p.categoryLabel.toLowerCase().includes(q) ||
        (p.mobileOrPhone && p.mobileOrPhone.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // KPI Calculations across all active credit parties
  const verifiedPayments = payments.filter((p) => p.status === 'VERIFIED');
  const pendingPayments = payments.filter((p) => p.status === 'PENDING');
  const flaggedPayments = payments.filter((p) => p.status === 'FLAGGED');

  const totalVerifiedSum = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPendingSum = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalOutstanding = partyCreditRecords.reduce((sum, p) => sum + p.total_liability, 0);
  const totalCreditLimit = partyCreditRecords.reduce((sum, p) => sum + p.credit_limit, 0);
  const totalFundShortage = partyCreditRecords.reduce((sum, p) => sum + p.fund_shortage, 0);
  const overLimitCount = partyCreditRecords.filter((p) => p.is_credit_blocked).length;

  const retailerPartyCount = partyCreditRecords.filter((p) => p.category === 'RETAILER').length;
  const distributorPartyCount = partyCreditRecords.filter((p) => p.category === 'DISTRIBUTOR').length;
  const cfsPartyCount = partyCreditRecords.filter((p) => p.category === 'CFS').length;

  // Handlers
  const handleManualFirestoreRefresh = async () => {
    setIsSyncingFirestore(true);
    const ok = await syncCreditGateFromFirestore();
    setIsSyncingFirestore(false);
    showToast(
      ok ? 'success' : 'info',
      ok
        ? 'Party Ledger & Credit Gate synced directly from Cloud Firestore.'
        : 'Showing live synced store records.'
    );
  };

  const handleOpenAdjustModal = (party: PartyCreditRecord) => {
    setAdjustingParty(party);
    setAdjustLimitInput(String(party.credit_limit));
  };

  const handleConfirmAdjustLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingParty) return;
    const numericLimit = Number(adjustLimitInput);
    if (isNaN(numericLimit) || numericLimit < 0) {
      showToast('error', 'Please enter a valid non-negative credit limit.');
      return;
    }

    setIsSavingCreditLimit(true);
    try {
      await updatePartyCreditLimit(adjustingParty.partyKind, adjustingParty.id, numericLimit, {
        linkedUserId: adjustingParty.linkedUserId,
        linkedDistributorId: adjustingParty.linkedDistributorId,
      });
      showToast(
        'success',
        `Credit limit for ${adjustingParty.name} (${adjustingParty.categoryLabel}) updated to ₹${numericLimit.toLocaleString('en-IN')} and persisted to Cloud Firestore.`
      );
      setAdjustingParty(null);
    } finally {
      setIsSavingCreditLimit(false);
    }
  };

  const handleConfirmRemoveParty = async () => {
    if (!removingParty) return;
    setIsRemovingParty(true);
    try {
      await removeCreditParty(removingParty.partyKind, removingParty.id, {
        linkedUserId: removingParty.linkedUserId,
        linkedDistributorId: removingParty.linkedDistributorId,
      });
      showToast(
        'success',
        `${removingParty.name} (${removingParty.categoryLabel}) removed from active Party Ledger & Credit Gate in Cloud Firestore.`
      );
      setRemovingParty(null);
    } finally {
      setIsRemovingParty(false);
    }
  };

  const handleVerify = (paymentId: string) => {
    verifyPayment(paymentId);
  };

  const handleUnflag = (paymentId: string) => {
    unflagPayment(paymentId);
    showToast('info', 'Payment collection flag removed. Status reset to Pending AE Check.');
  };

  const handleOpenFlagModal = (pay: Payment) => {
    setFlaggingPayment(pay);
    setFlagReasonInput('');
  };

  const handleConfirmFlag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flaggingPayment) return;
    flagPayment(flaggingPayment.id, flagReasonInput || 'Mismatch identified during Account Executive verification.');
    setFlaggingPayment(null);
    setFlagReasonInput('');
  };

  const handleCreateNewPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const matchedParty = partyCreditRecords.find((p) => p.id === newPayRetailerId);
    const partyName = matchedParty ? matchedParty.name : 'Direct Institutional Buyer';

    const inv = invoices.find((i) => i.id === newPayInvoiceId);

    const newPaymentObj: Payment = {
      id: `pay_${Date.now()}`,
      tenant_id: activeTenant.id,
      payment_number: `PAY-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      retailer_id: newPayRetailerId || null,
      retailer_name: partyName,
      amount: Number(newPayAmount) || 0,
      payment_mode: newPayMode,
      reference_number: newPayRef || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      payment_date: new Date().toISOString().split('T')[0],
      matched_invoice_id: newPayInvoiceId || null,
      allocations: inv
        ? [{ invoice_id: inv.id, invoice_number: inv.invoice_number, amount: Number(newPayAmount) || 0 }]
        : [],
      status: 'VERIFIED',
      collector_name: newPayCollector || 'Office Account Executive',
      bank_name: newPayBank || 'HDFC Bank',
      notes: newPayNotes || 'Direct Bank Transfer / NEFT entry by Collections Controller',
    };

    addPayment(newPaymentObj);
    setIsNewPaymentModalOpen(false);
    showToast('success', `Payment ${newPaymentObj.payment_number} for ₹${newPaymentObj.amount.toLocaleString('en-IN')} logged and verified in ledger!`);
  };

  const handleOpenSplitModal = (pay: Payment) => {
    setSelectedPaymentForSplit(pay);
    // Pre-populate open invoices for this retailer
    const retInvoices = invoices.filter(
      (i) => i.retailer_id === pay.retailer_id && (i.status === 'UNPAID' || i.status === 'PARTIAL')
    );

    if (retInvoices.length > 0) {
      let remaining = pay.amount;
      const initialSplits = retInvoices.map((inv) => {
        const invDue = inv.total_amount - inv.paid_amount;
        const allocated = Math.min(remaining, invDue);
        remaining = Math.max(0, remaining - allocated);
        return { invoice_id: inv.id, amount: allocated };
      });
      setSplitAllocations(initialSplits);
    } else {
      setSplitAllocations([]);
    }
  };

  const handleConfirmSplitAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentForSplit) return;

    const formattedAllocations: PaymentAllocation[] = splitAllocations
      .filter((s) => s.amount > 0)
      .map((s) => {
        const inv = invoices.find((i) => i.id === s.invoice_id);
        return {
          invoice_id: s.invoice_id,
          invoice_number: inv?.invoice_number || 'INV-000',
          amount: s.amount,
        };
      });

    verifyPayment(selectedPaymentForSplit.id, formattedAllocations);
    setSelectedPaymentForSplit(null);
    showToast('success', `Payment ${selectedPaymentForSplit.payment_number} verified and allocated across ${formattedAllocations.length} invoices!`);
  };

  return (
    <div className="space-y-6">
      {statusBanner && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
              : statusBanner.type === 'error'
                ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
                : 'bg-blue-950/70 border-blue-500/40 text-blue-200'
          }`}
        >
          <span>{statusBanner.message}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs font-bold opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Executive Role Header & Boundary Callout */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <ShieldCheckIcon /> Collections Controller Hub — Account Executive Desktop
          </div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            Incoming Payment Verification, Ledger Balancing & Credit Controls
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
            Account Executive verifies every incoming UPI, Cash, and RTGS/NEFT payment from agents, retailers, and sub-distributors against outstanding invoices, updates the ledger, and flags any mismatch.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsNewPaymentModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
          >
            <Plus size={16} /> Log Direct Bank/RTGS Payment
          </button>
        </div>
      </div>

      {/* Role Scope & Boundary Callout Notice */}
      <div className="bg-slate-900/90 border border-blue-500/30 rounded-2xl p-4 text-xs space-y-2 bg-gradient-to-r from-blue-950/30 to-slate-900">
        <div className="flex items-center gap-2 font-bold text-blue-300">
          <Info size={16} className="text-blue-400" />
          Role Boundary & Single Source of Truth
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] text-slate-300">
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <span className="font-bold text-slate-400 block mb-0.5">Billing Executive</span>
            Creates & issues invoices from cleared orders.
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-500/40">
            <span className="font-bold text-emerald-400 block mb-0.5">Account Executive (You)</span>
            Verifies every payment, matches to bills, updates ledger & credit.
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <span className="font-bold text-slate-400 block mb-0.5">Admin</span>
            Defines credit policies, limits, & claim rules.
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <span className="font-bold text-slate-400 block mb-0.5">Agents & Punchers</span>
            Collects field payments & uploads proofs.
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Verified Ledger Collections"
          value={`₹${totalVerifiedSum.toLocaleString('en-IN')}`}
          delta={{ value: `${verifiedPayments.length} Payments`, isPositive: true, label: 'locked in ledger' }}
          icon={CheckCircle2}
          subtext="Matched & verified"
          accentColor="#10b981"
        />
        <KPICard
          title="Pending Verification Inbox"
          value={`₹${totalPendingSum.toLocaleString('en-IN')}`}
          delta={{ value: `${pendingPayments.length} Payments`, isPositive: false, label: 'requires AE review' }}
          icon={Clock}
          subtext="UPI, Cash & RTGS queue"
          badge="Inbox"
          accentColor="#f59e0b"
        />
        <KPICard
          title="Flagged Mismatches"
          value={flaggedPayments.length}
          delta={{ value: 'Under Escalation', isPositive: false, label: 'mismatched proofs' }}
          icon={AlertOctagon}
          subtext="Amount / screenshot mismatch"
          accentColor="#f43f5e"
        />
        <KPICard
          title="Total Party Liability"
          value={`₹${totalOutstanding.toLocaleString('en-IN')}`}
          delta={{
            value: `${overLimitCount} Over Limit`,
            isPositive: overLimitCount === 0,
            label: totalFundShortage > 0 ? `Shortage ₹${totalFundShortage.toLocaleString('en-IN')}` : 'credit gate active',
          }}
          icon={Building}
          subtext={`Pool: ₹${totalCreditLimit.toLocaleString('en-IN')} (${partyCreditRecords.length} parties)`}
        />
      </div>

      {/* Primary Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('INBOX')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeTab === 'INBOX'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Layers size={15} />
          1. Incoming Payment Verification Inbox ({pendingPayments.length} Pending)
        </button>

        <button
          onClick={() => setActiveTab('MODE_HELPERS')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeTab === 'MODE_HELPERS'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <ArrowRightLeft size={15} />
          2. Mode-Specific Operations (UPI, Cash Tally, RTGS UTR)
        </button>

        <button
          onClick={() => setActiveTab('LEDGER_CREDIT')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
            activeTab === 'LEDGER_CREDIT'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/30'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileText size={15} />
          3. Party Ledger & Credit Gate ({partyCreditRecords.length})
        </button>
      </div>

      {/* TAB 1: INCOMING PAYMENT VERIFICATION INBOX */}
      {activeTab === 'INBOX' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Payment Mode Filter */}
              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-slate-400" />
                <span className="text-slate-400 font-medium">Payment Mode:</span>
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-medium"
                >
                  <option value="ALL">All Modes (UPI, Cash, RTGS, Cheque)</option>
                  <option value="UPI">UPI (Agent Collected)</option>
                  <option value="CASH">Cash (Agent Handover)</option>
                  <option value="NEFT_RTGS">RTGS / NEFT (Institutions)</option>
                  <option value="CHEQUE">Cheque / IMPS</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Verification Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-semibold"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">PENDING (Awaiting AE Verification)</option>
                  <option value="VERIFIED">VERIFIED (Locked in Ledger)</option>
                  <option value="FLAGGED">FLAGGED (Mismatch / Unclear)</option>
                </select>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search ref #, UTR, retailer, agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Inbox Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Payment # & Date</th>
                    <th className="py-3 px-4">Payment Mode & Ref / UTR</th>
                    <th className="py-3 px-4">Retailer / Payer</th>
                    <th className="py-3 px-4">Collected / Submitted By</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4">Matched Invoice(s)</th>
                    <th className="py-3 px-4">Verification Status</th>
                    <th className="py-3 px-4 text-right">AE Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No payments match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p) => {
                      const matchedInv = invoices.find((i) => i.id === p.matched_invoice_id);

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-800/60 transition-colors ${
                            p.status === 'FLAGGED' ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            {p.payment_number}
                            <div className="text-[10px] text-slate-500 font-sans">{p.payment_date}</div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {p.payment_mode === 'UPI' && (
                                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 text-[10px] flex items-center gap-1">
                                  <QrCode size={12} /> UPI
                                </span>
                              )}
                              {p.payment_mode === 'CASH' && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[10px] flex items-center gap-1">
                                  <Banknote size={12} /> CASH
                                </span>
                              )}
                              {p.payment_mode === 'NEFT_RTGS' && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30 text-[10px] flex items-center gap-1">
                                  <Building size={12} /> RTGS/NEFT
                                </span>
                              )}
                              {p.payment_mode === 'CHEQUE' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 text-[10px] flex items-center gap-1">
                                  <FileCheck size={12} /> CHEQUE
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-300 font-semibold truncate max-w-[180px]">
                              {p.reference_number}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-semibold text-slate-200">
                            {p.retailer_name}
                            {p.bank_name && (
                              <div className="text-[10px] text-slate-500">{p.bank_name}</div>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-300">
                            <span className="font-medium text-slate-200">{p.collector_name || 'Staff'}</span>
                            {p.proof_url && (
                              <button
                                onClick={() => setSelectedPaymentForProof(p)}
                                className="block text-[10px] text-blue-400 hover:underline mt-0.5 flex items-center gap-1"
                              >
                                <Eye size={10} /> View Proof Screenshot
                              </button>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold text-sm text-emerald-400">
                            ₹{p.amount.toLocaleString('en-IN')}
                          </td>

                          <td className="py-3 px-4 text-xs">
                            {p.allocations && p.allocations.length > 0 ? (
                              <div className="space-y-0.5">
                                {p.allocations.map((a, idx) => (
                                  <span
                                    key={idx}
                                    className="block font-mono text-[10px] text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/50"
                                  >
                                    {a.invoice_number}: ₹{a.amount.toLocaleString('en-IN')}
                                  </span>
                                ))}
                              </div>
                            ) : matchedInv ? (
                              <span className="font-mono text-[11px] text-slate-300 font-bold">
                                {matchedInv.invoice_number}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Unallocated Credit</span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-block w-max ${
                                  p.status === 'VERIFIED'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : p.status === 'FLAGGED'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {p.status === 'PENDING' ? 'Pending AE Check' : p.status}
                              </span>
                              {p.flag_reason && (
                                <span className="text-[10px] text-rose-400 italic max-w-xs truncate">
                                  {p.flag_reason}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right space-x-1">
                            {p.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleVerify(p.id)}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-sm"
                                >
                                  Verify
                                </button>

                                <button
                                  onClick={() => handleOpenSplitModal(p)}
                                  className="px-2 py-1 rounded bg-blue-900/60 hover:bg-blue-800 text-blue-200 border border-blue-700 text-[10px] font-semibold"
                                >
                                  Split / Allocate
                                </button>

                                <button
                                  onClick={() => handleOpenFlagModal(p)}
                                  className="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700 text-[10px] font-semibold"
                                >
                                  Flag
                                </button>
                              </>
                            )}

                            {p.status === 'FLAGGED' && (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => handleUnflag(p.id)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-semibold"
                                  title="Remove flag and return payment to Pending queue"
                                >
                                  Remove Flag
                                </button>
                                <button
                                  onClick={() => handleVerify(p.id)}
                                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold"
                                  title="Clear flag and verify this payment into ledger"
                                >
                                  Clear & Verify
                                </button>
                              </div>
                            )}

                            {p.status === 'VERIFIED' && (
                              <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center justify-end gap-1">
                                <CheckCircle2 size={12} /> Verified
                              </span>
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

      {/* TAB 2: MODE-SPECIFIC OPERATIONS */}
      {activeTab === 'MODE_HELPERS' && (
        <div className="space-y-6">
          {/* Helper 1: UPI Collections */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <QrCode size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    1. UPI Collected by Commission Agent Workflow
                  </h3>
                  <p className="text-xs text-slate-400">
                    Agent collects UPI on firm QR code, uploads screenshot ref. Account Executive matches amount, timestamp, and applies to invoice.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {payments
                .filter((p) => p.payment_mode === 'UPI')
                .map((p) => (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-white text-[11px]">{p.payment_number}</span>
                      <span
                        className={`px-2 py-0.2 rounded text-[9px] font-bold ${
                          p.status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : p.status === 'FLAGGED'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    <div className="font-semibold text-slate-200">{p.retailer_name}</div>
                    <div className="font-mono font-bold text-emerald-400 text-sm">₹{p.amount.toLocaleString('en-IN')}</div>
                    <div className="text-[10px] text-slate-400 font-mono">Ref: {p.reference_number}</div>
                    <div className="text-[10px] text-slate-500">Collected by: {p.collector_name || 'Agent'}</div>

                    {p.proof_url && (
                      <button
                        onClick={() => setSelectedPaymentForProof(p)}
                        className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 pt-1"
                      >
                        <Eye size={12} /> Inspect Proof Screenshot
                      </button>
                    )}

                    {p.status === 'PENDING' && (
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                        <button
                          onClick={() => handleVerify(p.id)}
                          className="w-full py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]"
                        >
                          Verify & Apply to Bill
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* Helper 2: Cash Handover Tally */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Banknote size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    2. Agent Cash Handover Tally & Safe-to-Bank Accounting
                  </h3>
                  <p className="text-xs text-slate-400">
                    Agent physically hands over field cash to Account Executive. AE counts physical cash, logs against retailer/agent ledger, and tracks banking status.
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px]">
                    <th className="py-2.5 px-3">Receipt #</th>
                    <th className="py-2.5 px-3">Agent Name</th>
                    <th className="py-2.5 px-3">Retailer Store</th>
                    <th className="py-2.5 px-3 text-right">Physical Cash (₹)</th>
                    <th className="py-2.5 px-3">Safe Status</th>
                    <th className="py-2.5 px-3 text-right">Banking Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                  {payments
                    .filter((p) => p.payment_mode === 'CASH')
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-bold text-white">{p.payment_number}</td>
                        <td className="py-2.5 px-3 font-sans text-slate-300">{p.collector_name || 'Agent'}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{p.retailer_name}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">₹{p.amount.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3 font-sans">
                          {p.cash_status === 'BANKED' ? (
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold text-[10px]">
                              Banked in Branch
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                              In Safe (Vault)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans space-x-1">
                          {p.status === 'PENDING' && (
                            <button
                              onClick={() => handleVerify(p.id)}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]"
                            >
                              Confirm Physical Count
                            </button>
                          )}

                          {p.cash_status !== 'BANKED' && (
                            <button
                              onClick={() => {
                                markCashBanked(p.id);
                                showToast('success', `Marked cash receipt ${p.payment_number} as banked in branch.`);
                              }}
                              className="px-2 py-1 rounded bg-blue-900/60 text-blue-200 border border-blue-700 font-semibold text-[10px]"
                            >
                              Mark Banked
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Helper 3: RTGS / NEFT Institution Split Allocation */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <Building size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    3. RTGS / NEFT Institutional Multi-Invoice Split Allocator
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sub-distributors and institutional buyers transfer bulk payments via bank. AE matches bank statement UTR and allocates across multiple outstanding bills.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {payments
                .filter((p) => p.payment_mode === 'NEFT_RTGS')
                .map((p) => (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-white">{p.payment_number}</span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[10px]">
                        {p.status}
                      </span>
                    </div>

                    <div className="font-bold text-slate-100 text-sm">{p.retailer_name}</div>
                    <div className="font-mono font-bold text-emerald-400 text-base">₹{p.amount.toLocaleString('en-IN')}</div>
                    <div className="text-[11px] font-mono text-slate-300 bg-slate-900 p-2 rounded border border-slate-800">
                      Bank Ref / UTR: <span className="text-blue-400 font-bold">{p.reference_number}</span>
                    </div>

                    {p.status === 'PENDING' && (
                      <button
                        onClick={() => handleOpenSplitModal(p)}
                        className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/30"
                      >
                        <ArrowRightLeft size={14} /> Allocate Payment Across Invoices
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PARTY LEDGER & CREDIT GATE */}
      {activeTab === 'LEDGER_CREDIT' && (
        <div className="space-y-4">
          {/* Renamed Section Header + Live Firestore Sync Bar */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield size={18} className="text-emerald-400" /> Party Ledger & Credit Gate
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold inline-flex items-center gap-1">
                  <Database size={10} /> Firestore Synced
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Unified credit control across {distributorPartyCount} Distributors, {cfsPartyCount} active CFS Agents, and {retailerPartyCount} Retail Outlets. Limit updates and party removals sync live to the Mobile App.
              </p>
            </div>

            <button
              type="button"
              onClick={handleManualFirestoreRefresh}
              disabled={isSyncingFirestore}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw size={13} className={isSyncingFirestore ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
              {isSyncingFirestore ? 'Syncing Firestore...' : 'Refresh from Firestore'}
            </button>
          </div>

          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(
                  [
                    { key: 'ALL', label: `All Parties (${partyCreditRecords.length})` },
                    { key: 'DISTRIBUTOR', label: `Distributors (${distributorPartyCount})` },
                    { key: 'CFS', label: `CFS Users (${cfsPartyCount})` },
                    { key: 'RETAILER', label: `Retailers (${retailerPartyCount})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilterPartyCategory(item.key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      filterPartyCategory === item.key
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setFilterOverLimit(!filterOverLimit)}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-all ${
                  filterOverLimit
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                <AlertTriangle size={14} /> Over Limit Only ({overLimitCount})
              </button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search party name, role, mobile, beat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* Unified Party Ledger Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Party Name, Code & Type</th>
                    <th className="py-3 px-4">Territory / Contact</th>
                    <th className="py-3 px-4 text-right">Credit Limit (₹)</th>
                    <th className="py-3 px-4 text-right">Total Liability (₹)</th>
                    <th className="py-3 px-4 text-right">Remaining Credit (₹)</th>
                    <th className="py-3 px-4 text-right">Fund Shortage (₹)</th>
                    <th className="py-3 px-4 text-center">Exposure %</th>
                    <th className="py-3 px-4 text-center">Credit Gate</th>
                    <th className="py-3 px-4 text-right">Party Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {filteredParties.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No active parties match your selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredParties.map((party) => {
                      const isExceeded = party.is_credit_blocked;
                      const pct = party.credit_limit > 0
                        ? Math.min(100, Math.round((party.total_liability / party.credit_limit) * 100))
                        : party.total_liability > 0
                          ? 100
                          : 0;

                      const badgeClass =
                        party.category === 'DISTRIBUTOR'
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                          : party.category === 'CFS'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-slate-800 text-slate-300 border-slate-700';

                      return (
                        <tr key={`${party.partyKind}_${party.id}`} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-semibold text-white">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{party.name}</span>
                              <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${badgeClass}`}>
                                {party.categoryLabel}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{party.code}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            <div>{party.routeOrLocation}</div>
                            {party.mobileOrPhone && (
                              <div className="text-[10px] text-slate-500 font-mono">{party.mobileOrPhone}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-white">
                            ₹{party.credit_limit.toLocaleString('en-IN')}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                              isExceeded ? 'text-rose-400' : 'text-amber-300'
                            }`}
                          >
                            ₹{party.total_liability.toLocaleString('en-IN')}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                              party.remaining_credit === 0 && party.total_liability > 0 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            ₹{party.remaining_credit.toLocaleString('en-IN')}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                              party.fund_shortage > 0 ? 'text-rose-400' : 'text-slate-500'
                            }`}
                          >
                            {party.fund_shortage > 0 ? `₹${party.fund_shortage.toLocaleString('en-IN')}` : '₹0'}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="w-24 mx-auto bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden mb-1">
                              <div
                                className={`h-full ${isExceeded ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono font-bold text-slate-400">{pct}%</span>
                          </td>

                          <td className="py-3 px-4 text-center">
                            {isExceeded ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1">
                                <Lock size={12} /> Shortage Hold
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                                <Unlock size={12} /> Clear
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedPartyForLedger(party)}
                                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shadow-sm"
                              >
                                Statement
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenAdjustModal(party)}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-semibold inline-flex items-center gap-1"
                              >
                                <Edit2 size={11} /> Adjust Limit
                              </button>

                              <button
                                type="button"
                                onClick={() => setRemovingParty(party)}
                                className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border border-rose-500/40 text-[10px] font-semibold inline-flex items-center gap-1"
                                title="Remove party from Credit Gate in Cloud Firestore"
                              >
                                <Trash2 size={11} /> Remove
                              </button>
                            </div>
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

      {/* MODAL 1: NEW DIRECT COLLECTION ENTRY */}
      {isNewPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">
                  Account Executive Direct Entry
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus size={18} className="text-emerald-400" /> Record Direct RTGS / Bank Collection
                </h3>
              </div>
              <button
                onClick={() => setIsNewPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleCreateNewPayment} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-medium">Select Party (Retailer / Distributor / CFS)</label>
                <select
                  value={newPayRetailerId}
                  onChange={(e) => setNewPayRetailerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  {partyCreditRecords.map((p) => (
                    <option key={`${p.partyKind}_${p.id}`} value={p.id}>
                      [{p.categoryLabel}] {p.name} ({p.code}) [Bal: ₹{p.current_outstanding.toLocaleString('en-IN')}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Collection Amount (₹)</label>
                  <input
                    type="number"
                    value={newPayAmount}
                    onChange={(e) => setNewPayAmount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Payment Mode</label>
                  <select
                    value={newPayMode}
                    onChange={(e) => setNewPayMode(e.target.value as PaymentMode)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-bold"
                  >
                    <option value="NEFT_RTGS">RTGS / NEFT (Direct Bank)</option>
                    <option value="UPI">UPI Transfer</option>
                    <option value="CHEQUE">Cheque / Demand Draft</option>
                    <option value="CASH">Direct Counter Cash</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">UTR / Transaction Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR: SBIN0001928374"
                    value={newPayRef}
                    onChange={(e) => setNewPayRef(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Firm Bank Account</label>
                  <input
                    type="text"
                    value={newPayBank}
                    onChange={(e) => setNewPayBank(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-medium">Link Specific Invoice (Optional)</label>
                <select
                  value={newPayInvoiceId}
                  onChange={(e) => setNewPayInvoiceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="">-- Apply as Ledger Credit (Unallocated) --</option>
                  {invoices
                    .filter((i) => i.retailer_id === newPayRetailerId && i.status !== 'PAID')
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoice_number} - Total ₹{i.total_amount.toLocaleString('en-IN')} (Due ₹
                        {(i.total_amount - i.paid_amount).toLocaleString('en-IN')})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-medium">Narration / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Confirmed on bank statement by AE"
                  value={newPayNotes}
                  onChange={(e) => setNewPayNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-900/30"
                >
                  Confirm & Post to Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SPLIT MULTI-INVOICE ALLOCATION */}
      {selectedPaymentForSplit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-blue-400 uppercase font-bold">
                  Multi-Invoice Split Allocation
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft size={18} className="text-blue-400" /> Allocate Payment #{selectedPaymentForSplit.payment_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPaymentForSplit(null)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Payer Retailer:</span>
                <span className="text-white font-bold">{selectedPaymentForSplit.retailer_name}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Payment Amount:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  ₹{selectedPaymentForSplit.amount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSplitAllocation} className="space-y-4 text-xs">
              <span className="font-bold text-white block">Distribute Amount Across Open Invoices:</span>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {splitAllocations.map((alloc, idx) => {
                  const inv = invoices.find((i) => i.id === alloc.invoice_id);
                  if (!inv) return null;
                  const due = inv.total_amount - inv.paid_amount;

                  return (
                    <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono font-bold text-white">{inv.invoice_number}</div>
                        <div className="text-[10px] text-slate-400">Total ₹{inv.total_amount.toLocaleString('en-IN')} | Outstanding Due ₹{due.toLocaleString('en-IN')}</div>
                      </div>

                      <div className="w-36">
                        <label className="block text-[9px] text-slate-400 mb-0.5">Apply Amount (₹)</label>
                        <input
                          type="number"
                          value={alloc.amount}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const copy = [...splitAllocations];
                            copy[idx].amount = val;
                            setSplitAllocations(copy);
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-emerald-400 font-bold"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentForSplit(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md shadow-blue-900/30"
                >
                  Verify & Apply Allocations
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: FLAG MISMATCH */}
      {flaggingPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
                <AlertOctagon size={18} /> Flag Payment Mismatch
              </h3>
              <button onClick={() => setFlaggingPayment(null)} className="text-slate-400 hover:text-white font-bold text-xs">
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleConfirmFlag} className="space-y-3 text-xs">
              <p className="text-slate-300">
                Flag payment <span className="font-mono font-bold text-white">{flaggingPayment.payment_number}</span> (₹{flaggingPayment.amount.toLocaleString('en-IN')}) for clarification or escalation.
              </p>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-medium">Mismatch Reason / Clarification Required</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Screenshot amount ₹14,500 does not match bank credit statement ₹12,500."
                  value={flagReasonInput}
                  onChange={(e) => setFlagReasonInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFlaggingPayment(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-900/30"
                >
                  Flag Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: PROOF / SCREENSHOT INSPECTOR */}
      {selectedPaymentForProof && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <QrCode size={16} className="text-purple-400" /> Payment Proof Inspector
              </h3>
              <button onClick={() => setSelectedPaymentForProof(null)} className="text-slate-400 hover:text-white font-bold text-xs">
                ✕ Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Payer Store:</span> <span className="font-bold text-white">{selectedPaymentForProof.retailer_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Amount:</span> <span className="font-mono font-bold text-emerald-400">₹{selectedPaymentForProof.amount.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Reference:</span> <span className="font-mono text-blue-300">{selectedPaymentForProof.reference_number}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Submitted By:</span> <span className="text-slate-200">{selectedPaymentForProof.collector_name || 'Agent'}</span></div>
              </div>

              {/* Attached Digital Payment Proof Box */}
              <div className="bg-slate-950 border border-dashed border-purple-500/40 rounded-xl p-6 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-purple-500/20 text-purple-300 mx-auto flex items-center justify-center font-bold">
                  UPI
                </div>
                <div className="font-mono text-xs font-bold text-purple-300">{selectedPaymentForProof.proof_url}</div>
                <p className="text-[10px] text-slate-400">Digital payment receipt reference submitted by field collector.</p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedPaymentForProof(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: PARTY LEDGER STATEMENT */}
      {selectedPartyForLedger && (() => {
        const liveParty =
          partyCreditRecords.find(
            (p) => p.id === selectedPartyForLedger.id && p.partyKind === selectedPartyForLedger.partyKind
          ) || selectedPartyForLedger;
        const matchIdSet = new Set(liveParty.matchIds);
        const matchNameSet = new Set(liveParty.matchNames.map((n) => n.trim().toLowerCase()));

        const matchesParty = (entityId?: string | null, entityName?: string | null) =>
          (entityId && matchIdSet.has(entityId)) ||
          (entityName && matchNameSet.has(entityName.trim().toLowerCase()));

        const matchedInvoices = invoices.filter((i) => matchesParty(i.retailer_id, i.retailer_name));
        const matchedAllOrders = orders.filter(
          (o) =>
            matchesParty(o.retailer_id, o.retailer_name_raw) ||
            (liveParty.role === 'DISTRIBUTOR' &&
              o.created_by_user_id === liveParty.linkedUserId &&
              (o.channel === 'DISTRIBUTOR' || o.order_source_role === 'DISTRIBUTOR'))
        );
        const matchedNonCancelledOrders = matchedAllOrders.filter((o) => o.status !== 'CANCELLED');
        const matchedCancelledOrders = matchedAllOrders.filter((o) => o.status === 'CANCELLED');
        const matchedPayments = payments.filter(
          (p) => p.status === 'VERIFIED' && matchesParty(p.retailer_id, p.retailer_name)
        );
        const matchedLedgerEntries = (partyLedger || [])
          .filter((le) => matchesParty(le.party_id, le.party_name))
          .slice(0, 25);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 text-slate-200 space-y-4 shadow-2xl my-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-blue-400 uppercase font-bold">
                    Live Cloud Firestore Party Ledger ({liveParty.categoryLabel})
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Statement of Account: {liveParty.name} ({liveParty.code})
                  </h3>
                </div>
                <button onClick={() => setSelectedPartyForLedger(null)} className="text-slate-400 hover:text-white font-bold text-xs">
                  ✕ Close
                </button>
              </div>

              {/* Account Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-center font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] block font-sans">Credit Limit</span>
                  <span className="font-bold text-white text-sm">₹{liveParty.credit_limit.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-sans">Total Liability (Utilized)</span>
                  <span className="font-bold text-amber-300 text-sm">₹{liveParty.total_liability.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-sans">Remaining Credit</span>
                  <span className="font-bold text-emerald-400 text-sm">₹{liveParty.remaining_credit.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-sans">Fund Shortage</span>
                  <span className={`font-bold text-sm ${liveParty.fund_shortage > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    ₹{liveParty.fund_shortage.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-sans">Credit Gate</span>
                  <span className={`font-bold text-xs ${liveParty.is_credit_blocked ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {liveParty.is_credit_blocked ? 'OVER-LIMIT HOLD' : 'ACTIVE'}
                  </span>
                </div>
              </div>

              {/* Formula Breakdown Banner */}
              <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 text-slate-300">
                <span>
                  Non-Cancelled Orders: <strong className="text-rose-300">₹{liveParty.non_cancelled_orders_total.toLocaleString('en-IN')}</strong>
                </span>
                <span>
                  Verified Payments: <strong className="text-emerald-300">-₹{liveParty.verified_payments_total.toLocaleString('en-IN')}</strong>
                </span>
                <span>
                  Explicit Credit Notes: <strong className="text-purple-300">-₹{liveParty.credit_note_discounts_total.toLocaleString('en-IN')}</strong>
                </span>
              </div>

              {/* Firestore Audit Ledger Entries */}
              {matchedLedgerEntries.length > 0 && (
                <div className="space-y-2">
                  <span className="font-bold text-emerald-300 text-xs block">
                    Live Cloud Firestore Ledger Stream (Real-Time Debits, Reversals &amp; Credits)
                  </span>
                  <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Event Type</th>
                          <th className="py-2 px-3">Ref # &amp; Notes</th>
                          <th className="py-2 px-3 text-right">Debit (+)</th>
                          <th className="py-2 px-3 text-right">Credit (-)</th>
                          <th className="py-2 px-3 text-right">Liability After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                        {matchedLedgerEntries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3 text-slate-400">{(entry.created_at || '').split('T')[0]}</td>
                            <td className="py-2 px-3 font-sans">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  entry.entry_type === 'ORDER_CANCELLATION_REVERSAL'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : entry.entry_type === 'PAYMENT_CREDIT'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : entry.entry_type === 'CREDIT_NOTE_DISCOUNT'
                                        ? 'bg-purple-500/20 text-purple-300'
                                        : entry.entry_type === 'ORDER_AMEND_ADJUSTMENT'
                                          ? 'bg-amber-500/20 text-amber-300'
                                          : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {entry.entry_type}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-200 max-w-xs truncate">
                              {(entry.order_number || entry.invoice_number || entry.credit_note_number) && (
                                <span className="font-mono font-bold mr-1.5">
                                  {entry.order_number || entry.invoice_number || entry.credit_note_number}
                                </span>
                              )}
                              <span className="text-slate-400">{entry.notes}</span>
                            </td>
                            <td className="py-2 px-3 text-right text-rose-400 font-bold">
                              {entry.debit_amount > 0 ? `+₹${entry.debit_amount.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                              {entry.credit_amount > 0 ? `-₹${entry.credit_amount.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right text-white font-bold">
                              ₹{(entry.balance_after || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Orders, Invoices & Payments Timeline */}
              <div className="space-y-2">
                <span className="font-bold text-white text-xs block">
                  All Orders (Active Reservations &amp; Cancelled Reversals), Invoices &amp; Verified Payments
                </span>
                <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Doc / Reference #</th>
                        <th className="py-2.5 px-3 text-right">Debit (Liability +)</th>
                        <th className="py-2.5 px-3 text-right">Credit (Cleared -)</th>
                        <th className="py-2.5 px-3 text-center">Status / Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                      {matchedAllOrders.length === 0 &&
                        matchedInvoices.length === 0 &&
                        matchedPayments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                              No orders, invoices, or payment entries recorded yet for {liveParty.name}.
                            </td>
                          </tr>
                        )}

                      {/* Active Non-Cancelled Orders (reserves credit immediately from PENDING_VERIFICATION onward) */}
                      {matchedNonCancelledOrders.map((ord, idx) => (
                        <tr key={`${ord.id || ord.order_number}_${idx}`} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-400">{ord.order_date}</td>
                          <td className="py-2 px-3 font-sans text-amber-300 font-semibold">
                            ORDER ({ord.status})
                          </td>
                          <td className="py-2 px-3 font-bold text-white">{ord.order_number}</td>
                          <td className="py-2 px-3 text-right text-rose-400 font-bold">
                            ₹{(ord.total_amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500">-</td>
                          <td className="py-2 px-3 text-center font-sans">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold text-[9px]">
                              RESERVED ({ord.status})
                            </span>
                          </td>
                        </tr>
                      ))}

                      {/* Cancelled Orders (Released Credit) */}
                      {matchedCancelledOrders.map((ord, idx) => (
                        <tr key={`cancel_${ord.id || ord.order_number}_${idx}`} className="hover:bg-slate-800/30 opacity-65">
                          <td className="py-2 px-3 text-slate-500">{ord.order_date}</td>
                          <td className="py-2 px-3 font-sans text-slate-400">ORDER CANCELLED</td>
                          <td className="py-2 px-3 line-through text-slate-400">{ord.order_number}</td>
                          <td className="py-2 px-3 text-right text-slate-500 line-through">
                            ₹{(ord.total_amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-400">Released</td>
                          <td className="py-2 px-3 text-center font-sans">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[9px]">
                              CANCELLED (RESTORED)
                            </span>
                          </td>
                        </tr>
                      ))}

                      {/* Invoices + Explicit Occasional Credit Note Discount Button */}
                      {matchedInvoices.map((inv) => {
                        const alreadyHasOrder = matchedAllOrders.some((o) => o.id === inv.order_id);
                        return (
                          <tr key={inv.id} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3 text-slate-400">{inv.invoice_date}</td>
                            <td className="py-2 px-3 font-sans text-blue-300">
                              INVOICE
                              {inv.is_credit_note_discount && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-bold">
                                  Credit Note {inv.credit_note_number || ''} (-₹{(inv.credit_note_discount_amount || 0).toLocaleString('en-IN')})
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-bold text-white">{inv.invoice_number}</td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {alreadyHasOrder ? (
                                <span className="text-[10px] text-slate-500 font-sans">Included via Order</span>
                              ) : (
                                <span className="text-rose-400 font-bold">₹{inv.total_amount.toLocaleString('en-IN')}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right text-purple-300">
                              {inv.is_credit_note_discount && inv.credit_note_discount_amount
                                ? `-₹${inv.credit_note_discount_amount.toLocaleString('en-IN')}`
                                : '-'}
                            </td>
                            <td className="py-2 px-3 text-center font-sans space-x-1">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[9px]">{inv.status}</span>
                              {inv.status !== 'PAID' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCreditNoteTargetInvoice(inv);
                                    setCreditNoteAmount('');
                                    setCreditNoteNumber(`CN-${Date.now().toString().slice(-5)}`);
                                    setCreditNoteReason('');
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-[9px] font-bold"
                                >
                                  + Credit Note
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Verified Payments */}
                      {matchedPayments.map((pay) => (
                        <tr key={pay.id} className="hover:bg-slate-800/30 bg-emerald-950/10">
                          <td className="py-2 px-3 text-slate-400">{pay.payment_date}</td>
                          <td className="py-2 px-3 font-sans text-emerald-300">PAYMENT ({pay.payment_mode})</td>
                          <td className="py-2 px-3 font-bold text-emerald-300">{pay.payment_number}</td>
                          <td className="py-2 px-3 text-right text-slate-500">-</td>
                          <td className="py-2 px-3 text-right text-emerald-400 font-bold">-₹{pay.amount.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[9px]">VERIFIED</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedPartyForLedger(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold text-xs"
                >
                  Close Statement
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 6: ADJUST PARTY CREDIT LIMIT (FIRESTORE SYNCED) */}
      {adjustingParty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">
                  Cloud Firestore Credit Control
                </span>
                <h3 className="text-base font-bold text-white">Adjust Credit Limit</h3>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingParty(null)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleConfirmAdjustLimit} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{adjustingParty.name}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase">
                    {adjustingParty.categoryLabel}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Current Limit:</span>
                  <span className="font-mono font-bold text-white">₹{adjustingParty.credit_limit.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Current Outstanding:</span>
                  <span className="font-mono font-bold text-amber-300">₹{adjustingParty.current_outstanding.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1 font-semibold">
                  New Approved Credit Limit (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  required
                  value={adjustLimitInput}
                  onChange={(e) => setAdjustLimitInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Updates immediately in Cloud Firestore and syncs live to the Mobile App.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustingParty(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCreditLimit}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-900/30 disabled:opacity-60"
                >
                  {isSavingCreditLimit ? 'Saving to Firestore...' : 'Save Credit Limit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: CONFIRM REMOVE PARTY FROM CREDIT GATE */}
      {removingParty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
                <Trash2 size={18} /> Remove Party from Credit Gate
              </h3>
              <button
                type="button"
                onClick={() => setRemovingParty(null)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Are you sure you want to remove <strong className="text-white">{removingParty.name}</strong> ({removingParty.categoryLabel}) from the active Party Ledger &amp; Credit Gate?
              </p>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Credit Limit:</span>
                  <span className="font-mono text-white">₹{removingParty.credit_limit.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Outstanding:</span>
                  <span className="font-mono font-bold text-amber-300">₹{removingParty.current_outstanding.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                {removingParty.partyKind === 'USER'
                  ? 'This updates credit_gate_enabled = false directly on their Cloud Firestore user profile.'
                  : 'This permanently deletes the party record from Cloud Firestore.'}
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRemovingParty(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRemovingParty}
                  onClick={handleConfirmRemoveParty}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-900/30 disabled:opacity-60"
                >
                  {isRemovingParty ? 'Removing from Firestore...' : 'Confirm Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: EXPLICIT CREDIT NOTE / DISCOUNT ISSUANCE */}
      {creditNoteTargetInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-purple-400 uppercase font-bold">
                  Occasional BE Credit Adjustment
                </span>
                <h3 className="text-base font-bold text-white">
                  Issue Credit Note Discount ({creditNoteTargetInvoice.invoice_number})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreditNoteTargetInvoice(null)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(creditNoteAmount);
                if (!amt || amt <= 0) {
                  showToast('error', 'Enter a valid credit note discount amount greater than zero.');
                  return;
                }
                const res = issueCreditNoteDiscount({
                  invoiceId: creditNoteTargetInvoice.id,
                  discountAmount: amt,
                  creditNoteNumber: creditNoteNumber,
                  reason: creditNoteReason || 'Occasional Credit Note Discount',
                  issuedByUserId: currentUser?.id,
                  issuedByName: currentUser?.name || 'Billing Executive',
                });
                if (!res.success) {
                  showToast('error', res.error || 'Unable to issue credit note.');
                  return;
                }
                showToast(
                  'success',
                  `Credit Note ${creditNoteNumber} (-₹${amt.toLocaleString('en-IN')}) applied to ${creditNoteTargetInvoice.invoice_number} and synced to Firestore Party Ledger.`
                );
                setCreditNoteTargetInvoice(null);
              }}
              className="space-y-3 text-xs"
            >
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Party:</span>
                  <strong className="text-white font-sans">{creditNoteTargetInvoice.retailer_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Invoice Total:</span>
                  <strong>₹{creditNoteTargetInvoice.total_amount.toLocaleString('en-IN')}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Remaining Unpaid Due:</span>
                  <strong className="text-amber-300">
                    ₹{Math.max(0, creditNoteTargetInvoice.total_amount - creditNoteTargetInvoice.paid_amount).toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Credit Note Number *</label>
                <input
                  type="text"
                  required
                  value={creditNoteNumber}
                  onChange={(e) => setCreditNoteNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Credit Discount Amount (₹) *</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, creditNoteTargetInvoice.total_amount - creditNoteTargetInvoice.paid_amount)}
                  required
                  value={creditNoteAmount}
                  onChange={(e) => setCreditNoteAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Discount Reason *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Damaged stock credit note / promotional trade scheme"
                  value={creditNoteReason}
                  onChange={(e) => setCreditNoteReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreditNoteTargetInvoice(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
                >
                  Apply Credit Note Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Icon Component
function ShieldCheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
