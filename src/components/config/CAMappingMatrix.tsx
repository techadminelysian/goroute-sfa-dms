import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../data/store';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sparkles,
  Layers,
  UserCheck,
  Check,
  Briefcase,
  Building2,
  Smartphone
} from 'lucide-react';

interface UnifiedRaiserItem {
  id: string;
  name: string;
  mobile_number?: string;
  email?: string;
  role: 'COMMISSION_AGENT' | 'SALES_EXECUTIVE' | 'DISTRIBUTOR';
  role_display: string;
  billing_executive_id?: string | null;
  detail_badge?: string;
  is_distributor_client?: boolean;
}

export const CAMappingMatrix: React.FC = () => {
  const {
    users,
    distributors = [],
    beats = [],
    updateUser,
    updateDistributor,
    updateCAAssignments,
    currentUser,
    activeRole
  } = useAppStore();

  const isAdmin = currentUser?.role === 'ADMIN' || activeRole === 'ADMIN';

  // Filter billing executives
  const billingExecutives = useMemo(
    () => users.filter((u) => u.role === 'BILLING'),
    [users]
  );

  // Compile unified order raisers: CFS (Commission Agents), Sales Executives, and Distributors
  const allRaisers = useMemo<UnifiedRaiserItem[]>(() => {
    const list: UnifiedRaiserItem[] = [];

    // 1. Commission Agents (CFS)
    users
      .filter((u) => u.role === 'COMMISSION_AGENT')
      .forEach((u) => {
        const agentBeats = beats.filter(
          (b) =>
            b.assigned_agent_id === u.id ||
            (u.assigned_beat_ids && u.assigned_beat_ids.includes(b.id)) ||
            u.beat_id === b.id
        );
        const beatDesc =
          agentBeats.length > 0
            ? `${agentBeats.length} Beat${agentBeats.length > 1 ? 's' : ''} (${agentBeats.map((b) => b.code).slice(0, 2).join(', ')})`
            : 'Unassigned Beats';

        list.push({
          id: u.id,
          name: u.name,
          mobile_number: u.mobile_number,
          email: u.email,
          role: 'COMMISSION_AGENT',
          role_display: 'CFS (Commission Agent)',
          billing_executive_id: u.billing_executive_id,
          detail_badge: beatDesc,
          is_distributor_client: false,
        });
      });

    // 2. Sales Executives (SE)
    users
      .filter((u) => u.role === 'SALES_EXECUTIVE')
      .forEach((u) => {
        list.push({
          id: u.id,
          name: u.name,
          mobile_number: u.mobile_number,
          email: u.email,
          role: 'SALES_EXECUTIVE',
          role_display: 'Sales Executive',
          billing_executive_id: u.billing_executive_id,
          detail_badge: 'Field Sales',
          is_distributor_client: false,
        });
      });

    // 3. Distributor Portal Users
    const seenDistributorIds = new Set<string>();
    users
      .filter((u) => u.role === 'DISTRIBUTOR')
      .forEach((u) => {
        seenDistributorIds.add(u.id);
        list.push({
          id: u.id,
          name: u.name,
          mobile_number: u.mobile_number,
          email: u.email,
          role: 'DISTRIBUTOR',
          role_display: 'Distributor (User)',
          billing_executive_id: u.billing_executive_id,
          detail_badge: 'Direct Distributor Portal',
          is_distributor_client: false,
        });
      });

    // 4. Distributor Commercial Accounts (Entities)
    (distributors || []).forEach((d) => {
      if (!seenDistributorIds.has(d.id)) {
        list.push({
          id: d.id,
          name: d.name,
          mobile_number: d.phone,
          email: d.email || undefined,
          role: 'DISTRIBUTOR',
          role_display: 'Distributor (Account)',
          billing_executive_id: d.billing_executive_id,
          detail_badge: `${d.code} • ${d.channel}`,
          is_distributor_client: true,
        });
      }
    });

    return list;
  }, [users, distributors, beats]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'ALL' | 'COMMISSION_AGENT' | 'SALES_EXECUTIVE' | 'DISTRIBUTOR'>('ALL');
  const [filterBE, setFilterBE] = useState<string>('ALL');

  // Bulk Selection State
  const [selectedRaiserIds, setSelectedRaiserIds] = useState<string[]>([]);
  const [bulkBE, setBulkBE] = useState<string>('');
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Local modifications tracking for instant feedback
  const [savedRowId, setSavedRowId] = useState<string | null>(null);

  // Filtered List
  const filteredRaisers = useMemo(() => {
    return allRaisers.filter((item) => {
      // Role Filter
      if (filterRole !== 'ALL' && item.role !== filterRole) {
        return false;
      }

      // Search Query
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        (item.mobile_number && item.mobile_number.includes(q)) ||
        (item.email && item.email.toLowerCase().includes(q)) ||
        (item.detail_badge && item.detail_badge.toLowerCase().includes(q));

      // Filter BE
      let matchesBE = true;
      if (filterBE === 'UNASSIGNED') {
        matchesBE = !item.billing_executive_id;
      } else if (filterBE !== 'ALL') {
        matchesBE = item.billing_executive_id === filterBE;
      }

      return matchesSearch && matchesBE;
    });
  }, [allRaisers, filterRole, searchQuery, filterBE]);

  // Statistics
  const stats = useMemo(() => {
    const total = allRaisers.length;
    const fullyMapped = allRaisers.filter((a) => a.billing_executive_id).length;
    const unmappedBE = allRaisers.filter((a) => !a.billing_executive_id).length;

    const caCount = allRaisers.filter((a) => a.role === 'COMMISSION_AGENT').length;
    const seCount = allRaisers.filter((a) => a.role === 'SALES_EXECUTIVE').length;
    const distCount = allRaisers.filter((a) => a.role === 'DISTRIBUTOR').length;

    return { total, fullyMapped, unmappedBE, caCount, seCount, distCount };
  }, [allRaisers]);

  // Inline Change Handler
  const handleSingleBEChange = (item: UnifiedRaiserItem, beId: string) => {
    if (item.is_distributor_client) {
      updateDistributor(item.id, { billing_executive_id: beId || null });
    } else {
      updateUser(item.id, { billing_executive_id: beId || null, dispatch_point_id: null });
    }
    setSavedRowId(item.id);
    setTimeout(() => setSavedRowId(null), 1800);
  };

  // Bulk Apply Handler
  const handleApplyBulkMapping = () => {
    if (selectedRaiserIds.length === 0) {
      alert('Please select at least one Order Raiser (CFS / SE / Distributor).');
      return;
    }

    if (!bulkBE) {
      alert('Please select a Billing Executive to apply.');
      return;
    }

    updateCAAssignments(
      selectedRaiserIds,
      bulkBE ? bulkBE : undefined,
      null
    );

    const count = selectedRaiserIds.length;
    setBulkFeedback(`Successfully updated ${count} Order Raiser(s) to designated Billing Executive!`);
    setSelectedRaiserIds([]);
    setBulkBE('');

    setTimeout(() => setBulkFeedback(null), 4000);
  };

  // Select all visible
  const handleToggleSelectAll = () => {
    if (selectedRaiserIds.length === filteredRaisers.length && filteredRaisers.length > 0) {
      setSelectedRaiserIds([]);
    } else {
      setSelectedRaiserIds(filteredRaisers.map((a) => a.id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Order Raiser & Billing Executive Mapping Matrix
                <span className="px-2 py-0.5 rounded-full bg-blue-950 border border-blue-700/60 text-blue-300 text-[10px] font-medium">
                  Many-to-One Architecture
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Map Commission Agents (CFS), Sales Executives, and Distributors to their designated Billing Executive (BE). Orders raised by these accounts automatically route to their mapped BE for verification.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <Users size={14} className="text-purple-400" />
            <span className="text-slate-400">Total Raisers:</span>
            <strong className="text-white font-mono">{stats.total}</strong>
            <span className="text-slate-500 text-[10px]">({stats.caCount} CFS, {stats.seCount} SE, {stats.distCount} Dist)</span>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-800/60 px-3 py-1.5 rounded-xl flex items-center gap-2 text-emerald-300">
            <UserCheck size={14} className="text-emerald-400" />
            <span>BE Mapped:</span>
            <strong className="text-white font-mono">{stats.fullyMapped}</strong>
          </div>
          {stats.unmappedBE > 0 && (
            <div className="bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-xl flex items-center gap-2 text-amber-300">
              <AlertTriangle size={14} className="text-amber-400" />
              <span>Pending Mapping:</span>
              <strong className="text-amber-200 font-mono">
                {stats.unmappedBE}
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Role Segment Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-950 border border-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => setFilterRole('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterRole === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          All Order Raisers ({stats.total})
        </button>
        <button
          type="button"
          onClick={() => setFilterRole('COMMISSION_AGENT')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            filterRole === 'COMMISSION_AGENT'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          CFS (Commission Agents) ({stats.caCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterRole('SALES_EXECUTIVE')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            filterRole === 'SALES_EXECUTIVE'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-400"></span>
          Sales Executives ({stats.seCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterRole('DISTRIBUTOR')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            filterRole === 'DISTRIBUTOR'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          Distributors ({stats.distCount})
        </button>
      </div>

      {/* Bulk Mapping Action Bar */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-900/50 rounded-2xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/40 pb-2.5">
            <span className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
              <Sparkles size={14} className="text-indigo-400" />
              Bulk Matrix Assignment
              <span className="text-[11px] text-slate-400 font-normal">
                ({selectedRaiserIds.length} of {filteredRaisers.length} Raisers selected)
              </span>
            </span>

            {bulkFeedback && (
              <span className="text-xs text-emerald-300 flex items-center gap-1 font-semibold animate-fadeIn">
                <CheckCircle2 size={14} className="text-emerald-400" />
                {bulkFeedback}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Assign Selected Order Raisers (CFS / SE / Distributor) to Billing Executive:
              </label>
              <select
                value={bulkBE}
                onChange={(e) => setBulkBE(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-white outline-none"
              >
                <option value="">-- Select Billing Executive --</option>
                {billingExecutives.map((be) => (
                  <option key={be.id} value={be.id}>
                    {be.name} ({be.mobile_number || 'BE'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleApplyBulkMapping}
                disabled={selectedRaiserIds.length === 0 || !bulkBE}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-bold rounded-lg px-4 py-2 text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-950/40 cursor-pointer"
              >
                <Check size={14} />
                <span>Apply to {selectedRaiserIds.length} Selected</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search raiser name, mobile, beat, code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-white placeholder-slate-500 outline-none focus:border-blue-500"
            />
          </div>

          {/* Filter BE */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-semibold">Filter BE:</span>
            <select
              value={filterBE}
              onChange={(e) => setFilterBE(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All BEs ({allRaisers.length})</option>
              <option value="UNASSIGNED">Unassigned BE ({stats.unmappedBE})</option>
              {billingExecutives.map((be) => {
                const count = allRaisers.filter((a) => a.billing_executive_id === be.id).length;
                return (
                  <option key={be.id} value={be.id}>
                    {be.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium">
          Showing <span className="text-white font-bold">{filteredRaisers.length}</span> of{' '}
          <span className="text-white font-bold">{allRaisers.length}</span> Order Raisers
        </div>
      </div>

      {/* Interactive Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selectedRaiserIds.length === filteredRaisers.length && filteredRaisers.length > 0
                    }
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="p-3">Order Raiser & Entity</th>
                <th className="p-3">Role Tier</th>
                <th className="p-3">Contact & Login</th>
                <th className="p-3">Coverage / Territory</th>
                <th className="p-3">Assigned Billing Executive (BE)</th>
                <th className="p-3 text-center">Routing Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {filteredRaisers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    <Users size={28} className="mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="font-semibold">No Order Raisers found matching the criteria</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Adjust your search or filter options above.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRaisers.map((raiser) => {
                  const isSelected = selectedRaiserIds.includes(raiser.id);
                  const isRowSaved = savedRowId === raiser.id;
                  const currentBE = billingExecutives.find((be) => be.id === raiser.billing_executive_id);
                  const isFullyConfigured = Boolean(raiser.billing_executive_id);

                  return (
                    <tr
                      key={raiser.id}
                      className={`hover:bg-slate-850/60 transition-colors ${
                        isSelected ? 'bg-indigo-950/20' : ''
                      } ${isRowSaved ? 'bg-emerald-950/20' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedRaiserIds((prev) =>
                              isSelected ? prev.filter((id) => id !== raiser.id) : [...prev, raiser.id]
                            );
                          }}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Raiser Name */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            raiser.role === 'COMMISSION_AGENT'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                              : raiser.role === 'SALES_EXECUTIVE'
                              ? 'bg-sky-950 text-sky-300 border border-sky-800/60'
                              : 'bg-amber-950 text-amber-300 border border-amber-800/60'
                          }`}>
                            {raiser.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{raiser.name}</span>
                              {isRowSaved && (
                                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5 animate-fadeIn">
                                  <Check size={12} /> Saved
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{raiser.id}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Tier */}
                      <td className="p-3">
                        {raiser.role === 'COMMISSION_AGENT' ? (
                          <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-700/60 text-purple-300 text-[10px] font-semibold flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                            CFS (CA)
                          </span>
                        ) : raiser.role === 'SALES_EXECUTIVE' ? (
                          <span className="px-2 py-0.5 rounded-full bg-sky-950/80 border border-sky-700/60 text-sky-300 text-[10px] font-semibold flex items-center gap-1 w-fit">
                            <Briefcase size={10} className="text-sky-400" />
                            Sales Exec
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-700/60 text-amber-300 text-[10px] font-semibold flex items-center gap-1 w-fit">
                            <Building2 size={10} className="text-amber-400" />
                            Distributor
                          </span>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="p-3">
                        <div className="font-mono text-emerald-400 font-medium">
                          {raiser.mobile_number ? `+91 ${raiser.mobile_number}` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {raiser.email || <span className="text-slate-500 italic">No email</span>}
                        </div>
                      </td>

                      {/* Territory / Detail */}
                      <td className="p-3">
                        <span className="text-[11px] text-slate-300 font-medium">
                          {raiser.detail_badge || 'Standard Territory'}
                        </span>
                      </td>

                      {/* Assigned Billing Executive Dropdown */}
                      <td className="p-3">
                        <div className="relative">
                          <select
                            value={raiser.billing_executive_id || ''}
                            onChange={(e) => handleSingleBEChange(raiser, e.target.value)}
                            disabled={!isAdmin}
                            className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none transition-all ${
                              isFullyConfigured
                                ? 'border-purple-800 text-purple-200 focus:border-purple-500'
                                : 'border-amber-600/80 text-amber-300 bg-amber-950/20 focus:border-amber-400'
                            }`}
                          >
                            <option value="">-- Unassigned (Select BE) --</option>
                            {billingExecutives.map((be) => (
                              <option key={be.id} value={be.id}>
                                {be.name} ({be.mobile_number || 'BE'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {isFullyConfigured ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 text-[10px] font-bold">
                            <CheckCircle2 size={12} className="text-emerald-400" />
                            <span>Active Route</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-800/80 text-amber-300 text-[10px] font-bold animate-pulse">
                            <AlertTriangle size={12} className="text-amber-400" />
                            <span>Unmapped BE</span>
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
  );
};
