import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import { Order, OrderInvoicingType } from '../../types';
import { isOrderAssignedToBE, getOrderFinancialSummary } from '../../utils/caRoutingLogic';
import { KPICard } from '../common/KPICard';
import { BEDistributorOnboardingModal } from '../common/BEDistributorOnboardingModal';
import { BEDistributorOrderPunchModal } from '../common/BEDistributorOrderPunchModal';
import {
  Home,
  ShoppingCart,
  Boxes,
  Receipt,
  AlertTriangle,
  FileCheck2,
  CheckCircle2,
  TrendingUp,
  Clock,
  Send,
  Plus,
  RefreshCw,
  Building,
  Building2,
  ShieldAlert,
  ChevronRight,
  ArrowUpRight,
  DollarSign,
  Truck,
  Lock,
  Eye,
  X,
  FileText,
  UserCheck,
  MapPin,
  Calendar,
  CreditCard,
  Info,
  Coins,
  FileSpreadsheet
} from 'lucide-react';

interface HomeViewProps {
  onNavigate: (module: string) => void;
  onOpenOnboarding: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate, onOpenOnboarding }) => {
  const {
    activeTenant,
    activeTenantSettings,
    activeRole = 'ADMIN',
    orders = [],
    invoices = [],
    claims = [],
    skus = [],
    retailers = [],
    stockLedger = [],
    dispatchPoints = [],
    companies = [],
    users = [],
    currentUser,
    updateOrderStatus,
    updateClaimStatus,
    addOrder,
    updateOrder,
    verifyAndApproveOrderByBilling,
  } = useAppStore();

  const [selectedOrderForReview, setSelectedOrderForReview] = useState<Order | null>(null);
  const [homeReviewInvoicingType, setHomeReviewInvoicingType] = useState<OrderInvoicingType>('REGISTERED_GST');
  const [isBEOnboardOpen, setIsBEOnboardOpen] = useState(false);
  const [isBEPunchOpen, setIsBEPunchOpen] = useState(false);
  const [selectedBEClientId, setSelectedBEClientId] = useState<string | undefined>(undefined);

  // Sync invoicing classification default whenever an order is opened for review
  useEffect(() => {
    if (selectedOrderForReview) {
      if (selectedOrderForReview.order_invoicing_type) {
        setHomeReviewInvoicingType(selectedOrderForReview.order_invoicing_type);
      } else {
        const ret = retailers.find(
          (r) =>
            r.id === selectedOrderForReview.retailer_id ||
            r.name.toLowerCase() === selectedOrderForReview.retailer_name_raw.toLowerCase()
        );
        setHomeReviewInvoicingType(ret?.gstin ? 'REGISTERED_GST' : 'UNREGISTERED_CASH');
      }
    }
  }, [selectedOrderForReview, retailers]);

  const safeOrders = orders || [];
  const safeInvoices = invoices || [];
  const safeClaims = claims || [];
  const safeSkus = skus || [];
  const safeRetailers = retailers || [];
  const safeStockLedger = stockLedger || [];
  const safeDispatchPoints = dispatchPoints || [];

  // Common calculations
  const totalSalesValue = safeOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const pendingOrders = safeOrders.filter((o) => o.status === 'PUNCHED' || o.status === 'APPROVED');
  const flaggedOrders = safeOrders.filter((o) => o.has_below_cost_lines);

  const totalInvoicedValue = safeInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const totalCollectedValue = safeInvoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0);
  const totalOutstandingValue = safeRetailers.reduce((sum, r) => sum + (r.current_outstanding || 0), 0);

  const totalClaimsVal = safeClaims.reduce((s, c) => s + (c.claim_amount || 0), 0);
  const leakageFlaggedCount = safeClaims.filter((c) => c.is_leakage_flagged).length;

  const creditThreshold = activeTenantSettings?.credit_limit_default ?? 50000;
  const overLimitRetailers = safeRetailers.filter(
    (r) => r.current_outstanding > r.credit_limit || r.current_outstanding > creditThreshold
  );

  // ---------------------------------------------------------------------------
  // 1. ADMIN / SUB-ADMIN HOME (Cross-Module Overview)
  // ---------------------------------------------------------------------------
  if (activeRole === 'ADMIN') {
    return (
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              <Home size={16} /> Home — Cross-Module Enterprise Overview
            </div>
            <h1 className="text-lg font-bold text-white">
              {activeTenant?.name || 'MS Enterprises'} Multi-Module Operations
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live snapshot across Orders, Inventory, Billing, Credit, and Principal Claims.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenOnboarding}
              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus size={14} /> Tenant Setup
            </button>
          </div>
        </div>

        {/* Overview KPIs from all 5 modules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="Orders & Sales"
            value={`₹${totalSalesValue.toLocaleString('en-IN')}`}
            delta={{ value: `${orders.length} orders`, isPositive: true, label: 'gross booked' }}
            icon={ShoppingCart}
            subtext="Across all channels"
            accentColor="#3b82f6"
          />
          <KPICard
            title="Inventory SKUs"
            value={skus.length}
            delta={{ value: 'Hard Gate', isPositive: true, label: 'stock ledger active' }}
            icon={Boxes}
            subtext="Tracked products"
            accentColor="#10b981"
          />
          <KPICard
            title="Billing Collections"
            value={`₹${totalCollectedValue.toLocaleString('en-IN')}`}
            delta={{ value: 'Auto-match', isPositive: true, label: 'receipts matched' }}
            icon={Receipt}
            subtext={`${invoices.length} total invoices`}
            accentColor="#a855f7"
          />
          <KPICard
            title="Credit Over-Limit"
            value={overLimitRetailers.length}
            delta={{ value: `₹${totalOutstandingValue.toLocaleString('en-IN')}`, isPositive: false, label: 'outstanding' }}
            icon={AlertTriangle}
            subtext="Stores exceeding threshold"
            accentColor="#f59e0b"
          />
          <KPICard
            title="Claims & Leakage"
            value={`₹${totalClaimsVal.toLocaleString('en-IN')}`}
            delta={{ value: `${leakageFlaggedCount} flagged`, isPositive: false, label: 'below cost' }}
            icon={FileCheck2}
            subtext="Principal recovery"
            accentColor="#ef4444"
          />
        </div>

        {/* Quick Nav Shortcut Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Orders', icon: ShoppingCart, module: 'orders', color: 'text-blue-400', count: orders.length, roles: ['ADMIN', 'BILLING', 'ORDER_PUNCHER', 'AGENT'] },
            { label: 'Inventory', icon: Boxes, module: 'inventory', color: 'text-emerald-400', count: skus.length, roles: ['ADMIN', 'DISPATCHER'] },
            { label: 'Billing', icon: Receipt, module: 'billing', color: 'text-purple-400', count: invoices.length, roles: ['ADMIN', 'BILLING', 'ACCOUNTANT'] },
            { label: 'Credit', icon: AlertTriangle, module: 'credit', color: 'text-amber-400', count: overLimitRetailers.length, roles: ['ADMIN', 'ACCOUNTANT'] },
            { label: 'Claims', icon: FileCheck2, module: 'claims', color: 'text-rose-400', count: claims.length, roles: ['ADMIN'] },
          ]
            .filter((item) => item.roles.includes(activeRole))
            .map((item) => (
              <button
                key={item.module}
                onClick={() => onNavigate(item.module)}
                className="p-3 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 rounded-xl flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <item.icon size={18} className={item.color} />
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-blue-300">
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-400">{item.count} items</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-300" />
              </button>
            ))}
        </div>

        {/* Actionable Exceptions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Orders Needing Verification */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShoppingCart size={14} className="text-blue-400" />
                Recent Orders ({pendingOrders.length} Pending Approval)
              </h2>
              <button
                onClick={() => onNavigate('orders')}
                className="text-[11px] font-semibold text-blue-400 hover:underline"
              >
                View All →
              </button>
            </div>

            <div className="space-y-2">
              {orders.slice(0, 4).map((ord) => (
                <div
                  key={ord.id}
                  className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono font-bold text-white flex items-center gap-2">
                      {ord.order_number}
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-sans font-normal">
                        {ord.channel}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {ord.retailer_name_raw} | ₹{ord.total_amount.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      ord.status === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {ord.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Critical Risk & Leakage Flags */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert size={14} className="text-rose-400" />
                Critical Operational Alerts
              </h2>
              <button
                onClick={() => onNavigate('claims')}
                className="text-[11px] font-semibold text-rose-400 hover:underline"
              >
                Review Claims →
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">Below-Cost Margin Flags ({flaggedOrders.length})</div>
                  <div className="text-[11px] text-slate-400">Selling price below landing price detected</div>
                </div>
                <button
                  onClick={() => onNavigate('claims')}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] rounded"
                >
                  Fix Claims
                </button>
              </div>

              <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">Over-Limit Retailers ({overLimitRetailers.length})</div>
                  <div className="text-[11px] text-slate-400">Stores exceeding configured credit threshold</div>
                </div>
                <button
                  onClick={() => onNavigate('credit')}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] rounded"
                >
                  Manage Credit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. BILLING EXECUTIVE HOME (Billing Queue)
  // ---------------------------------------------------------------------------
  if (activeRole === 'BILLING') {
    const billingExecutives = users.filter((u) => u.role === 'BILLING');

    // Determine effective current Billing Executive:
    // Strictly scoped to the logged-in Billing Executive's profile
    const currentBEUser =
      (currentUser?.role === 'BILLING'
        ? currentUser
        : users.find((u) => u.id === currentUser?.id && u.role === 'BILLING')) ||
      billingExecutives.find((u) => u.role === 'BILLING') ||
      billingExecutives[0];

    const effectiveCurrentBEId = currentBEUser?.id || 'usr_billing_1';
    const currentBEName = currentBEUser?.name || 'Priya Verma (BE-1)';

    // Commission Agents assigned to this Billing Executive
    const assignedCAs = users.filter(
      (u) => u.role === 'AGENT' && u.billing_executive_id === effectiveCurrentBEId
    );

    // Filter orders strictly to those taken by this BE's assigned Commission Agents or tagged to this BE
    const beQueueOrders = safeOrders.filter((o) =>
      isOrderAssignedToBE(o, effectiveCurrentBEId, users)
    );

    const pendingVerificationOrders = beQueueOrders.filter(
      (o) => o.status === 'PENDING_VERIFICATION' || o.status === 'PUNCHED' || o.status === 'FLAGGED'
    );
    const readyToInvoiceOrders = beQueueOrders.filter(
      (o) => o.status === 'APPROVED' || o.status === 'DISPATCHED' || o.status === 'VERIFIED_BY_BILLING' || o.status === 'VERIFIED'
    );

    const directBEOrders = safeOrders.filter(
      (o) =>
        o.is_direct_be_order ||
        o.channel === 'DISTRIBUTOR' ||
        o.channel === 'INSTITUTIONAL' ||
        !o.commission_agent_id
    );

    // Invoices relevant to this BE's orders
    const beInvoices = safeInvoices.filter((inv) => {
      const relatedOrder = safeOrders.find((o) => o.id === inv.order_id);
      if (relatedOrder) {
        return isOrderAssignedToBE(relatedOrder, effectiveCurrentBEId, users);
      }
      return true;
    });
    const beInvoicedValue = beInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

    return (
      <div className="space-y-6">
        {/* Billing Executive Desk Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
              <Home size={16} /> Home — Billing Work Queue
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-bold text-white">
                Billing Console & Accounting Sync
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                <UserCheck size={12} />
                <span>Desk: {currentBEName}</span>
              </span>
            </div>

            {/* Assigned CAs Pill */}
            <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500 font-semibold">Assigned Commission Agents ({assignedCAs.length}):</span>
              {assignedCAs.length > 0 ? (
                assignedCAs.map((ca) => (
                  <span
                    key={ca.id}
                    className="px-2 py-0.5 bg-slate-800 border border-slate-700/80 rounded text-[11px] text-purple-300 font-medium"
                  >
                    {ca.name}
                  </span>
                ))
              ) : (
                <span className="text-amber-400 italic text-[11px]">No Commission Agents currently assigned</span>
              )}
            </div>

            <p className="text-[11px] text-slate-500 mt-1">
              Showing strictly orders from your assigned Commission Agents • Accounting Sync:{' '}
              <span className="text-emerald-400 font-semibold">{activeTenantSettings?.accounting_integration || 'ZOHO'}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsBEOnboardOpen(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Building2 size={14} className="text-purple-400" />
              <span>Onboard Distributor/Institution</span>
            </button>
            <button
              onClick={() => {
                setSelectedBEClientId(undefined);
                setIsBEPunchOpen(true);
              }}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart size={14} />
              <span>+ New Direct Order</span>
            </button>
            <button
              onClick={() => onNavigate('billing')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-bold rounded-xl border border-purple-800/60 shadow transition-colors cursor-pointer"
            >
              Billing Ledger →
            </button>
          </div>
        </div>

        {/* Billing Task KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            title="My Orders Pending Verification"
            value={pendingVerificationOrders.length}
            delta={{ value: `${assignedCAs.length} CAs`, isPositive: true, label: 'in your queue' }}
            icon={Receipt}
            subtext="Assigned commission agent orders"
            accentColor="#9333ea"
          />
          <KPICard
            title="Invoices Raised Today"
            value={beInvoices.length}
            delta={{ value: `₹${beInvoicedValue.toLocaleString('en-IN')}`, isPositive: true, label: 'total value' }}
            icon={CheckCircle2}
            subtext="GST + Cash Non-GST"
            accentColor="#10b981"
          />
          <KPICard
            title="Accounting Sync Engine"
            value={activeTenantSettings?.accounting_integration || 'ZOHO'}
            delta={{ value: 'Connected', isPositive: true, label: 'real-time sync' }}
            icon={RefreshCw}
            subtext="Swappable per tenant"
          />
        </div>

        {/* Store Orders Pending Verification Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Receipt size={16} className="text-purple-400" />
                Store Orders Pending Verification ({pendingVerificationOrders.length} Orders in Desk Queue)
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Orders taken by your assigned Commission Agents awaiting line-rate review & credit approval
              </p>
            </div>
            <button
              onClick={() => onNavigate('billing')}
              className="text-xs text-purple-400 hover:underline font-semibold"
            >
              Verify All in Billing Queue →
            </button>
          </div>

          {pendingVerificationOrders.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <div className="font-semibold text-slate-300">All Clear — No Pending Orders in {currentBEName}&apos;s Queue</div>
              <p className="text-[11px] text-slate-500">
                No orders are currently awaiting verification from assigned agents: {assignedCAs.map((a) => a.name).join(', ') || 'None'}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {pendingVerificationOrders.slice(0, 6).map((ord) => {
                const agentName =
                  ord.commission_agent_name ||
                  users.find((u) => u.id === ord.commission_agent_id || u.id === ord.created_by_user_id)?.name ||
                  'Assigned Agent';

                return (
                  <div
                    key={ord.id}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="font-mono font-bold text-white flex items-center gap-1.5 flex-wrap">
                        <span>{ord.order_number}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                          {ord.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 font-medium truncate">
                        {ord.retailer_name_raw} | <strong className="text-emerald-400 font-mono">₹{getOrderFinancialSummary(ord).totalAmountWithGst.toLocaleString('en-IN')}</strong>
                      </div>
                      <div className="text-[10px] text-purple-300 flex items-center gap-1.5">
                        <UserCheck size={11} className="text-purple-400 shrink-0" />
                        <span className="truncate">Agent: <strong className="text-slate-200">{agentName}</strong></span>
                        {ord.beat_name && <span className="text-slate-500 truncate">• {ord.beat_name}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setSelectedOrderForReview(ord)}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                        title="Inspect order line details and verify"
                      >
                        <Eye size={13} /> View
                      </button>
                      <button
                        onClick={() => onNavigate('billing')}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-colors"
                        title="Open Billing Ledger"
                      >
                        Edit/Bill
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ready to Invoice Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Receipt size={16} className="text-purple-400" />
            Pending Invoicing Queue ({readyToInvoiceOrders.length} Orders in Desk Queue)
          </h2>

          {readyToInvoiceOrders.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs bg-slate-950 rounded-xl border border-slate-800">
              No orders pending invoicing for {currentBEName}&apos;s assigned agents currently.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {readyToInvoiceOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="font-mono font-bold text-white">{ord.order_number}</div>
                    <div className="text-[11px] text-slate-400">
                      {ord.retailer_name_raw} | ₹{getOrderFinancialSummary(ord).totalAmountWithGst.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Agent: {ord.commission_agent_name || users.find((u) => u.id === ord.commission_agent_id)?.name || 'CA'}
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('billing')}
                    className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                  >
                    Generate Invoice
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distributors & Institutions Direct Orders Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-purple-400" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Distributors & Institutions Direct Orders ({directBEOrders.length} Orders Placed)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  Auto-Verified • Direct BE Scope
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                B2B institutional and distributor orders punched directly by Billing Executives with custom rates. Bypasses CA verification queue directly to billing.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsBEOnboardOpen(true)}
                className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} /> Onboard Client
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => onNavigate('orders')}
                className="text-xs text-purple-400 hover:underline font-semibold"
              >
                View in Orders Console →
              </button>
            </div>
          </div>

          {directBEOrders.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <Building2 size={24} className="mx-auto text-slate-600" />
              <div className="font-semibold text-slate-300">No Direct Client Orders Placed Yet</div>
              <p className="text-[11px] text-slate-500">
                You can onboard distributors/institutions and punch direct orders without field agents.
              </p>
              <button
                onClick={() => {
                  setSelectedBEClientId(undefined);
                  setIsBEPunchOpen(true);
                }}
                className="mt-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} /> Punch Direct Order
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {directBEOrders.slice(0, 6).map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-white">{ord.order_number}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                        {ord.status}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 text-xs truncate">
                      {ord.retailer_name_raw}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/50 font-medium">
                        {ord.channel}
                      </span>
                      <span>• {ord.lines?.length || 0} SKUs</span>
                      <span>• {ord.order_date}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      ₹{ord.total_amount.toLocaleString('en-IN')}
                    </span>
                    <button
                      onClick={() => onNavigate('billing')}
                      className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Generate Invoice
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ORDER DETAILS & VERIFICATION MODAL FOR BILLING EXECUTIVE */}
        {selectedOrderForReview && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-5 sm:p-6 text-slate-200 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <FileText size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white font-mono">
                        {selectedOrderForReview.order_number}
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                        {selectedOrderForReview.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Billing Executive Order Review & Verification Audit
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOrderForReview(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto pr-1 space-y-4 text-xs flex-1">
                {(() => {
                  const retailerObj = safeRetailers.find(
                    (r) =>
                      r.id === selectedOrderForReview.retailer_id ||
                      r.name.toLowerCase() === selectedOrderForReview.retailer_name_raw.toLowerCase()
                  );
                  const dpObj = safeDispatchPoints.find(
                    (dp) => dp.id === selectedOrderForReview.dispatch_point_id
                  );
                  const agentObj = (users || []).find(
                    (u) => u.id === selectedOrderForReview.commission_agent_id
                  );
                  const agentName =
                    selectedOrderForReview.commission_agent_name ||
                    agentObj?.name ||
                    'Commission Agent';

                  const financialSummary = getOrderFinancialSummary(selectedOrderForReview);
                  const creditLimit =
                    retailerObj?.credit_limit ||
                    activeTenantSettings?.credit_limit_default ||
                    50000;
                  const currentOutstanding = retailerObj?.current_outstanding || 0;
                  const projectedTotal =
                    currentOutstanding + financialSummary.totalAmountWithGst;
                  const isOverCredit = projectedTotal > creditLimit;

                  const hasBelowCost =
                    selectedOrderForReview.has_below_cost_lines ||
                    (selectedOrderForReview.lines || []).some(
                      (l) => l.is_below_cost || l.unit_price < l.landing_price
                    );

                  return (
                    <div className="space-y-3">
                      {/* Store & Route Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">
                            Buyer / Retail Store
                          </span>
                          <strong className="text-white text-sm block">
                            {selectedOrderForReview.retailer_name_raw}
                          </strong>
                          <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                            <div>
                              Beat:{' '}
                              <span className="text-slate-300 font-medium">
                                {selectedOrderForReview.beat_name || 'Standard Route'}
                              </span>{' '}
                              | Channel:{' '}
                              <span className="text-blue-400 font-medium">
                                {selectedOrderForReview.channel || 'GT'}
                              </span>
                            </div>
                            {retailerObj?.contact_person && (
                              <div>
                                Contact:{' '}
                                <span className="text-slate-300">
                                  {retailerObj.contact_person} ({retailerObj.phone})
                                </span>
                              </div>
                            )}
                            {retailerObj?.gstin && (
                              <div className="font-mono text-[10px] text-slate-400">
                                GSTIN: {retailerObj.gstin}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">
                            Fulfillment & Route
                          </span>
                          <div className="text-[11px] text-slate-400 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <UserCheck size={13} className="text-purple-400 shrink-0" />
                              <span>
                                Agent:{' '}
                                <strong className="text-slate-200">{agentName}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MapPin size={13} className="text-blue-400 shrink-0" />
                              <span>
                                Warehouse:{' '}
                                <strong className="text-slate-200">
                                  {dpObj?.name ||
                                    selectedOrderForReview.dispatch_point_id ||
                                    'Central Warehouse'}
                                </strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar size={13} className="text-slate-400 shrink-0" />
                              <span>
                                Booked:{' '}
                                <span className="text-slate-300">
                                  {selectedOrderForReview.order_date}
                                </span>{' '}
                                | Delivery:{' '}
                                <span className="text-emerald-400 font-medium">
                                  {selectedOrderForReview.delivery_date}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Retailer Credit Health & Exposure */}
                      <div
                        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                          isOverCredit
                            ? 'bg-rose-950/20 border-rose-500/30'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CreditCard
                            size={16}
                            className={isOverCredit ? 'text-rose-400' : 'text-slate-400'}
                          />
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                              Retailer Credit Exposure
                            </span>
                            <div className="text-xs text-slate-300">
                              Outstanding:{' '}
                              <span className="font-mono font-bold text-amber-400">
                                ₹{currentOutstanding.toLocaleString('en-IN')}
                              </span>{' '}
                              /{' '}Limit:{' '}
                              <span className="font-mono font-semibold text-slate-400">
                                ₹{creditLimit.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">
                            Post-Order Exposure
                          </span>
                          <span
                            className={`font-mono font-bold text-xs ${
                              isOverCredit ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            ₹{projectedTotal.toLocaleString('en-IN')}{' '}
                            {isOverCredit ? '(Exceeds Limit)' : '(Within Limit)'}
                          </span>
                        </div>
                      </div>

                      {/* Warning Notice if Below Cost */}
                      {hasBelowCost && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
                          <AlertTriangle
                            size={16}
                            className="shrink-0 text-amber-400 mt-0.5"
                          />
                          <div>
                            <strong className="block font-semibold">
                              Pricing Sanity Alert: Below Cost Rates Detected
                            </strong>
                            <p className="text-[11px] text-amber-200/80 mt-0.5">
                              One or more lines in this order are priced below the master
                              landing price. Please verify the negotiated rates before
                              verifying and approving.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Line Items Table */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                            Order Line Items (
                            {selectedOrderForReview.lines?.length || 0})
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Check SKU, quantities & rates
                          </span>
                        </div>

                        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold text-[10px]">
                              <tr>
                                <th className="p-2.5">Item / SKU</th>
                                <th className="p-2.5 text-center">Qty</th>
                                <th className="p-2.5 text-right">Unit Rate</th>
                                <th className="p-2.5 text-right">Landing Cost</th>
                                <th className="p-2.5 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {(selectedOrderForReview.lines || []).map((line, idx) => {
                                const skuObj = safeSkus.find((s) => s.id === line.sku_id);
                                const compObj = companies.find(
                                  (c) =>
                                    c.id === line.company_id ||
                                    c.id === skuObj?.company_id
                                );
                                const isBelow =
                                  line.is_below_cost ||
                                  line.unit_price < line.landing_price;

                                return (
                                  <tr
                                    key={line.id || idx}
                                    className={`hover:bg-slate-900/50 transition-colors ${
                                      isBelow ? 'bg-amber-950/10' : ''
                                    }`}
                                  >
                                    <td className="p-2.5">
                                      <div className="font-semibold text-white">
                                        {line.sku_name || skuObj?.name || line.sku_id}
                                      </div>
                                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                        {compObj && (
                                          <span className="text-purple-400 font-medium">
                                            {compObj.name}
                                          </span>
                                        )}
                                        {skuObj?.pack_size && (
                                          <span>• {skuObj.pack_size}</span>
                                        )}
                                        {isBelow && (
                                          <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[9px]">
                                            BELOW COST
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-2.5 text-center font-mono font-bold text-white">
                                      {line.quantity}
                                    </td>
                                    <td className="p-2.5 text-right font-mono text-slate-200">
                                      ₹{line.unit_price.toFixed(2)}
                                    </td>
                                    <td className="p-2.5 text-right font-mono text-slate-400">
                                      ₹{line.landing_price.toFixed(2)}
                                    </td>
                                    <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                                      ₹
                                      {line.total.toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                      })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Order Invoicing Classification */}
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                            <FileText size={14} className="text-purple-400" />
                            Order Invoicing Classification <span className="text-rose-400 font-bold">*</span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {retailerObj?.gstin ? (
                              <span className="text-blue-400 font-mono font-medium">Customer GSTIN: {retailerObj.gstin}</span>
                            ) : (
                              <span className="text-amber-400 font-medium">Unregistered Customer (Cash/Composite)</span>
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setHomeReviewInvoicingType('UNREGISTERED_CASH')}
                            className={`p-2.5 rounded-xl text-left border transition-all ${
                              homeReviewInvoicingType === 'UNREGISTERED_CASH'
                                ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm ring-1 ring-amber-500'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-bold text-xs">
                              <Coins size={14} className={homeReviewInvoicingType === 'UNREGISTERED_CASH' ? 'text-amber-400' : 'text-slate-500'} />
                              Unregistered Cash
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Cash retail or composite sale. Form-08 commercial bill without B2B GST tax credit.
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setHomeReviewInvoicingType('REGISTERED_GST')}
                            className={`p-2.5 rounded-xl text-left border transition-all ${
                              homeReviewInvoicingType === 'REGISTERED_GST'
                                ? 'bg-blue-500/20 border-blue-500 text-blue-200 shadow-sm ring-1 ring-blue-500'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-bold text-xs">
                              <FileSpreadsheet size={14} className={homeReviewInvoicingType === 'REGISTERED_GST' ? 'text-blue-400' : 'text-slate-500'} />
                              Registered GST
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Official B2B Tax Invoice with item-level 18% GST tax credit pass-through.
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Financial Totals Summary with GST Included */}
                      <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex justify-between text-slate-400 text-xs">
                          <span>Product Value (Taxable Amount):</span>
                          <span className="font-mono text-slate-200">
                            ₹
                            {financialSummary.productValue.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400 text-xs">
                          <span className="flex items-center gap-1.5">
                            <span>Applicable GST (18%):</span>
                            <span className="text-[10px] text-amber-400 bg-amber-950/40 border border-amber-800/60 px-1.5 py-0.5 rounded font-semibold">
                              FMCG Tax
                            </span>
                          </span>
                          <span className="font-mono text-amber-300 font-semibold">
                            + ₹
                            {financialSummary.gstAmount.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between text-white font-bold text-sm pt-2.5 border-t border-slate-800">
                          <div className="space-y-0.5">
                            <span className="flex items-center gap-1.5">
                              <span>Total Amount:</span>
                              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-1.5 py-0.5 rounded">
                                GST Included
                              </span>
                            </span>
                            <span className="text-[10px] text-slate-400 block font-normal">
                              (Product Value ₹{financialSummary.productValue.toLocaleString('en-IN')} + GST ₹{financialSummary.gstAmount.toLocaleString('en-IN')})
                            </span>
                          </div>
                          <span className="font-mono text-emerald-400 text-base font-bold">
                            ₹
                            {financialSummary.totalAmountWithGst.toLocaleString(
                              'en-IN',
                              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Action Buttons Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForReview(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors"
                >
                  Close
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderForReview(null);
                      onNavigate('billing');
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 font-semibold rounded-xl text-xs transition-colors"
                  >
                    Open in Billing Ledger
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const fin = getOrderFinancialSummary(selectedOrderForReview);
                      const retailerObj = safeRetailers.find(
                        (r) =>
                          r.id === selectedOrderForReview.retailer_id ||
                          r.name.toLowerCase() === selectedOrderForReview.retailer_name_raw.toLowerCase()
                      );
                      const creditLimit =
                        retailerObj?.credit_limit ||
                        activeTenantSettings?.credit_limit_default ||
                        50000;
                      const currentOutstanding = retailerObj?.current_outstanding || 0;
                      const projectedTotal = currentOutstanding + fin.totalAmountWithGst;
                      const isOverCredit = projectedTotal > creditLimit;

                      const reason = isOverCredit
                        ? `Billing Executive Authorized: Credit variance approved under direct B2B terms (${homeReviewInvoicingType === 'REGISTERED_GST' ? 'Registered GST' : 'Unregistered Cash'}).`
                        : `Verified & Approved by Billing Executive (${homeReviewInvoicingType === 'REGISTERED_GST' ? 'Registered GST' : 'Unregistered Cash'})`;

                      // Uniform backend logic & status with Billing Verification Queue
                      verifyAndApproveOrderByBilling(
                        selectedOrderForReview.id,
                        effectiveCurrentBEId,
                        reason,
                        undefined,
                        homeReviewInvoicingType
                      );

                      alert(
                        `Order ${selectedOrderForReview.order_number} successfully verified and approved by Billing Executive!\n\n• Classification: ${homeReviewInvoicingType === 'REGISTERED_GST' ? 'Registered GST (B2B Tax Invoice)' : 'Unregistered Cash (Commercial Bill)'}\n• Final Order Value: ₹${fin.totalAmountWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (GST Included)\n• Status updated to VERIFIED & locked\n• Commission Agent can now deliver to ${selectedOrderForReview.retailer_name_raw}\n• Order moved to Ready to Invoice Queue`
                      );
                      setSelectedOrderForReview(null);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition-all transform active:scale-95"
                  >
                    <CheckCircle2 size={16} /> Verify & Approve Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ONBOARD DISTRIBUTOR / INSTITUTION */}
        {isBEOnboardOpen && (
          <BEDistributorOnboardingModal
            isOpen={isBEOnboardOpen}
            onClose={() => setIsBEOnboardOpen(false)}
            onSuccess={(client, proceedToOrder) => {
              if (proceedToOrder) {
                setSelectedBEClientId(client.id);
                setIsBEPunchOpen(true);
              }
            }}
          />
        )}

        {/* MODAL: DIRECT BE ORDER PUNCH DESK */}
        {isBEPunchOpen && (
          <BEDistributorOrderPunchModal
            isOpen={isBEPunchOpen}
            onClose={() => {
              setIsBEPunchOpen(false);
              setSelectedBEClientId(undefined);
            }}
            initialClientId={selectedBEClientId}
            onOpenOnboarding={() => {
              setIsBEPunchOpen(false);
              setIsBEOnboardOpen(true);
            }}
          />
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. ORDER PUNCHER HOME (Order Review Queue)
  // ---------------------------------------------------------------------------
  if (activeRole === 'ORDER_PUNCHER') {
    const newOrdersQueue = orders.filter((o) => o.status === 'PUNCHED');

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
              <Home size={16} /> Home — Order Review Queue
            </div>
            <h1 className="text-lg font-bold text-white">
              Omnichannel Order Capture & Verification Queue
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Review and verify newly punched orders across GT, MT, E-commerce, and Institutional channels.
            </p>
          </div>

          <button
            onClick={() => onNavigate('orders')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow"
          >
            + Punch New Order
          </button>
        </div>

        {/* Order Puncher KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            title="Pending Verification Queue"
            value={newOrdersQueue.length}
            delta={{ value: 'Requires Review', isPositive: true, label: 'new orders' }}
            icon={Clock}
            subtext="Awaiting approval"
            accentColor="#3b82f6"
          />
          <KPICard
            title="Total Sales Booked"
            value={`₹${totalSalesValue.toLocaleString('en-IN')}`}
            delta={{ value: `${orders.length} total`, isPositive: true, label: 'all channels' }}
            icon={ShoppingCart}
            subtext="Gross sales value"
          />
          <KPICard
            title="Below-Cost Margin Warnings"
            value={flaggedOrders.length}
            delta={{ value: 'Auto-Scheme Claim', isPositive: false, label: 'price < landing' }}
            icon={AlertTriangle}
            subtext="Scheme claim triggered"
            accentColor="#f59e0b"
          />
        </div>

        {/* Order Review Task List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock size={16} className="text-blue-400" />
            Unverified Orders Needing Approval ({newOrdersQueue.length})
          </h2>

          <div className="space-y-2 text-xs">
            {newOrdersQueue.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                All order queues are clear! No pending orders.
              </div>
            ) : (
              newOrdersQueue.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-mono font-bold text-white flex items-center gap-2">
                      {ord.order_number}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-blue-300 font-sans">
                        {ord.channel}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {ord.retailer_name_raw} | Value: <strong className="text-white">₹{ord.total_amount.toLocaleString('en-IN')}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateOrderStatus(ord.id, 'APPROVED')}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                    >
                      Approve Order
                    </button>
                    <button
                      onClick={() => updateOrderStatus(ord.id, 'CANCELLED')}
                      className="px-3 py-1.5 rounded bg-rose-600/30 text-rose-300 border border-rose-500/40 hover:bg-rose-600/50 text-xs font-bold"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. DISPATCHER HOME (Mobile Field Inventory Home)
  // ---------------------------------------------------------------------------
  if (activeRole === 'DISPATCHER') {
    const dp = dispatchPoints[0] || { name: 'Central Depot', code: 'WH-01' };

    return (
      <div className="space-y-4 max-w-md mx-auto">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-xs space-y-2">
          <div className="flex items-center justify-between text-emerald-400 font-semibold">
            <span className="flex items-center gap-1.5">
              <Boxes size={16} /> Location: {dp.name} ({dp.code})
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px] border border-emerald-500/30">
              Hard Gate Active
            </span>
          </div>
          <h1 className="text-base font-bold text-white">
            Today's Dispatch Point Stock Snapshot
          </h1>
          <p className="text-slate-400">
            Log inward receipts and outward dispatch gate movements matching physical inventory.
          </p>
        </div>

        {/* Stock Ledger Snapshot */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-white">Tracked SKU Stock Levels</span>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-emerald-400 font-bold hover:underline"
            >
              + Log Movement
            </button>
          </div>

          <div className="space-y-2">
            {skus.map((sku) => {
              const skuLedger = stockLedger.filter((st) => st.sku_id === sku.id);
              const inward = skuLedger
                .filter((st) => st.entry_type === 'INWARD' || st.entry_type === 'RETURN')
                .reduce((s, st) => s + st.quantity, 0);
              const outward = skuLedger
                .filter((st) => st.entry_type === 'DISPATCH_OUT')
                .reduce((s, st) => s + st.quantity, 0);
              const currentStock = Math.max(0, inward - outward);

              return (
                <div
                  key={sku.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-white">{sku.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{sku.code}</div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-400 text-sm">
                      {currentStock} units
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      In: +{inward} | Out: -{outward}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 5. ACCOUNTANT HOME (Collections View)
  // ---------------------------------------------------------------------------
  if (activeRole === 'ACCOUNTANT') {
    const uncollectedInvoices = invoices.filter((i) => i.status !== 'PAID');

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              <Home size={16} /> Home — Collections & Verification Queue
            </div>
            <h1 className="text-lg font-bold text-white">
              Accountant Collections Dashboard
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Verify payments, reconcile outstanding receivables, and audit retailer credit thresholds.
            </p>
          </div>

          <button
            onClick={() => onNavigate('credit')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow"
          >
            Go to Credit Management →
          </button>
        </div>

        {/* Accountant KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard
            title="Total Outstanding Receivables"
            value={`₹${totalOutstandingValue.toLocaleString('en-IN')}`}
            delta={{ value: `${uncollectedInvoices.length} invoices`, isPositive: false, label: 'uncollected' }}
            icon={DollarSign}
            subtext="Retailer balance due"
            accentColor="#e11d48"
          />
          <KPICard
            title="Total Cash Collected"
            value={`₹${totalCollectedValue.toLocaleString('en-IN')}`}
            delta={{ value: 'Auto Payment Match', isPositive: true, label: 'verified' }}
            icon={CheckCircle2}
            subtext="Bank & UPI receipts"
            accentColor="#10b981"
          />
          <KPICard
            title="Credit Limit Exceeded Stores"
            value={overLimitRetailers.length}
            delta={{ value: 'Credit Gate Active', isPositive: false, label: 'flagged' }}
            icon={AlertTriangle}
            subtext="Exceeds threshold"
            accentColor="#f59e0b"
          />
        </div>

        {/* Verification Task Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <DollarSign size={16} className="text-emerald-400" />
            Uncollected Invoices Needing Verification ({uncollectedInvoices.length})
          </h2>

          <div className="space-y-2 text-xs">
            {uncollectedInvoices.map((inv) => (
              <div
                key={inv.id}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-mono font-bold text-white">{inv.invoice_number}</div>
                  <div className="text-[11px] text-slate-400">
                    Retailer: <strong className="text-white">{inv.retailer_name}</strong> | Due: ₹{(inv.total_amount - inv.paid_amount).toLocaleString('en-IN')}
                  </div>
                </div>

                <button
                  onClick={() => onNavigate('billing')}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Match Payment
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 6. COMMISSION AGENT HOME (Mobile Capture CTA & Orders List)
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-md mx-auto space-y-4 text-xs">
      {/* Primary Action Hero Header */}
      <div className="p-4 bg-gradient-to-br from-blue-900/80 to-slate-900 border border-blue-500/40 rounded-3xl text-center space-y-3 shadow-xl">
        <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider bg-blue-500/20 px-3 py-1 rounded-full border border-blue-500/30">
          Field Beat Action Home
        </span>

        <h1 className="text-lg font-bold text-white">
          Field Commission Agent
        </h1>

        <p className="text-slate-300 text-xs">
          Punch GT store orders directly from field visits with real-time stock and margin validation.
        </p>

        <button
          onClick={() => onNavigate('orders')}
          className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/50 transition-all transform active:scale-95"
        >
          <Send size={18} /> Capture New Beat Order
        </button>
      </div>

      {/* Today's Orders List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <span className="font-bold text-white">Today's Captured Orders ({orders.length})</span>
          <button
            onClick={() => onNavigate('orders')}
            className="text-blue-400 font-bold hover:underline"
          >
            History →
          </button>
        </div>

        <div className="space-y-2">
          {orders.map((ord) => {
            const isDelivered = ord.status === 'DELIVERED';
            const isPendingVerification = ord.status === 'PENDING_VERIFICATION' || ord.status === 'PUNCHED';
            const isVerified = [
              'VERIFIED',
              'VERIFIED_BY_BILLING',
              'APPROVED',
              'DISPATCHED',
              'PUNCHED_TO_PRINCIPAL',
              'CLEARED'
            ].includes(ord.status);

            return (
              <div
                key={ord.id}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-mono font-bold text-white">{ord.order_number}</div>
                  <div className="text-[11px] text-slate-400">{ord.retailer_name_raw}</div>
                </div>

                <div className="text-right flex flex-col items-end gap-1">
                  <div className="font-mono font-bold text-emerald-400 text-xs">
                    ₹{ord.total_amount.toLocaleString('en-IN')}
                  </div>

                  {isDelivered ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold inline-flex items-center gap-1">
                      <CheckCircle2 size={10} /> Delivered
                    </span>
                  ) : isPendingVerification ? (
                    <span
                      title="Cannot mark delivered until Billing Executive verifies order"
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-semibold inline-flex items-center gap-1 cursor-not-allowed"
                    >
                      <Lock size={10} /> Pending Verification
                    </span>
                  ) : isVerified ? (
                    <button
                      onClick={() => {
                        updateOrderStatus(ord.id, 'DELIVERED');
                        alert(`Order ${ord.order_number} marked as DELIVERED!\nRetailer outstanding balance updated.`);
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-lg shadow-sm flex items-center gap-1 transition-all"
                      title="Click to mark order delivered to store"
                    >
                      <Truck size={10} /> Mark Delivered
                    </button>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                      {ord.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
