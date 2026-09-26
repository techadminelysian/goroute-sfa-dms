import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import { Company, DispatchPoint, User, UserRole } from '../../types';
import { validateStoreName, validateGSTIN } from '../../utils/validators';
import { generateSecurePassword, isValidMobileNumber, sanitizeMobileNumber } from '../../utils/authClient';
import { CAMappingMatrix } from './CAMappingMatrix';
import { BEAbsenceRemappingTool } from './BEAbsenceRemappingTool';
import {
  Building,
  Warehouse,
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  Shield,
  Database,
  RefreshCw,
  Smartphone,
  Key,
  Lock,
  Copy,
  Check,
  UserPlus,
  AlertCircle,
  Sparkles,
  Eye,
  EyeOff,
  Info,
  Layers,
  Zap,
  Filter,
  Search,
  MapPin,
  Edit2,
  X
} from 'lucide-react';

export const MasterConfigViews: React.FC<{ type: 'COMPANIES' | 'DISPATCH' | 'USERS' }> = ({ type }) => {
  const {
    activeTenant,
    activeRole,
    currentUser,
    companies,
    dispatchPoints,
    beats,
    users,
    addCompany,
    updateCompany,
    deleteCompany,
    addDispatchPoint,
    addUser,
    updateBeat,
    assignBeatsToAgent,
    deleteUser,
    adminResetUserPassword
  } = useAppStore();

  const isAdmin = (currentUser?.role === 'ADMIN' || activeRole === 'ADMIN');

  // Company Creation States
  const [compName, setCompName] = useState('');
  const [compCode, setCompCode] = useState('');
  const [compRel, setCompRel] = useState<'CF' | 'SS' | 'TCD'>('CF');
  const [compGstin, setCompGstin] = useState('');
  const [compContact, setCompContact] = useState('');
  const [compPhone, setCompPhone] = useState('');
  const [compEmail, setCompEmail] = useState('');
  const [compError, setCompError] = useState<string | null>(null);
  const [compSuccess, setCompSuccess] = useState<string | null>(null);

  // Company Editing Modal States
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompName, setEditCompName] = useState('');
  const [editCompCode, setEditCompCode] = useState('');
  const [editCompRel, setEditCompRel] = useState<'CF' | 'SS' | 'TCD'>('CF');
  const [editCompGstin, setEditCompGstin] = useState('');
  const [editCompContact, setEditCompContact] = useState('');
  const [editCompPhone, setEditCompPhone] = useState('');
  const [editCompEmail, setEditCompEmail] = useState('');
  const [editCompError, setEditCompError] = useState<string | null>(null);

  const [dpName, setDpName] = useState('');
  const [dpCode, setDpCode] = useState('');

  // User Creation States
  const [usrName, setUsrName] = useState('');
  const [usrEmail, setUsrEmail] = useState('');
  const [usrMobile, setUsrMobile] = useState('');
  const [usrRole, setUsrRole] = useState<UserRole>('AGENT');
  const [usrDispatchPointId, setUsrDispatchPointId] = useState('');
  const [usrBeatId, setUsrBeatId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Success Modal State for showing generated credentials to Admin
  const [createdCredentials, setCreatedCredentials] = useState<{
    user: User;
    rawPassword: string;
    dispatchPointName?: string;
    beatName?: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Admin Password Reset Modal State
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [resetMode, setResetMode] = useState<'AUTO' | 'CUSTOM'>('AUTO');
  const [customResetPassword, setCustomResetPassword] = useState('');
  const [showCustomPassword, setShowCustomPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Reset Success Handover Modal State
  const [resetSuccessData, setResetSuccessData] = useState<{
    user: Partial<User>;
    newPassword: string;
    message: string;
  } | null>(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);
  const [copiedResetHandover, setCopiedResetHandover] = useState(false);

  const [dbStats, setDbStats] = useState<{ total_records?: number; last_seeded_at?: string; users?: number } | null>(null);
  const [isSeedingDb, setIsSeedingDb] = useState(false);
  const [seedSuccessMsg, setSeedSuccessMsg] = useState<string | null>(null);

  // Sub-tabs in Users & Roles (horizontally aligned): Create User & Roster, CA Mapping Matrix, BE Absence Tool
  const [userSubTab, setUserSubTab] = useState<'USERS_ROSTER' | 'CA_MATRIX' | 'BE_ABSENCE'>('USERS_ROSTER');
  const [userRosterSearch, setUserRosterSearch] = useState('');
  const [userRosterRoleFilter, setUserRosterRoleFilter] = useState<string>('ALL');

  // Commission Agent Beat Assignment Modal State (1 Agent -> Many Beats)
  const [editingAgentBeatsUser, setEditingAgentBeatsUser] = useState<User | null>(null);
  const [selectedBeatIdsForAgent, setSelectedBeatIdsForAgent] = useState<string[]>([]);
  const [beatSearchQuery, setBeatSearchQuery] = useState('');
  const [beatTabFilter, setBeatTabFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');
  const [beatSaveSuccess, setBeatSaveSuccess] = useState<string | null>(null);

  const handleOpenAgentBeatsModal = (user: User) => {
    setEditingAgentBeatsUser(user);
    // Find all beats currently assigned to this user
    const currentlyAssigned = beats
      .filter(
        (b) =>
          b.assigned_agent_id === user.id ||
          (user.assigned_beat_ids && user.assigned_beat_ids.includes(b.id))
      )
      .map((b) => b.id);

    // If none found via assigned_agent_id but user has beat_id, include that
    if (currentlyAssigned.length === 0 && user.beat_id) {
      currentlyAssigned.push(user.beat_id);
    }
    setSelectedBeatIdsForAgent(currentlyAssigned);
    setBeatSearchQuery('');
    setBeatTabFilter('ALL');
    setBeatSaveSuccess(null);
  };

  const handleToggleBeatForAgent = (beatId: string) => {
    setSelectedBeatIdsForAgent((prev) =>
      prev.includes(beatId) ? prev.filter((id) => id !== beatId) : [...prev, beatId]
    );
  };

  const handleSaveAgentBeats = () => {
    if (!editingAgentBeatsUser) return;
    assignBeatsToAgent(editingAgentBeatsUser.id, selectedBeatIdsForAgent);
    setBeatSaveSuccess(`Saved! Assigned ${selectedBeatIdsForAgent.length} beat(s) to ${editingAgentBeatsUser.name}.`);
    setTimeout(() => {
      setEditingAgentBeatsUser(null);
      setBeatSaveSuccess(null);
    }, 1100);
  };

  const effectiveUsrDispatchPointId =
    usrDispatchPointId || (dispatchPoints.length > 0 ? dispatchPoints[0].id : '');

  const fetchDbStats = async () => {
    try {
      const res = await fetch('/api/db/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setDbStats(data.stats);
      }
    } catch (e) {
      console.warn('Could not fetch DB stats', e);
    }
  };

  useEffect(() => {
    fetchDbStats();
  }, []);

  const handleSeedDatabase = async () => {
    setIsSeedingDb(true);
    setSeedSuccessMsg(null);
    try {
      const res = await fetch('/api/db/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const data = await res.json();
      if (data.success) {
        setSeedSuccessMsg(`Database seeded successfully! (${data.total_records} master records stored in persistent DB)`);
        await fetchDbStats();
      } else {
        alert('Database seeding error: ' + data.error);
      }
    } catch (err: any) {
      alert('Failed to connect to database seeding endpoint: ' + err.message);
    } finally {
      setIsSeedingDb(false);
    }
  };

  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    setCompError(null);
    setCompSuccess(null);

    const nameVal = validateStoreName(compName);
    if (!nameVal.isValid) {
      setCompError(`Company Name Error: ${nameVal.error}`);
      return;
    }

    // Mandatory GSTIN validation as per requirement
    const gstinVal = validateGSTIN(compGstin, true);
    if (!gstinVal.isValid) {
      setCompError(`GSTIN Validation Error: ${gstinVal.error}`);
      return;
    }

    const code = compCode.trim() ? compCode.trim().toUpperCase() : compName.substring(0, 4).toUpperCase();
    if (companies.some((c) => c.name.toLowerCase() === compName.trim().toLowerCase() || c.code === code)) {
      setCompError(`Validation Error: A company with name "${compName}" or code "${code}" already exists.`);
      return;
    }

    const addedName = nameVal.formatted!;
    const addedGstin = gstinVal.formatted!;

    addCompany({
      id: `comp_${Date.now()}`,
      tenant_id: activeTenant.id,
      name: addedName,
      code,
      relationship_type: compRel,
      gstin: addedGstin,
      contact_person: compContact.trim() || 'Manager',
      email: compEmail.trim() || 'sales@company.com',
      phone: compPhone.trim() || '+91 98000 00000',
    });

    setCompName('');
    setCompCode('');
    setCompGstin('');
    setCompContact('');
    setCompPhone('');
    setCompEmail('');
    setCompSuccess(`Principal Company "${addedName}" successfully created with GSTIN: ${addedGstin}`);
    setTimeout(() => setCompSuccess(null), 5000);
  };

  const handleStartEditCompany = (company: Company) => {
    setEditingCompany(company);
    setEditCompName(company.name);
    setEditCompCode(company.code);
    setEditCompRel(company.relationship_type);
    setEditCompGstin(company.gstin || '');
    setEditCompContact(company.contact_person || '');
    setEditCompPhone(company.phone || '');
    setEditCompEmail(company.email || '');
    setEditCompError(null);
  };

  const handleSaveEditCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setEditCompError(null);

    const nameVal = validateStoreName(editCompName);
    if (!nameVal.isValid) {
      setEditCompError(`Company Name Error: ${nameVal.error}`);
      return;
    }

    // Mandatory GSTIN validation on edit as well
    const gstinVal = validateGSTIN(editCompGstin, true);
    if (!gstinVal.isValid) {
      setEditCompError(`GSTIN Validation Error: ${gstinVal.error}`);
      return;
    }

    const code = editCompCode.trim() ? editCompCode.trim().toUpperCase() : editCompName.substring(0, 4).toUpperCase();
    const isDuplicate = companies.some(
      (c) => c.id !== editingCompany.id && (c.name.toLowerCase() === editCompName.trim().toLowerCase() || c.code === code)
    );
    if (isDuplicate) {
      setEditCompError(`A company with name "${editCompName}" or code "${code}" already exists.`);
      return;
    }

    const updatedName = nameVal.formatted!;
    const updatedGstin = gstinVal.formatted!;

    updateCompany(editingCompany.id, {
      name: updatedName,
      code,
      relationship_type: editCompRel,
      gstin: updatedGstin,
      contact_person: editCompContact.trim() || 'Manager',
      email: editCompEmail.trim() || 'sales@company.com',
      phone: editCompPhone.trim() || '+91 98000 00000',
    });

    setEditingCompany(null);
    setCompSuccess(`Principal Company "${updatedName}" updated successfully with GSTIN: ${updatedGstin}`);
    setTimeout(() => setCompSuccess(null), 5000);
  };

  const handleAddDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    const nameVal = validateStoreName(dpName);
    if (!nameVal.isValid) {
      alert(`Dispatch Point Error:\n\n${nameVal.error}`);
      return;
    }

    addDispatchPoint({
      id: `dp_${Date.now()}`,
      tenant_id: activeTenant.id,
      name: nameVal.formatted!,
      code: dpCode.trim().toUpperCase() || `WH-${Math.floor(100 + Math.random() * 900)}`,
      address: 'Hub Depot Premises',
      supervisor_name: 'Supervisor',
      phone: '+91 98111 00000',
    });

    setDpName('');
    setDpCode('');
    alert(`Dispatch point "${dpName}" added!`);
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Mandatory Name Validation
    if (!usrName.trim()) {
      setFormError('Full Name is required.');
      return;
    }

    // 2. Mandatory Mobile Number Validation (10-digit Indian standard)
    const cleanMobile = sanitizeMobileNumber(usrMobile);
    if (!cleanMobile || !isValidMobileNumber(cleanMobile)) {
      setFormError('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    // 3. Optional Email Validation (validated only if provided)
    const trimmedEmail = usrEmail.trim();
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setFormError(`"${trimmedEmail}" is not a valid email address.`);
        return;
      }
      if (users.some((u) => (u.email || '').toLowerCase() === trimmedEmail.toLowerCase())) {
        setFormError(`A user with email "${trimmedEmail}" is already registered.`);
        return;
      }
    }

    // Check duplicate mobile
    if (users.some((u) => sanitizeMobileNumber(u.mobile_number || '') === cleanMobile)) {
      setFormError(`A user with mobile number "+91 ${cleanMobile}" is already registered.`);
      return;
    }

    // 4. Mandatory Dispatch Point Validation ONLY if Commission Agent
    let selectedDpId: string | null = null;
    let selectedDpName: string | undefined = undefined;
    let selectedBeat = usrRole === 'AGENT' && usrBeatId ? beats.find((b) => b.id === usrBeatId) : null;

    if (usrRole === 'AGENT') {
      if (!effectiveUsrDispatchPointId) {
        setFormError('Dispatch Point is mandatory for Commission Agent role.');
        return;
      }
      selectedDpId = effectiveUsrDispatchPointId;
      selectedDpName = dispatchPoints.find((dp) => dp.id === effectiveUsrDispatchPointId)?.name;
    } else if (usrRole === 'DISPATCHER') {
      selectedDpId = 'dp_central';
      selectedDpName = dispatchPoints.find((dp) => dp.id === 'dp_central')?.name || 'Central Depot';
    }

    // 5. Auto-generate secure password as per current security standards
    const autoGeneratedPassword = generateSecurePassword(14);

    const newUser: User = {
      id: `usr_${Date.now()}`,
      tenant_id: activeTenant.id,
      name: usrName.trim(),
      email: trimmedEmail || '',
      mobile_number: cleanMobile,
      role: usrRole,
      company_scope: [],
      dispatch_point_id: selectedDpId,
      beat_id: selectedBeat ? selectedBeat.id : null,
      beat_name: selectedBeat ? selectedBeat.name : null,
      platform: usrRole === 'DISPATCHER' || usrRole === 'AGENT' ? 'MOBILE' : 'WEB',
      is_active: true,
    };

    // Save in store & sync to backend database
    addUser(newUser, autoGeneratedPassword);

    // If a beat was selected for Commission Agent, assign beat to this new agent
    if (selectedBeat) {
      updateBeat(selectedBeat.id, {
        assigned_agent_id: newUser.id,
        assigned_agent_name: newUser.name,
      });
    }

    // 6. Show the generated password directly to the Admin in the credentials modal
    setCreatedCredentials({
      user: newUser,
      rawPassword: autoGeneratedPassword,
      dispatchPointName: selectedDpName,
      beatName: selectedBeat ? `${selectedBeat.name} (${selectedBeat.code})` : undefined,
    });

    // Reset form fields
    setUsrName('');
    setUsrEmail('');
    setUsrMobile('');
    setUsrRole('AGENT');
    setUsrDispatchPointId(dispatchPoints.length > 0 ? dispatchPoints[0].id : '');
    setUsrBeatId('');
    fetchDbStats();
  };

  const handleCopyPassword = () => {
    if (!createdCredentials) return;
    navigator.clipboard.writeText(createdCredentials.rawPassword);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const handleCopyAllCredentials = () => {
    if (!createdCredentials) return;
    const credsText = `Decode FMCG User Credentials\n------------------------\nName: ${createdCredentials.user.name}\nRole: ${createdCredentials.user.role}\nMobile (Login): +91 ${createdCredentials.user.mobile_number}\nPassword: ${createdCredentials.rawPassword}${createdCredentials.user.email ? `\nEmail: ${createdCredentials.user.email}` : ''}${createdCredentials.dispatchPointName ? `\nDispatch Point: ${createdCredentials.dispatchPointName}` : ''}${createdCredentials.beatName ? `\nAssigned Beat: ${createdCredentials.beatName}` : ''}\nLogin at: ${window.location.origin}`;
    navigator.clipboard.writeText(credsText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleOpenResetModal = (user: User) => {
    if (user.role === 'ADMIN') {
      alert('Security Policy: Admin account passwords cannot be reset from the web console. They can only be reset by the Dev Team via backend CLI script.');
      return;
    }
    setResetTargetUser(user);
    setResetMode('AUTO');
    setCustomResetPassword('');
    setShowCustomPassword(false);
    setResetError(null);
  };

  const handlePerformReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setResetError(null);

    let passwordToSend: string | undefined = undefined;
    if (resetMode === 'CUSTOM') {
      if (!customResetPassword) {
        setResetError('Please enter a new password.');
        return;
      }
      if (customResetPassword.length < 8) {
        setResetError('Password must be at least 8 characters long.');
        return;
      }
      if (!/[a-zA-Z]/.test(customResetPassword) || !/[0-9]/.test(customResetPassword)) {
        setResetError('Password must contain both letters and numbers.');
        return;
      }
      passwordToSend = customResetPassword;
    }

    setIsResetting(true);
    try {
      const res = await adminResetUserPassword(resetTargetUser.id, passwordToSend);
      if (res.success && res.new_password) {
        const target = resetTargetUser;
        setResetTargetUser(null);
        setResetSuccessData({
          user: target,
          newPassword: res.new_password,
          message: res.message || `Password for ${target.name} has been reset.`
        });
      } else {
        setResetError(res.error || 'Failed to reset user password.');
      }
    } catch (err: any) {
      setResetError(err.message || 'An unexpected error occurred while resetting password.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleCopyResetPassword = () => {
    if (!resetSuccessData) return;
    navigator.clipboard.writeText(resetSuccessData.newPassword);
    setCopiedResetPassword(true);
    setTimeout(() => setCopiedResetPassword(false), 2000);
  };

  const handleCopyResetHandover = () => {
    if (!resetSuccessData) return;
    const handoverText = `Hello ${resetSuccessData.user.name},\nYour Decode FMCG login password has been reset by the Administrator.\n\nLogin Mobile: +91 ${resetSuccessData.user.mobile_number}\nTemporary Password: ${resetSuccessData.newPassword}\nPortal Link: ${window.location.origin}\n\nPlease keep your credentials secure.`;
    navigator.clipboard.writeText(handoverText);
    setCopiedResetHandover(true);
    setTimeout(() => setCopiedResetHandover(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Companies Management */}
      {type === 'COMPANIES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Building size={16} className="text-blue-400" />
                Principal Companies ({companies.length} Configured)
              </h2>
              <p className="text-xs text-slate-400">
                Principal companies associated with tenant "{activeTenant.name}".
              </p>
            </div>
          </div>

          {/* Feedback & Error Alerts */}
          {compError && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/40 text-rose-300 rounded-xl text-xs flex items-center justify-between shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-rose-400 shrink-0" />
                <span>{compError}</span>
              </div>
              <button
                type="button"
                onClick={() => setCompError(null)}
                className="text-rose-400 hover:text-white p-1 rounded"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {compSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 rounded-xl text-xs flex items-center justify-between shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span className="font-semibold">{compSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setCompSuccess(null)}
                className="text-emerald-400 hover:text-white p-1 rounded"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Add Company Form with Mandatory GST Field */}
          <form onSubmit={handleAddCompany} className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
            <input
              type="text"
              placeholder="Company Name *"
              value={compName}
              onChange={(e) => setCompName(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white focus:outline-hidden focus:border-blue-500"
              required
            />
            <input
              type="text"
              placeholder="Code (e.g. BRIT)"
              value={compCode}
              onChange={(e) => setCompCode(e.target.value.toUpperCase())}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white uppercase font-mono focus:outline-hidden focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Mandatory GSTIN * (15 chars)"
              value={compGstin}
              onChange={(e) => setCompGstin(e.target.value.toUpperCase().replace(/[\s-]/g, ''))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono uppercase font-semibold text-emerald-400 focus:outline-hidden focus:border-emerald-500"
              maxLength={15}
              required
            />
            <select
              value={compRel}
              onChange={(e) => setCompRel(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white focus:outline-hidden focus:border-blue-500"
            >
              <option value="CF">C&F Relationship</option>
              <option value="SS">Super Stockist</option>
              <option value="TCD">Transporter-Distributor</option>
            </select>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer"
            >
              <Plus size={14} /> Add Company
            </button>
          </form>

          {/* Principal Companies Table with Edit Action Icon in Front */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="p-3 text-center w-20">Edit</th>
                    <th className="p-3">Company Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">GSTIN (Mandatory)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {companies.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Edit action icon in front of each specific company */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleStartEditCompany(c)}
                          className="p-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 transition-all inline-flex items-center gap-1 shadow-xs cursor-pointer"
                          title={`Edit Principal Company ${c.name}`}
                        >
                          <Edit2 size={13} />
                          <span className="text-[11px] font-bold">Edit</span>
                        </button>
                      </td>
                      <td className="p-3 font-mono font-bold text-white">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-400 border border-slate-700 font-mono text-[10px]">
                          {c.code}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-white">{c.name}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                          {c.relationship_type === 'CF' ? 'C&F' : c.relationship_type === 'SS' ? 'Super Stockist' : 'Transporter-Distributor'}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold">
                        {c.gstin ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-xs">
                            {c.gstin}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 text-[10px]">
                            Missing GSTIN
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PRINCIPAL COMPANY MODAL */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Edit2 size={16} className="text-blue-400" /> Edit Principal Company: {editingCompany.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCompany(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEditCompany} className="space-y-4 text-xs">
              {editCompError && (
                <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{editCompError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Company Name *</label>
                  <input
                    type="text"
                    value={editCompName}
                    onChange={(e) => setEditCompName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-blue-500"
                    placeholder="e.g. Britannia Industries"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Company Code *</label>
                  <input
                    type="text"
                    value={editCompCode}
                    onChange={(e) => setEditCompCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase focus:outline-hidden focus:border-blue-500"
                    placeholder="e.g. BRIT"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Relationship Type *</label>
                  <select
                    value={editCompRel}
                    onChange={(e) => setEditCompRel(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="CF">C&F Relationship</option>
                    <option value="SS">Super Stockist</option>
                    <option value="TCD">Transporter-Distributor</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold flex items-center gap-1">
                    <span>Mandatory GSTIN *</span>
                    <span className="text-[10px] text-amber-400 font-normal">(15 digits)</span>
                  </label>
                  <input
                    type="text"
                    value={editCompGstin}
                    onChange={(e) => setEditCompGstin(e.target.value.toUpperCase().replace(/[\s-]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase font-bold text-emerald-400 focus:outline-hidden focus:border-emerald-500"
                    placeholder="07AAAAA0000A1Z5"
                    maxLength={15}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Contact Person</label>
                  <input
                    type="text"
                    value={editCompContact}
                    onChange={(e) => setEditCompContact(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-blue-500"
                    placeholder="Key Account Mgr"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Phone Number</label>
                  <input
                    type="text"
                    value={editCompPhone}
                    onChange={(e) => setEditCompPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-blue-500"
                    placeholder="+91 98000 00000"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Email Address</label>
                  <input
                    type="email"
                    value={editCompEmail}
                    onChange={(e) => setEditCompEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-blue-500"
                    placeholder="sales@company.com"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow cursor-pointer transition-all"
                >
                  <CheckCircle2 size={14} /> Save Company Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispatch Points Management */}
      {type === 'DISPATCH' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Warehouse size={16} className="text-emerald-400" />
                Dispatch Points ({dispatchPoints.length} Configured)
              </h2>
              <p className="text-xs text-slate-400">
                Warehouses & depots linked to tenant "{activeTenant.name}".
              </p>
            </div>
          </div>

          <form onSubmit={handleAddDispatch} className="p-3 bg-slate-900 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <input
              type="text"
              placeholder="Warehouse / Depot Name"
              value={dpName}
              onChange={(e) => setDpName(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              required
            />
            <input
              type="text"
              placeholder="Code (e.g. WH-01)"
              value={dpCode}
              onChange={(e) => setDpCode(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono uppercase"
            />
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg px-3 py-1.5">
              + Add Dispatch Point
            </button>
          </form>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="p-3">Hub Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Supervisor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {dispatchPoints.map((dp) => (
                  <tr key={dp.id}>
                    <td className="p-3 font-mono font-bold text-white">{dp.code}</td>
                    <td className="p-3 font-semibold">{dp.name}</td>
                    <td className="p-3 text-slate-300">{dp.supervisor_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users Management */}
      {type === 'USERS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users size={16} className="text-purple-400" />
                Tenant Users, Mappings & Role Provisioning ({users.length} Users)
              </h2>
              <p className="text-xs text-slate-400">
                Manage accounts, many-to-one CA-to-BE routing, and absence failover within tenant "{activeTenant.name}".
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSeedDatabase}
                disabled={isSeedingDb}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Database size={13} className={isSeedingDb ? 'animate-spin' : ''} />
                {isSeedingDb ? 'Seeding Database...' : 'Seed Master Data in DB'}
              </button>
            </div>
          </div>

          {seedSuccessMsg && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              <span>{seedSuccessMsg}</span>
            </div>
          )}

          {dbStats && (
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-slate-300">
                  <Database size={12} className="text-blue-400" />
                  DB Records: <strong className="text-white font-mono">{dbStats.total_records || users.length}</strong>
                </span>
                <span className="text-slate-500">•</span>
                <span>
                  DB Users: <strong className="text-purple-300 font-mono">{dbStats.users || users.length}</strong>
                </span>
              </div>
              {dbStats.last_seeded_at && (
                <span className="text-slate-500">
                  Last Seeded: {new Date(dbStats.last_seeded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}

          {/* Horizontally Aligned Navigation Sub-Tabs beside "Create New User / User Accounts" */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-inner">
            <button
              type="button"
              onClick={() => setUserSubTab('USERS_ROSTER')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                userSubTab === 'USERS_ROSTER'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <UserPlus size={15} />
              <span>Create New User & User Accounts</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                  userSubTab === 'USERS_ROSTER'
                    ? 'bg-purple-800 text-purple-100'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {users.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setUserSubTab('CA_MATRIX')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                userSubTab === 'CA_MATRIX'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Layers size={15} />
              <span>CA BE & DP Mapping Matrix</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                  userSubTab === 'CA_MATRIX'
                    ? 'bg-blue-800 text-blue-100'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {users.filter((u) => u.role === 'AGENT').length} CAs
              </span>
            </button>

            <button
              type="button"
              onClick={() => setUserSubTab('BE_ABSENCE')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                userSubTab === 'BE_ABSENCE'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Zap size={15} />
              <span>BE Absence Quick Re-mapping Tool</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                  userSubTab === 'BE_ABSENCE'
                    ? 'bg-amber-800 text-amber-100'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                Failover
              </span>
            </button>
          </div>

          {/* SUB-VIEW 1: CREATE NEW USER & ROSTER */}
          {userSubTab === 'USERS_ROSTER' && (
            <div className="space-y-4 animate-fadeIn">
              {/* User Creation Section - ONLY ACCESSIBLE TO ADMIN / SUB-ADMIN */}
              {isAdmin ? (
                <div className="bg-slate-900/90 border border-purple-900/50 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30">
                        <UserPlus size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <span>Create New User</span>
                          <span className="px-2 py-0.5 rounded-full bg-purple-950 border border-purple-700/60 text-purple-300 text-[10px] normal-case font-medium">
                            Admin / Sub-Admin Only
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Auto-generates a secure password as per security standards and displays credentials upon creation.
                        </p>
                      </div>
                    </div>
                  </div>

                  {formError && (
                    <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0 text-rose-400" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <form onSubmit={handleAddUser} className="space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Name (Mandatory) */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Full Name <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Ramesh Patil"
                          value={usrName}
                          onChange={(e) => setUsrName(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg px-2.5 py-2 text-white placeholder-slate-500 outline-none"
                          required
                        />
                      </div>

                      {/* Role (Mandatory) */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Role <span className="text-rose-400">*</span>
                        </label>
                        <select
                          value={usrRole}
                          onChange={(e) => setUsrRole(e.target.value as UserRole)}
                          className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg px-2.5 py-2 text-white outline-none"
                          required
                        >
                          <option value="AGENT">Commission Agent (Mobile Field App)</option>
                          <option value="ADMIN">Admin / Sub-Admin (Web Console)</option>
                          <option value="BILLING">Billing Executive (Web Console)</option>
                          <option value="ORDER_PUNCHER">Order Puncher (Web Console)</option>
                          <option value="DISPATCHER">Dispatcher (Mobile Dock)</option>
                          <option value="ACCOUNTANT">Accountant (Web Console)</option>
                        </select>
                      </div>

                      {/* Mobile Number (Mandatory) */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Mobile Number <span className="text-rose-400">*</span> <span className="text-slate-400 text-[10px] font-normal">(Login ID)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">+91</span>
                          <input
                            type="tel"
                            placeholder="9810012345"
                            value={usrMobile}
                            onChange={(e) => setUsrMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg pl-10 pr-2.5 py-2 text-white font-mono placeholder-slate-500 outline-none"
                            maxLength={10}
                            required
                          />
                        </div>
                      </div>

                      {/* Email (Optional) */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Email Address <span className="text-slate-400 text-[10px] font-normal">(Optional)</span>
                        </label>
                        <input
                          type="email"
                          placeholder="user@example.com (optional)"
                          value={usrEmail}
                          onChange={(e) => setUsrEmail(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg px-2.5 py-2 text-white placeholder-slate-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* Dispatch Point Field - ONLY VISIBLE AND MANDATORY IF ROLE IS COMMISSION AGENT */}
                    {usrRole === 'AGENT' && (
                      <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center animate-fadeIn">
                        <div>
                          <label className="block text-xs font-semibold text-purple-200 mb-1 flex items-center gap-1.5">
                            <Warehouse size={13} className="text-purple-400" />
                            <span>Assigned Dispatch Point / Warehouse</span>
                            <span className="text-rose-400">*</span>
                          </label>
                          <p className="text-[10px] text-purple-300/80">
                            Commission Agents require an assigned dispatch point for allocating and inwarding outward stock.
                          </p>
                        </div>

                        <div>
                          <select
                            value={effectiveUsrDispatchPointId}
                            onChange={(e) => setUsrDispatchPointId(e.target.value)}
                            className="w-full bg-slate-950 border border-purple-700 focus:border-purple-400 rounded-lg px-3 py-2 text-white outline-none font-medium"
                            required
                          >
                            {dispatchPoints.length === 0 ? (
                              <option value="">No dispatch points configured</option>
                            ) : (
                              dispatchPoints.map((dp) => (
                                <option key={dp.id} value={dp.id}>
                                  {dp.name} ({dp.code})
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Beat Selection & Assignment Field - ONLY VISIBLE IF ROLE IS COMMISSION AGENT */}
                    {usrRole === 'AGENT' && (
                      <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center animate-fadeIn">
                        <div>
                          <label className="block text-xs font-semibold text-amber-200 mb-1 flex items-center gap-1.5">
                            <MapPin size={13} className="text-amber-400" />
                            <span>Beat Selection & Territory Assignment</span>
                            <span className="text-amber-400 font-normal text-[10px]">(Primary Beat)</span>
                          </label>
                          <p className="text-[10px] text-amber-300/80">
                            Assign an FMCG sales beat territory to this Commission Agent for daily retailer visits and field order booking.
                          </p>
                        </div>

                        <div>
                          <select
                            value={usrBeatId}
                            onChange={(e) => setUsrBeatId(e.target.value)}
                            className="w-full bg-slate-950 border border-amber-700 focus:border-amber-400 rounded-lg px-3 py-2 text-white outline-none font-medium"
                          >
                            <option value="">-- Select Beat Route (Optional / Assign Later) --</option>
                            {beats.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.code}) {b.assigned_agent_name ? `• Current: ${b.assigned_agent_name}` : '• [Available]'}
                              </option>
                            ))}
                          </select>
                          {usrBeatId && (
                            (() => {
                              const b = beats.find((item) => item.id === usrBeatId);
                              if (!b) return null;
                              return (
                                <div className="mt-1.5 flex items-center justify-between text-[10px] text-amber-300/90 bg-amber-950/50 px-2.5 py-1 rounded-md border border-amber-800/60">
                                  <span>{b.retailer_ids?.length || 0} Outlets Mapped</span>
                                  {b.assigned_agent_name ? (
                                    <span className="text-amber-200 font-semibold">
                                      Reassigns from: {b.assigned_agent_name}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 font-semibold">
                                      Currently Unassigned
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    )}

                    {/* Security & Password Notice */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 px-3 py-2 rounded-lg">
                        <Lock size={13} className="text-amber-400 shrink-0" />
                        <span>
                          <strong>Auto-Generated Password:</strong> 14-char secure random password with upper, lower, numbers & symbols will be generated and shown upon creation.
                        </span>
                      </div>

                      <button
                        type="submit"
                        className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl px-5 py-2.5 shadow-md shadow-purple-950/50 transition-all cursor-pointer shrink-0"
                      >
                        <UserPlus size={14} />
                        <span>Create User & Generate Credentials</span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center gap-3 text-slate-400 text-xs">
                  <Shield size={18} className="text-blue-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-200">User Provisioning Restricted:</span> User creation and credential issuance is exclusive to Admin / Sub-Admin roles. You are viewing the tenant user roster in read-only mode.
                  </div>
                </div>
              )}

              {/* Filter & Search Bar for User Roster */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                  <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search user name, mobile, email..."
                      value={userRosterSearch}
                      onChange={(e) => setUserRosterSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-white placeholder-slate-500 outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px] font-semibold">Filter Role:</span>
                    <select
                      value={userRosterRoleFilter}
                      onChange={(e) => setUserRosterRoleFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-purple-500"
                    >
                      <option value="ALL">All Roles ({users.length})</option>
                      <option value="AGENT">Commission Agents ({users.filter((u) => u.role === 'AGENT').length})</option>
                      <option value="BILLING">Billing Executives ({users.filter((u) => u.role === 'BILLING').length})</option>
                      <option value="ADMIN">Administrators ({users.filter((u) => u.role === 'ADMIN').length})</option>
                      <option value="DISPATCHER">Dispatchers ({users.filter((u) => u.role === 'DISPATCHER').length})</option>
                      <option value="ORDER_PUNCHER">Order Punchers ({users.filter((u) => u.role === 'ORDER_PUNCHER').length})</option>
                      <option value="ACCOUNTANT">Accountants ({users.filter((u) => u.role === 'ACCOUNTANT').length})</option>
                    </select>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 font-medium">
                  {users.length} Active Accounts Configured
                </div>
              </div>

              {/* User List Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs shadow-md">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="p-3">User Name</th>
                      <th className="p-3">Mobile (Login)</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Dispatch Point</th>
                      <th className="p-3">Assigned Beat</th>
                      <th className="p-3 text-right">Password & Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {users
                      .filter((u) => {
                        const matchesSearch =
                          u.name.toLowerCase().includes(userRosterSearch.toLowerCase()) ||
                          (u.mobile_number && u.mobile_number.includes(userRosterSearch)) ||
                          (u.email && u.email.toLowerCase().includes(userRosterSearch.toLowerCase()));
                        const matchesRole =
                          userRosterRoleFilter === 'ALL' || u.role === userRosterRoleFilter;
                        return matchesSearch && matchesRole;
                      })
                      .map((u) => {
                        const linkedDp = dispatchPoints.find((dp) => dp.id === u.dispatch_point_id);
                        const agentAssignedBeats = beats.filter(
                          (b) =>
                            b.assigned_agent_id === u.id ||
                            (u.assigned_beat_ids && u.assigned_beat_ids.includes(b.id)) ||
                            (u.beat_id && b.id === u.beat_id && (!b.assigned_agent_id || b.assigned_agent_id === u.id))
                        );
                        const isUserAdmin = u.role === 'ADMIN';

                        return (
                          <tr key={u.id} className="hover:bg-slate-850/50 transition-colors">
                            <td className="p-3 font-semibold text-white">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-800 text-purple-300 flex items-center justify-center font-bold text-[10px]">
                                  {u.name.charAt(0)}
                                </div>
                                <span>{u.name}</span>
                              </div>
                            </td>
                            <td className="p-3 text-emerald-400 font-mono font-medium">
                              +91 {u.mobile_number || '9810012345'}
                            </td>
                            <td className="p-3 text-slate-300 font-mono">
                              {u.email || <span className="text-slate-500 italic">None</span>}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                                  u.role === 'ADMIN'
                                    ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                                    : u.role === 'AGENT'
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                    : u.role === 'DISPATCHER'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                    : 'bg-slate-800 text-blue-300'
                                }`}
                              >
                                {u.role === 'AGENT' ? 'COMMISSION AGENT' : u.role}
                              </span>
                            </td>
                            <td className="p-3">
                              {linkedDp ? (
                                <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1">
                                  <Warehouse size={12} className="text-emerald-400" />
                                  {linkedDp.name}
                                </span>
                              ) : (
                                <span className="text-slate-500 font-mono text-[11px]">All Hubs / N/A</span>
                              )}
                            </td>
                            <td className="p-3">
                              {u.role === 'AGENT' ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {agentAssignedBeats.length === 0 ? (
                                    <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
                                      <MapPin size={12} className="text-slate-600" />
                                      <span>Unassigned</span>
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1 flex-wrap max-w-[280px]">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 text-[10px] font-semibold shrink-0">
                                        <MapPin size={10} className="text-amber-400" />
                                        {agentAssignedBeats.length} {agentAssignedBeats.length === 1 ? 'Beat' : 'Beats'}
                                      </span>
                                      {agentAssignedBeats.map((b) => (
                                        <span
                                          key={b.id}
                                          className="text-[10px] text-slate-200 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 font-medium"
                                          title={`${b.name} (${b.code})`}
                                        >
                                          {b.name} <span className="text-slate-500 font-mono text-[9px]">({b.code})</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAgentBeatsModal(u)}
                                      className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-amber-950/50 rounded-md border border-slate-800 hover:border-amber-700/60 transition-all cursor-pointer shadow-xs"
                                      title={`Assign or edit beats for ${u.name}`}
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono text-[11px]">N/A</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isUserAdmin ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 text-slate-400 border border-slate-800 text-[11px] font-mono select-none"
                                    title="Admin passwords can only be reset by the Dev Team via backend CLI script"
                                  >
                                    <Shield size={12} className="text-purple-400" />
                                    <span>Backend Dev Only</span>
                                  </span>
                                ) : isAdmin ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenResetModal(u)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900/90 text-amber-300 hover:text-amber-200 border border-amber-700/60 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                                      title={`Reset password for ${u.name}`}
                                    >
                                      <Key size={12} className="text-amber-400" />
                                      <span>Reset Password</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm(`Are you sure you want to remove user "${u.name}" from the database?`)) {
                                          deleteUser(u.id);
                                        }
                                      }}
                                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                                      title={`Delete user ${u.name}`}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-slate-500 font-mono text-[11px]">Admin Only</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: CA BE & DP MAPPING MATRIX */}
          {userSubTab === 'CA_MATRIX' && (
            <div className="animate-fadeIn">
              <CAMappingMatrix />
            </div>
          )}

          {/* SUB-VIEW 3: BE ABSENCE QUICK RE-MAPPING TOOL */}
          {userSubTab === 'BE_ABSENCE' && (
            <div className="animate-fadeIn">
              <BEAbsenceRemappingTool />
            </div>
          )}
        </div>
      )}

      {/* ADMIN-DRIVEN PASSWORD RESET MODAL */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-slate-200">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Key size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Reset Staff Password
                  </h3>
                  <p className="text-xs text-slate-400">
                    Administrator Credential Override
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setResetTargetUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Target Account Info */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Target Staff:</span>
                <span className="font-bold text-white">{resetTargetUser.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="px-2 py-0.5 rounded font-semibold bg-purple-950 text-purple-300 border border-purple-800/60 text-[10px]">
                  {resetTargetUser.role === 'AGENT' ? 'COMMISSION AGENT' : resetTargetUser.role}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Registered Mobile:</span>
                <span className="font-mono text-emerald-400 font-bold">+91 {resetTargetUser.mobile_number}</span>
              </div>
            </div>

            {/* Error message */}
            {resetError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-start gap-2 animate-fadeIn">
                <AlertCircle size={15} className="shrink-0 text-rose-400 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handlePerformReset} className="space-y-4">
              {/* Generation Mode Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Password Generation Method:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResetMode('AUTO')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      resetMode === 'AUTO'
                        ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles size={13} className={resetMode === 'AUTO' ? 'text-amber-400' : ''} />
                    <span>Auto-Generate (Strong)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResetMode('CUSTOM')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      resetMode === 'CUSTOM'
                        ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Lock size={13} className={resetMode === 'CUSTOM' ? 'text-amber-400' : ''} />
                    <span>Custom Password</span>
                  </button>
                </div>
              </div>

              {resetMode === 'AUTO' ? (
                <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-xl text-xs text-amber-300/90 leading-relaxed flex items-start gap-2">
                  <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    A cryptographically strong 14-character password will be generated and displayed to you immediately upon confirmation.
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    New Custom Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 text-slate-400 pointer-events-none">
                      <Lock size={15} />
                    </div>
                    <input
                      type={showCustomPassword ? 'text' : 'password'}
                      value={customResetPassword}
                      onChange={(e) => setCustomResetPassword(e.target.value)}
                      placeholder="Min 8 chars (letters & numbers)"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl text-xs text-white placeholder-slate-500 outline-none font-mono"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomPassword(!showCustomPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-200"
                    >
                      {showCustomPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Must contain minimum 8 characters with letters and numbers.
                  </p>
                </div>
              )}

              {/* Security Warning */}
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
                <Shield size={13} className="text-purple-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Session Revocation:</strong> Resetting this password will immediately terminate all active sessions for this user on all devices.
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isResetting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-950/40 cursor-pointer"
                >
                  {isResetting ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Updating Database...</span>
                    </>
                  ) : (
                    <>
                      <Check size={13} />
                      <span>Confirm & Reset Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET SUCCESS & CREDENTIALS HANDOVER MODAL */}
      {resetSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-200">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Password Reset Successfully!
                  </h3>
                  <p className="text-xs text-slate-400">
                    Handover credentials for {resetSuccessData.user.name}
                  </p>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Staff Name:</span>
                <span className="font-bold text-white text-sm">{resetSuccessData.user.name}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="px-2 py-0.5 rounded font-semibold bg-purple-950 text-purple-300 border border-purple-800/60 text-[10px]">
                  {resetSuccessData.user.role === 'AGENT' ? 'COMMISSION AGENT' : resetSuccessData.user.role}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Login Mobile:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  +91 {resetSuccessData.user.mobile_number}
                </span>
              </div>
            </div>

            {/* Generated Password Box */}
            <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                  <Lock size={14} className="text-emerald-400" />
                  <span>New Password (Active in DB):</span>
                </div>
                <span className="text-[10px] text-emerald-300 font-mono bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/50">
                  PBKDF2 SHA-512 Hashed
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-950 border border-emerald-900/60 rounded-lg p-3">
                <span className="font-mono font-bold text-amber-300 text-sm tracking-wider select-all">
                  {resetSuccessData.newPassword}
                </span>
                <button
                  type="button"
                  onClick={handleCopyResetPassword}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copiedResetPassword ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                  <span>{copiedResetPassword ? 'Copied!' : 'Copy Password'}</span>
                </button>
              </div>
            </div>

            {/* Guidance */}
            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-300/90 text-xs flex items-start gap-2">
              <Info size={15} className="shrink-0 text-amber-400 mt-0.5" />
              <span>
                <strong>Handover Notice:</strong> Please share this password with {resetSuccessData.user.name}. All existing user sessions have been terminated.
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyResetHandover}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                {copiedResetHandover ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedResetHandover ? 'Handover Message Copied!' : 'Copy Handover Message (WhatsApp / SMS)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setResetSuccessData(null)}
                className="w-full sm:w-auto px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Done & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREDENTIALS SUCCESS MODAL SHOWN JUST AFTER USER CREATION (TO ADMIN) */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-purple-500/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    User Created Successfully!
                  </h3>
                  <p className="text-xs text-slate-400">
                    Auto-generated security credentials for the new account
                  </p>
                </div>
              </div>
            </div>

            {/* User Details Summary */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">User Name:</span>
                <span className="font-bold text-white text-sm">{createdCredentials.user.name}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="px-2 py-0.5 rounded font-semibold bg-purple-950 text-purple-300 border border-purple-800/60">
                  {createdCredentials.user.role === 'AGENT' ? 'Commission Agent' : createdCredentials.user.role}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-slate-400">Mobile Number (Login ID):</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  +91 {createdCredentials.user.mobile_number}
                </span>
              </div>
              {createdCredentials.user.email ? (
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Email Address:</span>
                  <span className="font-mono text-slate-300">{createdCredentials.user.email}</span>
                </div>
              ) : null}
              {createdCredentials.dispatchPointName ? (
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Dispatch Point:</span>
                  <span className="font-semibold text-white flex items-center gap-1">
                    <Warehouse size={13} className="text-emerald-400" />
                    {createdCredentials.dispatchPointName}
                  </span>
                </div>
              ) : null}
              {createdCredentials.beatName ? (
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Assigned Beat:</span>
                  <span className="font-semibold text-amber-300 flex items-center gap-1">
                    <MapPin size={13} className="text-amber-400" />
                    {createdCredentials.beatName}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Generated Password Box */}
            <div className="bg-purple-950/40 border border-purple-500/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-200">
                  <Lock size={14} className="text-purple-400" />
                  <span>Auto-Generated Password:</span>
                </div>
                <span className="text-[10px] text-purple-300 font-mono bg-purple-900/60 px-2 py-0.5 rounded border border-purple-700/50">
                  Current Security Standard (14-char)
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-950 border border-purple-900/60 rounded-lg p-3">
                <span className="font-mono font-bold text-amber-300 text-sm tracking-wider select-all">
                  {createdCredentials.rawPassword}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copiedPassword ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
                  <span>{copiedPassword ? 'Copied!' : 'Copy Password'}</span>
                </button>
              </div>
            </div>

            {/* Security Guidance */}
            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-amber-300/90 text-xs flex items-start gap-2">
              <Info size={15} className="shrink-0 text-amber-400 mt-0.5" />
              <span>
                <strong>Admin Security Notice:</strong> Please share this auto-generated password with the user now. For strict security reasons, this plain-text password is only shown once and cannot be retrieved again after closing.
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyAllCredentials}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                {copiedAll ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedAll ? 'Full Credentials Copied!' : 'Copy Full Details (SMS / WhatsApp)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="w-full sm:w-auto px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Done & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commission Agent Beat Assignment Modal (1 Agent -> Many Beats) */}
      {editingAgentBeatsUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-700/60 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-fadeIn my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-800/80 text-amber-400 flex items-center justify-center shrink-0">
                  <MapPin size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base">
                      Assign & Manage Beats
                    </h3>
                    <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-amber-950 text-amber-300 border border-amber-800/60">
                      1 Agent : Multi-Beat Coverage
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Commission Agent: <strong className="text-white">{editingAgentBeatsUser.name}</strong> • +91 {editingAgentBeatsUser.mobile_number}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingAgentBeatsUser(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Explanatory banner on Multi-Beat & Absence Handling */}
            <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-200/90 flex items-start gap-2.5">
              <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">
                  Multiple Beat Assignment & Absence Coverage:
                </p>
                <p className="text-amber-200/80 text-[11px] leading-relaxed">
                  Admins can assign multiple beats to one commission agent as per business operational needs (such as covering for an absent agent or expanding route territory). Select beats to assign or deselect to remove.
                </p>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search beat name or code..."
                  value={beatSearchQuery}
                  onChange={(e) => setBeatSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setBeatTabFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    beatTabFilter === 'ALL'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  All ({beats.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBeatTabFilter('ASSIGNED')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    beatTabFilter === 'ASSIGNED'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Selected ({selectedBeatIdsForAgent.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBeatTabFilter('UNASSIGNED')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    beatTabFilter === 'UNASSIGNED'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Unassigned ({beats.filter((b) => !b.assigned_agent_id).length})
                </button>
              </div>
            </div>

            {/* Beat List with Checkboxes */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/50">
              {beats
                .filter((beat) => {
                  const matchesSearch =
                    beat.name.toLowerCase().includes(beatSearchQuery.toLowerCase()) ||
                    beat.code.toLowerCase().includes(beatSearchQuery.toLowerCase());
                  if (!matchesSearch) return false;

                  if (beatTabFilter === 'ASSIGNED') {
                    return selectedBeatIdsForAgent.includes(beat.id);
                  }
                  if (beatTabFilter === 'UNASSIGNED') {
                    return !beat.assigned_agent_id;
                  }
                  return true;
                })
                .map((beat) => {
                  const isChecked = selectedBeatIdsForAgent.includes(beat.id);
                  const isAssignedToOther =
                    beat.assigned_agent_id &&
                    beat.assigned_agent_id !== editingAgentBeatsUser.id;
                  const otherAgent = isAssignedToOther
                    ? users.find((u) => u.id === beat.assigned_agent_id)
                    : null;

                  return (
                    <div
                      key={beat.id}
                      onClick={() => handleToggleBeatForAgent(beat.id)}
                      className={`pt-2 p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isChecked
                          ? 'bg-amber-950/40 border-amber-600/70 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 ${
                            isChecked
                              ? 'bg-amber-500 text-slate-950'
                              : 'border border-slate-700 bg-slate-900'
                          }`}
                        >
                          {isChecked && <Check size={14} className="stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold text-xs truncate ${
                                isChecked ? 'text-amber-200' : 'text-slate-200'
                              }`}
                            >
                              {beat.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                              {beat.code}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span>{beat.retailer_ids?.length || 0} Outlets Mapped</span>
                            {beat.description && <span>• {beat.description}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {isChecked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-800/80">
                            <CheckCircle2 size={10} className="text-amber-400" />
                            Assigned to this Agent
                          </span>
                        ) : isAssignedToOther ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/60">
                            Currently: {beat.assigned_agent_name || otherAgent?.name || 'Other Agent'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                            Available (Unassigned)
                          </span>
                        )}
                        {isAssignedToOther && isChecked && (
                          <span className="text-[9px] text-amber-400 font-medium">
                            Will reassign coverage to this Agent
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Success Feedback Notification */}
            {beatSaveSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                <span>{beatSaveSuccess}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                Selected: <strong className="text-amber-300 font-semibold">{selectedBeatIdsForAgent.length} Beats</strong> for {editingAgentBeatsUser.name}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setEditingAgentBeatsUser(null)}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAgentBeats}
                  className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check size={14} className="stroke-[3]" />
                  <span>Save Beat Assignments</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
