import React from 'react';
import { useAppStore } from '../../data/store';
import { WorkflowNotification } from '../../types';
import {
  Bell,
  AlertTriangle,
  XCircle,
  Edit3,
  CheckCircle2,
  X,
  Info,
  Clock,
} from 'lucide-react';

export const MobileAlertsBanner: React.FC = () => {
  const {
    workflowNotifications = [],
    markNotificationAsRead,
  } = useAppStore();

  // Filter alerts for the active agent or general alerts
  const agentAlerts = workflowNotifications.filter((n) => {
    // If target_roles is specified, check if it contains AGENT or ALL
    if (n.target_roles && n.target_roles.length > 0) {
      if (!n.target_roles.includes('AGENT') && !n.target_roles.includes('ALL')) {
        return false;
      }
    }
    return !n.is_read;
  });

  if (agentAlerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-2">
      {agentAlerts.slice(0, 3).map((alert) => {
        const isCancelled = alert.type === 'ORDER_CANCELLED_CREDIT_LIMIT';
        const isAmended = alert.type === 'ORDER_AMENDED_PARTIAL_APPROVAL';
        const isVerified = alert.type === 'ORDER_VERIFIED_LOCKED' || alert.type === 'VERIFIED_PARALLEL_ALERT';

        return (
          <div
            key={alert.id}
            className={`p-3 rounded-2xl border flex items-start justify-between gap-3 text-xs shadow-lg transition-all animate-fadeIn ${
              isCancelled
                ? 'bg-rose-950/80 border-rose-500 text-rose-200 shadow-rose-950/40'
                : isAmended
                ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-amber-950/40'
                : 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {isCancelled && <XCircle size={16} className="text-rose-400" />}
                {isAmended && <Edit3 size={16} className="text-amber-400" />}
                {isVerified && <CheckCircle2 size={16} className="text-emerald-400" />}
                {!isCancelled && !isAmended && !isVerified && <Bell size={16} className="text-blue-400" />}
              </div>

              <div>
                <div className="font-bold flex items-center gap-1.5 text-[11px]">
                  <span>{alert.title}</span>
                  <span className="text-[9px] font-mono opacity-60">
                    {new Date(alert.timestamp || alert.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[10px] mt-0.5 leading-tight opacity-90">{alert.message}</p>
                {alert.order_id && (
                  <div className="text-[9px] font-mono mt-1 opacity-75">
                    Order ID: {alert.order_id}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => markNotificationAsRead(alert.id)}
              className="p-1 rounded-lg hover:bg-black/30 text-slate-400 hover:text-white shrink-0"
              title="Dismiss alert"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
