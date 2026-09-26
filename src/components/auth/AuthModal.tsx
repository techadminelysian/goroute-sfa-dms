import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import {
  Shield,
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Building2,
  RefreshCw,
  Info,
  Languages
} from 'lucide-react';
import { isValidMobileNumber, sanitizeMobileNumber } from '../../utils/authClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isForcedAuth?: boolean; // When true, modal cannot be dismissed without logging in
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  isForcedAuth = false
}) => {
  const {
    activeTenant,
    currentUser,
    login,
    language,
    setLanguage
  } = useAppStore();

  const isWebUser = Boolean(currentUser && currentUser.role !== 'AGENT' && currentUser.role !== 'DISPATCHER');

  // Form States
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Status & Feedback States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);

  if (!isOpen) return null;

  // Handle Login Submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const sanitized = sanitizeMobileNumber(mobileNumber);
    if (!sanitized) {
      setErrorMessage('Please enter your registered 10-digit mobile number.');
      return;
    }

    if (!isValidMobileNumber(sanitized)) {
      setErrorMessage('Please enter a valid 10-digit mobile number (e.g. 9810012345).');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(sanitized, password, rememberMe);
      if (res.success && res.user) {
        setSuccessMessage(`Welcome back, ${res.user.name} (${res.user.role})!`);
        if (onClose) {
          onClose();
        }
      } else {
        setErrorMessage(res.error || 'Invalid mobile number or password.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected authentication error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md"
              style={{ backgroundColor: activeTenant?.accent_color || '#2563eb' }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Enterprise Login Gate
                <span className="px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 text-[10px] font-semibold border border-blue-700/50">
                  PBKDF2 Secure
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                {activeTenant?.name || 'MS Enterprises'} • Multi-Tenant Access Terminal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selection: Hidden for web view console users */}
            {!isWebUser && (
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs shadow-xs">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                    language === 'en'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Languages size={11} />
                  <span>EN</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('hi')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                    language === 'hi'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>हिंदी</span>
                </button>
              </div>
            )}

            {!isForcedAuth && onClose && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="Close dialog"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Feedback Messages */}
        <div className="px-6 pt-4">
          {errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs rounded-xl flex items-start gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{successMessage}</div>
            </div>
          )}
        </div>

        {/* SECURE LOGIN FORM */}
        <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
          {/* Username / Registered Mobile */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Registered Mobile Number <span className="text-rose-400">*</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center gap-1.5 text-slate-400 pointer-events-none">
                <Smartphone size={16} />
                <span className="text-xs font-semibold text-slate-500 border-r border-slate-700 pr-1.5">+91</span>
              </div>
              <input
                type="tel"
                maxLength={10}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 9810012345"
                className="w-full pl-20 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 font-mono tracking-wide focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                autoFocus
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Enter your 10-digit registered mobile number assigned by Distributor Admin.
            </p>
          </div>

          {/* Secret Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Account Password <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPasswordHelp(!showPasswordHelp)}
                className="text-xs font-medium text-slate-400 hover:text-blue-400 flex items-center gap-1 transition-colors"
                title="Password recovery policy"
              >
                <Info size={13} />
                <span>Forgot password?</span>
              </button>
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-3 text-slate-400 pointer-events-none">
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-slate-400 hover:text-slate-200 focus:outline-none"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password Policy Guidance Notice */}
            {showPasswordHelp && (
              <div className="mt-2 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-400 leading-relaxed animate-in fade-in">
                <p className="font-semibold text-slate-300 mb-0.5">Password Recovery Policy:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                  <li><strong>Staff Members:</strong> Contact your Organization Administrator to reset your password.</li>
                  <li><strong>Administrators:</strong> Admin credentials can only be reset by the Dev Team via backend CLI.</li>
                </ul>
              </div>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Remember session on this device</span>
            </label>
          </div>

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-950/40 cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Verifying Credentials with DB...</span>
              </>
            ) : (
              <>
                <span>Sign In to Terminal</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Modal Footer Security Banner */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Shield size={12} className="text-slate-400" />
            PBKDF2 SHA-512 Encrypted
          </span>
          <span className="text-slate-500">Decode FMCG Security</span>
        </div>
      </div>
    </div>
  );
};
