import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import {
  getFirebaseConfig,
  isFirebaseConfigured,
  saveCustomFirebaseConfig,
  clearCustomFirebaseConfig
} from '../../firebase/config';
import {
  testFirestoreConnection,
  FirestoreConnectionTestResult
} from '../../firebase/firestoreService';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Key,
  Layers,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';

interface FirebaseConfigModalProps {
  onClose: () => void;
}

export const FirebaseConfigModal: React.FC<FirebaseConfigModalProps> = ({ onClose }) => {
  const {
    firebaseStatus,
    isSeeding,
    lastSyncedAt,
    seedFirestore,
    syncFromFirestore
  } = useAppStore();

  const currentConfig = getFirebaseConfig();
  const [apiKey, setApiKey] = useState(currentConfig.apiKey || '');
  const [authDomain, setAuthDomain] = useState(currentConfig.authDomain || '');
  const [projectId, setProjectId] = useState(currentConfig.projectId || '');
  const [databaseId, setDatabaseId] = useState(currentConfig.databaseId || 'goroute-sfa-dms');
  const [storageBucket, setStorageBucket] = useState(currentConfig.storageBucket || '');
  const [messagingSenderId, setMessagingSenderId] = useState(currentConfig.messagingSenderId || '');
  const [appId, setAppId] = useState(currentConfig.appId || '');

  const [pasteJson, setPasteJson] = useState('');
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);

  // Live Connectivity Diagnostics state
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<FirestoreConnectionTestResult | null>(null);
  const [seedStep, setSeedStep] = useState<string>('');
  const [seedProgressPercent, setSeedProgressPercent] = useState<number>(0);
  const [copiedRules, setCopiedRules] = useState(false);

  const runDiagnostics = async () => {
    setIsTestingConn(true);
    try {
      const result = await testFirestoreConnection();
      setTestResult(result);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Connection test failed',
        projectId: projectId || 'unknown',
        databaseId: databaseId || '(default)',
        latencyMs: 0,
        readStatus: 'FAILED',
        writeStatus: 'FAILED',
        tenantsCount: 0,
        collectionsFound: [],
        error: e?.message,
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleManualSeed = async () => {
    setSeedStep('Starting FMCG distribution dataset seed...');
    setSeedProgressPercent(5);
    setSaveMessage(null);

    const res = await seedFirestore(true, (step, current, total) => {
      setSeedStep(step);
      setSeedProgressPercent(Math.round((current / total) * 100));
    });

    setSeedStep('');
    setSeedProgressPercent(0);
    setSaveMessage({
      text: res.message,
      type: res.success ? 'success' : 'error',
    });
    runDiagnostics();
  };

  const copyRulesToClipboard = () => {
    const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;
    navigator.clipboard.writeText(rules);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2500);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId.trim()) {
      setSaveMessage({ text: 'Project ID is required', type: 'error' });
      return;
    }

    const success = saveCustomFirebaseConfig({
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim() || `${projectId.trim()}.firebaseapp.com`,
      projectId: projectId.trim(),
      databaseId: databaseId.trim() || 'goroute-sfa-dms',
      storageBucket: storageBucket.trim() || `${projectId.trim()}.appspot.com`,
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim(),
    });

    if (success) {
      setSaveMessage({ text: `Firebase configuration saved for database "${databaseId.trim() || 'goroute-sfa-dms'}"! Testing connection...`, type: 'success' });
      setTimeout(() => {
        syncFromFirestore();
        runDiagnostics();
      }, 500);
    } else {
      setSaveMessage({ text: 'Failed to save configuration', type: 'error' });
    }
  };

  const handlePasteJson = () => {
    try {
      // Parse JSON or JS object format
      let clean = pasteJson.trim();
      if (clean.startsWith('const firebaseConfig =')) {
        clean = clean.replace('const firebaseConfig =', '').replace(/;$/, '').trim();
      }
      // Replace unquoted keys
      clean = clean.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ');
      const parsed = JSON.parse(clean);

      if (parsed.apiKey) setApiKey(parsed.apiKey);
      if (parsed.authDomain) setAuthDomain(parsed.authDomain);
      if (parsed.projectId) setProjectId(parsed.projectId);
      if (parsed.databaseId) setDatabaseId(parsed.databaseId);
      if (parsed.storageBucket) setStorageBucket(parsed.storageBucket);
      if (parsed.messagingSenderId) setMessagingSenderId(parsed.messagingSenderId);
      if (parsed.appId) setAppId(parsed.appId);

      setSaveMessage({ text: 'Firebase config parsed successfully! Click "Save & Connect".', type: 'success' });
    } catch (e) {
      setSaveMessage({ text: 'Invalid JSON format. Please check your Firebase config snippet.', type: 'error' });
    }
  };

  const handleResetToEnv = () => {
    clearCustomFirebaseConfig();
    const envConf = getFirebaseConfig();
    setApiKey(envConf.apiKey || '');
    setAuthDomain(envConf.authDomain || '');
    setProjectId(envConf.projectId || '');
    setDatabaseId(envConf.databaseId || 'goroute-sfa-dms');
    setStorageBucket(envConf.storageBucket || '');
    setMessagingSenderId(envConf.messagingSenderId || '');
    setAppId(envConf.appId || '');
    setSaveMessage({ text: 'Reset to .env environment variables.', type: 'success' });
    syncFromFirestore();
  };

  const envSnippet = `VITE_FIREBASE_API_KEY="${apiKey || 'your-api-key'}"
VITE_FIREBASE_AUTH_DOMAIN="${authDomain || (projectId ? `${projectId}.firebaseapp.com` : 'your-project.firebaseapp.com')}"
VITE_FIREBASE_PROJECT_ID="${projectId || 'your-project-id'}"
VITE_FIREBASE_DATABASE_ID="${databaseId || 'goroute-sfa-dms'}"
VITE_FIREBASE_STORAGE_BUCKET="${storageBucket || (projectId ? `${projectId}.appspot.com` : 'your-project.appspot.com')}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${messagingSenderId || 'your-sender-id'}"
VITE_FIREBASE_APP_ID="${appId || 'your-app-id'}"`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const configured = isFirebaseConfigured();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl text-slate-100 shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Cloud Firestore Database Setup
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    configured
                      ? firebaseStatus === 'CONNECTED'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {configured ? (firebaseStatus === 'CONNECTED' ? '● Connected' : `● ${firebaseStatus}`) : '○ Standby / Local Mode'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Connect your Firestore database for persistent enterprise multi-tenant distribution data.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Live Connectivity Diagnostic Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={16} className={testResult?.success ? 'text-emerald-400' : 'text-amber-400'} />
                <span className="text-xs font-bold text-white">Live Firestore Connectivity Check</span>
              </div>
              <button
                onClick={runDiagnostics}
                disabled={isTestingConn}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <RefreshCw size={12} className={isTestingConn ? 'animate-spin' : ''} />
                <span>{isTestingConn ? 'Pinging Firestore...' : 'Test Connection'}</span>
              </button>
            </div>

            {testResult && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Status</div>
                  <div className={`text-xs font-bold mt-0.5 flex items-center justify-center gap-1 ${testResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {testResult.success ? <Wifi size={12} /> : <WifiOff size={12} />}
                    {testResult.success ? 'Connected' : 'Failed'}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Latency</div>
                  <div className="text-xs font-bold text-white mt-0.5 font-mono">
                    {testResult.latencyMs > 0 ? `${testResult.latencyMs} ms` : 'N/A'}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Write / Read</div>
                  <div className="text-xs font-bold text-emerald-400 mt-0.5">
                    {testResult.writeStatus === 'SUCCESS' && testResult.readStatus === 'SUCCESS' ? 'Verified OK' : `${testResult.writeStatus}/${testResult.readStatus}`}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Database ID</div>
                  <div className="text-xs font-bold text-amber-300 mt-0.5 truncate font-mono" title={testResult.databaseId}>
                    {testResult.databaseId || 'goroute-sfa-dms'}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg text-center">
                  <div className="text-[10px] text-slate-400 font-medium">Project ID</div>
                  <div className="text-xs font-semibold text-blue-300 mt-0.5 truncate font-mono" title={testResult.projectId}>
                    {testResult.projectId}
                  </div>
                </div>
              </div>
            )}

            {testResult && (
              <div className={`p-2.5 rounded-lg text-xs border ${
                testResult.success 
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}>
                {testResult.message}
              </div>
            )}
          </div>

          {/* Status & Quick Seeding Bar */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <Layers size={14} className="text-blue-400" />
                  Firestore Collections & Seed Status
                </div>
                <p className="text-[11px] text-slate-400">
                  {lastSyncedAt
                    ? `Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}`
                    : 'Seeds 12 enterprise collections (Tenants, SKUs, Retailers, Invoices, Stock Ledger).'}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => syncFromFirestore()}
                  disabled={isSeeding}
                  className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  title="Refresh collections from Firestore"
                >
                  <RefreshCw size={13} className={isSeeding ? 'animate-spin' : ''} />
                  <span>Pull from DB</span>
                </button>

                <button
                  onClick={handleManualSeed}
                  disabled={isSeeding}
                  className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                  title="Seed Firestore database with default FMCG enterprise dataset"
                >
                  <Sparkles size={13} />
                  <span>{isSeeding ? 'Seeding Database...' : 'Seed Static Data'}</span>
                </button>
              </div>
            </div>

            {/* Live Seeding Progress Bar */}
            {isSeeding && (
              <div className="space-y-1.5 pt-2 border-t border-slate-900">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-amber-300 font-medium animate-pulse">{seedStep || 'Writing records...'}</span>
                  <span className="text-slate-400 font-mono">{seedProgressPercent}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${seedProgressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Permission Denied Quick Fix Helper */}
          {(firebaseStatus === 'PERMISSION_DENIED' || (testResult && !testResult.success && testResult.message.includes('PERMISSION DENIED'))) && (
            <div className="bg-amber-950/40 border-2 border-amber-500/60 rounded-xl p-4 space-y-3 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                  <span>Action Required: Enable Security Rules for Database "{databaseId || 'goroute-sfa-dms'}"</span>
                </div>
                <a
                  href={`https://console.firebase.google.com/project/${projectId || 'you-can-touch-me-8919838-dba1d'}/firestore/databases/${databaseId || 'goroute-sfa-dms'}/rules`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shrink-0 transition-all shadow"
                >
                  <span>Open Rules in Console</span>
                  <ExternalLink size={11} />
                </a>
              </div>

              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                In Firebase, <b>each named database instance</b> (like <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300 font-mono">{databaseId || 'goroute-sfa-dms'}</code>) has its own independent Security Rules tab in Firebase Console. By default, newly created databases block all client reads and writes until published.
              </p>

              <div className="bg-slate-950 border border-amber-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-medium">Copy & Publish this rule in Firebase Console:</span>
                  <button
                    onClick={copyRulesToClipboard}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded"
                  >
                    {copiedRules ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedRules ? 'Copied to Clipboard!' : 'Copy Rule'}</span>
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-emerald-300 bg-slate-900/90 p-2.5 rounded border border-slate-800 overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                <span>Once published in Firebase Console, click:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      runDiagnostics();
                      syncFromFirestore();
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded text-xs transition-all"
                  >
                    Retry Connection & Sync
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Troubleshooting / Setup Helper */}
          <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-blue-400" />
                Firestore Setup & Seeding Checklist
              </span>
              <a
                href={`https://console.firebase.google.com/project/${projectId || 'you-can-touch-me-8919838-dba1d'}/firestore/databases/${databaseId || 'goroute-sfa-dms'}/rules`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline"
              >
                <span>Open Firebase Console Rules</span>
                <ExternalLink size={11} />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg space-y-1">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
                  Create Database
                </div>
                <p className="text-[11px] text-slate-400">
                  In Firebase Console &gt; <b>Firestore Database</b>, ensure the database is initialized.
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg space-y-1.5">
                <div className="font-semibold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
                    Enable Rules
                  </span>
                  <button
                    onClick={copyRulesToClipboard}
                    className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.5 rounded"
                  >
                    {copiedRules ? <Check size={10} /> : <Copy size={10} />}
                    <span>{copiedRules ? 'Copied' : 'Copy Rules'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Under the <b>Rules</b> tab, allow read/write permissions for testing mode.
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg space-y-1">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">3</span>
                  Seed Dataset
                </div>
                <p className="text-[11px] text-slate-400">
                  Click <b>"Seed Static Data"</b> above to write all 12 FMCG collections to your cloud project.
                </p>
              </div>
            </div>
          </div>

          {/* Feedback banner */}
          {saveMessage && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
                saveMessage.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-500/30 text-rose-300'
              }`}
            >
              {saveMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{saveMessage.text}</span>
            </div>
          )}

          {/* Option A: Paste Firebase Web Config */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Quick Paste Firebase Web Config (JSON or JS snippet):</span>
            </label>
            <div className="flex gap-2">
              <textarea
                value={pasteJson}
                onChange={(e) => setPasteJson(e.target.value)}
                placeholder='const firebaseConfig = { apiKey: "...", projectId: "...", ... };'
                rows={2}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={handlePasteJson}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg self-start transition-all"
              >
                Fill Fields
              </button>
            </div>
          </div>

          {/* Option B: Manual Form Configuration */}
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-1">
              Firebase Project Credentials
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Project ID *</label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="e.g. you-can-touch-me-8919838-dba1d"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-amber-300 mb-1 font-medium flex items-center justify-between">
                  <span>Firestore Database ID *</span>
                  <span className="text-[10px] text-amber-400/80 font-normal">Named Database</span>
                </label>
                <input
                  type="text"
                  value={databaseId}
                  onChange={(e) => setDatabaseId(e.target.value)}
                  placeholder="e.g. goroute-sfa-dms or (default)"
                  required
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-3 py-2 text-amber-200 font-mono focus:border-amber-400 focus:outline-none shadow-sm"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">API Key</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Auth Domain</label>
                <input
                  type="text"
                  value={authDomain}
                  onChange={(e) => setAuthDomain(e.target.value)}
                  placeholder="project-id.firebaseapp.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Storage Bucket</label>
                <input
                  type="text"
                  value={storageBucket}
                  onChange={(e) => setStorageBucket(e.target.value)}
                  placeholder="project-id.appspot.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Messaging Sender ID</label>
                <input
                  type="text"
                  value={messagingSenderId}
                  onChange={(e) => setMessagingSenderId(e.target.value)}
                  placeholder="e.g. 1029384756"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-400 mb-1 font-medium">App ID</label>
                <input
                  type="text"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1:1029384756:web:abcd1234"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleResetToEnv}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Clear custom in-browser config
              </button>

              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-md"
              >
                Save & Connect Firestore
              </button>
            </div>
          </form>

          {/* Environment Variables Reference */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Or configure via your <code className="text-blue-400 font-mono">.env</code> file:
              </span>
              <button
                onClick={copyToClipboard}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded"
              >
                {copiedEnv ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedEnv ? 'Copied!' : 'Copy .env snippet'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 p-3 rounded-lg text-[11px] text-slate-300 font-mono overflow-x-auto border border-slate-800 leading-relaxed">
              {envSnippet}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Rules file created at <code className="text-slate-300">firestore.rules</code></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
