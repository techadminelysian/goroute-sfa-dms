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
  Warehouse,
  Briefcase,
  Building2
} from 'lucide-react';

interface UnifiedRaiserItem {
  id: string;
  name: string;
  mobile?: string;
  role: 'COMMISSION_AGENT' | 'SALES_EXECUTIVE' | 'DISTRIBUTOR';
  roleTag: string;
  billing_executive_id?: string | null;
}

export const BEAbsenceRemappingTool: React.FC = () => {
  const {
    users,
    distributors = [],
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

  // Compile all order raisers (CFS, Sales Executives, Distributors)
  const allOrderRaisers = useMemo<UnifiedRaiserItem[]>(() => {
    const list: UnifiedRaiserItem[] = [];

    // Commission Agents (CFS)
    users
      .filter((u) => u.role === 'COMMISSION_AGENT')
      .forEach((u) => {
        list.push({
          id: u.id,
          name: u.name,
          mobile: u.mobile_number,
          role: 'COMMISSION_AGENT',
          roleTag: 'CFS (CA)',
          billing_executive_id: u.billing_executive_id,
        });
      });

    // Sales Executives
    users
      .filter((u) => u.role === 'SALES_EXECUTIVE')
      .forEach((u) => {
        list.push({
          id: u.id,
          name: u.name,
          mobile: u.mobile_number,
          role: 'SALES_EXECUTIVE',
          roleTag: 'Sales Exec',
          billing_executive_id: u.billing_executive_id,
        });
      });

    // Distributor users & accounts
    const seen = new Set<string>();
    users
      .filter((u) => u.role === 'DISTRIBUTOR')
      .forEach((u) => {
        seen.add(u.id);
        list.push({
          id: u.id,
          name: u.name,
          mobile: u.mobile_number,
          role: 'DISTRIBUTOR',
          roleTag: 'Distributor User',
          billing_executive_id: u.billing_executive_id,
        });
      });

    (distributors || []).forEach((d) => {
      if (!seen.has(d.id)) {
        list.push({
          id: d.id,
          name: d.name,
          mobile: d.phone,
          role: 'DISTRIBUTOR',
          roleTag: 'Distributor Account',
          billing_executive_id: d.billing_executive_id,
        });
      }
    });

    return list;
  }, [users, distributors]);

  // Form State
  const [absentBEId, setAbsentBEId] = useState<string>('');
  const [targetBEId, setTargetBEId] = useState<string>('');
  const [selectedRaiserIds, setSelectedRaiserIds] = useState<string[]>([]);
  const [hasManuallyToggled, setHasManuallyToggled] = useState(false);
  const [absenceReason, setAbsenceReason] = useState<string>('Leave / Temporary Absence');
  const [isExecuting, setIsExecuting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<{
    count: number;
    absentName: string;
    targetName: string;
  } | null>(null);

  // Resolved active absent BE
  const activeAbsentBEId = absentBEId || (billingExecutives.length > 0 ? billingExecutives[0].id : '');

  // Order raisers mapped to the active absent BE
  const affectedRaisers = useMemo(() => {
    if (!activeAbsentBEId) return [];
    return allOrderRaisers.filter((a) => a.billing_executive_id === activeAbsentBEId);
  }, [allOrderRaisers, activeAbsentBEId]);

  // Active selected raiser IDs (defaults to all affected raisers if not manually customized)
  const currentSelectedRaiserIds = hasManuallyToggled
    ? selectedRaiserIds
    : affectedRaisers.map((a) => a.id);

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
    setHasManuallyToggled(false);
    setSelectedRaiserIds([]);
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
    if (currentSelectedRaiserIds.length === 0) {
      alert('Please select at least one Order Raiser (CFS / SE / Distributor) to re-route.');
      return;
    }

    setIsExecuting(true);

    const absentObj = billingExecutives.find((b) => b.id === activeAbsentBEId);
    const targetObj = billingExecutives.find((b) => b.id === activeTargetBEId);

    // Apply update to store & DB
    updateCAAssignments(
      currentSelectedRaiserIds,
      activeTargetBEId,
      null
    );

    setSuccessMessage({
      count: currentSelectedRaiserIds.length,
      absentName: absentObj?.name || 'Absent BE',
      targetName: targetObj?.name || 'Replacement BE',
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
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                BE Absence Quick Re-mapping & Failover Tool
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-950 border border-amber-800/80 text-amber-300 text-[10px] font-semibold">
                High Availability
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Instantly re-route verification queues from an absent Billing Executive (BE) to a substitute BE for all assigned CFS (Commission Agents), Sales Executives, and Distributors.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
            <Users size={14} className="text-purple-400" />
            <span className="text-slate-400">Total BEs:</span>
            <strong className="text-white font-mono">{billingExecutives.length}</strong>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-4 bg-emerald-950/70 border border-emerald-500/50 rounded-2xl text-emerald-200 text-xs flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                Queue Re-routed Successfully!
              </div>
              <div className="text-emerald-300 mt-0.5">
                Re-routed <strong className="text-white">{successMessage.count}</strong> order raiser(s) from{' '}
                <strong className="text-white">{successMessage.absentName}</strong> to stand-in BE{' '}
                <strong className="text-white">{successMessage.targetName}</strong>.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-white px-3 py-1.5 rounded-lg bg-emerald-900/40 border border-emerald-700/60 transition-colors cursor-pointer text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Re-route Form & Workload Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Re-route Execution Form */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
              <RefreshCw size={15} className="text-amber-400" />
              Configure Failover Routing
            </h3>
            <span className="text-[11px] text-slate-400">Admin Action</span>
          </div>

          <form onSubmit={handleExecuteReroute} className="space-y-4 text-xs">
            {/* Step 1: Select Absent BE */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-[10px] font-mono">
                  1
                </span>
                <span>Select Absent Billing Executive (BE on Leave):</span>
              </label>

              <select
                value={activeAbsentBEId}
                onChange={(e) => handleAbsentBEChange(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-xl px-3 py-2 text-white font-medium outline-none"
                required
              >
                {billingExecutives.map((be) => {
                  const count = allOrderRaisers.filter((a) => a.billing_executive_id === be.id).length;
                  return (
                    <option key={be.id} value={be.id}>
                      {be.name} ({count} Raisers Mapped)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Affected Raisers Selection Box */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Select Order Raisers to Re-route ({currentSelectedRaiserIds.length} of {affectedRaisers.length} Selected):
                </span>
                {affectedRaisers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setHasManuallyToggled(true);
                      if (currentSelectedRaiserIds.length === affectedRaisers.length) {
                        setSelectedRaiserIds([]);
                      } else {
                        setSelectedRaiserIds(affectedRaisers.map((a) => a.id));
                      }
                    }}
                    className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
                  >
                    {currentSelectedRaiserIds.length === affectedRaisers.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {affectedRaisers.length === 0 ? (
                <div className="py-3 text-center text-slate-500 text-xs italic">
                  No order raisers (CFS, SE, or Distributor) are currently assigned to this Billing Executive.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {affectedRaisers.map((raiser) => {
                    const isChecked = currentSelectedRaiserIds.includes(raiser.id);

                    return (
                      <div
                        key={raiser.id}
                        onClick={() => {
                          setHasManuallyToggled(true);
                          setSelectedRaiserIds((prev) => {
                            const baseList = hasManuallyToggled ? prev : affectedRaisers.map((a) => a.id);
                            return isChecked ? baseList.filter((id) => id !== raiser.id) : [...baseList, raiser.id];
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
                          <span className="font-semibold text-xs">{raiser.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {raiser.mobile ? `+91 ${raiser.mobile}` : ''}
                          </span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                          raiser.role === 'COMMISSION_AGENT'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800/80'
                            : raiser.role === 'SALES_EXECUTIVE'
                            ? 'bg-sky-950 text-sky-300 border border-sky-800/80'
                            : 'bg-amber-950 text-amber-300 border border-amber-800/80'
                        }`}>
                          {raiser.roleTag}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2: Select Replacement BE */}
            <div className="space-y-3 pt-1">
              <label className="block font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-[10px] font-mono">
                  2
                </span>
                <span>Assign Stand-in Replacement Billing Executive:</span>
              </label>

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
                  Reason / Handover Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Priya Verma on 3-day leave, rerouting queue to Rohan Deshmukh"
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
                  affectedRaisers.length === 0 ||
                  currentSelectedRaiserIds.length === 0 ||
                  !activeTargetBEId
                }
                className="w-full bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:hover:from-amber-600 disabled:hover:to-amber-700 text-white font-bold rounded-xl py-3 px-4 flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 transition-all cursor-pointer text-xs"
              >
                <Zap size={16} />
                <span>
                  Execute Re-routing for {currentSelectedRaiserIds.length} Order Raiser(s)
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
              Live snapshot of CFS, Sales Executive, and Distributor allocations per Billing Executive.
            </p>

            <div className="space-y-2.5 pt-1">
              {billingExecutives.map((be) => {
                const assigned = allOrderRaisers.filter((a) => a.billing_executive_id === be.id);
                const isSelectedAbsent = be.id === activeAbsentBEId;
                const isSelectedTarget = be.id === activeTargetBEId;

                const caCount = assigned.filter((a) => a.role === 'COMMISSION_AGENT').length;
                const seCount = assigned.filter((a) => a.role === 'SALES_EXECUTIVE').length;
                const distCount = assigned.filter((a) => a.role === 'DISTRIBUTOR').length;

                return (
                  <div
                    key={be.id}
                    onClick={() => handleSelectAbsentFromCard(be.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelectedAbsent
                        ? 'bg-amber-950/30 border-amber-500/60 shadow-md shadow-amber-950/40'
                        : isSelectedTarget
                        ? 'bg-emerald-950/30 border-emerald-500/60 shadow-md shadow-emerald-950/40'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-950 text-purple-300 border border-purple-800/80 flex items-center justify-center text-xs font-bold">
                          {be.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs flex items-center gap-1.5">
                            <span>{be.name}</span>
                            {isSelectedAbsent && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/40">
                                Absent
                              </span>
                            )}
                            {isSelectedTarget && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/40">
                                Stand-in
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            +91 {be.mobile_number || '9810023456'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-bold text-white font-mono">
                          {assigned.length}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {caCount} CFS • {seCount} SE • {distCount} Dist
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
