import React from 'react';
import { StatusType } from '../../types';

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  let styles = 'bg-slate-800 text-slate-300 border-slate-700';

  switch (status) {
    case 'Received':
    case 'Auto-Ingested':
      styles = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      break;
    case 'In Delta Check':
    case 'Pending Review':
    case 'Pending Ingestion':
      styles = 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse';
      break;
    case 'Awaiting Sign-off':
      styles = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      break;
    case 'Approved':
    case 'Provisioned':
    case 'Synced':
    case 'Active Baseline':
      styles = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      break;
    case 'Rejected':
    case 'Action Required':
    case 'Failed Schema Validation':
      styles = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      break;
    case 'Rolled Back':
    case 'Pending Rollback':
      styles = 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      break;
  }

  const px = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${px} ${styles}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
      {status}
    </span>
  );
};
