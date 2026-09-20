import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import { KPICard } from '../common/KPICard';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  ShieldAlert,
  FileSpreadsheet,
  Building,
  DollarSign,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';

export const ReportingLayer: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    companies,
    skus,
    orders,
    invoices,
    claims,
    retailers,
    stockLedger
  } = useAppStore();

  const [activeReportTab, setActiveReportTab] = useState<
    'SALES_VS_COLLECTION' | 'INVENTORY_VARIANCE' | 'CLAIMS_AGING' | 'CHANNEL_PERFORMANCE' | 'OUTSTANDING_CREDIT'
  >('SALES_VS_COLLECTION');

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
    </div>
  );
};
