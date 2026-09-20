import React from 'react';
import { useAppStore } from '../../data/store';
import { UserRole } from '../../types';
import {
  Home,
  ShoppingCart,
  Boxes,
  Receipt,
  AlertTriangle,
  FileCheck2,
  BarChart3,
  Settings,
  CheckCircle2,
  Tag,
  Languages
} from 'lucide-react';

interface SidebarProps {
  activeModule: string;
  setActiveModule: (mod: string) => void;
  onOpenOnboarding: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  setActiveModule
}) => {
  const {
    activeTenant,
    activeTenantSettings,
    activeRole = 'ADMIN',
    language,
    setLanguage,
    orders = [],
    claims = [],
    retailers = []
  } = useAppStore();

  const pendingOrdersCount = (orders || []).filter((o) => o.status === 'PUNCHED').length;
  const flaggedClaimsCount = (claims || []).filter((c) => c.is_leakage_flagged || c.status === 'RAISED').length;
  const overLimitRetailersCount = (retailers || []).filter((r) => r.current_outstanding > r.credit_limit).length;

  // Master top-level nav items matching the prompt specification
  const navItems: {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    allowedRoles: UserRole[];
    badge?: string | null;
    badgeColor?: string;
  }[] = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      allowedRoles: ['ADMIN', 'BILLING', 'ORDER_PUNCHER', 'DISPATCHER', 'ACCOUNTANT', 'AGENT'],
      badge: null,
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: ShoppingCart,
      allowedRoles: ['ADMIN', 'BILLING', 'ORDER_PUNCHER', 'AGENT'],
      badge: pendingOrdersCount > 0 ? `${pendingOrdersCount}` : null,
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Boxes,
      allowedRoles: ['ADMIN', 'DISPATCHER'],
      badge: 'Hard Gate',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'billing',
      label: 'Billing',
      icon: Receipt,
      allowedRoles: ['ADMIN', 'BILLING', 'ACCOUNTANT'],
      badge: null,
    },
    {
      id: 'credit',
      label: 'Credit',
      icon: AlertTriangle,
      allowedRoles: ['ADMIN', 'ACCOUNTANT'],
      badge: overLimitRetailersCount > 0 ? `${overLimitRetailersCount}` : null,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'claims',
      label: 'Claims',
      icon: FileCheck2,
      allowedRoles: ['ADMIN'],
      badge: flaggedClaimsCount > 0 ? `${flaggedClaimsCount}` : null,
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
      allowedRoles: ['ADMIN', 'BILLING', 'ACCOUNTANT'],
      badge: null,
    },
    {
      id: 'setup',
      label: 'Setup',
      icon: Settings,
      allowedRoles: ['ADMIN'],
      badge: null,
    },
    {
      id: 'my_retailers',
      label: 'My Retailers',
      icon: Tag,
      allowedRoles: ['AGENT'],
      badge: null,
    },
  ];

  // Filter items visible to the currently selected role
  const visibleNav = navItems.filter((item) => item.allowedRoles.includes(activeRole));

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between p-3 text-slate-300 shrink-0">
      <div className="space-y-6">
        {/* Tenant Profile Banner */}
        <div
          className="p-3 rounded-xl border border-slate-800 bg-slate-900/80 flex items-center justify-between gap-2"
          style={{ borderLeft: `3px solid ${activeTenant?.accent_color || '#3b82f6'}` }}
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {activeTenant?.name || 'MS Enterprises'}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <span className="font-mono text-[10px] text-slate-300 bg-slate-800 px-1 py-0.2 rounded">
                {activeTenant?.type || 'FMCG_DISTRIBUTOR'}
              </span>
              <span className="truncate">GST: {activeTenant?.gstin || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Top-Level Navigation Menu */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-2">
            Navigation Scope
          </div>

          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const isActive = activeModule === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveModule(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-all ${
                    isActive
                      ? 'bg-blue-600/20 text-white border border-blue-500/40 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                  style={isActive ? { borderLeft: `3px solid ${activeTenant.accent_color}` } : {}}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Language Selector in Sidebar */}
      <div className="pt-3 border-t border-slate-800/80">
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1.5">
            <span className="text-slate-400 flex items-center gap-1">
              <Languages size={13} className="text-emerald-400" />
              <span>Language / भाषा</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
              {language === 'hi' ? 'हिंदी' : 'EN'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded-md border border-slate-800">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`py-1 rounded text-xs font-bold text-center transition-all ${
                language === 'en'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage('hi')}
              className={`py-1 rounded text-xs font-bold text-center transition-all ${
                language === 'hi'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              हिंदी
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info: Swappable Accounting Status */}
      <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1">
            <span className="text-slate-400">Sync Target:</span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
              <CheckCircle2 size={10} />
              {activeTenantSettings?.accounting_integration || 'ZOHO'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            Swappable accounting integration
          </div>
        </div>
      </div>
    </aside>
  );
};
