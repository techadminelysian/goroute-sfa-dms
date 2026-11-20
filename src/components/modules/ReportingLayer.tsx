import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../data/store';
import { KPICard } from '../common/KPICard';
import {
  buildDispatchBatchHistorySummaries,
  getOrderEffectiveDispatchDate,
  isOrderAlreadyDispatched,
} from '../../utils/dispatchBatching';
import {
  doesOrderBelongToDispatchPoint,
  getEffectiveLineCompanyId,
  UNMAPPED_DISPATCH_POINT_ID,
} from '../../utils/dispatchRouting';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  ShieldAlert,
  FileSpreadsheet,
  Building,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Truck,
  Download,
  ChevronDown,
  ChevronUp,
  Warehouse,
  CheckCircle2,
  Clock
} from 'lucide-react';

export const ReportingLayer: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    companies,
    dispatchPoints = [],
    skus,
    orders,
    invoices,
    claims,
    retailers,
    stockLedger
  } = useAppStore();

  const [activeReportTab, setActiveReportTab] = useState<
    | 'SALES_VS_COLLECTION'
    | 'INVENTORY_VARIANCE'
    | 'CLAIMS_AGING'
    | 'CHANNEL_PERFORMANCE'
    | 'OUTSTANDING_CREDIT'
    | 'DISPATCH_BATCH_HISTORY'
  >('SALES_VS_COLLECTION');

  // Dispatch Batch History Filters
  const [batchFromDate, setBatchFromDate] = useState<string>('');
  const [batchToDate, setBatchToDate] = useState<string>('');
  const [batchDpFilter, setBatchDpFilter] = useState<string>('ALL');
  const [batchCompanyFilter, setBatchCompanyFilter] = useState<string>('ALL');
  const [batchStatusFilter, setBatchStatusFilter] = useState<'ALL' | 'QUEUED' | 'PARTIAL' | 'FINALIZED'>('ALL');
  const [expandedBatchKey, setExpandedBatchKey] = useState<string | null>(null);

  // Sales vs Collection Stats
  const totalSalesValue = orders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalCollectedValue = invoices.reduce((sum, i) => sum + i.paid_amount, 0);
  const totalInvoicedValue = invoices.reduce((sum, i) => sum + i.total_amount, 0);
  const totalOutstandingValue = retailers.reduce((sum, r) => sum + (r.current_outstanding || 0), 0);

  // Channel breakdown
  const channelBreakdown = ['GT', 'MT', 'INSTITUTIONAL', 'ECOMMERCE', 'DIRECT'].map((ch) => {
    const channelOrders = orders.filter((o) => o.channel === ch);
    const value = channelOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const count = channelOrders.length;
    return { channel: ch, value, count };
  });

  // Claims aging stats
  const totalClaimsVal = claims.reduce((s, c) => s + c.claim_amount, 0);
  const settledClaimsVal = claims.filter((c) => c.status === 'SETTLED').reduce((s, c) => s + c.claim_amount, 0);
  const pendingClaimsVal = totalClaimsVal - settledClaimsVal;

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
            <BarChart3 size={16} /> Module 5 — Executive Reporting Layer & Audit Analytics
          </div>
          <h1 className="text-lg font-bold text-white">
            Tenant-Scoped Performance & Financial Audits
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time analytics strictly isolated to tenant "{activeTenant.name}".
          </p>
        </div>

        {/* Report Selector Pills */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap">
          <button
            onClick={() => setActiveReportTab('SALES_VS_COLLECTION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeReportTab === 'SALES_VS_COLLECTION' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Sales vs Collection
          </button>
          <button
            onClick={() => setActiveReportTab('INVENTORY_VARIANCE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeReportTab === 'INVENTORY_VARIANCE' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Inventory Variance
          </button>
          <button
            onClick={() => setActiveReportTab('CLAIMS_AGING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeReportTab === 'CLAIMS_AGING' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            3. Claims Aging
          </button>
          <button
            onClick={() => setActiveReportTab('CHANNEL_PERFORMANCE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeReportTab === 'CHANNEL_PERFORMANCE' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            4. Channel Performance
          </button>
          <button
            onClick={() => setActiveReportTab('OUTSTANDING_CREDIT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeReportTab === 'OUTSTANDING_CREDIT' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            5. Outstanding & Credit
          </button>
          <button
            onClick={() => setActiveReportTab('DISPATCH_BATCH_HISTORY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              activeReportTab === 'DISPATCH_BATCH_HISTORY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Truck size={12} /> 6. Dispatch Batch History
          </button>
        </div>
      </div>

      {/* KPI Section with Mandatory Delta Line */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Gross Booked Sales"
          value={`₹${totalSalesValue.toLocaleString('en-IN')}`}
          delta={{ value: '+14.8%', isPositive: true, label: 'vs prior 30d' }}
          icon={TrendingUp}
          subtext="Total orders captured"
          accentColor="#a855f7"
        />
        <KPICard
          title="Cash & Bank Collection"
          value={`₹${totalCollectedValue.toLocaleString('en-IN')}`}
          delta={{ value: '+22.1%', isPositive: true, label: 'matched receipts' }}
          icon={DollarSign}
          subtext="Net liquidity in"
          accentColor="#059669"
        />
        <KPICard
          title="Total Claims Portfolio"
          value={`₹${totalClaimsVal.toLocaleString('en-IN')}`}
          delta={{ value: '+8.3%', isPositive: true, label: 'scheme recovery' }}
          icon={ShieldAlert}
          subtext="Principal receivable"
          accentColor="#f59e0b"
        />
        <KPICard
          title="Current Net Outstanding"
          value={`₹${totalOutstandingValue.toLocaleString('en-IN')}`}
          delta={{ value: '-2.4%', isPositive: true, label: 'ageing controlled' }}
          icon={AlertTriangle}
          subtext="Retailer receivables"
          accentColor="#e11d48"
        />
      </div>

      {/* Report 1: Sales vs Collection */}
      {activeReportTab === 'SALES_VS_COLLECTION' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-purple-400" />
              Sales Bookings vs Cash Collections Summary
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-slate-400 text-[11px] font-sans">Total Gross Sales</div>
                <div className="text-xl font-bold text-white mt-1">₹{totalSalesValue.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-emerald-400 font-sans mt-2">+14.8% vs last month</div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-slate-400 text-[11px] font-sans">Total Collected Funds</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">₹{totalCollectedValue.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-emerald-400 font-sans mt-2">82.4% collection efficiency</div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-slate-400 text-[11px] font-sans">Current Uncollected Receivables</div>
                <div className="text-xl font-bold text-rose-400 mt-1">₹{totalOutstandingValue.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-amber-400 font-sans mt-2">Within tenant credit terms</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report 2: Inventory Variance */}
      {activeReportTab === 'INVENTORY_VARIANCE' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-emerald-400" />
            Stock Ledger Movements & Physical Tally Reconciliation
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-4">SKU Code & Name</th>
                  <th className="py-2.5 px-4">Landing Cost</th>
                  <th className="py-2.5 px-4 text-right">Inward Inflow</th>
                  <th className="py-2.5 px-4 text-right">Dispatch Outflow</th>
                  <th className="py-2.5 px-4 text-right">System Balance</th>
                  <th className="py-2.5 px-4 text-right">Stock Valuation (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {skus.map((sku) => {
                  const skuLedger = stockLedger.filter((st) => st.sku_id === sku.id);
                  const inward = skuLedger
                    .filter((st) => st.entry_type === 'INWARD' || st.entry_type === 'RETURN')
                    .reduce((sum, st) => sum + st.quantity, 0);
                  const outward = skuLedger
                    .filter((st) => st.entry_type === 'DISPATCH_OUT' || st.entry_type === 'ADJUSTMENT_DAMAGE')
                    .reduce((sum, st) => sum + st.quantity, 0);
                  const balance = Math.max(0, inward - outward);
                  const val = balance * sku.landing_price;

                  return (
                    <tr key={sku.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-semibold text-white">
                        {sku.name}
                        <div className="text-[10px] text-slate-500 font-mono">{sku.code}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">₹{sku.landing_price}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-emerald-400">+{inward}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-rose-400">-{outward}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-white">{balance} units</td>
                      <td className="py-2.5 px-4 text-right font-mono text-emerald-400 font-bold">₹{val.toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 3: Claims Aging */}
      {activeReportTab === 'CLAIMS_AGING' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-400" />
            Claims Portfolio Aging & Principal Settlement Breakdown
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-slate-400 font-sans">Settled Claims</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">₹{settledClaimsVal.toLocaleString('en-IN')}</div>
              <div className="text-[10px] text-slate-500 font-sans mt-2">Credit notes received</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-slate-400 font-sans">Pending Submission / Review</div>
              <div className="text-xl font-bold text-amber-400 mt-1">₹{pendingClaimsVal.toLocaleString('en-IN')}</div>
              <div className="text-[10px] text-slate-500 font-sans mt-2">Under principal verification</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-slate-400 font-sans">Auto-Leakage Audit Flags</div>
              <div className="text-xl font-bold text-rose-400 mt-1">{claims.filter((c) => c.is_leakage_flagged).length} Items</div>
              <div className="text-[10px] text-rose-400 font-sans mt-2">Below-cost unmatched</div>
            </div>
          </div>
        </div>
      )}

      {/* Report 4: Channel Performance */}
      {activeReportTab === 'CHANNEL_PERFORMANCE' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <PieChart size={16} className="text-purple-400" />
            Omnichannel Volume & Order Contribution Breakdown
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {channelBreakdown.map((ch) => (
              <div key={ch.channel} className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between text-slate-400 font-semibold mb-2">
                  <span>{ch.channel} Channel</span>
                  <span className="text-[10px] bg-slate-800 text-blue-300 px-2 py-0.5 rounded font-mono">
                    {ch.count} Orders
                  </span>
                </div>
                <div className="text-lg font-bold text-white font-mono">
                  ₹{ch.value.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-emerald-400 font-sans mt-2">
                  {totalSalesValue > 0 ? ((ch.value / totalSalesValue) * 100).toFixed(1) : 0}% of total volume
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report 5: Outstanding & Credit */}
      {activeReportTab === 'OUTSTANDING_CREDIT' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-400" />
                Retailer Credit Limit & Outstanding Audit
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time synchronized trade receivables across delivered orders, tax invoices, and verified receipts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
                Total Outlets: <strong className="text-white">{retailers.length}</strong>
              </span>
              <span className="px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-mono text-rose-300">
                Over-Limit: <strong className="text-rose-400">{retailers.filter((r) => r.current_outstanding > r.credit_limit).length}</strong>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-4">Retailer / GT Store</th>
                  <th className="py-2.5 px-4">Beat Route</th>
                  <th className="py-2.5 px-4 text-right">Tenant Credit Limit (₹)</th>
                  <th className="py-2.5 px-4 text-right">Current Outstanding (₹)</th>
                  <th className="py-2.5 px-4 text-center">Credit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {retailers.map((r) => {
                  const isExceeded = r.current_outstanding > r.credit_limit;

                  return (
                    <tr key={r.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-semibold text-white">
                        {r.name}
                        <div className="text-[10px] text-slate-500 font-mono">{r.code}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{r.beat_name}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-300">
                        ₹{r.credit_limit.toLocaleString('en-IN')}
                      </td>
                      <td className={`py-2.5 px-4 text-right font-mono font-bold ${isExceeded ? 'text-rose-400' : 'text-emerald-400'}`}>
                        ₹{r.current_outstanding.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {isExceeded ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1">
                            <AlertTriangle size={10} /> Credit Limit Exceeded
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Normal Credit
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950 border-t-2 border-slate-800 font-bold text-xs">
                  <td colSpan={2} className="py-3 px-4 text-white">
                    Total Enterprise Retail Receivables ({retailers.length} Outlets)
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    ₹{retailers.reduce((s, r) => s + (r.credit_limit || 0), 0).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-rose-400 text-sm">
                    ₹{totalOutstandingValue.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-4 text-center text-slate-400 font-normal">
                    Synced with Ledger
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Report 6: Dispatch Batch History */}
      {activeReportTab === 'DISPATCH_BATCH_HISTORY' && (() => {
        const companyScopedOrders = orders.filter((ord) => {
          if (batchDpFilter !== 'ALL' && !doesOrderBelongToDispatchPoint(ord, batchDpFilter, companies, skus, dispatchPoints)) {
            return false;
          }
          if (batchCompanyFilter !== 'ALL') {
            const matchesComp =
              ord.company_id === batchCompanyFilter ||
              (ord.company_ids || []).includes(batchCompanyFilter) ||
              (ord.lines || []).some((l) => getEffectiveLineCompanyId(l, ord, skus) === batchCompanyFilter);
            if (!matchesComp) return false;
          }
          return true;
        });

        const allBatches = buildDispatchBatchHistorySummaries(
          companyScopedOrders,
          dispatchPoints,
          companies,
          skus
        );

        const filteredBatches = allBatches.filter((b) => {
          if (batchFromDate && b.dispatchDate < batchFromDate) return false;
          if (batchToDate && b.dispatchDate > batchToDate) return false;
          if (batchStatusFilter !== 'ALL' && b.status !== batchStatusFilter) return false;
          return true;
        });

        const totalBatchOrders = filteredBatches.reduce((s, b) => s + b.totalOrders, 0);
        const totalDispatched = filteredBatches.reduce((s, b) => s + b.dispatchedCount, 0);
        const totalPending = filteredBatches.reduce((s, b) => s + b.pendingCount, 0);
        const totalBatchValue = filteredBatches.reduce((s, b) => s + b.totalValue, 0);

        const handleExportBatchHistoryCsv = () => {
          const headers = [
            'Dispatch Date',
            'Batch ID',
            'Dispatch Point',
            'Principal Companies',
            'Parties',
            'Total Orders',
            'Dispatched Orders',
            'Pending Orders',
            'Invoiced Orders',
            'Total Units',
            'Total Value (INR)',
            'Batch Status',
          ];
          const rows = filteredBatches.map((b) =>
            [
              `"${b.dispatchDate}"`,
              `"${b.batchId}"`,
              `"${b.dispatchPointName} (${b.dispatchPointCode})"`,
              `"${b.companyNames.join('; ').replace(/"/g, '""')}"`,
              `"${b.partyNames.join('; ').replace(/"/g, '""')}"`,
              b.totalOrders,
              b.dispatchedCount,
              b.pendingCount,
              b.invoicedCount,
              b.totalUnits,
              b.totalValue,
              `"${b.status}"`,
            ].join(',')
          );
          const csv = [headers.join(','), ...rows].join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', `Dispatch_Batch_History_${new Date().toISOString().split('T')[0]}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        };

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Truck size={16} className="text-indigo-400" />
                  Daily Dispatch Batch History &amp; Fulfillment Audit
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chronological audit of D+1 daily dispatch batches across Dispatch Points, Principal Companies, and Dispatched vs Queued states.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportBatchHistoryCsv}
                disabled={filteredBatches.length === 0}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Download size={14} /> Export Batch History CSV
              </button>
            </div>

            {/* Filters Bar */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-indigo-400" />
                <span className="text-slate-400">From:</span>
                <input
                  type="date"
                  value={batchFromDate}
                  onChange={(e) => setBatchFromDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">To:</span>
                <input
                  type="date"
                  value={batchToDate}
                  onChange={(e) => setBatchToDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Warehouse size={13} className="text-cyan-400" />
                <select
                  value={batchDpFilter}
                  onChange={(e) => setBatchDpFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                >
                  <option value="ALL">All Dispatch Points</option>
                  {dispatchPoints.map((dp) => (
                    <option key={dp.id} value={dp.id}>
                      {dp.name} ({dp.code})
                    </option>
                  ))}
                  <option value={UNMAPPED_DISPATCH_POINT_ID}>⚠ Unmapped Dispatch Point</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <Building size={13} className="text-purple-400" />
                <select
                  value={batchCompanyFilter}
                  onChange={(e) => setBatchCompanyFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                >
                  <option value="ALL">All Principal Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={batchStatusFilter}
                onChange={(e) => setBatchStatusFilter(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
              >
                <option value="ALL">All Batch Statuses</option>
                <option value="QUEUED">Queued (Un-dispatched)</option>
                <option value="PARTIAL">Partially Dispatched</option>
                <option value="FINALIZED">Finalized (100% Dispatched)</option>
              </select>
              {(batchFromDate || batchToDate || batchDpFilter !== 'ALL' || batchCompanyFilter !== 'ALL' || batchStatusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setBatchFromDate('');
                    setBatchToDate('');
                    setBatchDpFilter('ALL');
                    setBatchCompanyFilter('ALL');
                    setBatchStatusFilter('ALL');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Reset Filters
                </button>
              )}
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-[10px] text-slate-400 font-sans">Filtered Batches</div>
                <div className="text-lg font-bold text-white mt-0.5">{filteredBatches.length}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-[10px] text-slate-400 font-sans">Dispatched / Total Orders</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  {totalDispatched} / {totalBatchOrders}
                </div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-[10px] text-slate-400 font-sans">Pending Un-dispatched</div>
                <div className="text-lg font-bold text-amber-300 mt-0.5">{totalPending}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="text-[10px] text-slate-400 font-sans">Total Batch Value</div>
                <div className="text-lg font-bold text-indigo-300 mt-0.5">
                  ₹{totalBatchValue.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Batch Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                    <th className="py-2.5 px-3">Dispatch Date</th>
                    <th className="py-2.5 px-3">Dispatch Point</th>
                    <th className="py-2.5 px-3">Companies</th>
                    <th className="py-2.5 px-3 text-right">Orders</th>
                    <th className="py-2.5 px-3 text-right">Dispatched</th>
                    <th className="py-2.5 px-3 text-right">Units</th>
                    <th className="py-2.5 px-3 text-right">Value (₹)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No dispatch batches match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => {
                      const rowKey = `${batch.dispatchDate}__${batch.dispatchPointId}`;
                      const isExpanded = expandedBatchKey === rowKey;
                      return (
                        <React.Fragment key={rowKey}>
                          <tr className="hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-300">
                              {batch.dispatchDate}
                              <div className="text-[10px] text-slate-500 font-normal">{batch.batchId}</div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">
                              {batch.dispatchPointId === UNMAPPED_DISPATCH_POINT_ID ? (
                                <span className="px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-500/40 text-[11px] font-bold">
                                  {batch.dispatchPointName}
                                </span>
                              ) : (
                                <>
                                  {batch.dispatchPointName}{' '}
                                  <span className="font-mono text-[10px] text-cyan-400">({batch.dispatchPointCode})</span>
                                </>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate">
                              {batch.companyNames.length > 0 ? batch.companyNames.join(', ') : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">{batch.totalOrders}</td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className="text-emerald-400 font-bold">{batch.dispatchedCount}</span>
                              {batch.pendingCount > 0 && (
                                <span className="text-amber-300"> ({batch.pendingCount} pend)</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">{batch.totalUnits.toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                              ₹{batch.totalValue.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {batch.status === 'FINALIZED' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                  <CheckCircle2 size={10} /> FINALIZED
                                </span>
                              ) : batch.status === 'PARTIAL' ? (
                                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                                  PARTIAL
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                  <Clock size={10} /> QUEUED
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => setExpandedBatchKey(isExpanded ? null : rowKey)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] inline-flex items-center gap-1"
                              >
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {isExpanded ? 'Hide' : 'Orders'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-950/80">
                              <td colSpan={9} className="p-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {batch.orders.map((ord) => (
                                    <div
                                      key={ord.id}
                                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-[11px]"
                                    >
                                      <div>
                                        <div className="font-mono font-bold text-indigo-300 flex items-center gap-1.5">
                                          {ord.order_number}
                                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[9px]">
                                            {ord.fulfillment_source === 'DEPOT_STOCK' ? 'DEPOT' : 'PO'}
                                          </span>
                                        </div>
                                        <div className="text-slate-200 font-semibold">{ord.retailer_name_raw}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">
                                          Batch Date: {getOrderEffectiveDispatchDate(ord)}
                                          {ord.dispatched_at ? ` • Dispatched: ${ord.dispatched_at.split('T')[0]}` : ''}
                                        </div>
                                      </div>
                                      <div className="text-right font-mono">
                                        <div className="font-bold text-emerald-400">
                                          ₹{(ord.total_amount || 0).toLocaleString('en-IN')}
                                        </div>
                                        <span
                                          className={`text-[9px] font-bold ${
                                            isOrderAlreadyDispatched(ord) ? 'text-emerald-400' : 'text-amber-300'
                                          }`}
                                        >
                                          {ord.status}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
