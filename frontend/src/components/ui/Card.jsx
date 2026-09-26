import React from 'react';
import { PhosphorIcon } from './PhosphorIcon';

export function Card({
  children,
  title,
  subtitle,
  icon,
  iconColor = '#4F46E5',
  action,
  className = '',
  bodyClassName = '',
  hover = false,
  onClick,
  overflowVisible = false,
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-200/80 shadow-card ${
        overflowVisible ? 'overflow-visible' : 'overflow-hidden'
      } transition-all duration-200 ${
        hover ? 'hover:border-slate-300 hover:shadow-lift cursor-pointer' : ''
      } ${className}`}
    >
      {(title || action) && (
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div
                className="p-1.5 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center"
                style={{ color: iconColor }}
              >
                <PhosphorIcon name={icon} size={18} weight="duotone" />
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-slate-800 tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export default Card;
