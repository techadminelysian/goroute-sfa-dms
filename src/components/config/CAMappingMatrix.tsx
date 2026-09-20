import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../data/store';
import { User, DispatchPoint } from '../../types';
import {
  Users,
  Warehouse,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  Save,
  Check,
  ArrowRight,
  Shield,
  RefreshCw,
  Sparkles,
  Layers,
  UserCheck,
  UserX,
  FileSpreadsheet
} from 'lucide-react';

export const CAMappingMatrix: React.FC = () => {
  const {
    users,
    dispatchPoints,
    updateUser,
    updateCAAssignments,
    currentUser,
    activeRole
  } = useAppStore();

  const isAdmin = currentUser?.role === 'ADMIN' || activeRole === 'ADMIN';

  // Filter commission agents and billing executives
  const commissionAgents = useMemo(
    () => users.filter((u) => u.role === 'AGENT'),
    [users]
  );

  const billingExecutives = useMemo(
    () => users.filter((u) => u.role === 'BILLING'),
    [users]
  );

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBE, setFilterBE] = useState<string>('ALL');
  const [filterDP, setFilterDP] = useState<string>('ALL');

  // Bulk Selection State
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [bulkBE, setBulkBE] = useState<string>('');
  const [bulkDP, setBulkDP] = useState<string>('');
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Local modifications tracking for instant feedback
  const [savedRowId, setSavedRowId] = useState<string | null>(null);

  // Filtered List
  const filteredAgents = useMemo(() => {
    return commissionAgents.filter((agent) => {
      // Search
      const matchesSearch =
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (agent.mobile_number && agent.mobile_number.includes(searchQuery)) ||
        (agent.email && agent.email.toLowerCase().includes(searchQuery.toLowerCase()));

      // Filter BE
      let matchesBE = true;
      if (filterBE === 'UNASSIGNED') {
        matchesBE = !agent.billing_executive_id;
      } else if (filterBE !== 'ALL') {
        matchesBE = agent.billing_executive_id === filterBE;
      }

      // Filter DP
      let matchesDP = true;
      if (filterDP === 'UNASSIGNED') {
        matchesDP = !agent.dispatch_point_id;
      } else if (filterDP !== 'ALL') {
        matchesDP = agent.dispatch_point_id === filterDP;
      }

      return matchesSearch && matchesBE && matchesDP;
    });
  }, [commissionAgents, searchQuery, filterBE, filterDP]);

  // Statistics
  const stats = useMemo(() => {
    const total = commissionAgents.length;
    const fullyMapped = commissionAgents.filter(
      (a) => a.billing_executive_id && a.dispatch_point_id
    ).length;
    const unmappedBE = commissionAgents.filter((a) => !a.billing_executive_id).length;
    const unmappedDP = commissionAgents.filter((a) => !a.dispatch_point_id).length;

    return { total, fullyMapped, unmappedBE, unmappedDP };
  }, [commissionAgents]);

  // Inline Change Handler
  const handleSingleBEChange = (agentId: string, beId: string) => {
    updateUser(agentId, { billing_executive_id: beId || null });
    setSavedRowId(agentId);
    setTimeout(() => setSavedRowId(null), 1800);
  };

  const handleSingleDPChange = (agentId: string, dpId: string) => {
    updateUser(agentId, { dispatch_point_id: dpId || null });
    setSavedRowId(agentId);
    setTimeout(() => setSavedRowId(null), 1800);
  };

  // Bulk Apply Handler
  const handleApplyBulkMapping = () => {
    if (selectedAgentIds.length === 0) {
      alert('Please select at least one Commission Agent.');
      return;
    }

    if (!bulkBE && !bulkDP) {
      alert('Please select a Billing Executive or Dispatch Point to apply.');
      return;
    }

    updateCAAssignments(
      selectedAgentIds,
      bulkBE ? bulkBE : undefined,
      bulkDP ? bulkDP : undefined
    );

    const count = selectedAgentIds.length;
    setBulkFeedback(`Successfully updated ${count} Commission Agent mappings!`);
    setSelectedAgentIds([]);
    setBulkBE('');
    setBulkDP('');

    setTimeout(() => setBulkFeedback(null), 4000);
  };

  // Select all visible
  const handleToggleSelectAll = () => {
    if (selectedAgentIds.length === filteredAgents.length && filteredAgents.length > 0) {
      setSelectedAgentIds([]);
    } else {
      setSelectedAgentIds(filteredAgents.map((a) => a.id));
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
                CA BE & DP Mapping Matrix
                <span className="px-2 py-0.5 rounded-full bg-blue-950 border border-blue-700/60 text-blue-300 text-[10px] font-medium">
                  Many-to-One Architecture
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure fixed Billing Executives and Dispatch Points for Commission Agents. Field orders automatically route to these assigned endpoints.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <Users size={14} className="text-purple-400" />
            <span className="text-slate-400">Total CAs:</span>
            <strong className="text-white font-mono">{stats.total}</strong>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-800/60 px-3 py-1.5 rounded-xl flex items-center gap-2 text-emerald-300">
            <UserCheck size={14} className="text-emerald-400" />
            <span>Fully Mapped:</span>
            <strong className="text-white font-mono">{stats.fullyMapped}</strong>
          </div>
          {(stats.unmappedBE > 0 || stats.unmappedDP > 0) && (
            <div className="bg-amber-950/40 border border-amber-800/60 px-3 py-1.5 rounded-xl flex items-center gap-2 text-amber-300">
              <AlertTriangle size={14} className="text-amber-400" />
              <span>Pending Mappings:</span>
              <strong className="text-amber-200 font-mono">
                {stats.unmappedBE} BE / {stats.unmappedDP} DP
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Mapping Action Bar */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-900/50 rounded-2xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/40 pb-2.5">
            <span className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
              <Sparkles size={14} className="text-indigo-400" />
              Bulk Matrix Assignment
              <span className="text-[11px] text-slate-400 font-normal">
                ({selectedAgentIds.length} of {filteredAgents.length} Agents selected)
              </span>
            </span>

            {bulkFeedback && (
              <span className="text-xs text-emerald-300 flex items-center gap-1 font-semibold animate-fadeIn">
                <CheckCircle2 size={14} className="text-emerald-400" />
                {bulkFeedback}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Assign Selected to Billing Executive:
              </label>
              <select
                value={bulkBE}
                onChange={(e) => setBulkBE(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-white outline-none"
              >
                <option value="">-- No Change --</option>
                {billingExecutives.map((be) => (
                  <option key={be.id} value={be.id}>
                    {be.name} ({be.mobile_number || 'BE'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                Assign Selected to Dispatch Point:
              </label>
              <select
                value={bulkDP}
                onChange={(e) => setBulkDP(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-white outline-none"
              >
                <option value="">-- No Change --</option>
                {dispatchPoints.map((dp) => (
                  <option key={dp.id} value={dp.id}>
                    {dp.name} ({dp.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 flex items-end gap-2">
              <button
                type="button"
                onClick={handleApplyBulkMapping}
                disabled={selectedAgentIds.length === 0 || (!bulkBE && !bulkDP)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-bold rounded-lg px-4 py-2 text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-950/40 cursor-pointer"
              >
                <Save size={14} />
                Apply Bulk Assignment ({selectedAgentIds.length})
              </button>

              {selectedAgentIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedAgentIds([])}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search CA by name, mobile..."
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
              <option value="ALL">All BEs ({commissionAgents.length})</option>
              <option value="UNASSIGNED">Unassigned BE ({stats.unmappedBE})</option>
              {billingExecutives.map((be) => {
                const count = commissionAgents.filter((a) => a.billing_executive_id === be.id).length;
                return (
                  <option key={be.id} value={be.id}>
                    {be.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Filter DP */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-semibold">Filter DP:</span>
            <select
              value={filterDP}
              onChange={(e) => setFilterDP(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-blue-500"
            >
              <option value="ALL">All Warehouses ({commissionAgents.length})</option>
              <option value="UNASSIGNED">Unassigned DP ({stats.unmappedDP})</option>
              {dispatchPoints.map((dp) => {
                const count = commissionAgents.filter((a) => a.dispatch_point_id === dp.id).length;
                return (
                  <option key={dp.id} value={dp.id}>
                    {dp.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium">
          Showing <span className="text-white font-bold">{filteredAgents.length}</span> of{' '}
          <span className="text-white font-bold">{commissionAgents.length}</span> Commission Agents
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
                      selectedAgentIds.length === filteredAgents.length && filteredAgents.length > 0
                    }
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="p-3">Commission Agent (CA)</th>
                <th className="p-3">Contact & Login</th>
                <th className="p-3">Assigned Billing Executive (BE)</th>
                <th className="p-3">Assigned Dispatch Point (DP)</th>
                <th className="p-3 text-center">Routing Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <Users size={28} className="mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="font-semibold">No Commission Agents found matching the criteria</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Adjust your search or filter options above.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  const isRowSaved = savedRowId === agent.id;
                  const currentBE = billingExecutives.find((be) => be.id === agent.billing_executive_id);
                  const currentDP = dispatchPoints.find((dp) => dp.id === agent.dispatch_point_id);
                  const isFullyConfigured = Boolean(agent.billing_executive_id && agent.dispatch_point_id);

                  return (
                    <tr
                      key={agent.id}
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
                            setSelectedAgentIds((prev) =>
                              isSelected ? prev.filter((id) => id !== agent.id) : [...prev, agent.id]
                            );
                          }}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Agent Name */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-800 text-purple-300 flex items-center justify-center font-bold text-xs">
                            {agent.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{agent.name}</span>
                              {isRowSaved && (
                                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5 animate-fadeIn">
                                  <Check size={12} /> Saved
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{agent.id}</div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="p-3">
                        <div className="font-mono text-emerald-400 font-medium">
                          +91 {agent.mobile_number || '9810012345'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {agent.email || <span className="text-slate-500 italic">No email</span>}
                        </div>
                      </td>

                      {/* Assigned Billing Executive Dropdown */}
                      <td className="p-3">
                        <div className="relative">
                          <select
                            value={agent.billing_executive_id || ''}
                            onChange={(e) => handleSingleBEChange(agent.id, e.target.value)}
                            disabled={!isAdmin}
                            className={`w-full bg-slate-950 border text-xs rounded-lg px-2.5 py-1.5 outline-none font-medium transition-all ${
                              agent.billing_executive_id
                                ? 'border-slate-700 text-purple-300 focus:border-purple-500'
                                : 'border-amber-700/80 text-amber-300 bg-amber-950/20'
                            } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <option value="">-- Select Billing Executive --</option>
                            {billingExecutives.map((be) => (
                              <option key={be.id} value={be.id}>
                                {be.name} ({be.email ? be.email.split('@')[0] : 'BE'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Assigned Dispatch Point Dropdown */}
                      <td className="p-3">
                        <div className="relative">
                          <select
                            value={agent.dispatch_point_id || ''}
                            onChange={(e) => handleSingleDPChange(agent.id, e.target.value)}
                            disabled={!isAdmin}
                            className={`w-full bg-slate-950 border text-xs rounded-lg px-2.5 py-1.5 outline-none font-medium transition-all ${
                              agent.dispatch_point_id
                                ? 'border-slate-700 text-emerald-300 focus:border-emerald-500'
                                : 'border-amber-700/80 text-amber-300 bg-amber-950/20'
                            } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <option value="">-- Select Dispatch Point --</option>
                            {dispatchPoints.map((dp) => (
                              <option key={dp.id} value={dp.id}>
                                {dp.name} ({dp.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Routing Status */}
                      <td className="p-3 text-center">
                        {isFullyConfigured ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] font-semibold">
                            <CheckCircle2 size={11} className="text-emerald-400" />
                            Auto-Routing Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-700/60 text-amber-300 text-[10px] font-semibold">
                            <AlertTriangle size={11} className="text-amber-400" />
                            Incomplete
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
