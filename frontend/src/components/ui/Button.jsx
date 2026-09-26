import React from 'react';
import { PhosphorIcon } from './PhosphorIcon';

export function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost'
  size = 'md', // 'sm' | 'md' | 'lg'
  icon,
  iconRight,
  loading = false,
  disabled = false,
  className = '',
  onClick,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 active:scale-[0.98] select-none disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-500/20';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-8',
    md: 'text-xs sm:text-sm px-3.5 py-2 gap-2 h-9 sm:h-10',
    lg: 'text-sm sm:text-base px-5 py-2.5 gap-2.5 h-11',
  };

  const variantStyles = {
    primary:
      'btn-storm-primary bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm hover:from-brand-500 hover:to-brand-600 hover:shadow-md active:from-brand-700 active:to-brand-800 border border-brand-800/40 transition-all duration-150',
    secondary:
      'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300',
    outline:
      'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-subtle',
    danger:
      'bg-coral-50 text-coral-600 border border-coral-200 hover:bg-coral-100 active:bg-coral-200',
    success:
      'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 active:bg-emerald-200',
    ghost:
      'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:bg-slate-200/80',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size] || sizeStyles.md} ${variantStyles[variant] || variantStyles.primary} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <PhosphorIcon name="SpinnerGap" size={16} weight="duotone" className="animate-spin" />
      ) : icon ? (
        <PhosphorIcon name={icon} size={size === 'sm' ? 14 : 18} weight="duotone" />
      ) : null}
      {children}
      {!loading && iconRight ? (
        <PhosphorIcon name={iconRight} size={size === 'sm' ? 14 : 18} weight="duotone" />
      ) : null}
    </button>
  );
}

export default Button;
