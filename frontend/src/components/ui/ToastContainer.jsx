import React from 'react';
import { useApp } from '../../context/AppContext';
import { PhosphorIcon } from './PhosphorIcon';

export function ToastContainer() {
  const { toasts, removeToast } = useApp();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        const border = isSuccess
          ? 'border-emerald-200'
          : isError
          ? 'border-rose-200'
          : 'border-slate-200';

        const iconColor = isSuccess
          ? '#10B981'
          : isError
          ? '#F43F5E'
          : '#4F46E5';

        const iconName = isSuccess
          ? 'CheckCircle'
          : isError
          ? 'WarningCircle'
          : 'Info';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white/95 backdrop-blur-md shadow-lift border text-xs text-slate-800 transition-all animate-in slide-in-from-bottom-2 duration-150 ${border}`}
          >
            <div className="flex items-center gap-2.5">
              <PhosphorIcon
                name={iconName}
                size={18}
                weight="duotone"
                color={iconColor}
              />
              <span className="font-medium leading-snug">{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
            >
              <PhosphorIcon name="X" size={14} weight="duotone" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastContainer;
