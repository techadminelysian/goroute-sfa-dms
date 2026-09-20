import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../data/store';
import { User, DispatchPoint, WorkflowNotification } from '../../types';
import {
  UserMinus,
  UserCheck,
  Users,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Shield,
  Send,
  Zap,
  Info,
  Calendar,
  Warehouse
} from 'lucide-react';

export const BEAbsenceRemappingTool: React.FC = () => {
  const {
    users,
    dispatchPoints,
    updateCAAssignments,
    currentUser,
    activeRole,
    activeTenant
  } = useAppStore();

  const isAdmin = currentUser?.role === 'ADMIN' || activeRole === 'ADMIN';

  const billingExecutives = useMemo(
    () => users.filter((u) => u.role === 'BILLING'),
    [users]
  );

  const commissionAgents = useMemo(
    () => users.filter((u) => u.role === 'AGENT'),
    [users]
  );

  // Form State
  const [absentBEId, setAbsentBEId] = useState<string>('');
  const [targetBEId, setTargetBEId] = useState<string>('');
  const [targetDPId, setTargetDPId] = useState<string>('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [hasManuallyToggledAgents, setHasManuallyToggledAgents] = useState(false);
  const [absenceReason, setAbsenceReason] = useState<string>('Leave / Temporary Absence');
  const [isExecuting, setIsExecuting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<{
    count: number;
    absentName: string;
    targetName: string;
    dpName?: string;
  } | null>(null);

  // Resolved active absent BE
  const activeAbsentBEId = absentBEId || (billingExecutives.length > 0 ? billingExecutives[0].id : '');

  // CAs mapped to the active absent BE
  const affectedAgents = useMemo(() => {
    if (!activeAbsentBEId) return [];
    return commissionAgents.filter((a) => a.billing_executive_id === activeAbsentBEId);
  }, [commissionAgents, activeAbsentBEId]);

  // Active selected agent IDs (defaults to all affected agents if not manually customized)
  const currentSelectedAgentIds = hasManuallyToggledAgents
    ? selectedAgentIds
    : affectedAgents.map((a) => a.id);

  // Candidate replacement BEs (all BEs except absent BE)
  const replacementCandidates = useMemo(() => {
    return billingExecutives.filter((b) => b.id !== activeAbsentBEId);
  }, [billingExecutives, activeAbsentBEId]);

  // Resolved active target BE
  const activeTargetBEId =
    targetBEId && targetBEId !== activeAbsentBEId
      ? targetBEId
      : replacementCandidates.length > 0
      ? replacementCandidates[0].id
      : '';

  const handleAbsentBEChange = (newAbsentId: string) => {
    setAbsentBEId(newAbsentId);
    setSuccessMessage(null);
    setHasManuallyToggledAgents(false);
    setSelectedAgentIds([]);
    const remaining = billingExecutives.filter((b) => b.id !== newAbsentId);
    if (remaining.length > 0) {
      setTargetBEId(remaining[0].id);
    } else {
      setTargetBEId('');
    }
  };

  const handleExecuteReroute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAbsentBEId) {
      alert('Please select the absent Billing Executive.');
      return;
    }
    if (!activeTargetBEId) {
      alert('Please select a Stand-in / Replacement Billing Executive.');
      return;
    }
    if (currentSelectedAgentIds.length === 0) {
      alert('Please select at least one Commission Agent to re-route.');
      return;
    }

    setIsExecuting(true);

    const absentObj = billingExecutives.find((b) => b.id === activeAbsentBEId);
    const targetObj = billingExecutives.find((b) => b.id === activeTargetBEId);
    const targetDPObj = dispatchPoints.find((d) => d.id === targetDPId);

    // Apply update to store & DB
    updateCAAssignments(
      currentSelectedAgentIds,
      activeTargetBEId,
      targetDPId ? targetDPId : undefined
    );

    setSuccessMessage({
      count: currentSelectedAgentIds.length,
      absentName: absentObj?.name || 'Absent BE',
      targetName: targetObj?.name || 'Replacement BE',
      dpName: targetDPObj?.name
    });

    setIsExecuting(false);
  };

  const handleSelectAbsentFromCard = (beId: string) => {
    handleAbsentBEChange(beId);
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <Zap size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              BE Absence Quick Re-mapping Tool
              <span className="px-2 py-0.5 rounded-full bg-amber-950 border border-amber-700/60 text-amber-300 text-[10px] font-medium">
                Instant Roster Failover
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Rapidly re-route field orders when a Billing Executive is on leave or absent, ensuring zero order verification bottlenecks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-medium flex items-center gap-1.5">
            <Users size={13} className="text-blue-400" />
            {billingExecutives.length} Active Billing Executives
          </span>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="bg-emerald-950/50 border border-emerald-700/80 rounded-2xl p-4 text-xs text-emerald-200 flex items-start justify-between gap-3 shadow-lg shadow-emerald-950/30 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-emerald-100 text-sm">
                Absence Re-routing Successfully Executed!
              </div>
              <p className="mt-1 text-emerald-200/90 leading-relaxed">
                <strong>{successMessage.count} Commission Agents</strong> previously assigned to{' '}
                <strong className="text-white underline">{successMessage.absentName}</strong> have been
                instantly re-routed to{' '}
                <strong className="text-white underline">{successMessage.targetName}</strong>
                {successMessage.dpName ? (
                  <> with Dispatch Point updated to <strong>{successMessage.dpName}</strong>.</>
                ) : (
                  <> (Dispatch Points retained as configured).</>
                )}
              </p>
              <p className="text-[11px] text-emerald-400 mt-1 font-mono">
                All upcoming field orders from these agents will now appear directly in {successMessage.targetName}'s verification queue.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 text-[11px] font-bold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main 2-Column Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Interactive Re-route Form */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <UserMinus size={15} className="text-amber-400" />
              Configure Absence Roster Failover
            </h3>
            <span className="text-[10px] text-slate-400">1-Click Execution</span>
          </div>

          <form onSubmit={handleExecuteReroute} className="space-y-4 text-xs">
            {/* Step 1: Select Absent BE */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-[10px] font-mono">
                  1
                </span>
                <span>Select Absent Billing Executive:</span>
              </label>

              <select
                value={activeAbsentBEId}
                onChange={(e) => handleAbsentBEChange(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-xl px-3 py-2.5 text-white font-medium text-xs outline-none"
                required
              >
                {billingExecutives.map((be) => {
                  const count = commissionAgents.filter((a) => a.billing_executive_id === be.id).length;
                  return (
                    <option key={be.id} value={be.id}>
                      {be.name} ({be.mobile_number || 'BE'}) — {count} Assigned Agents
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Affected Agents Preview & Selection */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <Users size={13} className="text-purple-400" />
                  Commission Agents Mapped to this BE ({affectedAgents.length})
                </span>
                {affectedAgents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setHasManuallyToggledAgents(true);
                      if (currentSelectedAgentIds.length === affectedAgents.length) {
                        setSelectedAgentIds([]);
                      } else {
                        setSelectedAgentIds(affectedAgents.map((a) => a.id));
                      }
                    }}
                    className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
                  >
                    {currentSelectedAgentIds.length === affectedAgents.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {affectedAgents.length === 0 ? (
                <div className="py-3 text-center text-slate-500 text-xs italic">
                  No Commission Agents are currently assigned to this Billing Executive.
                </div>
              ) : (
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {affectedAgents.map((agent) => {
                    const isChecked = currentSelectedAgentIds.includes(agent.id);
                    const dpObj = dispatchPoints.find((d) => d.id === agent.dispatch_point_id);

                    return (
                      <div
                        key={agent.id}
                        onClick={() => {
                          setHasManuallyToggledAgents(true);
                          setSelectedAgentIds((prev) => {
                            const baseList = hasManuallyToggledAgents ? prev : affectedAgents.map((a) => a.id);
                            return isChecked ? baseList.filter((id) => id !== agent.id) : [...baseList, agent.id];
                          });
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-purple-950/30 border-purple-600/50 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded border-slate-700 text-purple-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="font-semibold text-xs">{agent.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            +91 {agent.mobile_number || 'Mobile'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {dpObj?.name || 'Default DP'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2: Select Replacement BE & Optional DP */}
            <div className="space-y-3 pt-1">
              <label className="block font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px] font-mono">
                  2
                </span>
                <span>Assign Stand-in Replacement & Destination:</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Stand-in Billing Executive *
                  </label>
                  <select
                    value={activeTargetBEId}
                    onChange={(e) => setTargetBEId(e.target.value)}
                    className="w-full bg-slate-950 border border-emerald-500/40 focus:border-emerald-400 rounded-xl px-3 py-2 text-white font-medium outline-none"
                    required
                  >
                    {replacementCandidates.length === 0 ? (
                      <option value="">No other Billing Executives available</option>
                    ) : (
                      replacementCandidates.map((be) => (
                        <option key={be.id} value={be.id}>
                          {be.name} ({be.mobile_number || 'BE'})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Warehouse / Dispatch Point (Optional)
                  </label>
                  <select
                    value={targetDPId}
                    onChange={(e) => setTargetDPId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white font-medium outline-none"
                  >
                    <option value="">-- Keep Current Dispatch Points --</option>
                    {dispatchPoints.map((dp) => (
                      <option key={dp.id} value={dp.id}>
                        {dp.name} ({dp.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  Reason / Handover Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Priya Verma on 3-day leave, rerouting queue to Anjali Sharma"
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Step 3: Execute Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={
                  isExecuting ||
                  affectedAgents.length === 0 ||
                  currentSelectedAgentIds.length === 0 ||
                  !activeTargetBEId
                }
                className="w-full bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:hover:from-amber-600 disabled:hover:to-amber-700 text-white font-bold rounded-xl py-3 px-4 flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 transition-all cursor-pointer text-xs"
              >
                <Zap size={16} />
                <span>
                  Execute Re-routing for {currentSelectedAgentIds.length} Commission Agent(s)
                </span>
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Active BE Workload Distribution */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users size={15} className="text-blue-400" />
              Current BE Workload Distribution
            </h3>
            <p className="text-[11px] text-slate-400">
              Live snapshot of Commission Agent allocations per Billing Executive.
            </p>

            <div className="space-y-2.5 pt-1">
              {billingExecutives.map((be) => {
                const assignedCAs = commissionAgents.filter((a) => a.billing_executive_id === be.id);
                const isCurrentAbsent = be.id === activeAbsentBEId;

                return (
                  <div
                    key={be.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isCurrentAbsent
                        ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                            isCurrentAbsent
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-slate-800 text-purple-300'
                          }`}
                        >
                          {be.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs">{be.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            +91 {be.mobile_number || '9810012345'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-purple-300 text-[10px] font-bold font-mono">
                          {assignedCAs.length} CAs Mapped
                        </span>
                      </div>
                    </div>

                    {assignedCAs.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 truncate max-w-[180px]">
                          {assignedCAs.map((a) => a.name.split(' ')[0]).join(', ')}
                        </span>
                        {!isCurrentAbsent && (
                          <button
                            type="button"
                            onClick={() => handleSelectAbsentFromCard(be.id)}
                            className="text-amber-400 hover:text-amber-300 font-bold hover:underline"
                          >
                            Set as Absent
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Guide Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-[11px] text-slate-400 space-y-2">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Info size={14} className="text-blue-400" />
              How Absence Failover Works:
            </div>
            <ul className="list-disc pl-4 space-y-1 leading-relaxed text-slate-400">
              <li>
                When you execute a re-route, the selected CAs' <code>billing_executive_id</code> is updated in the database.
              </li>
              <li>
                Any new field orders punched by these agents immediately show up in the replacement BE's verification queue.
              </li>
              <li>
                When the original BE returns, simply use this tool to re-assign the agents back in 1 click.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
