import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../data/store';
import { User, Company } from '../../types';
import {
  Shield,
  Building2,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Info
} from 'lucide-react';

interface CompanySKUAccessMatrixProps {
  currentUser?: User;
}

export const CompanySKUAccessMatrix: React.FC<CompanySKUAccessMatrixProps> = ({ currentUser }) => {
  const { users, companies, skus, updateUserCompanyScope, bulkUpdateUserCompanyScopes } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'COMMISSION_AGENT' | 'SALES_EXECUTIVE' | 'DISTRIBUTOR'>('ALL');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [quickGrantCompanyId, setQuickGrantCompanyId] = useState<string>('');

  // Admins & Sub-Admins have editing privilege
  const isAuthorized = currentUser?.role === 'ADMIN' || (currentUser?.role as string) === 'SUB_ADMIN';

  // Field Raisers: Commission Agents (CFS), Sales Executives (SE), and Distributors
  const fieldUsers = useMemo(() => {
    return users.filter((u) => {
      const isFieldRole = u.role === 'COMMISSION_AGENT' || u.role === 'SALES_EXECUTIVE' || u.role === 'DISTRIBUTOR';
      if (!isFieldRole) return false;
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const nameMatch = u.name.toLowerCase().includes(q);
      const phoneMatch = (u.mobile_number || '').includes(q);
      const beatMatch = (u.beat_name || '').toLowerCase().includes(q);
      return nameMatch || phoneMatch || beatMatch;
    });
  }, [users, roleFilter, searchQuery]);

  // SKU count per company
  const skuCountsByCompany = useMemo(() => {
    const map: Record<string, number> = {};
    companies.forEach((c) => {
      map[c.id] = skus.filter((s) => s.company_id === c.id).length;
    });
    return map;
  }, [companies, skus]);

  // Overall statistics
  const stats = useMemo(() => {
    const allField = users.filter((u) => u.role === 'COMMISSION_AGENT' || u.role === 'SALES_EXECUTIVE' || u.role === 'DISTRIBUTOR');
    const zeroAccessCount = allField.filter((u) => !u.company_scope || u.company_scope.length === 0).length;
    const fullyGrantedCount = allField.filter((u) => (u.company_scope || []).length === companies.length).length;
    const partialCount = allField.length - zeroAccessCount - fullyGrantedCount;
    return {
      total: allField.length,
      zeroAccess: zeroAccessCount,
      fullyGranted: fullyGrantedCount,
      partial: partialCount,
      companiesCount: companies.length
    };
  }, [users, companies]);

  // Notification helper
  const triggerToast = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 3500);
  };

  // Toggle individual cell
  const handleToggleAccess = (userId: string, companyId: string) => {
    if (!isAuthorized) return;
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const currentScope = targetUser.company_scope || [];
    const hasAccess = currentScope.includes(companyId);
    const newScope = hasAccess
      ? currentScope.filter((id) => id !== companyId)
      : [...currentScope, companyId];

    updateUserCompanyScope(userId, newScope);
    const comp = companies.find((c) => c.id === companyId);
    triggerToast(
      hasAccess
        ? `Revoked access to ${comp?.name || 'Company'} for ${targetUser.name}`
        : `Granted access to ${comp?.name || 'Company'} for ${targetUser.name}`
    );
  };

  // Row-level actions
  const handleGrantAllForUser = (userId: string) => {
    if (!isAuthorized) return;
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const allCompIds = companies.map((c) => c.id);
    updateUserCompanyScope(userId, allCompIds);
    triggerToast(`Granted all Principal Companies to ${targetUser.name}`);
  };

  const handleRevokeAllForUser = (userId: string) => {
    if (!isAuthorized) return;
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    updateUserCompanyScope(userId, []);
    triggerToast(`Applied Zero-Trust Lock (0 Companies) to ${targetUser.name}`);
  };

  // Column-level actions (toggle all filtered users for a single company)
  const handleColumnGrantAll = (companyId: string) => {
    if (!isAuthorized) return;
    const comp = companies.find((c) => c.id === companyId);
    const updates = fieldUsers.map((u) => {
      const current = u.company_scope || [];
      const updated = current.includes(companyId) ? current : [...current, companyId];
      return { userId: u.id, companyIds: updated };
    });
    bulkUpdateUserCompanyScopes(updates);
    triggerToast(`Granted ${comp?.name || 'Company'} to all ${fieldUsers.length} filtered agents.`);
  };

  const handleColumnRevokeAll = (companyId: string) => {
    if (!isAuthorized) return;
    const comp = companies.find((c) => c.id === companyId);
    const updates = fieldUsers.map((u) => {
      const current = u.company_scope || [];
      const updated = current.filter((id) => id !== companyId);
      return { userId: u.id, companyIds: updated };
    });
    bulkUpdateUserCompanyScopes(updates);
    triggerToast(`Revoked ${comp?.name || 'Company'} from all ${fieldUsers.length} filtered agents.`);
  };

  // Bulk actions on selected users
  const handleSelectAllRows = () => {
    if (selectedUserIds.length === fieldUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(fieldUsers.map((u) => u.id));
    }
  };

  const handleToggleSelectRow = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleBulkGrantCompany = () => {
    if (!quickGrantCompanyId || selectedUserIds.length === 0) return;
    const comp = companies.find((c) => c.id === quickGrantCompanyId);
    const updates = selectedUserIds.map((uid) => {
      const u = users.find((usr) => usr.id === uid);
      const current = u?.company_scope || [];
      const updated = current.includes(quickGrantCompanyId) ? current : [...current, quickGrantCompanyId];
      return { userId: uid, companyIds: updated };
    });
    bulkUpdateUserCompanyScopes(updates);
    triggerToast(`Granted ${comp?.name} to ${selectedUserIds.length} selected agents.`);
    setQuickGrantCompanyId('');
  };

  const handleBulkRevokeAll = () => {
    if (selectedUserIds.length === 0) return;
    if (!window.confirm(`Apply Zero-Trust Lock (0 Companies) to all ${selectedUserIds.length} selected agents? They will not be able to book orders until re-assigned.`)) return;

    const updates = selectedUserIds.map((uid) => ({ userId: uid, companyIds: [] }));
    bulkUpdateUserCompanyScopes(updates);
    triggerToast(`Zero-Trust Lock applied to ${selectedUserIds.length} agents.`);
  };

  const handleBulkGrantAllCompanies = () => {
    if (selectedUserIds.length === 0) return;
    const allCompIds = companies.map((c) => c.id);
    const updates = selectedUserIds.map((uid) => ({ userId: uid, companyIds: allCompIds }));
    bulkUpdateUserCompanyScopes(updates);
    triggerToast(`Granted all Principal Companies to ${selectedUserIds.length} agents.`);
  };

  const getRoleBadge = (role: User['role']) => {
    switch (role) {
      case 'COMMISSION_AGENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            CFS / Agent
          </span>
        );
      case 'SALES_EXECUTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            Sales Exec
          </span>
        );
      case 'DISTRIBUTOR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Distributor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">
            {role}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {showNotification && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md animate-fade-in text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{showNotification}</span>
        </div>
      )}

      {/* Header & Strategic Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Shield className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Field User Principal Company & SKU Access Matrix
              </h2>
            </div>
            <p className="text-sm text-slate-400 max-w-3xl">
              Configure and enforce which Principal Company SKUs field agents (Commission Agents / CFS, Sales Executives, and Distributors) can browse and order. Permissions are stored in the database and synchronize directly to field agents’ Android mobile apps in real time.
            </p>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
            <div className="text-xs text-slate-400">Field Raisers</div>
            <div className="text-xl font-bold text-white font-mono mt-0.5">{stats.total}</div>
            <div className="text-[11px] text-slate-500">CFS, SE & Distributors</div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
            <div className="text-xs text-emerald-400 flex items-center gap-1">
              <Unlock className="w-3 h-3" /> All Brands Granted
            </div>
            <div className="text-xl font-bold text-emerald-300 font-mono mt-0.5">{stats.fullyGranted}</div>
            <div className="text-[11px] text-slate-500">Full catalog access</div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
            <div className="text-xs text-blue-400">Custom Scoped</div>
            <div className="text-xl font-bold text-blue-300 font-mono mt-0.5">{stats.partial}</div>
            <div className="text-[11px] text-slate-500">Specific company subset</div>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
            <div className="text-xs text-rose-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Zero-Trust Locked
            </div>
            <div className="text-xl font-bold text-rose-300 font-mono mt-0.5">{stats.zeroAccess}</div>
            <div className="text-[11px] text-slate-500">0 SKUs until assigned</div>
          </div>
        </div>

        {/* Zero-trust rule disclaimer */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 px-3.5 py-2 rounded-lg border border-slate-800/80">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong className="text-slate-200">Zero-Trust Policy Active:</strong> Field agents with 0 assigned companies cannot view or punch orders. Any new company added in the master catalog remains hidden from field agents until explicitly toggled on here.
          </span>
        </div>
      </div>

      {/* Filter Bar & Controls */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search field agent by name, mobile, beat..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
          />
        </div>

        {/* Role Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-x-auto text-xs">
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              roleFilter === 'ALL'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Roles ({users.filter((u) => u.role === 'COMMISSION_AGENT' || u.role === 'SALES_EXECUTIVE' || u.role === 'DISTRIBUTOR').length})
          </button>
          <button
            onClick={() => setRoleFilter('COMMISSION_AGENT')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              roleFilter === 'COMMISSION_AGENT'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            CFS / Agents ({users.filter((u) => u.role === 'COMMISSION_AGENT').length})
          </button>
          <button
            onClick={() => setRoleFilter('SALES_EXECUTIVE')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              roleFilter === 'SALES_EXECUTIVE'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sales Execs ({users.filter((u) => u.role === 'SALES_EXECUTIVE').length})
          </button>
          <button
            onClick={() => setRoleFilter('DISTRIBUTOR')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              roleFilter === 'DISTRIBUTOR'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Distributors ({users.filter((u) => u.role === 'DISTRIBUTOR').length})
          </button>
        </div>
      </div>

      {/* Bulk Action Toolbar when rows are selected */}
      {selectedUserIds.length > 0 && isAuthorized && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm text-emerald-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white bg-emerald-500/20 px-2 py-0.5 rounded text-xs font-mono">
              {selectedUserIds.length} Selected
            </span>
            <span>Batch actions on selected field agents:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Grant Company */}
            <select
              value={quickGrantCompanyId}
              onChange={(e) => setQuickGrantCompanyId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-400"
            >
              <option value="">-- Grant Specific Company --</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>

            <button
              onClick={handleBulkGrantCompany}
              disabled={!quickGrantCompanyId}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Apply Grant
            </button>

            <span className="text-emerald-500/40">|</span>

            <button
              onClick={handleBulkGrantAllCompanies}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-xs font-medium transition-colors"
            >
              Grant All Brands
            </button>

            <button
              onClick={handleBulkRevokeAll}
              className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
            >
              <Lock className="w-3.5 h-3.5" />
              Apply Zero-Trust Lock
            </button>

            <button
              onClick={() => setSelectedUserIds([])}
              className="px-2.5 py-1.5 text-slate-400 hover:text-slate-200 text-xs"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Main Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {/* Select All Checkbox */}
                <th className="py-3.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={fieldUsers.length > 0 && selectedUserIds.length === fieldUsers.length}
                    onChange={handleSelectAllRows}
                    disabled={!isAuthorized || fieldUsers.length === 0}
                    className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950"
                  />
                </th>

                {/* Field User Profile Column */}
                <th className="py-3.5 px-4 min-w-[240px]">
                  Field Agent & Contact
                </th>

                {/* Role & Territory Column */}
                <th className="py-3.5 px-4 min-w-[150px]">
                  Role & Beat / Territory
                </th>

                {/* Company Columns */}
                {companies.map((company) => {
                  const skuCount = skuCountsByCompany[company.id] || 0;
                  return (
                    <th key={company.id} className="py-3.5 px-4 text-center min-w-[140px] border-l border-slate-800/60">
                      <div className="flex flex-col items-center">
                        <span className="text-white font-medium truncate max-w-[130px]">
                          {company.name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {company.code}
                          </span>
                          <span className="text-[10px] bg-slate-800/90 text-slate-400 px-1 rounded">
                            {skuCount} SKUs
                          </span>
                        </div>

                        {/* Column Bulk Toggle Helper */}
                        {isAuthorized && (
                          <div className="flex items-center gap-1 mt-2 text-[10px] normal-case">
                            <button
                              onClick={() => handleColumnGrantAll(company.id)}
                              title={`Grant ${company.name} to all filtered agents`}
                              className="text-emerald-400 hover:text-emerald-300 hover:underline"
                            >
                              All
                            </button>
                            <span className="text-slate-600">/</span>
                            <button
                              onClick={() => handleColumnRevokeAll(company.id)}
                              title={`Revoke ${company.name} from all filtered agents`}
                              className="text-slate-500 hover:text-rose-400 hover:underline"
                            >
                              None
                            </button>
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* Row Quick Action Column */}
                <th className="py-3.5 px-4 text-center w-28 border-l border-slate-800/60">
                  Quick Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {fieldUsers.length === 0 ? (
                <tr>
                  <td colSpan={3 + companies.length + 1} className="py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm">No field agents found matching current filters.</p>
                  </td>
                </tr>
              ) : (
                fieldUsers.map((user) => {
                  const userScope = user.company_scope || [];
                  const isZeroTrustLocked = userScope.length === 0;
                  const isSelected = selectedUserIds.includes(user.id);

                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-emerald-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(user.id)}
                          disabled={!isAuthorized}
                          className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950"
                        />
                      </td>

                      {/* User Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isZeroTrustLocked
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {user.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-white text-sm truncate flex items-center gap-1.5">
                              {user.name}
                              {isZeroTrustLocked && (
                                <span title="Zero-Trust Locked (0 SKUs Accessible)">
                                  <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">
                              +91-{user.mobile_number || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Beat */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {getRoleBadge(user.role)}
                          <div className="text-xs text-slate-400 truncate max-w-[150px]">
                            {user.beat_name || 'Standard Territory'}
                          </div>
                        </div>
                      </td>

                      {/* Company Toggle Cells */}
                      {companies.map((company) => {
                        const hasAccess = userScope.includes(company.id);

                        return (
                          <td
                            key={company.id}
                            className="py-3.5 px-4 text-center border-l border-slate-800/40"
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleAccess(user.id, company.id)}
                              disabled={!isAuthorized}
                              title={
                                !isAuthorized
                                  ? 'Only Admin/Sub-Admin can modify access matrix'
                                  : hasAccess
                                  ? `Click to revoke ${company.name}`
                                  : `Click to grant ${company.name}`
                              }
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                hasAccess
                                  ? 'bg-emerald-500'
                                  : 'bg-slate-800 hover:bg-slate-700'
                              } ${!isAuthorized ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                  hasAccess ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <div className="text-[10px] text-slate-500 mt-1 font-mono">
                              {hasAccess ? (
                                <span className="text-emerald-400 font-medium">GRANTED</span>
                              ) : (
                                <span className="text-slate-500">LOCKED</span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Row Quick Actions */}
                      <td className="py-3.5 px-4 text-center border-l border-slate-800/40">
                        {isAuthorized ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleGrantAllForUser(user.id)}
                              title="Grant all Principal Companies"
                              className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRevokeAllForUser(user.id)}
                              title="Revoke all (Apply Zero-Trust Lock)"
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">View Only</span>
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

      {/* Audit & Mobile Synchronization Legend */}
      <div className="bg-slate-900/60 border border-slate-800/70 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span className="text-slate-200">Active Access (SKUs visible in Mobile/Web catalog)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-800 border border-slate-700"></span>
            <span className="text-slate-400">Restricted (Filtered out of Order Booking)</span>
          </div>
        </div>

        <div className="text-slate-500">
          Showing {fieldUsers.length} of {users.length} total users across {companies.length} Principal Companies.
        </div>
      </div>
    </div>
  );
};
