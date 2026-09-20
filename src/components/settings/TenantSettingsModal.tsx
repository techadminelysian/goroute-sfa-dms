import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import { AccountingSystem } from '../../types';
import { validateGSTIN, validateStoreName } from '../../utils/validators';
import { Settings, Sliders, CheckCircle2, Shield, Palette, Building2, AlertCircle, Sun, Moon, Languages } from 'lucide-react';

interface TenantSettingsModalProps {
  onClose: () => void;
}

export const TenantSettingsModal: React.FC<TenantSettingsModalProps> = ({ onClose }) => {
  const {
    activeTenant,
    activeTenantSettings,
    updateTenantBranding,
    updateTenantSettings,
    theme,
    setTheme,
    language,
    setLanguage
  } = useAppStore();

  const [tenantName, setTenantName] = useState(activeTenant.name);
  const [accentColor, setAccentColor] = useState(activeTenant.accent_color);
  const [gstin, setGstin] = useState(activeTenant.gstin);

  const [creditLimit, setCreditLimit] = useState(activeTenantSettings.credit_limit_default);
  const [creditDays, setCreditDays] = useState(activeTenantSettings.credit_days_threshold);
  const [claimDays, setClaimDays] = useState(activeTenantSettings.claim_recoverable_days);
  const [stockFreq, setStockFreq] = useState(activeTenantSettings.stock_count_frequency);
  const [accountingSys, setAccountingSys] = useState<AccountingSystem>(activeTenantSettings.accounting_integration);

  const gstinStatus = validateGSTIN(gstin, false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const nameVal = validateStoreName(tenantName);
    if (!nameVal.isValid) {
      alert(`Distributor Name Error:\n\n${nameVal.error}`);
      return;
    }

    if (gstin.trim()) {
      const gVal = validateGSTIN(gstin, true);
      if (!gVal.isValid) {
        alert(`GSTIN Registration Error:\n\n${gVal.error}`);
        return;
      }
    }

    updateTenantBranding(activeTenant.id, {
      name: nameVal.formatted!,
      accent_color: accentColor,
      gstin: gstin.trim().toUpperCase(),
    });

    updateTenantSettings(activeTenant.id, {
      credit_limit_default: creditLimit,
      credit_days_threshold: creditDays,
      claim_recoverable_days: claimDays,
      stock_count_frequency: stockFreq,
      accounting_integration: accountingSys,
    });

    alert(`Settings saved successfully for tenant "${tenantName}"!`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 text-slate-200 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Settings size={18} className="text-blue-400" />
            Tenant Configuration & White-Label Rules
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs font-bold">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Section 1: Tenant Branding */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <Building2 size={14} className="text-blue-400" /> Tenant Branding & Identity
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Distributor Name</label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 flex items-center justify-between">
                  <span>GSTIN Registration</span>
                  {gstin.length > 0 && (
                    <span className="text-[10px]">
                      {gstinStatus.isValid ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 size={11} /> Valid
                        </span>
                      ) : (
                        <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                          <AlertCircle size={11} /> Invalid
                        </span>
                      )}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[\s-]/g, ''))}
                  className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-white font-mono uppercase focus:outline-none ${
                    gstin.length > 0
                      ? gstinStatus.isValid
                        ? 'border-emerald-500 focus:border-emerald-400'
                        : 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-700 focus:border-blue-500'
                  }`}
                  placeholder="27AAAAA0000A1Z5"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Tenant Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-slate-300">{accentColor}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Operational Thresholds */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <Sliders size={14} className="text-amber-400" /> Credit & Claims Threshold Rules
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Credit Limit Threshold (₹)</label>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Credit Days Threshold</label>
                <input
                  type="number"
                  value={creditDays}
                  onChange={(e) => setCreditDays(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1">Claim Recoverable Window (Days)</label>
                <input
                  type="number"
                  value={claimDays}
                  onChange={(e) => setClaimDays(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Stock Tally Frequency</label>
                <select
                  value={stockFreq}
                  onChange={(e) => setStockFreq(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                >
                  <option value="DAILY">DAILY</option>
                  <option value="WEEKLY">WEEKLY</option>
                  <option value="BIWEEKLY">BIWEEKLY</option>
                  <option value="MONTHLY">MONTHLY</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Swappable Accounting Integration */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <Shield size={14} className="text-emerald-400" /> Swappable Accounting Module
            </div>
            <select
              value={accountingSys}
              onChange={(e) => setAccountingSys(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-semibold"
            >
              <option value="ZOHO">Zoho Finance / Books (Reference Tenant)</option>
              <option value="TALLY">Tally Prime ERP</option>
              <option value="SAP">SAP S/4HANA</option>
              <option value="CUSTOM">Custom REST API</option>
              <option value="NONE">None (Manual Reconciliation)</option>
            </select>
          </div>

          {/* Section 4: Application UI Theme Selection */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="font-semibold text-white flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <Palette size={14} className="text-purple-400" /> UI Theme Appearance
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                Select your preferred workspace visual theme
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Dark Theme Option */}
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  theme === 'dark'
                    ? 'bg-blue-600/15 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/40'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400">
                      <Moon size={13} />
                    </div>
                    <span className="font-bold text-xs text-white">Dark Theme</span>
                  </div>
                  {theme === 'dark' && (
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Default high-contrast deep slate palette designed for low-light environments and enterprise control rooms.
                </p>
              </button>

              {/* Light Theme Option */}
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  theme === 'light'
                    ? 'bg-amber-500/15 border-amber-500 text-slate-900 shadow-sm ring-1 ring-amber-500/40'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-500">
                      <Sun size={13} />
                    </div>
                    <span className="font-bold text-xs text-white">Light Theme</span>
                  </div>
                  {theme === 'light' && (
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Crisp off-white canvas with high-contrast text, clear borders, and optimal daytime readability.
                </p>
              </button>
            </div>
          </div>

          {/* Section 5: Application Language Preference */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="font-semibold text-white flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <Languages size={14} className="text-emerald-400" /> भाषा चयन / Language Preference
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                English & हिंदी (Hindi) supported
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* English Option */}
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  language === 'en'
                    ? 'bg-blue-600/15 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/40'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-white">English (Default)</span>
                  {language === 'en' && (
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  Standard enterprise terminology for distributor web console and handheld terminals.
                </p>
              </button>

              {/* Hindi Option */}
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  language === 'hi'
                    ? 'bg-emerald-600/15 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/40'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-white">हिंदी (Hindi)</span>
                  {language === 'hi' && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      सक्रिय (Active)
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  फील्ड एजेंट्स और डिपो कर्मचारियों के लिए अनुकूलित हिंदी इंटरफेस।
                </p>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} /> Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
