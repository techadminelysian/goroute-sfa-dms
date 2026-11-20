import React, { useState, useEffect } from 'react';
import { useAppStore } from './data/store';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { HomeView } from './components/dashboard/HomeView';
import { OrderCapture } from './components/modules/OrderCapture';
import { InventoryTally } from './components/modules/InventoryTally';
import { ClaimsDashboard } from './components/modules/ClaimsDashboard';
import { BillingInvoicing } from './components/modules/BillingInvoicing';
import { CreditManagement } from './components/modules/CreditManagement';
import { ReportingLayer } from './components/modules/ReportingLayer';
import { SetupView } from './components/modules/SetupView';
import { MobileAgentView } from './components/mobile/MobileAgentView';
import { MobileDispatcherApp } from './components/mobile/MobileDispatcherApp';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AccessDenied } from './components/common/AccessDenied';
import { TenantSettingsModal } from './components/settings/TenantSettingsModal';
import { FirebaseConfigModal } from './components/settings/FirebaseConfigModal';
import { AuthModal } from './components/auth/AuthModal';
import { isTenantSettingsAuthorized, isOnboardingAuthorized, isMobileOnlyRole, formatRoleDisplayName, getWebPortalBlockedMessage } from './utils/authClient';
import { Languages, ShieldAlert, Smartphone, LogOut } from 'lucide-react';

export default function App() {
  const { activeTenant, activeRole, isMobilePreview, isAuthenticated, theme, language, setLanguage, currentUser, logout } = useAppStore();

  const isTenantSettingsAllowed = isTenantSettingsAuthorized(currentUser);
  const isOnboardingAllowed = isOnboardingAuthorized(currentUser);

  const [activeModule, setActiveModule] = useState<string>('home');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFirebaseOpen, setIsFirebaseOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Enforce English language for web portal users
  useEffect(() => {
    if (!isMobileOnlyRole(activeRole) && language !== 'en') {
      setLanguage('en');
    }
  }, [activeRole, language, setLanguage]);

  // If user is not authenticated, render full-screen secure authentication gate
  if (!isAuthenticated) {
    return (
      <div 
        className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200"
        data-theme={theme}
      >
        <AuthModal
          isOpen={true}
          isForcedAuth={true}
          onClose={() => setIsAuthOpen(false)}
        />
      </div>
    );
  }

  // Strict RBAC Web Portal Gate: Block all Mobile-Only roles from accessing the Web Portal
  if (isMobileOnlyRole(activeRole)) {
    return (
      <div
        className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans"
        data-theme={theme}
      >
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-950/70 border border-rose-700/60 text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert size={32} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
              Web Portal Access Blocked
            </p>
            <h1 className="text-xl font-bold text-white">
              Mobile Application Required
            </h1>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {getWebPortalBlockedMessage(activeRole)}
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs flex items-center justify-between">
            <span className="text-slate-400">Account Role:</span>
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              <Smartphone size={13} />
              {formatRoleDisplayName(activeRole)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              setIsAuthOpen(true);
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            <span>Sign Out & Return to Web Login</span>
          </button>
        </div>
      </div>
    );
  }

  // Define module role permissions (strictly Web Portal roles)
  const moduleRoleRules: Record<string, string[]> = {
    home: ['ADMIN', 'SUB_ADMIN', 'BILLING', 'ORDER_PUNCHER', 'ACCOUNTANT'],
    orders: ['ADMIN', 'SUB_ADMIN', 'BILLING', 'ORDER_PUNCHER'],
    inventory: ['ADMIN', 'SUB_ADMIN', 'BILLING', 'ORDER_PUNCHER'],
    billing: ['ADMIN', 'SUB_ADMIN', 'BILLING', 'ACCOUNTANT'],
    credit: ['ADMIN', 'SUB_ADMIN', 'ACCOUNTANT'],
    claims: ['ADMIN', 'SUB_ADMIN'],
    reports: ['ADMIN', 'SUB_ADMIN', 'BILLING', 'ACCOUNTANT'],
    setup: ['ADMIN', 'SUB_ADMIN']
  };

  const isModuleAllowed = (mod: string): boolean => {
    const allowed = moduleRoleRules[mod];
    if (!allowed) return true;
    return allowed.includes(activeRole);
  };

  return (
    <div 
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors duration-200"
      data-theme={theme}
    >
      {/* Top Header */}
      <Header
        onOpenOnboarding={() => {
          if (isOnboardingAllowed) setIsOnboardingOpen(true);
        }}
        onOpenSettings={() => {
          if (isTenantSettingsAllowed) setIsSettingsOpen(true);
        }}
        onOpenFirebaseModal={() => setIsFirebaseOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        activeModule={activeModule}
      />

      {/* Main Container */}
      {isMobilePreview ? (
        /* Mobile Field View Container */
        <main className="flex-1 p-4 flex flex-col items-center justify-center bg-slate-950">
          <div className="mb-3 w-full max-w-md flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
              {language === 'hi'
                ? `मोबाइल टर्मिनल (${
                    activeRole === 'DISPATCHER'
                      ? 'डिपो डिस्पैचर'
                      : activeRole === 'SALES_EXECUTIVE'
                      ? 'सेल्स एग्जीक्यूटिव'
                      : activeRole === 'DISTRIBUTOR'
                      ? 'वितरक (Distributor)'
                      : 'कमीशन एजेंट'
                  })`
                : `Mobile Terminal (${
                    activeRole === 'DISPATCHER'
                      ? 'Depot Dispatcher'
                      : activeRole === 'SALES_EXECUTIVE'
                      ? 'Sales Executive'
                      : activeRole === 'DISTRIBUTOR'
                      ? 'Distributor Portal'
                      : 'Commission Agent'
                  })`}
            </span>

            {/* Direct Language Switcher in Mobile Mode Top Banner */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs shadow-xs">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                  language === 'en'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Switch to English"
              >
                <Languages size={12} className={language === 'en' ? 'text-white' : 'text-slate-400'} />
                <span>EN</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                  language === 'hi'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="हिंदी भाषा में बदलें (Switch to Hindi)"
              >
                <span>हिंदी</span>
              </button>
            </div>
          </div>
          <ErrorBoundary fallbackTitle="Mobile Handheld Terminal Notice">
            {activeRole === 'DISPATCHER' ? <MobileDispatcherApp /> : <MobileAgentView />}
          </ErrorBoundary>
        </main>
      ) : (
        /* Desktop Enterprise Layout */
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Sidebar */}
          <Sidebar
            activeModule={activeModule}
            setActiveModule={setActiveModule}
            onOpenOnboarding={() => {
              if (isOnboardingAllowed) setIsOnboardingOpen(true);
            }}
          />

          {/* Main Module Canvas */}
          <main className="flex-1 p-6 overflow-y-auto bg-slate-950">
            <ErrorBoundary fallbackTitle="Enterprise Module View Notice">
              {!isModuleAllowed(activeModule) ? (
                <AccessDenied
                  requiredRoles={(moduleRoleRules[activeModule] || []) as any}
                  moduleName={activeModule.toUpperCase()}
                  onNavigateHome={() => setActiveModule('home')}
                />
              ) : (
                <>
                  {activeModule === 'home' && (
                    <HomeView
                      onNavigate={setActiveModule}
                      onOpenOnboarding={() => {
                        if (isOnboardingAllowed) setIsOnboardingOpen(true);
                      }}
                    />
                  )}

                  {activeModule === 'orders' && <OrderCapture />}

                  {activeModule === 'inventory' && <InventoryTally />}

                  {activeModule === 'billing' && <BillingInvoicing />}

                  {activeModule === 'credit' && <CreditManagement />}

                  {activeModule === 'claims' && <ClaimsDashboard />}

                  {activeModule === 'reports' && <ReportingLayer />}

                  {activeModule === 'setup' && (
                    <SetupView
                      onOpenOnboarding={() => {
                        if (isOnboardingAllowed) setIsOnboardingOpen(true);
                      }}
                      onOpenSettings={() => {
                        if (isTenantSettingsAllowed) setIsSettingsOpen(true);
                      }}
                    />
                  )}
                </>
              )}
            </ErrorBoundary>
          </main>
        </div>
      )}

      {/* Auth Modal Overlay for Session / Re-auth */}
      {isAuthOpen && (
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
        />
      )}

      {/* Onboarding Modal Overlay - Strictly restricted to user Yash Sharma */}
      {isOnboardingOpen && isOnboardingAllowed && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md overflow-y-auto p-4">
          <div className="relative max-w-4xl mx-auto">
            <button
              onClick={() => setIsOnboardingOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white font-bold text-sm bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 z-10"
            >
              ✕ Close
            </button>
            <OnboardingWizard
              onComplete={() => {
                setIsOnboardingOpen(false);
                setActiveModule('home');
              }}
            />
          </div>
        </div>
      )}

      {/* Settings Modal Overlay - Only visible to backend user 7830260134 */}
      {isSettingsOpen && isTenantSettingsAllowed && (
        <TenantSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Firebase Database Setup Modal Overlay */}
      {isFirebaseOpen && (
        <FirebaseConfigModal onClose={() => setIsFirebaseOpen(false)} />
      )}
    </div>
  );
}

