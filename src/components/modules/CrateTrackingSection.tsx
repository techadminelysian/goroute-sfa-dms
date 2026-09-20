import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import {
  DEFAULT_CRATE_DEPOSIT_VALUE,
  CRATE_AGING_WARNING_DAYS,
  CRATE_AGING_CRITICAL_DAYS,
  CRATE_HIGH_DEFICIT_THRESHOLD,
  ReturnableAssetLedgerEntry,
} from '../../types';
import {
  Package,
  Warehouse,
  Truck,
  Store,
  RotateCcw,
  AlertTriangle,
  AlertOctagon,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Search,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';

interface CrateTrackingSectionProps {
  selectedDpId: string;
}

export const CrateTrackingSection: React.FC<CrateTrackingSectionProps> = ({ selectedDpId }) => {
  const {
    dispatchPoints,
    retailers,
    users,
    returnableAssetLedger,
    recordHubCrateTransfer,
    getCrateAgingInfo,
    checkRetailerCrateAlert,
  } = useAppStore();

  const currentDepot = dispatchPoints.find((d) => d.id === selectedDpId) || dispatchPoints[0];
  const commissionAgents = users.filter((u) => u.role === 'AGENT');

  // Transfer console state
  const [crateTransferType, setCrateTransferType] = useState<'HUB_TO_AGENT' | 'AGENT_TO_HUB'>('HUB_TO_AGENT');
  const [crateAgentId, setCrateAgentId] = useState<string>(commissionAgents[0]?.id || '');
  const [crateQty, setCrateQty] = useState<number>(25);
  const [crateRefDoc, setCrateRefDoc] = useState<string>('GP-CR-2026-01');
  const [crateVehicleNo, setCrateVehicleNo] = useState<string>('DL-01-V-8841');
  const [crateNotes, setCrateNotes] = useState<string>('Morning route dispatch allocation');
  const [crateCustodyFilter, setCrateCustodyFilter] = useState<'ALL' | 'WARNING' | 'CRITICAL' | 'DEFICIT'>('ALL');
  const [crateSearchQuery, setCrateSearchQuery] = useState<string>('');
  const [crateFeedback, setCrateFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Depot dock crate balance: Base depot stock of 250 standard crates minus issued to agents plus returns
  const INITIAL_DEPOT_CRATE_POOL = 250;
  const hubOutflow = returnableAssetLedger
    .filter((e) => e.dispatch_point_id === selectedDpId && e.holder_type === 'AGENT' && e.movement_type === 'ISSUED')
    .reduce((sum, e) => sum + e.quantity, 0);
  const hubInflow = returnableAssetLedger
    .filter((e) => e.dispatch_point_id === selectedDpId && e.holder_type === 'AGENT' && e.movement_type === 'RETURNED')
    .reduce((sum, e) => sum + e.quantity, 0);
  const depotCrateBalance = Math.max(0, INITIAL_DEPOT_CRATE_POOL - hubOutflow + hubInflow);

  const totalAgentCrates = commissionAgents.reduce(
    (sum, ag) => sum + (ag.crate_custody_balance || 0),
    0
  );

  const totalRetailerCrates = retailers.reduce(
    (sum, r) => sum + (r.crate_custody_balance || 0),
    0
  );

  const totalSystemCrates = depotCrateBalance + totalAgentCrates + totalRetailerCrates;

  // Alerts and risks
  const retailerAlerts = retailers.map((r) => {
    const aging = getCrateAgingInfo(r.last_crate_return_date, r.last_crate_issue_date);
    const alert = checkRetailerCrateAlert(r.id);
    const depositExposure = (r.crate_custody_balance || 0) * DEFAULT_CRATE_DEPOSIT_VALUE;
    return {
      retailer: r,
      aging,
      alert,
      depositExposure,
    };
  });

  const warningCount = retailerAlerts.filter(
    (a) => (a.retailer.crate_custody_balance || 0) > 0 && a.aging.status === 'WARNING'
  ).length;

  const criticalCount = retailerAlerts.filter(
    (a) => (a.retailer.crate_custody_balance || 0) > 0 && a.aging.status === 'CRITICAL'
  ).length;

  const highDeficitCount = retailerAlerts.filter(
    (a) => (a.retailer.crate_custody_balance || 0) >= CRATE_HIGH_DEFICIT_THRESHOLD
  ).length;

  const totalLeakageExposure = retailerAlerts
    .filter(
      (a) =>
        (a.retailer.crate_custody_balance || 0) > 0 &&
        (a.aging.status === 'WARNING' || a.aging.status === 'CRITICAL')
    )
    .reduce((sum, a) => sum + a.depositExposure, 0);

  const activeAgentObj = commissionAgents.find((ag) => ag.id === crateAgentId);

  const handleCrateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (crateQty <= 0) {
      setCrateFeedback({ message: 'Transfer quantity must be at least 1 crate.', type: 'error' });
      return;
    }

    if (!crateAgentId) {
      setCrateFeedback({ message: 'Please select a Commission Agent.', type: 'error' });
      return;
    }

    try {
      if (crateTransferType === 'HUB_TO_AGENT') {
        recordHubCrateTransfer({
          agentId: crateAgentId,
          dispatchPointId: selectedDpId,
          movementType: 'ISSUED',
          quantity: crateQty,
          notes: `${crateNotes ? crateNotes + ' | ' : ''}Gate Pass: ${crateRefDoc} (Van: ${crateVehicleNo})`,
          dispatcherUserId: 'usr_dispatcher_1',
          dispatcherName: 'Depot Warehouse Supervisor',
        });
        const ag = commissionAgents.find((u) => u.id === crateAgentId);
        setCrateFeedback({
          message: `✅ Issued ${crateQty} Standard Crates to Commission Agent ${ag?.name || 'Agent'} (Gate Pass: ${crateRefDoc}).`,
          type: 'success',
        });
      } else {
        recordHubCrateTransfer({
          agentId: crateAgentId,
          dispatchPointId: selectedDpId,
          movementType: 'RETURNED',
          quantity: crateQty,
          notes: `${crateNotes ? crateNotes + ' | ' : ''}Gate Pass: ${crateRefDoc} (Van: ${crateVehicleNo})`,
          dispatcherUserId: 'usr_dispatcher_1',
          dispatcherName: 'Depot Warehouse Supervisor',
        });
        const ag = commissionAgents.find((u) => u.id === crateAgentId);
        setCrateFeedback({
          message: `✅ Received ${crateQty} empty crates from Commission Agent ${ag?.name || 'Agent'} back into depot dock.`,
          type: 'success',
        });
      }
      setCrateRefDoc(`GP-CR-2026-${Date.now().toString().slice(-4)}`);
    } catch (err: any) {
      setCrateFeedback({ message: err?.message || 'Failed to complete crate transfer.', type: 'error' });
    }
  };

  // Filtered Custody Rows
  const filteredRetailers = retailerAlerts.filter(({ retailer, aging }) => {
    if (crateCustodyFilter === 'WARNING' && aging.status !== 'WARNING') return false;
    if (crateCustodyFilter === 'CRITICAL' && aging.status !== 'CRITICAL') return false;
    if (crateCustodyFilter === 'DEFICIT' && (retailer.crate_custody_balance || 0) < CRATE_HIGH_DEFICIT_THRESHOLD)
      return false;

    if (crateSearchQuery.trim()) {
      const q = crateSearchQuery.toLowerCase();
      return (
        retailer.name.toLowerCase().includes(q) ||
        retailer.code.toLowerCase().includes(q) ||
        retailer.phone.includes(q) ||
        retailer.beat_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Crate KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
            <Package size={14} className="text-amber-400" /> Total Active Crates
          </div>
          <div className="text-2xl font-black text-white font-mono">{totalSystemCrates}</div>
          <div className="text-[10px] text-slate-400">Universal Standard Crates</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
            <Warehouse size={14} className="text-blue-400" /> Depot Dock Inventory
          </div>
          <div className="text-2xl font-black text-blue-400 font-mono">{depotCrateBalance}</div>
          <div className="text-[10px] text-slate-400">Available for route loadout</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
            <Truck size={14} className="text-indigo-400" /> In Field / Agent Vans
          </div>
          <div className="text-2xl font-black text-indigo-400 font-mono">{totalAgentCrates}</div>
          <div className="text-[10px] text-slate-400">Across {commissionAgents.length} Commission Agents</div>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
            <Store size={14} className="text-emerald-400" /> In Retailer Custody
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{totalRetailerCrates}</div>
          <div className="text-[10px] text-slate-400">Held across {retailers.length} retail outlets</div>
        </div>

        <div className="p-4 bg-rose-950/30 border border-rose-500/40 rounded-2xl space-y-1">
          <div className="text-[11px] font-semibold text-rose-300 flex items-center gap-1.5">
            <AlertOctagon size={14} className="text-rose-400" /> Leakage Risk Exposure
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">
            ₹{totalLeakageExposure.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-rose-300/80">
            {criticalCount} Critical (15d+) | {warningCount} Warning (10d+)
          </div>
        </div>
      </div>

      {/* Notification Banner if Leakage Alert */}
      {(criticalCount > 0 || warningCount > 0) && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-2xl flex items-start gap-3 text-xs">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-amber-300">
              Crate Leakage & Aging Threshold Alert Active ({CRATE_AGING_WARNING_DAYS} Days Warning / {CRATE_AGING_CRITICAL_DAYS} Days Critical Alert)
            </div>
            <div className="text-amber-200/90 text-[11px] leading-relaxed">
              {criticalCount > 0 && (
                <span className="font-bold text-rose-300">
                  {criticalCount} outlet(s) hold crates past the 15-day critical leakage deadline.{' '}
                </span>
              )}
              {warningCount > 0 && (
                <span>{warningCount} outlet(s) have crossed the 10-day soft warning threshold. </span>
              )}
              Commission Agents are notified during order punch and delivery to collect empties from these stores.
            </div>
          </div>
        </div>
      )}

      {/* Two-Column Grid: Left = Dock Gate Transfer, Right = Commission Agent Van Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Crate Transfer Console */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">
                Dock Gate Operations
              </span>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <RotateCcw size={16} className="text-amber-400" />
                Record Hub Crate Transfer (Returnable Asset Ledger)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Depot: <strong className="text-white">{currentDepot.name}</strong>
            </span>
          </div>

          {crateFeedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between ${
                crateFeedback.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
              }`}
            >
              <span>{crateFeedback.message}</span>
              <button
                type="button"
                onClick={() => setCrateFeedback(null)}
                className="text-slate-400 hover:text-white font-bold text-xs ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleCrateSubmit} className="space-y-4 text-xs">
            {/* Operation Type */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                Transfer Operation Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCrateTransferType('HUB_TO_AGENT');
                    setCrateNotes('Morning route dispatch allocation');
                  }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    crateTransferType === 'HUB_TO_AGENT'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <ArrowUpRight size={14} className="text-blue-400" /> Morning Route Loadout
                  </span>
                  <span className="text-[10px] leading-tight">
                    Issue Standard Crates from Depot Dock ➔ Commission Agent Van
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCrateTransferType('AGENT_TO_HUB');
                    setCrateNotes('Evening empty crates return to depot');
                  }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    crateTransferType === 'AGENT_TO_HUB'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <ArrowDownRight size={14} className="text-emerald-400" /> Evening Gate-In Empties
                  </span>
                  <span className="text-[10px] leading-tight">
                    Receive Collected Empty Crates from Commission Agent ➔ Depot Dock
                  </span>
                </button>
              </div>
            </div>

            {/* Commission Agent Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Commission Agent *
                </label>
                <select
                  required
                  value={crateAgentId}
                  onChange={(e) => setCrateAgentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-semibold focus:border-amber-500 focus:outline-none"
                >
                  {commissionAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} (Van Crate Bal: {ag.crate_custody_balance || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Vehicle / Van Number
                </label>
                <input
                  type="text"
                  value={crateVehicleNo}
                  onChange={(e) => setCrateVehicleNo(e.target.value)}
                  placeholder="e.g. DL-01-V-8841"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Quantity and Quick Steppers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-300">
                    Transfer Quantity (Standard Crates) *
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    Depot Bal: <strong className="text-blue-400">{depotCrateBalance}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={crateQty}
                    onChange={(e) => setCrateQty(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCrateQty((q) => q + 10)}
                    className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold cursor-pointer"
                  >
                    +10
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrateQty((q) => q + 25)}
                    className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold cursor-pointer"
                  >
                    +25
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrateQty((q) => q + 50)}
                    className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold cursor-pointer"
                  >
                    +50
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Gate Pass / Reference Doc # *
                </label>
                <input
                  type="text"
                  required
                  value={crateRefDoc}
                  onChange={(e) => setCrateRefDoc(e.target.value)}
                  placeholder="e.g. GP-CR-2026-01"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Operation Notes & Remarks
              </label>
              <input
                type="text"
                value={crateNotes}
                onChange={(e) => setCrateNotes(e.target.value)}
                placeholder="e.g. Morning dispatch count verified and loaded"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Live Simulation Preview */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1 text-slate-300">
              <div className="font-bold text-slate-400 flex items-center justify-between text-[11px]">
                <span>Custody Impact Simulation:</span>
                <span className="text-amber-400 font-mono">
                  Asset Value: ₹{(crateQty * DEFAULT_CRATE_DEPOSIT_VALUE).toLocaleString('en-IN')} (at ₹{DEFAULT_CRATE_DEPOSIT_VALUE}/crate)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Depot Dock Balance:</span>
                <span className="font-mono">
                  {depotCrateBalance} ➔{' '}
                  <strong
                    className={crateTransferType === 'HUB_TO_AGENT' ? 'text-rose-400' : 'text-emerald-400'}
                  >
                    {crateTransferType === 'HUB_TO_AGENT'
                      ? Math.max(0, depotCrateBalance - crateQty)
                      : depotCrateBalance + crateQty}
                  </strong>
                </span>
              </div>
              {activeAgentObj && (
                <div className="flex justify-between">
                  <span>Commission Agent ({activeAgentObj.name}) Van Balance:</span>
                  <span className="font-mono">
                    {activeAgentObj.crate_custody_balance || 0} ➔{' '}
                    <strong
                      className={crateTransferType === 'HUB_TO_AGENT' ? 'text-emerald-400' : 'text-blue-400'}
                    >
                      {crateTransferType === 'HUB_TO_AGENT'
                        ? (activeAgentObj.crate_custody_balance || 0) + crateQty
                        : Math.max(0, (activeAgentObj.crate_custody_balance || 0) - crateQty)}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-900/30 transition-all cursor-pointer"
              >
                <CheckCircle2 size={16} /> Execute Crate Transfer & Update Returnable Ledger
              </button>
            </div>
          </form>
        </div>

        {/* Commission Agent Van Balances Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="font-bold text-white text-xs flex items-center gap-1.5">
                <Truck size={15} className="text-indigo-400" />
                Commission Agent Van Balances
              </div>
              <span className="text-[10px] font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                {commissionAgents.length} Agents
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mt-2 mb-3 leading-snug">
              Commission agents hold standard crates in their delivery vans to service beat orders. Empty crates collected from retailers replenish their van balance until returned to depot.
            </p>

            <div className="space-y-2">
              {commissionAgents.map((ag) => (
                <div
                  key={ag.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-white text-xs">{ag.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{ag.mobile_number || 'Mobile Agent'}</div>
                    <div className="text-[9px] text-indigo-400 mt-0.5">
                      {ag.beat_name || 'Assigned FMCG Beat'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-black text-amber-400">
                      {ag.crate_custody_balance || 0}
                    </div>
                    <div className="text-[9px] text-slate-400">crates in van</div>
                    <button
                      type="button"
                      onClick={() => {
                        setCrateAgentId(ag.id);
                        setCrateTransferType('AGENT_TO_HUB');
                        setCrateQty(ag.crate_custody_balance || 10);
                      }}
                      className="mt-1 text-[9px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 font-semibold cursor-pointer"
                    >
                      Gate-In Empties ➔
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl text-[11px] text-indigo-200/90 leading-snug mt-4">
            💡 <strong>Agent Responsibility:</strong> Commission Agents manage drivers, take custody of crate inventories, and reconcile empty crates daily upon depot return.
          </div>
        </div>
      </div>

      {/* Crate Custody & Leakage Risk Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">
              Audit & Enforcement Matrix
            </span>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Store size={16} className="text-amber-400" />
              Outlet Crate Custody & Aging Deadlines
            </h3>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => setCrateCustodyFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                crateCustodyFilter === 'ALL'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All Outlets ({retailers.length})
            </button>

            <button
              type="button"
              onClick={() => setCrateCustodyFilter('WARNING')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                crateCustodyFilter === 'WARNING'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-950 text-amber-400 hover:text-white border border-slate-800'
              }`}
            >
              10-14d Warning ({warningCount})
            </button>

            <button
              type="button"
              onClick={() => setCrateCustodyFilter('CRITICAL')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                crateCustodyFilter === 'CRITICAL'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-950 text-rose-400 hover:text-white border border-slate-800'
              }`}
            >
              15d+ Critical ({criticalCount})
            </button>

            <button
              type="button"
              onClick={() => setCrateCustodyFilter('DEFICIT')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                crateCustodyFilter === 'DEFICIT'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-950 text-purple-400 hover:text-white border border-slate-800'
              }`}
            >
              High Deficit 30+ ({highDeficitCount})
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search outlet by store name, phone, code, or beat route..."
            value={crateSearchQuery}
            onChange={(e) => setCrateSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* Custody Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="py-2.5 px-3">Retail Outlet / Beat</th>
                <th className="py-2.5 px-3">Contact</th>
                <th className="py-2.5 px-3 text-right">Crates in Custody</th>
                <th className="py-2.5 px-3">Aging Status</th>
                <th className="py-2.5 px-3">Days Held</th>
                <th className="py-2.5 px-3">Last Return</th>
                <th className="py-2.5 px-3 text-right">Deposit Exposure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRetailers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No outlets match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRetailers.map(({ retailer, aging, alert, depositExposure }) => (
                  <tr key={retailer.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">{retailer.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {retailer.beat_name} • Code: {retailer.code}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                      {retailer.phone}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      <span
                        className={`text-sm ${
                          (retailer.crate_custody_balance || 0) >= CRATE_HIGH_DEFICIT_THRESHOLD
                            ? 'text-rose-400'
                            : (retailer.crate_custody_balance || 0) > 0
                            ? 'text-amber-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {retailer.crate_custody_balance || 0}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {retailer.crate_custody_balance === 0 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                          CLEAR
                        </span>
                      ) : aging.status === 'CRITICAL' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold flex items-center gap-1 w-fit">
                          <AlertTriangle size={11} /> 15d+ CRITICAL
                        </span>
                      ) : aging.status === 'WARNING' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1 w-fit">
                          <Clock size={11} /> 10-14d WARNING
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                          HEALTHY
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                      {retailer.crate_custody_balance > 0 ? `${aging.daysHeld} days` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                      {retailer.last_crate_return_date || 'No return logged'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-300">
                      ₹{depositExposure.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Returnable Asset Ledger Audit Trail */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-mono text-blue-400 font-bold uppercase">
              Chronological Ledger
            </span>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-blue-400" />
              Returnable Asset Movement Trail ({returnableAssetLedger.length} Movements)
            </h3>
          </div>
          <span className="text-[10px] text-slate-400">Parallel Ledger (Independent of Stock Ledgers)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="py-2.5 px-3">Date / Time</th>
                <th className="py-2.5 px-3">Holder Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Movement</th>
                <th className="py-2.5 px-3">Linked Order</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Running Balance</th>
                <th className="py-2.5 px-3">Recorded By & Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {returnableAssetLedger.slice(0, 25).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-white">
                    {log.holder_name}
                  </td>
                  <td className="py-2.5 px-3 text-[10px] font-mono text-slate-400">
                    {log.holder_type}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        log.movement_type === 'ISSUED'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {log.movement_type === 'ISSUED' ? 'ISSUED (Custody Debit)' : 'RETURNED (Custody Credit)'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-amber-300 text-[11px]">
                    {log.linked_order_number || 'Hub Transfer'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                    {log.quantity}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">
                    {log.running_balance}
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-slate-400 max-w-xs truncate">
                    <span className="font-semibold text-slate-300">{log.recorded_by_user_name || 'Dispatcher'}:</span>{' '}
                    {log.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
