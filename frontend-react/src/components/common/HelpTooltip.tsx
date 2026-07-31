import React, { useState } from 'react';
import { HelpCircle, Info } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface HelpTooltipProps {
  title: string;
  explanation: string;
  telecomContext?: string;
  children?: React.ReactNode;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  title,
  explanation,
  telecomContext,
  children,
}) => {
  const { helpMode } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-flex items-center group">
      {children}
      
      {(helpMode || isOpen) && (
        <div className="ml-1.5 inline-flex items-center text-cyan-400 cursor-pointer animate-pulse">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            aria-label={`Help info for ${title}`}
            className="p-1 rounded-full hover:bg-cyan-500/20 transition-colors focus:outline-none"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
          </button>

          {/* Hover / Click Modal Card */}
          {isOpen && (
            <div className="absolute left-full top-0 ml-2 w-72 p-3 bg-slate-900 border border-cyan-500/40 rounded-xl shadow-2xl z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
              <div className="flex items-center space-x-1.5 font-semibold text-cyan-300 pb-1 mb-1 border-b border-cyan-500/20">
                <Info className="w-3.5 h-3.5" />
                <span>What is this? ({title})</span>
              </div>
              <p className="leading-relaxed text-slate-300 mb-2">{explanation}</p>
              {telecomContext && (
                <div className="p-2 bg-slate-950/80 rounded-lg border border-cyan-500/20 text-[11px] text-cyan-200/90 font-mono">
                  <span className="font-bold text-cyan-400">MNO Context: </span>
                  {telecomContext}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
