import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  delta?: {
    value: string; // e.g. "+12.4%" or "-2.1%"
    isPositive?: boolean; // true = green, false = red
    label?: string; // e.g. "vs prior period"
  };
  icon: LucideIcon;
  subtext?: string;
  subtitle?: string;
  status?: 'info' | 'success' | 'warning' | 'danger' | 'neutral' | string;
  badge?: string;
  accentColor?: string;
  id?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  delta,
  icon: Icon,
  subtext,
  subtitle,
  status,
  badge,
  accentColor,
  id,
}) => {
  const deltaValue = delta?.value || '';
  const isUp = deltaValue.startsWith('+');
  const isDown = deltaValue.startsWith('-');
  const displaySubtext = subtext || subtitle;

  const statusColors = {
    info: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    neutral: '#64748b',
  };

  const computedAccentColor = accentColor || (status && status in statusColors ? statusColors[status as keyof typeof statusColors] : undefined);

  return (
    <div
      id={id}
      className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between transition-all hover:border-slate-700 shadow-sm"
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {title}
          </span>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-800 text-slate-300"
            style={computedAccentColor ? { color: computedAccentColor, backgroundColor: `${computedAccentColor}15` } : {}}
          >
            <Icon size={16} />
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <div className="text-2xl font-bold tracking-tight text-white font-mono">
            {value}
          </div>
          {badge && (
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-800 text-slate-300 border border-slate-700">
              {badge}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
        {delta ? (
          <div className="flex items-center gap-1.5 font-medium">
            {isUp ? (
              <span className={`inline-flex items-center gap-0.5 ${delta.isPositive === false ? 'text-rose-400' : 'text-emerald-400'}`}>
                <TrendingUp size={13} />
                {delta.value}
              </span>
            ) : isDown ? (
              <span className={`inline-flex items-center gap-0.5 ${delta.isPositive === true ? 'text-emerald-400' : 'text-rose-400'}`}>
                <TrendingDown size={13} />
                {delta.value}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-slate-400">
                <Minus size={13} />
                {delta.value}
              </span>
            )}
            <span className="text-slate-400 text-[11px]">
              {delta.label || 'vs prior 30d'}
            </span>
          </div>
        ) : (
          <div className="text-slate-400 text-[11px]">
            {displaySubtext || 'Operational metric'}
          </div>
        )}

        {subtext && delta && (
          <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
};
