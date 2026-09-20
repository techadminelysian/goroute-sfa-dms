import React from 'react';
import { useAppStore } from '../../data/store';
import { UserRole } from '../../types';
import { ShieldAlert, Lock, ArrowLeft } from 'lucide-react';

interface AccessDeniedProps {
  requiredRoles: UserRole[];
  moduleName?: string;
  onNavigateHome?: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  requiredRoles,
  moduleName = 'Feature',
  onNavigateHome
}) => {
  const { currentUser, activeRole } = useAppStore();

  const currentRole = currentUser?.role || activeRole || 'UNASSIGNED';

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[50vh] text-center max-w-lg mx-auto animate-in fade-in duration-200">
      <div className="w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center mb-4 shadow-lg shadow-rose-950/40">
        <ShieldAlert size={32} />
      </div>

      <h2 className="text-xl font-bold text-white tracking-tight mb-1">
        Access Restricted
      </h2>

      <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-3">
        Role-Based Access Control Enforced
      </p>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 w-full text-xs text-slate-300 space-y-2 mb-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-slate-400">Your Assigned Role:</span>
          <span className="font-semibold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            {currentRole}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-slate-400">Permitted Roles for {moduleName}:</span>
          <div className="flex gap-1 flex-wrap justify-end">
            {requiredRoles.map((role) => (
              <span
                key={role}
                className="font-semibold text-blue-300 px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-800/60 text-[10px]"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
        You do not have administrative privileges or assignment to access this module. Please use features available to your role or contact your Distributor Admin.
      </p>

      {onNavigateHome && (
        <button
          onClick={onNavigateHome}
          className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
        >
          <ArrowLeft size={14} />
          <span>Return to Role Workspace</span>
        </button>
      )}
    </div>
  );
};
