import React from 'react';
import { UserRole } from '../../types';
import { ROLE_PERMISSIONS } from '../../data/mockData';

interface RoleBadgeProps {
  role: UserRole;
  showIcon?: boolean;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role }) => {
  const perm = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['Admin'];

  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${perm.badgeColor}`}>
      {role}
    </span>
  );
};
