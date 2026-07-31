import React from 'react';
import { useStore } from '../../store/useStore';
import { Sparkles, ChevronRight, ChevronLeft, X, ShieldCheck, Zap, Network, GitPullRequest } from 'lucide-react';

const TOUR_STEPS = [
  {
    title: 'Welcome to Mobileum Roaming Automation',
    icon: Sparkles,
    description: 'This platform automates complex telecom roaming configuration updates (IR.21 XML, RAEX OpData & IOT). Say goodbye to 14-day manual entry backlogs and billing errors.',
  },
  {
    title: 'Role-Based Governance System',
    icon: ShieldCheck,
    description: 'Switch between 10 specialized telecom roles (CTO, CMO, Security, Analyst, NOC, Auditor). Each role has specific permissions for commercial, technical, and security sign-offs.',
  },
  {
    title: 'Automated Delta Difference Engine',
    icon: GitPullRequest,
    description: 'Incoming IR.21 XML files are automatically parsed against the Master Baseline to highlight GT routing, APN core, and IOT tariff rate discrepancies.',
  },
  {
    title: 'Interactive React Flow Automation Pipeline',
    icon: Network,
    description: 'Visualize the full lifecycle: Mail Repository ➔ RAEX Import ➔ Master Repository ➔ Difference Checker ➔ Stage Approvals ➔ Core Provisioning ➔ Rollback Center.',
  },
  {
    title: 'Instant Rollback & Audit Readiness',
    icon: Zap,
    description: 'Deploy core routing changes with peace of mind. Single-click rollback snapshots restore stable GSMA configurations instantly if network issues arise.',
  }
];

export const OnboardingTour: React.FC = () => {
  const { onboardingActive, onboardingStep, nextOnboardingStep, prevOnboardingStep, endOnboarding, setActiveTab } = useStore();

  if (!onboardingActive) return null;

  const step = TOUR_STEPS[onboardingStep] || TOUR_STEPS[0];
  const Icon = step.icon;

  const handleFinish = () => {
    endOnboarding();
    setActiveTab('dashboard');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Background Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Onboarding Step {onboardingStep + 1} of {TOUR_STEPS.length}
            </span>
          </div>
          <button
            onClick={endOnboarding}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="my-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 mx-auto sm:mx-0">
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-100 mb-2">{step.title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{step.description}</p>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-4 mt-6 border-t border-slate-800">
          <button
            onClick={prevOnboardingStep}
            disabled={onboardingStep === 0}
            className="flex items-center space-x-1 text-sm font-medium text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <div className="flex space-x-1.5">
            {TOUR_STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === onboardingStep ? 'w-6 bg-blue-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          {onboardingStep < TOUR_STEPS.length - 1 ? (
            <button
              onClick={nextOnboardingStep}
              className="flex items-center space-x-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-blue-600/30 transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center space-x-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-emerald-600/30 transition-colors"
            >
              <span>Explore Platform</span>
              <Sparkles className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
