import React from 'react';
import { Retailer } from '../../types';
import {
  CheckCircle2,
  Store,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  UserCheck,
  ShoppingBag,
  ArrowRight,
  X,
  BadgeCheck,
  Sparkles
} from 'lucide-react';

interface StoreOnboardSuccessModalProps {
  retailer: Retailer | null;
  onClose: () => void;
  onAction?: (action: 'ORDER' | 'PAYMENT' | 'CLOSE') => void;
  actionLabel?: string;
}

export const StoreOnboardSuccessModal: React.FC<StoreOnboardSuccessModalProps> = ({
  retailer,
  onClose,
  onAction,
  actionLabel = 'Punch Order for Store'
}) => {
  if (!retailer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-emerald-950/40 transform transition-all">
        {/* Top Header with Celebration Accent */}
        <div className="bg-gradient-to-b from-emerald-950/60 to-slate-900 border-b border-emerald-800/30 p-5 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-3 text-emerald-400 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 size={32} className="stroke-[2.5]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-[10px] font-semibold text-emerald-300 uppercase tracking-wider mb-1">
            <Sparkles size={11} /> Registration Verified
          </div>

          <h2 className="text-lg font-bold text-white">Store Onboarded Successfully!</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            The outlet has been registered and is now active for instant order punching and beat distribution.
          </p>
        </div>

        {/* Store Detail Summary Card */}
        <div className="p-5 space-y-3.5">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800/50 text-emerald-400">
                  <Store size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{retailer.name}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="font-mono text-emerald-400 font-semibold">{retailer.code}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                      {retailer.channel} Trade
                    </span>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                <BadgeCheck size={11} /> Active
              </span>
            </div>

            {/* Grid of Attributes */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <Phone size={10} className="text-emerald-400" /> Contact (Unique ID)
                </div>
                <div className="font-mono font-semibold text-slate-200 text-[11px]">{retailer.phone}</div>
              </div>

              <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <MapPin size={10} className="text-blue-400" /> Beat Route
                </div>
                <div className="font-medium text-slate-200 text-[11px] truncate">{retailer.beat_name}</div>
              </div>

              <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <FileText size={10} className="text-amber-400" /> GSTIN Number
                </div>
                <div className="font-mono text-[11px] text-slate-200 truncate">
                  {retailer.gstin || <span className="text-slate-500 italic">Unregistered / Composition</span>}
                </div>
              </div>

              <div className="bg-slate-900/70 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <CreditCard size={10} className="text-purple-400" /> Credit Limit
                </div>
                <div className="font-semibold text-slate-200 text-[11px]">
                  ₹{retailer.credit_limit.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {retailer.contact_person && (
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 px-1 pt-1">
                <UserCheck size={12} className="text-slate-500" />
                <span>Contact Person: <strong className="text-slate-300">{retailer.contact_person}</strong></span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={() => {
                if (onAction) onAction('ORDER');
                onClose();
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition"
            >
              <ShoppingBag size={14} />
              <span>{actionLabel}</span>
              <ArrowRight size={13} />
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition text-center"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
