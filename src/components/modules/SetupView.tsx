import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import { MasterConfigViews } from '../config/MasterConfigViews';
import { BeatManagement } from './BeatManagement';
import { SKU, Retailer } from '../../types';
import { StoreOnboardSuccessModal } from '../common/StoreOnboardSuccessModal';
import { INITIAL_TRADE_SCHEMES } from '../../data/tradeSchemes';
import { calculateExpectedClaimPerUnit, registerSKUMaster } from '../../utils/claimAccrual';
import { getAgentAssignedBeats, getBeatsForBE } from '../../utils/caRoutingLogic';
import {
  validateGSTIN,
  validatePhoneNumber,
  validateStoreName,
  validateBeatRoute,
  validateCreditLimit,
  validateSKUPricing
} from '../../utils/validators';
import {
  Settings,
  Building,
  Boxes,
  Warehouse,
  Users,
  Store,
  MapPin,
  Plus,
  PlayCircle,
  Sliders,
  CheckCircle2,
  Lock,
  Tag,
  Upload,
  Download,
  FileSpreadsheet,
  Edit3,
  Trash2,
  AlertTriangle,
  FileText,
  X,
  Search,
  CheckSquare,
  AlertCircle,
  Percent,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Award,
  Sparkles,
  Coins
} from 'lucide-react';

interface SetupViewProps {
  onOpenOnboarding: () => void;
  onOpenSettings: () => void;
}

export const SetupView: React.FC<SetupViewProps> = ({ onOpenOnboarding, onOpenSettings }) => {
  const {
    activeTenant,
    activeTenantSettings,
    activeRole,
    currentUser,
    skus,
    companies,
    retailers,
    beats,
    users,
    addSKU,
    updateSKU,
    deleteSKU,
    bulkUpsertSKUs,
    addRetailer
  } = useAppStore();

  const isAdmin = currentUser?.role === 'ADMIN' || activeRole === 'ADMIN';
  const isAgent = currentUser?.role === 'AGENT' || activeRole === 'AGENT';
  const isBilling = currentUser?.role === 'BILLING' || activeRole === 'BILLING';

  // Beat visibility for store onboarding:
  // - Admins: All beats
  // - Billing Executive (BE): All beats under Commission Agents mapped to that BE
  // - Commission Agent (CA): Strictly only their assigned beats
  const availableBeatsForOnboarding = useMemo(() => {
    if (isAdmin) {
      return beats;
    }
    if (isAgent) {
      return getAgentAssignedBeats(currentUser, beats);
    }
    if (isBilling) {
      const beBeats = getBeatsForBE(currentUser?.id || '', users, beats);
      return beBeats.length > 0 ? beBeats : beats;
    }
    return beats;
  }, [isAdmin, isAgent, isBilling, currentUser, beats, users]);

  const [activeTab, setActiveTab] = useState<
    'COMPANIES' | 'SKUS' | 'DISPATCH' | 'BEATS' | 'RETAILERS' | 'USERS' | 'SETTINGS' | 'MY_RETAILERS'
  >(activeRole === 'AGENT' ? 'MY_RETAILERS' : 'COMPANIES');

  // SKU Management State
  const [skuCompanyFilter, setSkuCompanyFilter] = useState<string>('ALL');
  const [skuSearchQuery, setSkuSearchQuery] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    companies.length > 0 ? companies[0].id : ''
  );

  // Single SKU Form State
  const [skuName, setSkuName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [skuCategory, setSkuCategory] = useState('General Grocery & FMCG');
  const [skuHsn, setSkuHsn] = useState('1905');
  const [skuPack, setSkuPack] = useState('12 Packs/Case');
  const [skuMrp, setSkuMrp] = useState(100);
  const [skuPtr, setSkuPtr] = useState(80);
  const [skuLanding, setSkuLanding] = useState(65);
  const [skuGst, setSkuGst] = useState(18);
  const [skuIsClaimEligible, setSkuIsClaimEligible] = useState(false);
  const [skuClaimSchemeId, setSkuClaimSchemeId] = useState('');
  const [skuEffectiveFrom, setSkuEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [skuEffectiveTo, setSkuEffectiveTo] = useState('2026-12-31');

  // Editing SKU Modal State
  const [editingSku, setEditingSku] = useState<SKU | null>(null);

  // Deleting SKU Modal State
  const [skuToDelete, setSkuToDelete] = useState<SKU | null>(null);
  const [skuFeedback, setSkuFeedback] = useState<string | null>(null);

  // Bulk Upload Modal State
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [parsedPreviewSkus, setParsedPreviewSkus] = useState<
    Array<{
      company_id: string;
      company_code: string;
      company_name: string;
      code: string;
      name: string;
      category: string;
      hsn_code: string;
      pack_size: string;
      mrp: number;
      selling_price: number;
      landing_price: number;
      tax_rate: number;
      below_cost_flag: boolean;
      isValid: boolean;
      validationMsg: string;
    }>
  >([]);

  // Form State for new Retailer
  const [onboardedStoreSuccess, setOnboardedStoreSuccess] = useState<Retailer | null>(null);
  const [duplicateAlertInfo, setDuplicateAlertInfo] = useState<{
    cleanPhone: string;
    existingStore: Retailer;
  } | null>(null);
  const [retName, setRetName] = useState('');
  const [retPhone, setRetPhone] = useState('');
  const [retBeatId, setRetBeatId] = useState<string>(availableBeatsForOnboarding[0]?.id || beats[0]?.id || '');
  const [retGstin, setRetGstin] = useState('');
  const [retOwner, setRetOwner] = useState('');
  const [retChannel, setRetChannel] = useState<'GT' | 'MT' | 'INSTITUTIONAL' | 'ECOMMERCE'>('GT');
  const [retLimit, setRetLimit] = useState(50000);

  useEffect(() => {
    if (availableBeatsForOnboarding.length > 0) {
      if (!availableBeatsForOnboarding.some((b) => b.id === retBeatId)) {
        setRetBeatId(availableBeatsForOnboarding[0].id);
      }
    } else {
      setRetBeatId('');
    }
  }, [availableBeatsForOnboarding, retBeatId]);

  const handleAddSku = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuName.trim()) {
      alert('SKU Name is required.');
      return;
    }

    const companyObj = companies.find((c) => c.id === selectedCompanyId) || companies[0];

    const pricingVal = validateSKUPricing(
      Number(skuMrp),
      Number(skuPtr),
      Number(skuLanding)
    );
    if (!pricingVal.isValid) {
      alert(`SKU Pricing Validation Error:\n\n${pricingVal.error}`);
      return;
    }

    const selectedScheme = skuIsClaimEligible && skuClaimSchemeId
      ? INITIAL_TRADE_SCHEMES.find((s) => s.schemeId === skuClaimSchemeId)
      : undefined;

    let expectedClaimPerUnit = 0;
    const baseGap = Number(skuLanding) - Number(skuPtr);
    if (skuIsClaimEligible && selectedScheme) {
      try {
        expectedClaimPerUnit = calculateExpectedClaimPerUnit(
          { pts: Number(skuLanding), ptr: Number(skuPtr) },
          selectedScheme
        );
      } catch {
        expectedClaimPerUnit = Math.max(0, baseGap);
      }
    } else if (Number(skuPtr) < Number(skuLanding)) {
      expectedClaimPerUnit = baseGap;
    }

    const newSku: SKU = {
      id: `sku_${Date.now()}`,
      tenant_id: activeTenant.id,
      company_id: companyObj.id,
      code: skuCode.trim().toUpperCase() || `SKU-${Date.now().toString().slice(-4)}`,
      name: skuName.trim(),
      category: skuCategory.trim() || 'General FMCG',
      hsn_code: skuHsn.trim() || '1905',
      mrp: Number(skuMrp) || 100,
      landing_price: Number(skuLanding) || 65,
      selling_price: Number(skuPtr) || 80,
      pts: Number(skuLanding) || 65,
      ptr: Number(skuPtr) || 80,
      below_cost_flag: Number(skuPtr) < Number(skuLanding),
      expected_claim_per_unit: expectedClaimPerUnit,
      pack_size: skuPack.trim() || '12 Packs/Case',
      tax_rate: Number(skuGst) || 18,
      is_claim_eligible: skuIsClaimEligible,
      claim_scheme_id: skuIsClaimEligible ? (skuClaimSchemeId || null) : null,
      effective_from: skuIsClaimEligible ? skuEffectiveFrom : undefined,
      effective_to: skuIsClaimEligible ? skuEffectiveTo : undefined,
    };

    addSKU(newSku);
    registerSKUMaster([...skus, newSku]);

    setSkuName('');
    setSkuCode('');
    setSkuIsClaimEligible(false);
    setSkuClaimSchemeId('');
    alert(
      `SKU "${skuName}" added successfully under ${companyObj.name}!\n${
        skuIsClaimEligible
          ? `Claim Participation: Active (${selectedScheme?.schemeName || 'Custom Scheme'}, Expected Claim: ₹${expectedClaimPerUnit.toFixed(2)}/unit)`
          : 'Claim Participation: Normal SKU'
      }`
    );
  };

  // Download Standard CSV Template
  const handleDownloadSkuTemplate = () => {
    const headers = [
      'Company Code',
      'SKU Code',
      'Product Name',
      'Category',
      'HSN Code',
      'Pack Size',
      'MRP',
      'PTR Selling Price',
      'Landing Cost',
      'GST Rate %'
    ];

    const sampleRows = [
      ['BRIT', 'BRIT-GOODDAY-100', 'Britannia Good Day Butter 100g', 'Biscuits & Cookies', '1905', '24 Packs/Case', '30', '24.50', '21.00', '18'],
      ['BRIT', 'BRIT-MARIE-200', 'Britannia Marie Gold 200g', 'Biscuits & Cookies', '1905', '12 Packs/Case', '45', '37.00', '32.50', '18'],
      ['AMUL', 'AMUL-MILK-500', 'Amul Taaza Toned Milk 500ml Pouch', 'Dairy Fresh', '0401', '30 Pouches/Crate', '27', '24.50', '22.00', '5'],
      ['PARAS', 'PARAS-GHEE-1L', 'Paras Pure Desi Cow Ghee 1L Jar', 'Ghee & Cooking Oils', '0405', '12 Jars/Case', '650', '560.00', '510.00', '12'],
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...sampleRows.map((e) => e.map(x => `"${x}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'FMCG_Company_SKU_MRP_Master_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Current SKU Catalog to CSV
  const handleExportSkuMasterCsv = () => {
    const targetSkus = skuCompanyFilter === 'ALL'
      ? skus
      : skus.filter((s) => s.company_id === skuCompanyFilter);

    if (targetSkus.length === 0) {
      alert('No SKUs available to export.');
      return;
    }

    const headers = [
      'Company Code',
      'Company Name',
      'SKU Code',
      'Product Name',
      'Category',
      'HSN Code',
      'Pack Size',
      'MRP (Rs)',
      'PTR Selling Price (Rs)',
      'Landing Cost (Rs)',
      'Margin (PTR - Landing)',
      'Below Cost Subsidized Flag',
      'GST Rate %'
    ];

    const rows = targetSkus.map((s) => {
      const comp = companies.find((c) => c.id === s.company_id);
      const margin = (s.selling_price - s.landing_price).toFixed(2);
      return [
        comp?.code || 'GENERIC',
        comp?.name || 'General',
        s.code,
        s.name,
        s.category || 'General FMCG',
        s.hsn_code || '1905',
        s.pack_size || '12 Packs/Case',
        s.mrp,
        s.selling_price,
        s.landing_price,
        margin,
        s.below_cost_flag ? 'YES (Subsidized Scheme)' : 'NO',
        s.tax_rate || 18
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SKU_Price_Master_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse CSV string into preview array
  const handleParseCsvContent = (content: string) => {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      alert('CSV file must contain a header row and at least one data row.');
      return;
    }

    const parsedRows: typeof parsedPreviewSkus = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Simple regex parser handling quoted fields
      const cells = line.match(/(".*?"|[^",\t]+)(?=\s*,\s*|\s*$)/g) || line.split(',');
      const cleanCells = cells.map((c) => c.replace(/^"|"$/g, '').trim());

      if (cleanCells.length < 3) continue;

      const compCode = (cleanCells[0] || 'BRIT').toUpperCase();
      const code = (cleanCells[1] || `SKU-${Date.now()}-${i}`).toUpperCase();
      const name = cleanCells[2] || 'Unassigned SKU Name';
      const category = cleanCells[3] || 'General Grocery & FMCG';
      const hsn_code = cleanCells[4] || '1905';
      const pack_size = cleanCells[5] || '12 Packs/Case';
      const mrp = parseFloat(cleanCells[6]) || 100;
      const selling_price = parseFloat(cleanCells[7]) || 80;
      const landing_price = parseFloat(cleanCells[8]) || 65;
      const tax_rate = parseFloat(cleanCells[9]) || 18;

      // Match company code against system companies
      const comp = companies.find(
        (c) => c.code.toUpperCase() === compCode || c.name.toUpperCase().includes(compCode)
      ) || companies[0];

      const below_cost_flag = selling_price < landing_price;
      const isValid = Boolean(code && name && mrp > 0 && selling_price > 0);
      let validationMsg = 'Valid';
      if (!isValid) validationMsg = 'Invalid code or non-positive price values';
      else if (below_cost_flag) validationMsg = 'Subsidized Scheme (PTR < Landing Cost)';

      parsedRows.push({
        company_id: comp ? comp.id : companies[0]?.id || 'comp_brit',
        company_code: comp ? comp.code : compCode,
        company_name: comp ? comp.name : 'Britannia',
        code,
        name,
        category,
        hsn_code,
        pack_size,
        mrp,
        selling_price,
        landing_price,
        tax_rate,
        below_cost_flag,
        isValid,
        validationMsg
      });
    }

    setParsedPreviewSkus(parsedRows);
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvText(text);
        handleParseCsvContent(text);
      }
    };
    reader.readAsText(file);
  };

  // Commit Bulk Import
  const handleCommitBulkImport = () => {
    const validRows = parsedPreviewSkus.filter((r) => r.isValid);

    if (validRows.length === 0) {
      alert('No valid SKU rows found to import.');
      return;
    }

    const newSkus: SKU[] = validRows.map((r, idx) => ({
      id: `sku_bulk_${Date.now()}_${idx}`,
      tenant_id: activeTenant.id,
      company_id: r.company_id,
      code: r.code,
      name: r.name,
      category: r.category,
      hsn_code: r.hsn_code,
      mrp: r.mrp,
      selling_price: r.selling_price,
      landing_price: r.landing_price,
      below_cost_flag: r.below_cost_flag,
      expected_claim_per_unit: r.below_cost_flag ? r.landing_price - r.selling_price : 0,
      pack_size: r.pack_size,
      tax_rate: r.tax_rate
    }));

    bulkUpsertSKUs(newSkus);

    alert(`Successfully bulk-imported / updated ${validRows.length} SKU(s) across Company Masters!\n\nAll pricing, MRPs, PTRs, and Landing Costs are now active across the system.`);
    setIsBulkImportOpen(false);
    setCsvText('');
    setParsedPreviewSkus([]);
  };

  // Save SKU Edit
  const handleSaveEditSku = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSku) return;

    const pricingVal = validateSKUPricing(
      editingSku.mrp,
      editingSku.selling_price,
      editingSku.landing_price
    );
    if (!pricingVal.isValid) {
      alert(`SKU Pricing Validation Error:\n\n${pricingVal.error}`);
      return;
    }

    const selectedScheme = editingSku.is_claim_eligible && editingSku.claim_scheme_id
      ? INITIAL_TRADE_SCHEMES.find((s) => s.schemeId === editingSku.claim_scheme_id)
      : undefined;

    let expectedClaimPerUnit = 0;
    const baseGap = Number(editingSku.landing_price) - Number(editingSku.selling_price);
    if (editingSku.is_claim_eligible && selectedScheme) {
      try {
        expectedClaimPerUnit = calculateExpectedClaimPerUnit(
          { pts: Number(editingSku.landing_price), ptr: Number(editingSku.selling_price) },
          selectedScheme
        );
      } catch {
        expectedClaimPerUnit = Math.max(0, baseGap);
      }
    } else if (editingSku.selling_price < editingSku.landing_price) {
      expectedClaimPerUnit = baseGap;
    }

    const belowCost = editingSku.selling_price < editingSku.landing_price;
    const updatedSku: SKU = {
      ...editingSku,
      pts: Number(editingSku.landing_price),
      ptr: Number(editingSku.selling_price),
      below_cost_flag: belowCost,
      expected_claim_per_unit: expectedClaimPerUnit,
    };

    updateSKU(editingSku.id, updatedSku);
    registerSKUMaster(skus.map((s) => (s.id === editingSku.id ? updatedSku : s)));

    alert(`SKU "${editingSku.name}" (${editingSku.code}) updated successfully!`);
    setEditingSku(null);
  };

  const handleAddRetailer = (e: React.FormEvent) => {
    e.preventDefault();

    if (isAgent && availableBeatsForOnboarding.length === 0) {
      alert(
        'Store Onboarding Blocked:\n\nYou are not assigned to any territory beats. Please contact an administrator to assign route beats before onboarding new stores.'
      );
      return;
    }

    const nameVal = validateStoreName(retName);
    if (!nameVal.isValid) {
      alert(`Outlet Name Error:\n\n${nameVal.error}`);
      return;
    }

    const phoneVal = validatePhoneNumber(retPhone);
    if (!phoneVal.isValid) {
      alert(`Contact Number Error:\n\n${phoneVal.error}`);
      return;
    }

    const cleanPhone = phoneVal.formatted!;
    // Duplicate check on phone number
    const existing = retailers.find((r) => r.phone.trim().replace(/\D/g, '') === cleanPhone);
    if (existing) {
      setDuplicateAlertInfo({ cleanPhone, existingStore: existing });
      return;
    }

    const selectedBeatObj = beats.find((b) => b.id === retBeatId) || beats[0];
    const cleanBeat = selectedBeatObj ? selectedBeatObj.name : 'Central GT Beat';

    const gstinVal = validateGSTIN(retGstin, false);
    if (!gstinVal.isValid) {
      alert(
        `GSTIN Validation Error:\n\n${gstinVal.error}\n\n• If this retailer is unregistered under GST or is a composition dealer, please leave the GSTIN field empty.\n• If registered, enter the complete 15-character GSTIN (e.g., 27AAAAA0000A1Z5).`
      );
      return;
    }

    const creditLimitVal = validateCreditLimit(retLimit);
    if (!creditLimitVal.isValid) {
      alert(`Credit Limit Error:\n\n${creditLimitVal.error}`);
      return;
    }

    const cleanName = nameVal.formatted!;
    const cleanGstin = gstinVal.formatted || null;

    const newRet = {
      id: `ret_${Date.now()}`,
      tenant_id: activeTenant.id,
      code: `RET-${Math.floor(100 + Math.random() * 900)}`,
      name: cleanName,
      channel: retChannel,
      beat_name: cleanBeat,
      beat_id: selectedBeatObj?.id,
      gstin: cleanGstin,
      credit_limit: creditLimitVal.value!,
      current_outstanding: 0,
      address: `${cleanBeat} Route`,
      contact_person: retOwner.trim() || 'Store Owner',
      phone: cleanPhone,
      phase_status: 'ACTIVE' as const
    };

    addRetailer(newRet);

    setRetName('');
    setRetPhone('');
    setRetGstin('');
    setRetOwner('');

    // Trigger visual store onboarding success modal
    setOnboardedStoreSuccess(newRet);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <Settings size={16} /> Setup — Tenant Configuration & Masters
          </div>
          <h1 className="text-lg font-bold text-white">
            {activeTenant.name} Setup Console
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure tenant masters (Companies, SKUs, Dispatch Points, Retailers, Users) and threshold settings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenOnboarding}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow"
          >
            <PlayCircle size={15} /> Run Onboarding Wizard
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-xl text-xs overflow-x-auto">
        {activeRole === 'AGENT' ? (
          <button
            onClick={() => setActiveTab('MY_RETAILERS')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'MY_RETAILERS'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tag size={14} /> My Tagged Retailers
          </button>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('COMPANIES')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'COMPANIES'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building size={14} /> Principal Companies
            </button>

            <button
              onClick={() => setActiveTab('SKUS')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'SKUS'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Boxes size={14} /> SKU & Price Master
            </button>

            <button
              onClick={() => setActiveTab('DISPATCH')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'DISPATCH'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Warehouse size={14} /> Dispatch Points
            </button>

            {isAdmin && (
              <button
                onClick={() => setActiveTab('BEATS')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'BEATS'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MapPin size={14} /> FMCG Beats
              </button>
            )}

            <button
              onClick={() => setActiveTab('RETAILERS')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'RETAILERS'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Store size={14} /> Retailers Master
            </button>

            <button
              onClick={() => setActiveTab('USERS')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'USERS'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users size={14} /> Users & Roles
            </button>

            <button
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'SETTINGS'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders size={14} /> Tenant Settings
            </button>
          </>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === 'COMPANIES' && <MasterConfigViews type="COMPANIES" />}
      {activeTab === 'DISPATCH' && <MasterConfigViews type="DISPATCH" />}
      {activeTab === 'USERS' && <MasterConfigViews type="USERS" />}
      {activeTab === 'BEATS' && isAdmin && <BeatManagement />}

      {/* SKUs Master */}
      {activeTab === 'SKUS' && (
        <div className="space-y-4">
          {/* Header Action Banner */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Boxes size={18} className="text-blue-400" /> Company-Wise SKU & Price Master ({skus.length} SKUs)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Bulk upload MRPs, PTR (Price to Retailer), and Landing Costs across Principal Companies.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDownloadSkuTemplate}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                title="Download standard CSV template formatted for Company-wise SKU & MRP bulk upload"
              >
                <Download size={14} className="text-blue-400" /> Download CSV Template
              </button>

              <button
                onClick={handleExportSkuMasterCsv}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                title="Export current active SKU catalog into CSV format"
              >
                <FileSpreadsheet size={14} className="text-emerald-400" /> Export SKU Master (CSV)
              </button>

              <button
                onClick={() => setIsBulkImportOpen(true)}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-900/30 transition-all"
              >
                <Upload size={14} /> Bulk Upload SKU Master
              </button>
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-300">Filter Company:</span>
              <select
                value={skuCompanyFilter}
                onChange={(e) => setSkuCompanyFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-1.5 font-semibold focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Principal Companies ({skus.length} SKUs)</option>
                {companies.map((c) => {
                  const count = skus.filter((s) => s.company_id === c.id).length;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) — {count} SKUs
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search SKU name or code..."
                value={skuSearchQuery}
                onChange={(e) => setSkuSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Single SKU Add Bar */}
          <form onSubmit={handleAddSku} className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white flex items-center gap-2">
                <Plus size={14} className="text-blue-400" /> Single SKU Entry
              </span>
              <span className="text-[10px] text-slate-400">Add an individual SKU directly into company master</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Company *</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">SKU Code *</label>
                <input
                  type="text"
                  placeholder="e.g. BRIT-GOODDAY"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono uppercase"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1">Product Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Britannia Good Day Butter 100g"
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">MRP ₹ *</label>
                <input
                  type="number"
                  step="0.01"
                  value={skuMrp}
                  onChange={(e) => setSkuMrp(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">PTR (Selling ₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={skuPtr}
                  onChange={(e) => setSkuPtr(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-emerald-400 font-mono font-bold"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Landing Cost ₹ (PTS)</label>
                <input
                  type="number"
                  step="0.01"
                  value={skuLanding}
                  onChange={(e) => setSkuLanding(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Biscuits"
                  value={skuCategory}
                  onChange={(e) => setSkuCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">HSN Code</label>
                <input
                  type="text"
                  placeholder="e.g. 1905"
                  value={skuHsn}
                  onChange={(e) => setSkuHsn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Pack / Case Size</label>
                <input
                  type="text"
                  placeholder="e.g. 24 Packs/Case"
                  value={skuPack}
                  onChange={(e) => setSkuPack(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">GST Rate %</label>
                <select
                  value={skuGst}
                  onChange={(e) => setSkuGst(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                >
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5% GST</option>
                  <option value={12}>12% GST</option>
                  <option value={18}>18% GST</option>
                  <option value={28}>28% GST</option>
                </select>
              </div>
            </div>

            {/* DEDICATED TRADE SCHEME CLAIM ELIGIBILITY SECTION */}
            <div className="mt-2 p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Coins size={15} className="text-amber-400" />
                  <span className="font-bold text-slate-200 text-xs">FMCG Trade Scheme Claim Configuration</span>
                  <span className="text-[10px] text-slate-400">(Automatic distributor claim accrual during billing)</span>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  id="sku-claim-eligible-toggle"
                  onClick={() => {
                    const next = !skuIsClaimEligible;
                    setSkuIsClaimEligible(next);
                    if (next && !skuClaimSchemeId) {
                      const matched = INITIAL_TRADE_SCHEMES.find((s) => s.companyId === selectedCompanyId) || INITIAL_TRADE_SCHEMES[0];
                      if (matched) setSkuClaimSchemeId(matched.schemeId);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                    skuIsClaimEligible
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-900/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {skuIsClaimEligible ? (
                    <>
                      <ToggleRight size={18} className="text-amber-400" />
                      <span>Claim Eligible: ON</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={18} className="text-slate-500" />
                      <span>Claim Eligible: OFF</span>
                    </>
                  )}
                </button>
              </div>

              {/* Contextual Scheme Selector & Calculation Preview */}
              {skuIsClaimEligible && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-slate-800/80 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[10px] font-bold text-amber-300 mb-1 flex items-center gap-1">
                      <Percent size={11} /> Select Active Trade Scheme *
                    </label>
                    <select
                      value={skuClaimSchemeId}
                      onChange={(e) => setSkuClaimSchemeId(e.target.value)}
                      className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-white font-medium focus:outline-none focus:border-amber-400"
                    >
                      <option value="">-- Choose Company Scheme --</option>
                      {INITIAL_TRADE_SCHEMES.filter(
                        (s) => s.companyId === selectedCompanyId || s.companyId === 'ALL'
                      ).map((sch) => (
                        <option key={sch.schemeId} value={sch.schemeId}>
                          [{sch.schemeType}] {sch.schemeName} ({sch.schemeId})
                        </option>
                      ))}
                      {INITIAL_TRADE_SCHEMES.filter((s) => s.companyId !== selectedCompanyId).length > 0 && (
                        <optgroup label="Other Available Schemes">
                          {INITIAL_TRADE_SCHEMES.filter((s) => s.companyId !== selectedCompanyId).map((sch) => (
                            <option key={sch.schemeId} value={sch.schemeId}>
                              [{sch.schemeType}] {sch.schemeName}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">Effective Period</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={skuEffectiveFrom}
                        onChange={(e) => setSkuEffectiveFrom(e.target.value)}
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
                      />
                      <span className="text-slate-500 text-[10px]">to</span>
                      <input
                        type="date"
                        value={skuEffectiveTo}
                        onChange={(e) => setSkuEffectiveTo(e.target.value)}
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Real-time Calculation Badge */}
                  <div className="sm:col-span-3 bg-amber-950/40 border border-amber-500/30 rounded-lg p-2 flex flex-col justify-center">
                    <span className="text-[9px] uppercase tracking-wider text-amber-300 font-bold">
                      Calculated Claim / Unit
                    </span>
                    {(() => {
                      const scheme = INITIAL_TRADE_SCHEMES.find((s) => s.schemeId === skuClaimSchemeId);
                      const baseGap = Number(skuLanding) - Number(skuPtr);
                      let claimPerUnit = 0;
                      if (scheme) {
                        try {
                          claimPerUnit = calculateExpectedClaimPerUnit(
                            { pts: Number(skuLanding), ptr: Number(skuPtr) },
                            scheme
                          );
                        } catch {
                          claimPerUnit = Math.max(0, baseGap);
                        }
                      } else {
                        claimPerUnit = Math.max(0, baseGap);
                      }
                      return (
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="text-base font-extrabold text-amber-400 font-mono">
                            ₹{claimPerUnit.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            (Base Gap: ₹{baseGap.toFixed(2)})
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg px-5 py-2 flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/30 transition-all text-xs"
              >
                <Plus size={14} /> Add SKU to Master
              </button>
            </div>
          </form>

          {/* Deletion / Modification Feedback Banner */}
          {skuFeedback && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 rounded-xl text-xs flex items-center justify-between shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span className="font-semibold">{skuFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setSkuFeedback(null)}
                className="text-emerald-400 hover:text-white p-1 rounded hover:bg-emerald-900/40"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* SKU Catalog Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden text-xs shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="p-3">Company</th>
                    <th className="p-3">SKU Code</th>
                    <th className="p-3">Product Name & Category</th>
                    <th className="p-3 text-right">MRP (₹)</th>
                    <th className="p-3 text-right">PTR (Selling ₹)</th>
                    <th className="p-3 text-right">Landing (PTS ₹)</th>
                    <th className="p-3 text-center">Trade Scheme & Claim</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {skus
                    .filter((s) => skuCompanyFilter === 'ALL' || s.company_id === skuCompanyFilter)
                    .filter((s) => {
                      if (!skuSearchQuery.trim()) return true;
                      const q = skuSearchQuery.toLowerCase();
                      return (
                        s.name.toLowerCase().includes(q) ||
                        s.code.toLowerCase().includes(q) ||
                        (s.category && s.category.toLowerCase().includes(q))
                      );
                    })
                    .map((s) => {
                      const comp = companies.find((c) => c.id === s.company_id);
                      const margin = s.selling_price - s.landing_price;
                      const isClaimEligible = Boolean(s.is_claim_eligible || s.expected_claim_per_unit > 0);
                      const linkedScheme = s.claim_scheme_id
                        ? INITIAL_TRADE_SCHEMES.find((sch) => sch.schemeId === s.claim_scheme_id)
                        : undefined;

                      return (
                        <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-bold text-white">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-400 border border-slate-700 font-mono text-[10px]">
                              {comp?.code || 'GENERIC'}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                              {comp?.name || 'Principal'}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-white">{s.code}</td>
                          <td className="p-3">
                            <div className="font-semibold text-white">{s.name}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>{s.category || 'FMCG'}</span>
                              <span>•</span>
                              <span>Pack: {s.pack_size || 'Std'}</span>
                              <span>•</span>
                              <span>HSN: {s.hsn_code || '1905'}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-200">₹{s.mrp.toFixed(2)}</td>
                          <td className="p-3 text-right font-mono text-emerald-400 font-bold">
                            ₹{s.selling_price.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">₹{s.landing_price.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            {isClaimEligible ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold inline-flex items-center gap-1">
                                  <ShieldCheck size={11} className="text-amber-400" />
                                  Claim: ₹{s.expected_claim_per_unit.toFixed(2)}/u
                                </span>
                                <span className="text-[9px] text-slate-400 mt-0.5 max-w-[140px] truncate">
                                  {linkedScheme ? linkedScheme.schemeName : 'Active Trade Scheme'}
                                </span>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold inline-flex items-center gap-1">
                                <CheckCircle2 size={11} className="text-emerald-400" /> Normal (+₹{margin.toFixed(2)})
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setEditingSku(s)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                title="Edit SKU & Claim Eligibility"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSkuToDelete(s)}
                                className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 transition-colors"
                                title={`Delete SKU ${s.name} (${s.code})`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* BULK SKU CSV UPLOAD MODAL */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-blue-400" />
                <h3 className="font-bold text-white text-sm">Bulk Upload Company-Wise SKU & Price Master (CSV)</h3>
              </div>
              <button
                onClick={() => setIsBulkImportOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Upload or paste a CSV file containing company codes, SKU codes, product names, categories, MRPs, PTRs, and Landing Costs. System automatically maps company codes and flags subsidized scheme items.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Drag Drop File Input */}
              <div className="p-4 bg-slate-950 border border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                <FileSpreadsheet size={28} className="text-blue-400" />
                <span className="text-xs font-bold text-white">Choose CSV File</span>
                <span className="text-[10px] text-slate-400">Drag & drop or click to upload `.csv` spreadsheet</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="mt-2 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                />
              </div>

              {/* Quick CSV Template Helper */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-slate-200 block">Expected CSV Format:</span>
                <code className="block bg-slate-900 p-2 rounded text-[10px] text-blue-300 font-mono overflow-x-auto">
                  Company Code, SKU Code, Product Name, Category, HSN, Pack Size, MRP, PTR, Landing Cost, GST Rate %
                </code>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={handleDownloadSkuTemplate}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 text-[11px] font-bold flex items-center gap-1 border border-slate-700"
                  >
                    <Download size={12} /> Get Sample CSV Template
                  </button>
                </div>
              </div>
            </div>

            {/* Direct CSV Text Area */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">Or Paste CSV Raw Data:</label>
              <textarea
                rows={4}
                placeholder={`Company Code,SKU Code,Product Name,Category,HSN Code,Pack Size,MRP,PTR Selling Price,Landing Cost,GST Rate %\nBRIT,BRIT-GOODDAY-100,Britannia Good Day Butter 100g,Biscuits & Cookies,1905,24 Packs/Case,30,24.50,21.00,18\nAMUL,AMUL-MILK-500,Amul Taaza Toned Milk 500ml Pouch,Dairy Fresh,0401,30 Pouches/Crate,27,24.50,22.00,5`}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  handleParseCsvContent(e.target.value);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
              ></textarea>
            </div>

            {/* Parsed CSV Preview Table */}
            {parsedPreviewSkus.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <CheckSquare size={14} className="text-emerald-400" /> Validation Preview ({parsedPreviewSkus.filter((r) => r.isValid).length} Valid SKU Rows)
                  </span>
                  <span className="text-[11px] text-amber-400">
                    {parsedPreviewSkus.filter((r) => r.below_cost_flag).length} Subsidized Scheme Items Detected
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950 text-[11px]">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 sticky top-0">
                      <tr>
                        <th className="p-2">Company</th>
                        <th className="p-2">SKU Code</th>
                        <th className="p-2">Name</th>
                        <th className="p-2 text-right">MRP ₹</th>
                        <th className="p-2 text-right">PTR ₹</th>
                        <th className="p-2 text-right">Landing ₹</th>
                        <th className="p-2 text-center">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200 font-mono">
                      {parsedPreviewSkus.map((r, idx) => (
                        <tr key={idx} className={r.isValid ? 'hover:bg-slate-900' : 'bg-rose-950/20'}>
                          <td className="p-2 font-bold text-blue-400">{r.company_code}</td>
                          <td className="p-2 font-bold text-white">{r.code}</td>
                          <td className="p-2 font-sans font-medium text-slate-200">{r.name}</td>
                          <td className="p-2 text-right text-slate-300">₹{r.mrp}</td>
                          <td className="p-2 text-right text-emerald-400 font-bold">₹{r.selling_price}</td>
                          <td className="p-2 text-right text-slate-400">₹{r.landing_price}</td>
                          <td className="p-2 text-center font-sans">
                            {r.below_cost_flag ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px]">
                                Subsidized Scheme
                              </span>
                            ) : r.isValid ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[9px]">
                                Ready
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[9px]">
                                {r.validationMsg}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
              <button
                onClick={() => setIsBulkImportOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitBulkImport}
                disabled={parsedPreviewSkus.filter((r) => r.isValid).length === 0}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-900/30"
              >
                <CheckCircle2 size={15} /> Commit Bulk SKU Master Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE SKU EDIT MODAL */}
      {editingSku && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Edit3 size={16} className="text-blue-400" /> Edit SKU & Master Prices
              </h3>
              <button
                onClick={() => setEditingSku(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditSku} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">Company</label>
                <select
                  value={editingSku.company_id}
                  onChange={(e) => setEditingSku({ ...editingSku, company_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-bold"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={editingSku.code}
                    onChange={(e) => setEditingSku({ ...editingSku, code: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">Pack Size</label>
                  <input
                    type="text"
                    value={editingSku.pack_size || ''}
                    onChange={(e) => setEditingSku({ ...editingSku, pack_size: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Product Name</label>
                <input
                  type="text"
                  value={editingSku.name}
                  onChange={(e) => setEditingSku({ ...editingSku, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">MRP ₹</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSku.mrp}
                    onChange={(e) => setEditingSku({ ...editingSku, mrp: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">PTR (Selling ₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSku.selling_price}
                    onChange={(e) => setEditingSku({ ...editingSku, selling_price: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-emerald-400 font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">Landing Cost ₹</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingSku.landing_price}
                    onChange={(e) => setEditingSku({ ...editingSku, landing_price: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={editingSku.category || ''}
                    onChange={(e) => setEditingSku({ ...editingSku, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">HSN Code</label>
                  <input
                    type="text"
                    value={editingSku.hsn_code || ''}
                    onChange={(e) => setEditingSku({ ...editingSku, hsn_code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* DEDICATED CLAIM ELIGIBILITY CONTROLS IN EDIT MODAL */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins size={15} className="text-amber-400" />
                    <div>
                      <span className="font-bold text-slate-200 text-xs block">Trade Scheme & Claim Participation</span>
                      <span className="text-[10px] text-slate-400">Track and accrue claims for this SKU</span>
                    </div>
                  </div>

                  {/* Modal Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !editingSku.is_claim_eligible;
                      let nextSchemeId = editingSku.claim_scheme_id;
                      if (next && !nextSchemeId) {
                        const matched = INITIAL_TRADE_SCHEMES.find((s) => s.companyId === editingSku.company_id) || INITIAL_TRADE_SCHEMES[0];
                        nextSchemeId = matched?.schemeId || null;
                      }
                      setEditingSku({
                        ...editingSku,
                        is_claim_eligible: next,
                        claim_scheme_id: next ? nextSchemeId : null,
                      });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                      editingSku.is_claim_eligible
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {editingSku.is_claim_eligible ? (
                      <>
                        <ToggleRight size={18} className="text-amber-400" />
                        <span>Eligible: ON</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft size={18} className="text-slate-500" />
                        <span>Eligible: OFF</span>
                      </>
                    )}
                  </button>
                </div>

                {editingSku.is_claim_eligible && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-[10px] font-bold text-amber-300 mb-1 flex items-center gap-1">
                        <Percent size={11} /> Linked Trade Scheme *
                      </label>
                      <select
                        value={editingSku.claim_scheme_id || ''}
                        onChange={(e) => setEditingSku({ ...editingSku, claim_scheme_id: e.target.value })}
                        className="w-full bg-slate-900 border border-amber-500/40 rounded-lg p-2 text-white font-medium focus:outline-none focus:border-amber-400"
                      >
                        <option value="">-- Choose Company Scheme --</option>
                        {INITIAL_TRADE_SCHEMES.filter(
                          (s) => s.companyId === editingSku.company_id || s.companyId === 'ALL'
                        ).map((sch) => (
                          <option key={sch.schemeId} value={sch.schemeId}>
                            [{sch.schemeType}] {sch.schemeName} ({sch.schemeId})
                          </option>
                        ))}
                        {INITIAL_TRADE_SCHEMES.filter((s) => s.companyId !== editingSku.company_id).length > 0 && (
                          <optgroup label="Other Available Schemes">
                            {INITIAL_TRADE_SCHEMES.filter((s) => s.companyId !== editingSku.company_id).map((sch) => (
                              <option key={sch.schemeId} value={sch.schemeId}>
                                [{sch.schemeType}] {sch.schemeName}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">Effective From</label>
                        <input
                          type="date"
                          value={editingSku.effective_from || '2026-01-01'}
                          onChange={(e) => setEditingSku({ ...editingSku, effective_from: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">Effective To</label>
                        <input
                          type="date"
                          value={editingSku.effective_to || '2026-12-31'}
                          onChange={(e) => setEditingSku({ ...editingSku, effective_to: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white text-xs"
                        />
                      </div>
                    </div>

                    {/* Calculation breakdown card */}
                    <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-amber-300 block">
                          Expected Claim Rate
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Base Gap: ₹{(editingSku.landing_price - editingSku.selling_price).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-right">
                        {(() => {
                          const scheme = INITIAL_TRADE_SCHEMES.find((s) => s.schemeId === editingSku.claim_scheme_id);
                          const baseGap = editingSku.landing_price - editingSku.selling_price;
                          let claim = 0;
                          if (scheme) {
                            try {
                              claim = calculateExpectedClaimPerUnit(
                                { pts: editingSku.landing_price, ptr: editingSku.selling_price },
                                scheme
                              );
                            } catch {
                              claim = Math.max(0, baseGap);
                            }
                          } else {
                            claim = Math.max(0, baseGap);
                          }
                          return (
                            <span className="text-base font-extrabold text-amber-400 font-mono">
                              ₹{claim.toFixed(2)} / unit
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingSku(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 shadow"
                >
                  <CheckCircle2 size={15} /> Save SKU Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SKU DELETE CONFIRMATION POPUP MODAL */}
      {skuToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} className="text-rose-400" /> Confirm SKU Deletion
              </h3>
              <button
                type="button"
                onClick={() => setSkuToDelete(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Are you sure you want to permanently delete this product SKU from the database and master catalog?
              </p>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">SKU Code:</span>
                  <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    {skuToDelete.code}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Product Name:</span>
                  <span className="font-semibold text-white text-right max-w-[220px] truncate">{skuToDelete.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Category / Pack:</span>
                  <span className="text-slate-300">{skuToDelete.category || 'FMCG'} • {skuToDelete.pack_size || 'Std'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">MRP / PTR / PTS:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    ₹{skuToDelete.mrp.toFixed(2)} / ₹{skuToDelete.selling_price.toFixed(2)} / ₹{skuToDelete.landing_price.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                <span className="text-[11px] leading-relaxed">
                  This SKU will be permanently removed from cloud database, price lists, order punching, and stock tally.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setSkuToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = skuToDelete.id;
                  const targetName = skuToDelete.name;
                  const targetCode = skuToDelete.code;
                  deleteSKU(targetId);
                  setSkuToDelete(null);
                  setSkuFeedback(`SKU "${targetName}" (${targetCode}) was successfully deleted from the database.`);
                  setTimeout(() => setSkuFeedback(null), 5000);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-900/30 transition-all"
              >
                <Trash2 size={14} /> Yes, Delete SKU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retailers Master */}
      {(activeTab === 'RETAILERS' || activeTab === 'MY_RETAILERS') && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Store size={16} className="text-amber-400" /> GT Beat Retailers Master ({retailers.length} Stores)
              </h2>
              <p className="text-xs text-slate-400">
                General Trade beat stores, tagged agents, and credit limits.
              </p>
            </div>
          </div>

          {(() => {
            const phoneStatus = validatePhoneNumber(retPhone, false);
            const gstinStatus = validateGSTIN(retGstin, false);
            const nameStatus = validateStoreName(retName);
            const cleanPhoneDigits = retPhone.replace(/\D/g, '');
            const existingStoreWithPhone =
              cleanPhoneDigits.length === 10
                ? retailers.find((r) => r.phone.trim().replace(/\D/g, '') === cleanPhoneDigits)
                : undefined;

            return (
              <form onSubmit={handleAddRetailer} className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs">
                <div className="text-xs font-bold text-white flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Plus size={14} className="text-emerald-400" /> Onboard New Store Outlet
                    <span className="text-[10px] text-emerald-400 font-mono font-normal">Contact Number = Unique Identifier</span>
                  </div>
                </div>

                {isAgent && availableBeatsForOnboarding.length === 0 && (
                  <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-600/80 text-amber-200 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <AlertTriangle size={15} /> Store Onboarding Blocked (0 Assigned Beats)
                    </div>
                    <p className="text-[11px] text-amber-200/90 leading-snug">
                      Your agent account does not have any assigned territory beats. Store onboarding is restricted until an administrator assigns a beat route to your profile.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Outlet / Store Name *</span>
                      {retName.trim().length >= 2 ? (
                        <span className="text-[9px] text-emerald-400 font-medium flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> Valid
                        </span>
                      ) : retName.length > 0 ? (
                        <span className="text-[9px] text-amber-400 font-medium flex items-center gap-0.5">
                          <AlertCircle size={10} /> Min 2 chars
                        </span>
                      ) : null}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Laxmi Provision Store"
                      value={retName}
                      onChange={(e) => setRetName(e.target.value)}
                      className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-white focus:outline-none ${
                        retName.length > 0 && retName.trim().length < 2
                          ? 'border-amber-500 focus:border-amber-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Contact Number (10 Digits) *</span>
                      <span className="text-[9px] font-mono">
                        {existingStoreWithPhone ? (
                          <span className="text-rose-400 font-bold flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Duplicate Contact
                          </span>
                        ) : retPhone.length === 10 && phoneStatus.isValid ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <CheckCircle2 size={10} /> 10/10 Digits Valid
                          </span>
                        ) : retPhone.length > 0 ? (
                          <span className="text-amber-400 flex items-center gap-0.5">
                            <AlertCircle size={10} /> {retPhone.length}/10 digits
                          </span>
                        ) : (
                          <span className="text-emerald-400">Unique Key</span>
                        )}
                      </span>
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={retPhone}
                      onChange={(e) => setRetPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none ${
                        existingStoreWithPhone
                          ? 'border-rose-500 focus:border-rose-400'
                          : retPhone.length > 0 && !phoneStatus.isValid
                          ? 'border-amber-500 focus:border-amber-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Assign to Beat *</span>
                      <span className="text-[9px] text-blue-400 font-mono font-normal">
                        {isAdmin
                          ? 'All Beats (Admin)'
                          : isBilling
                          ? 'Beats Under Assigned CAs'
                          : 'Your Assigned Beats'}
                      </span>
                    </label>
                    <select
                      value={retBeatId}
                      onChange={(e) => setRetBeatId(e.target.value)}
                      disabled={isAgent && availableBeatsForOnboarding.length === 0}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                    >
                      {availableBeatsForOnboarding.length === 0 ? (
                        <option value="">-- No Beats Available --</option>
                      ) : (
                        availableBeatsForOnboarding.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code}) {b.assigned_agent_name ? `— Agent: ${b.assigned_agent_name}` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Prominent Duplicate Contact Number Alert Banner in SetupView */}
                {existingStoreWithPhone && (
                  <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-600/80 text-rose-200 text-xs space-y-1.5 animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5 font-bold text-rose-300">
                      <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                      <span>Store Onboarding Blocked (Duplicate Contact Number):</span>
                    </div>
                    <p className="text-[11px] text-rose-200/90 leading-snug">
                      Each retailer must have a unique 10-digit contact number.
                    </p>
                    <div className="bg-black/40 p-2 rounded-lg text-[10px] space-y-0.5 border border-rose-900/50">
                      <div className="text-slate-300 font-semibold">• Store: {existingStoreWithPhone.name} ({existingStoreWithPhone.code})</div>
                      <div className="text-slate-400">• Beat Route: {existingStoreWithPhone.beat_name}</div>
                      <div className="text-slate-400">• Registered Phone: <span className="font-mono text-emerald-400">{existingStoreWithPhone.phone}</span></div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Trade Channel</label>
                    <select
                      value={retChannel}
                      onChange={(e) => setRetChannel(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="GT">GT (General Trade)</option>
                      <option value="MT">MT (Modern Trade)</option>
                      <option value="INSTITUTIONAL">Institutional / HoReCa</option>
                      <option value="ECOMMERCE">E-Commerce</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Owner / Contact</label>
                    <input
                      type="text"
                      placeholder="e.g. Rajesh Sharma"
                      value={retOwner}
                      onChange={(e) => setRetOwner(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1 flex items-center justify-between">
                      <span>GSTIN Number</span>
                      <span className="text-[9px] text-slate-500">Optional</span>
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      placeholder="e.g. 27AAAAA0000A1Z5"
                      value={retGstin}
                      onChange={(e) => setRetGstin(e.target.value.toUpperCase().replace(/[\s-]/g, ''))}
                      className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-white font-mono uppercase focus:outline-none ${
                        retGstin.length > 0
                          ? gstinStatus.isValid
                            ? 'border-emerald-500 focus:border-emerald-400'
                            : 'border-rose-500 focus:border-rose-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Credit Limit ₹</label>
                    <input
                      type="number"
                      placeholder="50000"
                      value={retLimit}
                      onChange={(e) => setRetLimit(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Real-time GSTIN validation feedback */}
                {retGstin.length > 0 && (
                  <div
                    className={`p-2 rounded-xl text-[10px] flex items-start gap-1.5 ${
                      gstinStatus.isValid
                        ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/50 border border-rose-800 text-rose-300'
                    }`}
                  >
                    {gstinStatus.isValid ? (
                      <>
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Valid 15-character GSTIN:</strong> State {retGstin.slice(0, 2)} | PAN {retGstin.slice(2, 12)} | Checksum {retGstin.slice(12)}
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={13} className="text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>GSTIN Validation Notice:</strong> {gstinStatus.error}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={(isAgent && availableBeatsForOnboarding.length === 0) || !!existingStoreWithPhone}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-lg px-5 py-2 text-xs flex items-center gap-1.5 shadow"
                  >
                    <CheckCircle2 size={14} />
                    {isAgent && availableBeatsForOnboarding.length === 0 ? 'Onboarding Disabled (0 Beats)' : 'Complete Store Onboarding'}
                  </button>
                </div>
              </form>
            );
          })()}

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="p-3">Store Code</th>
                  <th className="p-3">Retailer Name</th>
                  <th className="p-3">Contact (Unique Key)</th>
                  <th className="p-3">Beat Route</th>
                  <th className="p-3">GSTIN</th>
                  <th className="p-3 text-right">Credit Limit (₹)</th>
                  <th className="p-3 text-right">Outstanding (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {retailers.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-mono font-bold text-white">{r.code}</td>
                    <td className="p-3 font-semibold">
                      {r.name}
                      <span className="ml-2 text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                        {r.channel}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-emerald-400">{r.phone}</td>
                    <td className="p-3 text-slate-300">{r.beat_name}</td>
                    <td className="p-3 font-mono text-slate-400">{r.gstin || '—'}</td>
                    <td className="p-3 text-right font-mono">₹{r.credit_limit.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right font-mono text-rose-400 font-bold">₹{r.current_outstanding.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tenant Settings Tab */}
      {activeTab === 'SETTINGS' && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white">Tenant Parameters</h2>
              <p className="text-slate-400">Configured thresholds and integrations for tenant "{activeTenant.name}"</p>
            </div>
            <button
              onClick={onOpenSettings}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              Edit Tenant Parameters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Default Credit Limit</span>
              <div className="text-base font-bold text-white font-mono">₹{activeTenantSettings.credit_limit_default.toLocaleString('en-IN')}</div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Credit Days Threshold</span>
              <div className="text-base font-bold text-white font-mono">{activeTenantSettings.credit_days_threshold} Days</div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Claim Window</span>
              <div className="text-base font-bold text-white font-mono">{activeTenantSettings.claim_recoverable_days} Days</div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Accounting Integration</span>
              <div className="text-base font-bold text-emerald-400 font-mono">{activeTenantSettings.accounting_integration}</div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-medium">Tenant Accent Color</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: activeTenant.accent_color }} />
                <span className="text-white font-mono uppercase">{activeTenant.accent_color}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DUPLICATE STORE CONTACT NUMBER ALERT MODAL */}
      {duplicateAlertInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500/80 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl shadow-rose-950/50 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">
                  Alert
                </span>
                <h3 className="text-base font-bold text-white leading-snug">
                  Store Onboarding Blocked (Duplicate Contact Number):
                </h3>
                <p className="text-xs text-rose-200 font-medium">
                  Each retailer must have a unique 10-digit contact number.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950 border border-rose-900/50 rounded-xl space-y-2 text-xs">
              <div className="text-[12px] font-semibold text-slate-300">
                A store with contact number <span className="font-mono text-emerald-400 font-bold">{duplicateAlertInfo.cleanPhone}</span> already exists:
              </div>
              <div className="space-y-1 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800">
                <div>• Store Name: <strong className="text-white font-semibold">{duplicateAlertInfo.existingStore.name}</strong></div>
                <div>• Beat Route: <span className="text-slate-300">{duplicateAlertInfo.existingStore.beat_name}</span></div>
                <div>• Store Code: <span className="font-mono text-slate-300">{duplicateAlertInfo.existingStore.code}</span></div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setDuplicateAlertInfo(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
              >
                Change Contact Number
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Onboard Success Modal */}
      <StoreOnboardSuccessModal
        retailer={onboardedStoreSuccess}
        onClose={() => setOnboardedStoreSuccess(null)}
        actionLabel="Done & Close"
      />
    </div>
  );
};
