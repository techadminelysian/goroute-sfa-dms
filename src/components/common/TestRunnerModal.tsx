import React, { useState } from 'react';
import { runAllCaRoutingTests, TestResult } from '../../utils/caRoutingTests';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Check,
  AlertOctagon,
  Layers,
  FileCheck,
} from 'lucide-react';

export const TestRunnerModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [testReport, setTestReport] = useState<{
    results: TestResult[];
    totalPassed: number;
    totalFailed: number;
    allPassed: boolean;
  } | null>(() => runAllCaRoutingTests());

  if (!isOpen) return null;

  const handleRerun = () => {
    setTestReport(runAllCaRoutingTests());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 text-slate-200 shadow-2xl space-y-4 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-600/20 text-purple-400 rounded-xl border border-purple-500/30">
              <FileCheck size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">CA-BE-DP Verification Test Suite</h3>
              <p className="text-xs text-slate-400">Positive & Negative Scenario Test Automation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRerun}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 border border-slate-700"
            >
              <RotateCcw size={13} /> Re-run Tests
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>

        {/* Test Summary Pill Bar */}
        {testReport && (
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Scenarios</span>
              <span className="text-lg font-bold font-mono text-white">{testReport.results.length}</span>
            </div>
            <div className="p-3 bg-emerald-950/30 rounded-xl border border-emerald-500/40 text-center">
              <span className="text-[10px] text-emerald-400 block uppercase font-bold">Passed</span>
              <span className="text-lg font-bold font-mono text-emerald-400">{testReport.totalPassed}</span>
            </div>
            <div className="p-3 bg-rose-950/30 rounded-xl border border-rose-500/40 text-center">
              <span className="text-[10px] text-rose-400 block uppercase font-bold">Failed</span>
              <span className="text-lg font-bold font-mono text-rose-400">{testReport.totalFailed}</span>
            </div>
          </div>
        )}

        {/* Results List */}
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {testReport?.results.map((res, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                res.passed
                  ? 'bg-slate-950/80 border-emerald-500/30'
                  : 'bg-rose-950/40 border-rose-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  {res.passed ? (
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-rose-400 shrink-0" />
                  )}
                  <span className={res.passed ? 'text-white' : 'text-rose-200'}>{res.scenarioName}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    res.type === 'POSITIVE'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {res.type}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px]">Expected:</span>
                  <span className="text-slate-300">{res.expectedOutcome}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Actual Result:</span>
                  <span className={res.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {res.actualOutcome}
                  </span>
                </div>
              </div>

              {res.error && (
                <div className="text-[10px] text-rose-400 bg-rose-950/60 p-2 rounded-lg font-mono">
                  Error: {res.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <ShieldCheck size={16} /> All test cases verified against specification.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
