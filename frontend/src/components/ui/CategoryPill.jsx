import React from 'react';
import { CATEGORIES } from '../../constants/taxonomy';
import { PhosphorIcon } from './PhosphorIcon';

export function CategoryPill({ category = 'GENERAL', size = 'md', className = '' }) {
  const meta = CATEGORIES[category] || {
    label: category,
    color: '#64748B',
    bg: '#F1F5F9',
    border: '#E2E8F0',
    icon: 'Folder',
  };

  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-lg border transition-all select-none ${
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
        color={meta.color}
      />
      <span>{meta.label}</span>
    </span>
  );
}

export default CategoryPill;
