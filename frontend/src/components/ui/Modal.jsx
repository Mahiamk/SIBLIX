import React, { useEffect } from 'react';
import { PhosphorIcon } from './PhosphorIcon';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
  className = '',
  contentClassName = 'p-6',
  hideHeader = false,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog content */}
      <div
        className={`relative w-full ${maxWidth} my-auto bg-white rounded-2xl shadow-lift border border-slate-200/90 overflow-hidden transform transition-all z-10 animate-in fade-in zoom-in-95 duration-150 ${className}`}
      >
        {!hideHeader && (title || subtitle || onClose) && (
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              {title && (
                <h3 className="text-base font-semibold text-slate-800 tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
              )}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <PhosphorIcon name="X" size={18} weight="duotone" />
              </button>
            )}
          </div>
        )}
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );
}

export default Modal;
