import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import { Claim, ClaimStatus, ClaimType } from '../../types';
import { KPICard } from '../common/KPICard';
import {
  FileCheck2,
  AlertTriangle,
  Building,
  CheckCircle2,
  Plus,
  Send,
  Search,
  Filter,
  ArrowUpRight,
  ShieldAlert
} from 'lucide-react';

export const ClaimsDashboard: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    companies,
    skus,
    claims,
    invoices,
    orders,
    updateClaimStatus,
    addTenant
  } = useAppStore();

  const [filterCompany, setFilterCompany] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter claims
  const filteredClaims = claims.filter((c) => {
    if (filterCompany !== 'ALL' && c.company_id !== filterCompany) return false;
    if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.claim_number.toLowerCase().includes(q) ||
        c.sku_name.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Calculate Metrics
  const totalClaimsCount = filteredClaims.length;
  const totalClaimAmount = filteredClaims.reduce((sum, c) => sum + c.claim_amount, 0);
  const settledClaimAmount = filteredClaims
    .filter((c) => c.status === 'SETTLED')
    .reduce((sum, c) => sum + c.claim_amount, 0);
  const leakageFlaggedCount = filteredClaims.filter((c) => c.is_leakage_flagged).length;

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
            <FileCheck2 size={16} /> Module 3 — Principal Claims Lifecycle & Auto-Leakage Safeguard
          </div>
          <h1 className="text-lg font-bold text-white">
            Principal Company Claims & Scheme Margin Recovery
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Auto-leakage flag active: Below-cost SKUs invoiced without matching claim or outside {activeTenantSettings.claim_recoverable_days}-day window are flagged automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg text-xs font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
            <ShieldAlert size={14} /> Recoverable Window: {activeTenantSettings.claim_recoverable_days} Days
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Claims Receivable"
          value={`₹${totalClaimAmount.toLocaleString('en-IN')}`}
          delta={{ value: '+11.4%', isPositive: true, label: 'vs last month' }}
          icon={FileCheck2}
          subtext="From principal companies"
          accentColor="#f59e0b"
        />
        <KPICard
          title="Settled & Recovered"
          value={`₹${settledClaimAmount.toLocaleString('en-IN')}`}
          delta={{ value: '+24.0%', isPositive: true, label: 'credit notes received' }}
          icon={CheckCircle2}
          subtext="Bank/credit settled"
          accentColor="#059669"
        />
        <KPICard
          title="Auto-Leakage Risk Flags"
          value={leakageFlaggedCount}
          delta={{ value: '-12.5%', isPositive: true, label: 'unmatched margins' }}
          icon={AlertTriangle}
          subtext="Selling price < Landing"
          badge="Audit Flag"
          accentColor="#e11d48"
        />
        <KPICard
          title="Principal Companies Tracked"
          value={companies.length}
          delta={{ value: '100%', isPositive: true, label: 'configured in tenant' }}
          icon={Building}
          subtext="C&F / SS / TCD principals"
        />
      </div>

      {/* Leakage Safeguard Banner */}
      {leakageFlaggedCount > 0 && (
        <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                Auto-Leakage Safeguard Triggered ({leakageFlaggedCount} Items)
              </div>
              <p className="text-slate-300 mt-0.5">
                The system detected below-cost SKU invoices where scheme claims have not been submitted to the principal company within the configured {activeTenantSettings.claim_recoverable_days}-day window.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Company Filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-slate-400" />
            <span className="text-slate-400 font-medium">Principal Company:</span>
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white"
            >
              <option value="ALL">All Principal Companies ({companies.length})</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white"
            >
              <option value="ALL">All Claim Statuses</option>
              <option value="RAISED">RAISED</option>
              <option value="SUBMITTED">SUBMITTED</option>
              <option value="SETTLED">SETTLED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search claim #, SKU, company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white"
          />
        </div>
      </div>

      {/* Claims Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Claim # & Dates</th>
                <th className="py-3 px-4">Principal Company</th>
                <th className="py-3 px-4">SKU Product</th>
                <th className="py-3 px-4">Claim Type</th>
                <th className="py-3 px-4 text-right">Qty × Rate</th>
                <th className="py-3 px-4 text-right">Claim Value (₹)</th>
                <th className="py-3 px-4 text-center">Leakage Risk</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No claims entries match selected filters.
                  </td>
                </tr>
              ) : (
                filteredClaims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-white">
                      {c.claim_number}
                      <div className="text-[10px] text-slate-500 font-sans">
                        Raised: {c.raised_date}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-200">
                      {c.company_name}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {c.sku_name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-amber-300 border border-slate-700">
                        {c.claim_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {c.quantity} × ₹{c.rate_per_unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                      ₹{c.claim_amount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {c.is_leakage_flagged ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1">
                          <AlertTriangle size={10} /> Leakage Flag
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">Normal</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          c.status === 'SETTLED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : c.status === 'SUBMITTED'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      {c.status === 'RAISED' && (
                        <button
                          onClick={() => updateClaimStatus(c.id, 'SUBMITTED')}
                          className="px-2 py-1 rounded bg-blue-600/30 text-blue-300 border border-blue-500/40 hover:bg-blue-600/50 text-[10px] font-semibold"
                        >
                          Submit
                        </button>
                      )}
                      {c.status === 'SUBMITTED' && (
                        <button
                          onClick={() => updateClaimStatus(c.id, 'SETTLED')}
                          className="px-2 py-1 rounded bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/50 text-[10px] font-semibold"
                        >
                          Settle
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
