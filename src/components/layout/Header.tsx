import React from 'react';
import { useAppStore } from '../../data/store';
import { UserRole } from '../../types';
import {
  Shield,
  Smartphone,
  Monitor,
  Settings,
  RefreshCw,
  Sparkles,
  Database,
  User,
  LogOut,
  LogIn,
  KeyRound,
  Sun,
  Moon,
  Languages
} from 'lucide-react';

interface HeaderProps {
  onOpenOnboarding: () => void;
  onOpenSettings: () => void;
  onOpenFirebaseModal: () => void;
  onOpenAuth?: () => void;
  activeModule: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenOnboarding,
  onOpenSettings,
  onOpenFirebaseModal,
  onOpenAuth,
}) => {
  const {
    activeTenant,
    activeRole,
    currentUser,
    isAuthenticated,
    isMobilePreview,
    setIsMobilePreview,
    theme,
    setTheme,
    language,
    setLanguage,
    resetStoreToDefault,
    firebaseStatus,
    logout
  } = useAppStore();

  const roleLabelMap: Record<UserRole, { label: string; platform: 'WEB' | 'MOBILE' }> = {
    ADMIN: { label: 'Admin / Sub-Admin', platform: 'WEB' },
    BILLING: { label: 'Billing Executive', platform: 'WEB' },
    ORDER_PUNCHER: { label: 'Order Puncher', platform: 'WEB' },
    DISPATCHER: { label: 'Dispatcher', platform: 'MOBILE' },
    ACCOUNTANT: { label: 'Accountant', platform: 'WEB' },
    AGENT: { label: 'Commission Agent', platform: 'MOBILE' },
  };

  const userAssignedRole = currentUser?.role || activeRole || 'ADMIN';
  const roleInfo = roleLabelMap[userAssignedRole] || { label: userAssignedRole, platform: 'WEB' };

  return (
    <header className="sticky top-0 z-40 bg-slate-950 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-slate-200 shadow-sm">
      {/* Left: Single Client Branding */}
      <div className="flex items-center gap-3">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center p-1.5 shadow-inner font-black text-white text-xs uppercase"
            style={{ backgroundColor: activeTenant?.accent_color || '#2563eb' }}
          >
            {(activeTenant?.name || 'MS').substring(0, 2)}
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white leading-none flex items-center gap-2">
              {activeTenant?.name || 'MS Enterprises'}
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-normal">
                {activeTenant?.type || 'FMCG_DISTRIBUTOR'}
              </span>
            </div>
            <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Distributor Operations Console | GST: {activeTenant?.gstin || '27AABCU9603R1ZM'}
            </div>
          </div>
        </div>
      </div>

      {/* Right Controls: User Profile, Role Simulator, Device View Toggle, Settings */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Authenticated User Profile Badge & Sign In/Out */}
        {isAuthenticated && currentUser ? (
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <div className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-300 border border-blue-500/40 flex items-center justify-center font-bold text-[10px]">
              {currentUser.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-white leading-tight">
                {currentUser.name}
              </span>
              <span className="text-[9px] font-mono text-slate-400">
                +91 {currentUser.mobile_number || 'N/A'} • {currentUser.role}
              </span>
            </div>
            <button
              onClick={() => {
                logout();
                if (onOpenAuth) onOpenAuth();
              }}
              className="ml-1.5 p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1"
              title="Sign Out of Session"
            >
              <LogOut size={13} />
              <span className="text-[10px] text-slate-400 hover:text-rose-400">Logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm"
          >
            <LogIn size={13} />
            <span>Sign In</span>
          </button>
        )}

        {/* Static Logged-in User Role Badge (Role switching dropdown removed) */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
          <Shield size={13} className="text-blue-400" />
          <span className="text-[11px] text-slate-400 font-medium">Role:</span>
          <span className="font-semibold text-white bg-slate-800 border border-slate-700/80 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
            <span>{roleInfo.label}</span>
            <span className="text-[9px] font-mono text-slate-400 font-normal">({roleInfo.platform})</span>
          </span>
        </div>

        {/* Device View Toggle (Desktop vs Mobile Preview) */}
        <button
          onClick={() => setIsMobilePreview(!isMobilePreview)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
            isMobilePreview
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
          }`}
          title="Toggle Mobile Handheld view vs Web Enterprise view"
        >
          {isMobilePreview ? <Smartphone size={14} /> : <Monitor size={14} />}
          <span className="hidden sm:inline">
            {isMobilePreview ? 'Mobile Field View' : 'Web Console'}
          </span>
        </button>

        {/* Theme Selector: Light and Dark Options */}
        <div 
          className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs shadow-xs"
          role="radiogroup"
          aria-label="UI Theme Options"
        >
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'light'}
            onClick={() => setTheme('light')}
            className={`px-2 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all ${
              theme === 'light'
                ? 'bg-amber-500/20 text-amber-600 border border-amber-500/40 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
            title="Switch to Light Theme"
          >
            <Sun size={13} className={theme === 'light' ? 'text-amber-500' : 'text-slate-400'} />
            <span className="hidden sm:inline font-semibold">Light</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'dark'}
            onClick={() => setTheme('dark')}
            className={`px-2 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all ${
              theme === 'dark'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
            title="Switch to Dark Theme (Current Default)"
          >
            <Moon size={13} className={theme === 'dark' ? 'text-blue-400' : 'text-slate-400'} />
            <span className="hidden sm:inline font-semibold">Dark</span>
          </button>
        </div>

        {/* Language Selector: English vs Hindi */}
        <div
          className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs shadow-xs"
          role="radiogroup"
          aria-label="Language Options"
        >
          <button
            type="button"
            role="radio"
            aria-checked={language === 'en'}
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 rounded-md font-bold text-xs flex items-center gap-1 transition-all ${
              language === 'en'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Switch Language to English"
          >
            <Languages size={13} className={language === 'en' ? 'text-white' : 'text-slate-400'} />
            <span>EN</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={language === 'hi'}
            onClick={() => setLanguage('hi')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center gap-1 transition-all ${
              language === 'hi'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="हिंदी भाषा में बदलें (Switch to Hindi)"
          >
            <span>हिंदी</span>
          </button>
        </div>

        {/* Firestore Database Connection & Seeding Button */}
        <button
          onClick={onOpenFirebaseModal}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
            firebaseStatus === 'CONNECTED'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
              : firebaseStatus === 'SYNCING'
              ? 'bg-blue-950/60 border-blue-500/40 text-blue-300 animate-pulse'
              : firebaseStatus === 'PERMISSION_DENIED'
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
          }`}
          title={
            firebaseStatus === 'PERMISSION_DENIED'
              ? 'Firestore permissions blocked. Click to view rules link and resolution.'
              : 'Cloud Firestore Database Connection & Initial Seeder'
          }
        >
          <Database
            size={14}
            className={
              firebaseStatus === 'CONNECTED'
                ? 'text-emerald-400'
                : firebaseStatus === 'PERMISSION_DENIED'
                ? 'text-amber-400'
                : 'text-blue-400'
            }
          />
          <span className="hidden sm:inline">
            {firebaseStatus === 'CONNECTED'
              ? 'Firestore'
              : firebaseStatus === 'SYNCING'
              ? 'Syncing DB'
              : firebaseStatus === 'PERMISSION_DENIED'
              ? 'DB (Rules Needed)'
              : 'Firestore DB'}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              firebaseStatus === 'CONNECTED'
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                : firebaseStatus === 'SYNCING'
                ? 'bg-blue-400 animate-ping'
                : firebaseStatus === 'PERMISSION_DENIED'
                ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                : 'bg-slate-500'
            }`}
          />
        </button>

        {/* Client System Setup */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all"
          title="Distributor Settings (Credit limits, Claim window, Accounting integration)"
        >
          <Settings size={16} />
        </button>

        {/* Run Setup Wizard */}
        <button
          onClick={onOpenOnboarding}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm"
          title="Run System Setup Wizard"
        >
          <Sparkles size={14} />
          <span>Client Setup</span>
        </button>

        {/* Reset Store Data */}
        <button
          onClick={() => {
            if (confirm('Reset distributor data to defaults?')) {
              resetStoreToDefault();
            }
          }}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-amber-400 transition-all"
          title="Reset Store Data"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  );
};

