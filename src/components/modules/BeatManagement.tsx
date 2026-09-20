import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import { Beat } from '../../types';
import {
  MapPin,
  Plus,
  Edit3,
  Trash2,
  Users,
  Store,
  UserCheck,
  CheckCircle2,
  X,
  Search,
  AlertTriangle,
  FileText,
  Layers,
  ArrowRightLeft,
  Calendar,
  Check
} from 'lucide-react';

export const BeatManagement: React.FC = () => {
  const {
    activeTenant,
    activeRole,
    currentUser,
    beats,
    retailers,
    users,
    addBeat,
    updateBeat,
    deleteBeat,
    assignRetailerToBeat
  } = useAppStore();

  const isAdmin = currentUser?.role === 'ADMIN' || activeRole === 'ADMIN';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('ALL');
  const [selectedBeatForDetail, setSelectedBeatForDetail] = useState<Beat | null>(null);

  // Beat Form Modal (Create / Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBeat, setEditingBeat] = useState<Beat | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAgentId, setFormAgentId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Reassignment Modal State
  const [reassignModalStore, setReassignModalStore] = useState<{
    id: string;
    name: string;
    currentBeatId?: string;
    currentBeatName?: string;
  } | null>(null);
  const [targetBeatId, setTargetBeatId] = useState('');

  // Agents list for assignment dropdown
  const commissionAgents = users.filter(
    (u) => u.role === 'AGENT'
  );

  const openCreateModal = () => {
    setEditingBeat(null);
    setFormName('');
    setFormCode(`BEAT-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(10 + Math.random() * 90)}`);
    setFormDescription('');
    setFormAgentId(commissionAgents[0]?.id || '');
    setFormIsActive(true);
    setIsFormOpen(true);
  };

  const openEditModal = (beat: Beat) => {
    setEditingBeat(beat);
    setFormName(beat.name);
    setFormCode(beat.code);
    setFormDescription(beat.description || '');
    setFormAgentId(beat.assigned_agent_id || '');
    setFormIsActive(beat.is_active);
    setIsFormOpen(true);
  };

  const handleSaveBeat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Beat Name is required.');
      return;
    }
    if (!formCode.trim()) {
      alert('Beat Code is required.');
      return;
    }

    const assignedAgent = users.find((u) => u.id === formAgentId);

    if (editingBeat) {
      updateBeat(editingBeat.id, {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        description: formDescription.trim(),
        assigned_agent_id: formAgentId || undefined,
        assigned_agent_name: assignedAgent ? assignedAgent.name : undefined,
        is_active: formIsActive,
        updated_at: new Date().toISOString()
      });
      alert(`Beat "${formName.trim()}" updated successfully!`);
    } else {
      // Check duplicate code
      if (beats.some((b) => b.code.toUpperCase() === formCode.trim().toUpperCase())) {
        alert(`Beat Code "${formCode.trim().toUpperCase()}" already exists. Please use a unique beat code.`);
        return;
      }

      const newBeat: Beat = {
        id: `beat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: activeTenant.id,
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        description: formDescription.trim(),
        assigned_agent_id: formAgentId || undefined,
        assigned_agent_name: assignedAgent ? assignedAgent.name : undefined,
        retailer_ids: [],
        is_active: formIsActive,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      addBeat(newBeat);
      alert(`Beat "${newBeat.name}" (${newBeat.code}) created successfully!`);
    }

    setIsFormOpen(false);
  };

  const handleDeleteBeat = (beat: Beat) => {
    const storesOnBeat = retailers.filter((r) => r.beat_id === beat.id || r.beat_name === beat.name);
    const confirmMsg = storesOnBeat.length > 0
      ? `Are you sure you want to delete Beat "${beat.name}"?\n\nWarning: ${storesOnBeat.length} store(s) currently mapped to this beat will be set to "Unassigned".`
      : `Are you sure you want to delete Beat "${beat.name}" (${beat.code})?`;

    if (window.confirm(confirmMsg)) {
      deleteBeat(beat.id);
      if (selectedBeatForDetail?.id === beat.id) {
        setSelectedBeatForDetail(null);
      }
    }
  };

  const handleConfirmReassign = () => {
    if (!reassignModalStore || !targetBeatId) return;
    assignRetailerToBeat(reassignModalStore.id, targetBeatId);
    const destBeat = beats.find((b) => b.id === targetBeatId);
    alert(`Store "${reassignModalStore.name}" reassigned to Beat "${destBeat?.name || 'Selected Beat'}".`);
    setReassignModalStore(null);
    setTargetBeatId('');
  };

  // Filtered beats
  const filteredBeats = beats.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.assigned_agent_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAgent =
      selectedAgentFilter === 'ALL' || b.assigned_agent_id === selectedAgentFilter;

    return matchesSearch && matchesAgent;
  });

  const totalStoresInBeats = retailers.filter((r) => r.beat_id).length;
  const unassignedStores = retailers.filter(
    (r) => !r.beat_id || !beats.some((b) => b.id === r.beat_id)
  );

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <MapPin size={16} /> Standard FMCG Beat Management
          </div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            Field Beats & Retailer Clusters ({beats.length} Beats)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Organize retail outlets into dedicated FMCG territory beats with 1:1 outlet-to-beat mapping and dedicated Commission Agents.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow"
          >
            <Plus size={15} /> Create New Beat
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Total Beats</span>
          <div className="text-xl font-bold text-white font-mono mt-1">{beats.length}</div>
          <span className="text-[10px] text-emerald-400">
            {beats.filter((b) => b.is_active).length} Active Routes
          </span>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Mapped Outlets</span>
          <div className="text-xl font-bold text-blue-400 font-mono mt-1">{totalStoresInBeats}</div>
          <span className="text-[10px] text-slate-400">
            Across {beats.length} territory beats
          </span>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Assigned Field Agents</span>
          <div className="text-xl font-bold text-indigo-400 font-mono mt-1">
            {new Set(beats.map((b) => b.assigned_agent_id).filter(Boolean)).size}
          </div>
          <span className="text-[10px] text-slate-400">Dedicated Commission Agents</span>
        </div>

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Unassigned Stores</span>
          <div className={`text-xl font-bold font-mono mt-1 ${unassignedStores.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {unassignedStores.length}
          </div>
          <span className="text-[10px] text-slate-400">
            {unassignedStores.length > 0 ? 'Require Beat assignment' : 'All stores linked'}
          </span>
        </div>
      </div>

      {/* Unassigned Stores Notice Banner */}
      {unassignedStores.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">{unassignedStores.length} Retailer Outlet(s) currently unassigned to any Beat.</span>
              <p className="text-[11px] text-amber-300/80">
                In FMCG operations, each outlet should belong to a designated beat for field ordering and delivery schedules.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search beat by name, code, agent, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedAgentFilter}
            onChange={(e) => setSelectedAgentFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Field Agents ({commissionAgents.length})</option>
            {commissionAgents.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Beats List Table & Outlets Expansion */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Beats Directory */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
          <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-2">
              <Layers size={14} className="text-emerald-400" /> Active Beats Master
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Showing {filteredBeats.length} of {beats.length} beats
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px]">
                  <th className="p-3">Beat Code</th>
                  <th className="p-3">Beat Name</th>
                  <th className="p-3">Assigned Commission Agent</th>
                  <th className="p-3 text-center">Retailers (1:1)</th>
                  <th className="p-3 text-center">Status</th>
                  {isAdmin && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {filteredBeats.map((beat) => {
                  const beatStores = retailers.filter(
                    (r) => r.beat_id === beat.id || r.beat_name === beat.name
                  );
                  const isSelected = selectedBeatForDetail?.id === beat.id;

                  return (
                    <tr
                      key={beat.id}
                      onClick={() => setSelectedBeatForDetail(beat)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-950/20 border-l-2 border-emerald-500' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-emerald-400">{beat.code}</td>
                      <td className="p-3">
                        <div className="font-semibold text-white">{beat.name}</div>
                        {beat.description && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {beat.description}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {beat.assigned_agent_name ? (
                          <div className="flex items-center gap-1.5 text-indigo-300 font-medium">
                            <UserCheck size={13} className="text-indigo-400 shrink-0" />
                            <span>{beat.assigned_agent_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned Agent</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-mono font-semibold">
                          {beatStores.length} stores
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {beat.is_active ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                            Inactive
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(beat)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                              title="Edit Beat"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteBeat(beat)}
                              className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900 border border-rose-800/40 text-rose-300"
                              title="Delete Beat"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {filteredBeats.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="p-8 text-center text-slate-400">
                      No beats match the selected filters. Click "Create New Beat" to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Beat Outlets Detail Drawer / View */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs space-y-3.5">
          {selectedBeatForDetail ? (
            <>
              <div className="border-b border-slate-800 pb-3 flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-mono text-emerald-400 uppercase font-bold">
                    {selectedBeatForDetail.code}
                  </div>
                  <h3 className="text-sm font-bold text-white">{selectedBeatForDetail.name}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {selectedBeatForDetail.description || 'No description provided.'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBeatForDetail(null)}
                  className="text-slate-500 hover:text-white p-1"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Assigned Agent:</span>
                  <span className="font-semibold text-indigo-300">
                    {selectedBeatForDetail.assigned_agent_name || 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Enforced 1:1 Mapping:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <Check size={12} /> FMCG Primary Beat
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Total Outlets:</span>
                  <span className="font-mono font-bold text-white">
                    {retailers.filter((r) => r.beat_id === selectedBeatForDetail.id || r.beat_name === selectedBeatForDetail.name).length} stores
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Store size={13} className="text-amber-400" /> Mapped Outlets
                  </h4>
                  <span className="text-[10px] text-slate-400">Click to reassign</span>
                </div>

                <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                  {retailers
                    .filter(
                      (r) =>
                        r.beat_id === selectedBeatForDetail.id ||
                        r.beat_name === selectedBeatForDetail.name
                    )
                    .map((ret) => (
                      <div
                        key={ret.id}
                        className="p-2 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-lg flex items-center justify-between transition-all"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-white truncate text-[11px]">{ret.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                            <span>{ret.code}</span>
                            <span>•</span>
                            <span className="text-emerald-400">{ret.phone}</span>
                            <span>•</span>
                            <span className="text-slate-300">{ret.channel}</span>
                          </div>
                        </div>

                        {isAdmin && (
                          <button
                            onClick={() => {
                              setReassignModalStore({
                                id: ret.id,
                                name: ret.name,
                                currentBeatId: selectedBeatForDetail.id,
                                currentBeatName: selectedBeatForDetail.name
                              });
                              setTargetBeatId(beats.find((b) => b.id !== selectedBeatForDetail.id)?.id || '');
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium flex items-center gap-1 shrink-0"
                            title="Move store to another beat"
                          >
                            <ArrowRightLeft size={11} /> Move
                          </button>
                        )}
                      </div>
                    ))}

                  {retailers.filter(
                    (r) =>
                      r.beat_id === selectedBeatForDetail.id ||
                      r.beat_name === selectedBeatForDetail.name
                  ).length === 0 && (
                    <div className="p-4 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg">
                      No retailers currently mapped to this beat. When onboarding stores, select "{selectedBeatForDetail.name}".
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <MapPin size={28} className="mx-auto text-slate-600" />
              <div className="font-semibold text-slate-300">Select a Beat</div>
              <p className="text-[11px] text-slate-500">
                Click on any beat row in the master table to inspect mapped retailers, dedicated agents, and manage store assignments.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Beat Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-emerald-400" />
                <h3 className="font-bold text-white text-sm">
                  {editingBeat ? `Edit Beat: ${editingBeat.name}` : 'Create New FMCG Beat'}
                </h3>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveBeat} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Beat Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Beat A - Chandni Chowk"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Beat Code * (Unique Identifier)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BEAT-A1"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Assigned Commission Agent (Dedicated Field Agent)
                </label>
                <select
                  value={formAgentId}
                  onChange={(e) => setFormAgentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- No Dedicated Agent Assigned --</option>
                  {commissionAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.role}) - {ag.mobile_number || 'No phone'}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Field orders and store visits for this beat will be assigned to this representative.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Description / Territory Scope
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Covers Chandni Chowk wholesale spice market and adjoining Katra lanes."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="beatActiveCheckbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="beatActiveCheckbox" className="text-slate-300 font-medium text-xs">
                  Active Beat (Available for Store Onboarding and Route Scheduling)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow"
                >
                  <CheckCircle2 size={15} /> {editingBeat ? 'Save Beat Changes' : 'Create Beat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Store Modal */}
      {reassignModalStore && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={16} className="text-blue-400" />
                <h3 className="font-bold text-white text-sm">Reassign Store Beat</h3>
              </div>
              <button onClick={() => setReassignModalStore(null)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Outlet to Reassign</span>
                <div className="font-bold text-white text-xs">{reassignModalStore.name}</div>
                <div className="text-[11px] text-slate-400">
                  Current Beat: <span className="text-amber-400">{reassignModalStore.currentBeatName || 'Unassigned'}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Destination Beat (Enforces 1:1 FMCG Primary Beat) *
                </label>
                <select
                  value={targetBeatId}
                  onChange={(e) => setTargetBeatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select Destination Beat --</option>
                  {beats
                    .filter((b) => b.id !== reassignModalStore.currentBeatId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code}) — {b.assigned_agent_name || 'No agent'}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  The outlet will be moved from its current beat to the destination beat.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setReassignModalStore(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!targetBeatId}
                  onClick={handleConfirmReassign}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 shadow"
                >
                  <CheckCircle2 size={15} /> Confirm Reassignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
