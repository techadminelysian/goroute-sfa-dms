import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import { DistributorInstitution } from '../../types';
import {
  Building2,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  MapPin,
  Phone,
  Mail,
  User,
  Shield,
  ArrowRight,
  Plus
} from 'lucide-react';
import { validateGSTIN, validatePhoneNumber } from '../../utils/validators';

interface BEDistributorOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (onboardedClient: DistributorInstitution, proceedToOrder?: boolean) => void;
}

export const BEDistributorOnboardingModal: React.FC<BEDistributorOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { activeTenant, dispatchPoints, retailers, distributors, addDistributor, currentUser, activeRole } = useAppStore();

  const [channel, setChannel] = useState<'DISTRIBUTOR' | 'INSTITUTIONAL'>('DISTRIBUTOR');
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [fssai, setFssai] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Delhi NCR');
  const [pincode, setPincode] = useState('');
  const [dispatchPointId, setDispatchPointId] = useState<string>(dispatchPoints[0]?.id || '');
  const [creditLimit, setCreditLimit] = useState<number>(500000);
  const [creditDays, setCreditDays] = useState<number>(21);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdClient, setCreatedClient] = useState<DistributorInstitution | null>(null);

  const handleResetForm = () => {
    setName('');
    setGstin('');
    setPan('');
    setFssai('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setPincode('');
    setCreditLimit(500000);
    setCreditDays(21);
    setErrors({});
    setCreatedClient(null);
  };

  // Reset form whenever modal opens so it never displays stale completed card
  useEffect(() => {
    if (isOpen) {
      handleResetForm();
    }
  }, [isOpen]);

  const handleModalClose = () => {
    handleResetForm();
    onClose();
  };

  if (!isOpen) return null;

  // Auto-derive PAN from GSTIN if 15 chars (chars 3 to 12)
  const handleGstinChange = (val: string) => {
    const clean = val.toUpperCase().trim();
    setGstin(clean);
    if (clean.length === 15 && (!pan || pan.length !== 10)) {
      setPan(clean.substring(2, 12));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!name.trim()) errs.name = 'Firm / Entity name is required';
    if (!contactPerson.trim()) errs.contactPerson = 'Contact person / Key representative is required';

    // Strict Phone validation using Indian mobile standard
    const phoneVal = validatePhoneNumber(phone, true);
    if (!phoneVal.isValid) {
      errs.phone = phoneVal.error || 'Valid 10-digit Indian mobile number is required (starts with 6-9)';
    } else {
      const cleanPhone = phoneVal.formatted || phone.replace(/\D/g, '');
      const existingInDistributors = (distributors || []).find(
        (d) => d.phone && d.phone.replace(/\D/g, '') === cleanPhone
      );
      const existingInRetailers = (retailers || []).find(
        (r) => r.phone && r.phone.replace(/\D/g, '') === cleanPhone
      );
      if (existingInDistributors || existingInRetailers) {
        const clientName = existingInDistributors?.name || existingInRetailers?.name;
        errs.phone = `A client with phone ${cleanPhone} already exists (${clientName})`;
      }
    }

    if (gstin.trim()) {
      const gstinVal = validateGSTIN(gstin.trim());
      if (!gstinVal.isValid) {
        errs.gstin = gstinVal.error || 'Invalid GSTIN format';
      } else {
        const cleanGst = gstin.trim().toUpperCase();
        const existingInDistributors = (distributors || []).find(
          (d) => d.gstin && d.gstin.toUpperCase() === cleanGst
        );
        const existingInRetailers = (retailers || []).find(
          (r) => r.gstin && r.gstin.toUpperCase() === cleanGst
        );
        if (existingInDistributors || existingInRetailers) {
          const clientName = existingInDistributors?.name || existingInRetailers?.name;
          errs.gstin = `A client with GSTIN ${cleanGst} already exists (${clientName})`;
        }
      }
    }

    if (!address.trim()) errs.address = 'Warehouse / Delivery address is required';
    if (!city.trim()) errs.city = 'City is required';

    if (pincode.trim() && pincode.trim().length !== 6) {
      errs.pincode = 'Pincode must be 6 digits';
    }

    if (creditLimit < 0) {
      errs.creditLimit = 'Credit limit cannot be negative';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const prefix = channel === 'DISTRIBUTOR' ? 'DST' : 'INS';
    const randomCode = Math.floor(100 + Math.random() * 900);
    const newCode = `${prefix}-${randomCode}`;

    const newClient: DistributorInstitution = {
      id: `dst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: activeTenant?.id || 'tenant_ms_enterprises',
      name: name.trim(),
      code: newCode,
      channel: channel,
      beat_name: 'Direct / Institutional (No Beat)',
      gstin: gstin.trim().toUpperCase() || null,
      pan_number: pan.trim().toUpperCase() || null,
      fssai_license: fssai.trim() || null,
      email: email.trim().toLowerCase() || null,
      address: address.trim(),
      city: city.trim(),
      state: stateName.trim(),
      pincode: pincode.trim() || null,
      contact_person: contactPerson.trim(),
      phone: phone.replace(/\D/g, ''),
      phase_status: 'ACTIVE',
      credit_limit: Number(creditLimit) || 0,
      credit_days: Number(creditDays) || 0,
      dispatch_point_id: dispatchPointId || null,
      current_outstanding: 0,
      onboarded_by_role: activeRole || 'BILLING',
      onboarded_by_user_id: currentUser?.id || null,
      created_at: new Date().toISOString(),
    };

    // Save directly to distributors collection in DB / store
    addDistributor(newClient);
    setCreatedClient(newClient);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-2xl w-full space-y-5 shadow-2xl animate-fadeIn my-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-800/80 text-purple-400 flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  Onboard Distributor / Institution
                </h3>
                <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-purple-950 text-purple-300 border border-purple-800/60">
                  BE Direct Client
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Standard FMCG commercial setup • Direct order punching without Commission Agent or Beat mapping
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Success Screen */}
        {createdClient ? (
          <div className="p-6 bg-slate-950 rounded-xl border border-emerald-800/60 text-center space-y-4 animate-fadeIn">
            <div className="w-12 h-12 bg-emerald-950 border border-emerald-600 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Client Successfully Onboarded!</h4>
              <p className="text-xs text-slate-400 mt-1">
                <strong className="text-emerald-300">{createdClient.name}</strong> ({createdClient.code}) is now active as a {createdClient.channel === 'DISTRIBUTOR' ? 'Distributor' : 'Institution'}.
              </p>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-left text-xs space-y-1.5 max-w-md mx-auto font-mono text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Client Code:</span>
                <span className="text-amber-400 font-bold">{createdClient.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Channel:</span>
                <span className="text-purple-300">{createdClient.channel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Credit Limit:</span>
                <span className="text-emerald-400 font-bold">₹{createdClient.credit_limit.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Terms:</span>
                <span>{createdClient.credit_days || 0} Days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Beat Management:</span>
                <span className="text-slate-400">Direct / None (BE Managed)</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                + Onboard Another
              </button>
              <button
                type="button"
                onClick={() => {
                  const client = createdClient;
                  handleResetForm();
                  if (onSuccess && client) onSuccess(client, true);
                  onClose();
                }}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <span>Punch Order for this Client</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Channel Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Client Classification (FMCG Segment) <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setChannel('DISTRIBUTOR')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    channel === 'DISTRIBUTOR'
                      ? 'bg-purple-950/70 border-purple-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Building2 size={14} className={channel === 'DISTRIBUTOR' ? 'text-purple-400' : 'text-slate-500'} />
                    <span>Distributor / Super Stockist</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    B2B regional stockist, redistribution point, or wholesale agency.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setChannel('INSTITUTIONAL')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    channel === 'INSTITUTIONAL'
                      ? 'bg-purple-950/70 border-purple-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Shield size={14} className={channel === 'INSTITUTIONAL' ? 'text-purple-400' : 'text-slate-500'} />
                    <span>Institutional Client</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Hospitals, corporate canteens, hotels, armed forces mess, or educational bodies.
                  </p>
                </button>
              </div>
            </div>

            {/* Section 1: Entity Name & Key Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Firm / Trade Legal Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Super Distributors Pvt Ltd"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-600 ${
                    errors.name ? 'border-rose-500 focus:border-rose-400' : 'border-slate-800 focus:border-purple-500'
                  }`}
                />
                {errors.name && <p className="text-[10px] text-rose-400 mt-0.5">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Contact Person / Authorized Rep <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Khurana (Managing Partner)"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-600 ${
                    errors.contactPerson ? 'border-rose-500 focus:border-rose-400' : 'border-slate-800 focus:border-purple-500'
                  }`}
                />
                {errors.contactPerson && <p className="text-[10px] text-rose-400 mt-0.5">{errors.contactPerson}</p>}
              </div>
            </div>

            {/* Section 2: Contact Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mobile / Phone Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    value={phone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhone(digits);
                      if (errors.phone) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.phone;
                          return next;
                        });
                      }
                    }}
                    onBlur={() => {
                      if (phone) {
                        const valRes = validatePhoneNumber(phone, true);
                        if (!valRes.isValid) {
                          setErrors((prev) => ({ ...prev, phone: valRes.error || 'Invalid mobile number' }));
                        }
                      }
                    }}
                    className={`w-full bg-slate-950 border rounded-lg pl-9 pr-3 py-1.5 text-xs text-white font-mono outline-none placeholder:text-slate-600 ${
                      errors.phone ? 'border-rose-500 focus:border-rose-400' : 'border-slate-800 focus:border-purple-500'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-[10px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} className="shrink-0" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Official Email Address (Optional)
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    placeholder="accounts@apexdistributors.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Tax & Regulatory Compliance */}
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={12} className="text-purple-400" />
                <span>Tax & Statutory Compliance</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    GSTIN (15 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="07AAAAA0000A1Z5"
                    value={gstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1 text-xs text-white font-mono uppercase outline-none placeholder:text-slate-600 ${
                      errors.gstin ? 'border-rose-500' : 'border-slate-800 focus:border-purple-500'
                    }`}
                  />
                  {errors.gstin && <p className="text-[9px] text-rose-400 mt-0.5">{errors.gstin}</p>}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    PAN Number (10 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="ABCDE1234F"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase().trim())}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg px-2.5 py-1 text-xs text-white font-mono uppercase outline-none placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    FSSAI License No. (14 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={14}
                    placeholder="10019011000123"
                    value={fssai}
                    onChange={(e) => setFssai(e.target.value.trim())}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg px-2.5 py-1 text-xs text-white font-mono outline-none placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Address & Delivery Point */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Delivery / Godown Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Plot 45, Okhla Industrial Area Phase II"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-600 ${
                    errors.address ? 'border-rose-500' : 'border-slate-800 focus:border-purple-500'
                  }`}
                />
                {errors.address && <p className="text-[10px] text-rose-400 mt-0.5">{errors.address}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  City <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="New Delhi"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-600 ${
                    errors.city ? 'border-rose-500' : 'border-slate-800 focus:border-purple-500'
                  }`}
                />
                {errors.city && <p className="text-[10px] text-rose-400 mt-0.5">{errors.city}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">State / Territory</label>
                <input
                  type="text"
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Pincode</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="110020"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white outline-none font-mono"
                />
                {errors.pincode && <p className="text-[10px] text-rose-400 mt-0.5">{errors.pincode}</p>}
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Mapped Dispatch Point / Depot</label>
                <select
                  value={dispatchPointId}
                  onChange={(e) => setDispatchPointId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                >
                  {dispatchPoints.map((dp) => (
                    <option key={dp.id} value={dp.id}>
                      {dp.name} ({dp.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Section 5: Commercial Terms */}
            <div className="p-3 bg-purple-950/30 border border-purple-900/60 rounded-xl space-y-2">
              <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard size={12} className="text-purple-400" />
                <span>Commercial & Credit Terms</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-300 mb-1">
                    Approved Credit Limit (₹) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-emerald-400 font-bold outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Orders beyond this will trigger an advisory alert for Billing Executives.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 mb-1">
                    Payment Terms / Credit Days
                  </label>
                  <select
                    value={creditDays}
                    onChange={(e) => setCreditDays(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                  >
                    <option value={0}>Immediate Advance / Spot Cash (0 Days)</option>
                    <option value={7}>7 Days Credit</option>
                    <option value={15}>15 Days Credit</option>
                    <option value={21}>21 Days Credit (FMCG Standard)</option>
                    <option value={30}>30 Days Credit</option>
                    <option value={45}>45 Days Credit</option>
                    <option value={60}>60 Days Credit</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Onboard {channel === 'DISTRIBUTOR' ? 'Distributor' : 'Institution'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
