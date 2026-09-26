import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PhosphorIcon } from '../ui/PhosphorIcon';

export function AuthModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    authMode,
    setAuthMode,
    handleLogin,
    handleRegister,
    loading,
  } = useApp();

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (authMode === 'signin') {
      handleLogin(username, password);
    } else {
      handleRegister({
        username,
        password,
        email: email || undefined,
        full_name: fullName || undefined,
        organization: organization || undefined,
      });
    }
  };

  return (
    <Modal
      isOpen={authModalOpen}
      onClose={() => setAuthModalOpen(false)}
      maxWidth="max-w-sm"
      hideHeader={true}
      contentClassName="p-5"
    >
      <div className="relative space-y-4">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => setAuthModalOpen(false)}
          className="absolute -top-1 -right-1 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Close modal"
        >
          <PhosphorIcon name="X" size={16} />
        </button>

        {/* Compact Header */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="w-10 h-10 rounded-xl siblix-logo-badge text-white flex items-center justify-center mx-auto shadow-sm">
            <PhosphorIcon name="Boat" size={22} weight="duotone" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              {authMode === 'signin' ? 'Sign in to SIBLIX' : 'Create Account'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {authMode === 'signin'
                ? 'Intelligent Shipping Document Verification'
                : 'Start verifying shipping instructions'}
            </p>
          </div>
        </div>

        {/* Compact Tab Switcher (Sign In vs Create Account) */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/70 text-xs font-medium">
          <button
            type="button"
            onClick={() => setAuthMode('signin')}
            className={`flex-1 py-1 rounded-md transition-all text-center ${
              authMode === 'signin'
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('register')}
            className={`flex-1 py-1 rounded-md transition-all text-center ${
              authMode === 'register'
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Compact Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {authMode === 'register' && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
                  Full Name
                </label>
                <div className="relative">
                  <PhosphorIcon
                    name="User"
                    size={14}
                    weight="duotone"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Captain Morgan"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
                  Work Email
                </label>
                <div className="relative">
                  <PhosphorIcon
                    name="EnvelopeSimple"
                    size={14}
                    weight="duotone"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@shipping.com"
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
                Organization <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <PhosphorIcon
                  name="Buildings"
                  size={14}
                  weight="duotone"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Global Maritime Freight"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                />
              </div>
            </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
              Username
            </label>
            <div className="relative">
              <PhosphorIcon
                name="User"
                size={14}
                weight="duotone"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                required
                minLength={authMode === 'register' ? 3 : undefined}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-0.5">
              Password
            </label>
            <div className="relative">
              <PhosphorIcon
                name="Lock"
                size={14}
                weight="duotone"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={authMode === 'register' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-8 pr-9 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <PhosphorIcon
                  name={showPassword ? 'EyeSlash' : 'Eye'}
                  size={14}
                  weight="duotone"
                />
              </button>
            </div>
          </div>

          {authMode === 'register' && (
            <p className="text-[10px] text-slate-400 -mt-1">
              Username 3+ characters, password 8+ characters.
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={loading}
            className="w-full font-medium py-2 mt-1"
          >
            {authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        {authMode === 'signin' && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="text-slate-400">Quick Fill:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setUsername('admin'); setPassword('admin123'); }}
                className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 font-mono text-[10px] text-slate-700 transition-colors"
                title="Fill Admin credentials"
              >
                admin
              </button>
              <button
                type="button"
                onClick={() => { setUsername('demo'); setPassword('demo1234'); }}
                className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700 font-mono text-[10px] text-slate-700 transition-colors"
                title="Fill Demo credentials"
              >
                demo
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default AuthModal;
