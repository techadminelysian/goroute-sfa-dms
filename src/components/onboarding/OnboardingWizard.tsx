import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import { Tenant, TenantSettings, Company, DispatchPoint, SKU, AccountingSystem } from '../../types';
import {
  Sparkles,
  Building2,
  Building,
  Warehouse,
  Boxes,
  Users,
  Sliders,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Palette
} from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const { addTenant, addCompany, addDispatchPoint, addSKU } = useAppStore();

  const [step, setStep] = useState<number>(1);

  // Tenant Account Form
  const [tenantName, setTenantName] = useState('');
  const [tenantType, setTenantType] = useState<'CF' | 'SUPER_STOCKIST' | 'TCD'>('TCD');
  const [accentColor, setAccentColor] = useState('#1e3a8a');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Principal Companies
  const [companies, setCompanies] = useState<Partial<Company>[]>([
    { name: '', code: '', relationship_type: 'CF', gstin: '', contact_person: '' }
  ]);

  // Dispatch Points
  const [dispatchPoints, setDispatchPoints] = useState<Partial<DispatchPoint>[]>([
    { name: 'Central Warehouse', code: 'WH-01', address: '', supervisor_name: '' }
  ]);

  // SKUs
  const [skus, setSkus] = useState<Partial<SKU>[]>([
    { name: '', code: '', mrp: 100, landing_price: 80, selling_price: 85, below_cost_flag: false, tax_rate: 18 }
  ]);

  // Operational Settings
  const [creditLimit, setCreditLimit] = useState<number>(50000);
  const [creditDays, setCreditDays] = useState<number>(15);
  const [claimDays, setClaimDays] = useState<number>(45);
  const [stockFreq, setStockFreq] = useState<'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('WEEKLY');
  const [accountingSys, setAccountingSys] = useState<AccountingSystem>('ZOHO');

  const colorPresets = ['#1e3a8a', '#0d9488', '#b91c1c', '#4f46e5', '#d97706', '#059669', '#7c3aed'];

  const handleFinishOnboarding = () => {
    if (!tenantName.trim()) {
      alert('Please enter a valid Tenant Name');
      return;
    }

    const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newTenant: Tenant = {
      id: tenantId,
      name: tenantName,
      type: tenantType,
      accent_color: accentColor,
      gstin: gstin || '07AAAAA0000A1Z5',
      address: address || 'Warehouse Complex, Main Road',
      phone: phone || '+91 99000 11223',
      email: email || 'admin@' + tenantName.toLowerCase().replace(/\s+/g, '') + '.com',
      created_at: new Date().toISOString(),
    };

    const newSettings: TenantSettings = {
      tenant_id: tenantId,
      credit_limit_default: creditLimit,
      credit_days_threshold: creditDays,
      claim_recoverable_days: claimDays,
      stock_count_frequency: stockFreq,
      accounting_integration: accountingSys,
      accounting_sync_status: accountingSys === 'NONE' ? 'DISCONNECTED' : 'SYNCED',
      enabled_channels: ['GT', 'MT', 'INSTITUTIONAL', 'ECOMMERCE', 'DIRECT'],
      require_stock_gate: true,
    };

    addTenant(newTenant, newSettings);

    // Save Companies
    companies.forEach((comp, idx) => {
      if (comp.name) {
        const companyId = `comp_${Date.now()}_${idx}`;
        addCompany({
          id: companyId,
          tenant_id: tenantId,
          name: comp.name,
          code: comp.code || comp.name.substring(0, 4).toUpperCase(),
          relationship_type: comp.relationship_type || 'CF',
          gstin: comp.gstin || '07AABCC1234A1Z1',
          contact_person: comp.contact_person || 'Manager',
          email: 'sales@' + (comp.name || 'company').toLowerCase().replace(/\s+/g, '') + '.com',
          phone: '+91 98000 00000',
        });

        // Save SKUs for this company
        skus.forEach((skuItem, sIdx) => {
          if (skuItem.name) {
            addSKU({
              id: `sku_${Date.now()}_${idx}_${sIdx}`,
              tenant_id: tenantId,
              company_id: companyId,
              code: skuItem.code || `${comp.code || 'SKU'}-${sIdx + 1}`,
              name: skuItem.name,
              category: 'General FMCG',
              hsn_code: '19053100',
              mrp: Number(skuItem.mrp) || 100,
              landing_price: Number(skuItem.landing_price) || 80,
              selling_price: Number(skuItem.selling_price) || 85,
              below_cost_flag: Boolean(skuItem.below_cost_flag || (Number(skuItem.selling_price) < Number(skuItem.landing_price))),
              expected_claim_per_unit: Number(skuItem.landing_price) > Number(skuItem.selling_price) ? (Number(skuItem.landing_price) - Number(skuItem.selling_price)) : 0,
              pack_size: '48 pcs/case',
              tax_rate: Number(skuItem.tax_rate) || 18,
            });
          }
        });
      }
    });

    // Save Dispatch Points
    dispatchPoints.forEach((dp, idx) => {
      if (dp.name) {
        addDispatchPoint({
          id: `dp_${Date.now()}_${idx}`,
          tenant_id: tenantId,
          name: dp.name,
          code: dp.code || `DP-0${idx + 1}`,
          address: dp.address || 'Central Depot Premises',
          supervisor_name: dp.supervisor_name || 'Supervisor',
          phone: '+91 98111 00000',
        });
      }
    });

    alert(`Tenant "${tenantName}" successfully onboarded! All core entities are strictly tenant-isolated.`);
    onComplete();
  };

  return (
    <div className="max-w-4xl mx-auto my-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-200 shadow-xl">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs uppercase tracking-wider mb-1">
            <Sparkles size={16} />
            Module 0 — Self-Service Tenant Onboarding
          </div>
          <h2 className="text-xl font-bold text-white">
            Configure New FMCG Distributor Tenant
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Zero engineering required. Set up branding, companies, dispatch points, SKUs, and settings.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
          Step <span className="text-blue-400 font-bold">{step}</span> of 5
        </div>
      </div>

      {/* Step Progress Indicators */}
      <div className="grid grid-cols-5 gap-2 my-6">
        {[
          { num: 1, title: 'Branding', icon: Building2 },
          { num: 2, title: 'Companies', icon: Building },
          { num: 3, title: 'Dispatch', icon: Warehouse },
          { num: 4, title: 'SKUs', icon: Boxes },
          { num: 5, title: 'Settings', icon: Sliders },
        ].map((s) => (
          <button
            key={s.num}
            onClick={() => setStep(s.num)}
            className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
              step === s.num
                ? 'bg-blue-600/20 border-blue-500 text-white font-semibold'
                : step > s.num
                ? 'bg-slate-800/80 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950/60 border-slate-800 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between text-[11px]">
              <span>Step 0{s.num}</span>
              {step > s.num && <CheckCircle size={12} className="text-emerald-400" />}
            </div>
            <div className="text-xs font-medium truncate mt-1 flex items-center gap-1.5">
              <s.icon size={14} />
              {s.title}
            </div>
          </button>
        ))}
      </div>

      {/* Step 1: Branding & Account */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Building2 size={16} className="text-blue-400" />
            Distributor Account & White-Label Branding
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Distributor / Tenant Name *
              </label>
              <input
                type="text"
                placeholder="e.g., MS Enterprises or Apex Global Logistics"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Distributor Model Type
              </label>
              <select
                value={tenantType}
                onChange={(e) => setTenantType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="TCD">Transporter-cum-Distributor (TCD)</option>
                <option value="CF">Clearing & Forwarding Agent (C&F)</option>
                <option value="SUPER_STOCKIST">Super Stockist (SS)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                GSTIN Number
              </label>
              <input
                type="text"
                placeholder="07AAAAA0000A1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Primary Contact Email
              </label>
              <input
                type="email"
                placeholder="admin@distributor.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tenant Accent Theme Color
              </label>
              <div className="flex items-center gap-3">
                {colorPresets.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAccentColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                      accentColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {accentColor === c && <CheckCircle size={14} className="text-white" />}
                  </button>
                ))}
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                  title="Choose custom color"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Principal Companies */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Building size={16} className="text-blue-400" />
              Configure Principal Companies (Any N companies)
            </h3>
            <button
              onClick={() =>
                setCompanies([...companies, { name: '', code: '', relationship_type: 'CF', gstin: '' }])
              }
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1"
            >
              <Plus size={14} /> Add Company
            </button>
          </div>

          <div className="space-y-3">
            {companies.map((comp, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 items-center"
              >
                <input
                  type="text"
                  placeholder="Company Name (e.g. Britannia)"
                  value={comp.name}
                  onChange={(e) => {
                    const copy = [...companies];
                    copy[idx].name = e.target.value;
                    setCompanies(copy);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Code (e.g. BRIT)"
                  value={comp.code}
                  onChange={(e) => {
                    const copy = [...companies];
                    copy[idx].code = e.target.value;
                    setCompanies(copy);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase font-mono"
                />
                <select
                  value={comp.relationship_type}
                  onChange={(e) => {
                    const copy = [...companies];
                    copy[idx].relationship_type = e.target.value as any;
                    setCompanies(copy);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="CF">C&F Relationship</option>
                  <option value="SS">Super Stockist</option>
                  <option value="TCD">Transporter-Distributor</option>
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="GSTIN"
                    value={comp.gstin}
                    onChange={(e) => {
                      const copy = [...companies];
                      copy[idx].gstin = e.target.value;
                      setCompanies(copy);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono flex-1"
                  />
                  {companies.length > 1 && (
                    <button
                      onClick={() => setCompanies(companies.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Dispatch Points */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Warehouse size={16} className="text-blue-400" />
              Configure Dispatch Points & Warehouses
            </h3>
            <button
              onClick={() =>
                setDispatchPoints([...dispatchPoints, { name: '', code: `WH-0${dispatchPoints.length + 1}` }])
              }
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1"
            >
              <Plus size={14} /> Add Dispatch Point
            </button>
          </div>

          <div className="space-y-3">
            {dispatchPoints.map((dp, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-2 items-center"
              >
                <input
                  type="text"
                  placeholder="Dispatch Point Name"
                  value={dp.name}
                  onChange={(e) => {
                    const copy = [...dispatchPoints];
                    copy[idx].name = e.target.value;
                    setDispatchPoints(copy);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Code (e.g. WH-01)"
                  value={dp.code}
                  onChange={(e) => {
                    const copy = [...dispatchPoints];
                    copy[idx].code = e.target.value;
                    setDispatchPoints(copy);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono uppercase"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Supervisor Name"
                    value={dp.supervisor_name}
                    onChange={(e) => {
                      const copy = [...dispatchPoints];
                      copy[idx].supervisor_name = e.target.value;
                      setDispatchPoints(copy);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white flex-1"
                  />
                  {dispatchPoints.length > 1 && (
                    <button
                      onClick={() => setDispatchPoints(dispatchPoints.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: SKUs */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Boxes size={16} className="text-blue-400" />
              Configure Product Catalog (SKUs with Below-Cost / Claim Flags)
            </h3>
            <button
              onClick={() =>
                setSkus([
                  ...skus,
                  { name: '', mrp: 100, landing_price: 80, selling_price: 85, below_cost_flag: false, tax_rate: 18 }
                ])
              }
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1"
            >
              <Plus size={14} /> Add SKU
            </button>
          </div>

          <div className="space-y-3">
            {skus.map((sku, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-6 gap-2 items-center text-xs"
              >
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="SKU Name (e.g., Good Day 75g)"
                    value={sku.name}
                    onChange={(e) => {
                      const copy = [...skus];
                      copy[idx].name = e.target.value;
                      setSkus(copy);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Landing (Cost)</label>
                  <input
                    type="number"
                    value={sku.landing_price}
                    onChange={(e) => {
                      const copy = [...skus];
                      copy[idx].landing_price = Number(e.target.value);
                      copy[idx].below_cost_flag = Number(copy[idx].selling_price) < Number(e.target.value);
                      setSkus(copy);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Selling Price</label>
                  <input
                    type="number"
                    value={sku.selling_price}
                    onChange={(e) => {
                      const copy = [...skus];
                      copy[idx].selling_price = Number(e.target.value);
                      copy[idx].below_cost_flag = Number(e.target.value) < Number(copy[idx].landing_price);
                      setSkus(copy);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-amber-300">
                    <input
                      type="checkbox"
                      checked={Boolean(sku.below_cost_flag)}
                      onChange={(e) => {
                        const copy = [...skus];
                        copy[idx].below_cost_flag = e.target.checked;
                        setSkus(copy);
                      }}
                      className="rounded bg-slate-900 border-slate-700"
                    />
                    Claim-Dep.
                  </label>
                </div>
                <div className="flex items-center justify-end">
                  {skus.length > 1 && (
                    <button
                      onClick={() => setSkus(skus.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Settings & Accounting Integration */}
      {step === 5 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sliders size={16} className="text-blue-400" />
            Tenant Operational Rules & Swappable Accounting Integration
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 mb-1">Default Credit Limit (₹)</label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Credit Days Threshold</label>
              <input
                type="number"
                value={creditDays}
                onChange={(e) => setCreditDays(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Claim Recoverable Window (Days)</label>
              <input
                type="number"
                value={claimDays}
                onChange={(e) => setClaimDays(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Stock Count Frequency</label>
              <select
                value={stockFreq}
                onChange={(e) => setStockFreq(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              >
                <option value="DAILY">Daily Audits</option>
                <option value="WEEKLY">Weekly Audits</option>
                <option value="BIWEEKLY">Bi-Weekly Audits</option>
                <option value="MONTHLY">Monthly Audits</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 mb-1">Swappable Accounting System</label>
              <select
                value={accountingSys}
                onChange={(e) => setAccountingSys(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
              >
                <option value="ZOHO">Zoho Finance / Books (Reference Integration)</option>
                <option value="TALLY">Tally Prime ERP</option>
                <option value="SAP">SAP S/4HANA / Business One</option>
                <option value="CUSTOM">Custom REST Accounting API</option>
                <option value="NONE">None (Manual Reconciliation)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-800">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> Back
          </button>
        ) : (
          <div />
        )}

        {step < 5 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5"
          >
            Next Step <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleFinishOnboarding}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-2 shadow-lg shadow-emerald-900/30"
          >
            <CheckCircle size={16} /> Complete & Launch Tenant
          </button>
        )}
      </div>
    </div>
  );
};
