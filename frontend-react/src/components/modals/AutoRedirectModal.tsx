import React, { useEffect } from 'react';
import { CheckCircle2, ArrowRight, X } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const AutoRedirectModal: React.FC = () => {
  const { autoRedirect, closeAutoRedirectModal, decrementAutoRedirectCountdown, setActiveTab } = useStore();

  useEffect(() => {
    if (!autoRedirect.open) return;

    const timer = setInterval(() => {
      decrementAutoRedirectCountdown();
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRedirect.open, autoRedirect.countdown, decrementAutoRedirectCountdown]);

  if (!autoRedirect.open) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Workflow Stage Complete</h3>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold">Automatic Workflow Advancement</p>
            </div>
          </div>
          <button
            onClick={closeAutoRedirectModal}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-2 space-y-2">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">{autoRedirect.message}</p>
          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-200 dark:border-blue-500/30 text-xs font-mono flex items-center justify-between text-blue-700 dark:text-cyan-300">
            <span>Next Stage: <strong className="font-extrabold">{autoRedirect.nextStepName}</strong></span>
            <span className="font-extrabold animate-pulse">Auto-proceed in {autoRedirect.countdown}s</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between space-x-3">
          <button
            onClick={closeAutoRedirectModal}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
          >
            Stay on this page
          </button>

          <button
            onClick={() => {
              const target = autoRedirect.targetTab;
              closeAutoRedirectModal();
              setActiveTab(target);
            }}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl shadow-md shadow-blue-600/30 transition-all flex items-center space-x-1.5"
          >
            <span>Continue Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
