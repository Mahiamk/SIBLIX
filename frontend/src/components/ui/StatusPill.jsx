import React from 'react';
import { STATUS } from '../../constants/taxonomy';
import { PhosphorIcon } from './PhosphorIcon';

export function StatusPill({ status = 'PROCESSING', size = 'md', className = '' }) {
  const meta = STATUS[status] || {
    label: status,
    color: '#64748B',
    bg: '#F1F5F9',
    border: '#E2E8F0',
    icon: 'Circle',
  };

  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border transition-all select-none ${
        isSmall
          ? 'px-2 py-0.5 text-[11px] gap-1'
          : 'px-2.5 py-1 text-xs gap-1.5'
      } ${className}`}
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        borderColor: meta.border,
      }}
    >
      <PhosphorIcon
        name={meta.icon}
        size={isSmall ? 12 : 14}
        weight="duotone"
        className={status === 'PROCESSING' ? 'animate-spin' : ''}
        color={meta.color}
      />
      <span>{meta.label}</span>
    </span>
  );
}

export default StatusPill;
