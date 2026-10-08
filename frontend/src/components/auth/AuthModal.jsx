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
    authNotice,
    setAuthNotice,
    handleLogin,
    handleRegister,
    loading,
  } = useApp();

  const handleClose = () => {
    setAuthModalOpen(false);
    if (setAuthNotice) setAuthNotice('');
  };

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const handleTabChange = (mode) => {
    setAuthMode(mode);
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (authMode === 'signin') {
      const res = await handleLogin(username, password);
      if (res && !res.ok) {
        setFormError(res.error || 'Invalid username or password');
      }
    } else {
      const res = await handleRegister({
        username,
        password,
        email: email || undefined,
        full_name: fullName || undefined,
        organization: organization || undefined,
      });
      if (res && !res.ok) {
        setFormError(res.error || 'Registration failed');
      }
    }
  };

  const handleDemoSignIn = async () => {
    setUsername('demo');
    setPassword('demo1234');
    setFormError('');
    const res = await handleLogin('demo', 'demo1234');
    if (res && !res.ok) {
      setFormError(res.error || 'Demo sign-in failed');
    }
  };

  return (
    <Modal
      isOpen={authModalOpen}
      onClose={handleClose}
      maxWidth="max-w-sm"
      hideHeader={true}
      contentClassName="p-5"
    >
      <div className="relative space-y-4">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
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
            onClick={() => handleTabChange('signin')}
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
            onClick={() => handleTabChange('register')}
            className={`flex-1 py-1 rounded-md transition-all text-center ${
              authMode === 'register'
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Informative Notice (e.g. Session Expired) */}
        {authNotice && (
          <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-800 flex items-start gap-2">
            <PhosphorIcon name="Info" size={16} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
            <span className="flex-1">{authNotice}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {authMode === 'register' && (
            <>
              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <PhosphorIcon
                    name="User"
                    size={16}
                    weight="duotone"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-sm sm:text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-700 mb-1">
                  Work Email
                </label>
                <div className="relative">
                  <PhosphorIcon
                    name="EnvelopeSimple"
                    size={16}
                    weight="duotone"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-sm sm:text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-700 mb-1">
                  Organization <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <PhosphorIcon
                    name="Buildings"
                    size={16}
                    weight="duotone"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Company or Organization"
                    className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-sm sm:text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs sm:text-[11px] font-semibold text-slate-700 mb-1">
              Username
            </label>
            <div className="relative">
              <PhosphorIcon
                name="User"
                size={16}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                required
                minLength={authMode === 'register' ? 3 : undefined}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-sm sm:text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-[11px] font-semibold text-slate-700 mb-1">
              Password
            </label>
            <div className="relative">
              <PhosphorIcon
                name="Lock"
                size={16}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={authMode === 'register' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2 sm:py-1.5 text-sm sm:text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <PhosphorIcon
                  name={showPassword ? 'EyeSlash' : 'Eye'}
                  size={16}
                  weight="duotone"
                />
              </button>
            </div>
          </div>

          {authMode === 'register' && (
            <p className="text-[11px] text-slate-400 -mt-1">
              Username 3+ characters, password 8+ characters.
            </p>
          )}

          {/* Inline Form Error */}
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <PhosphorIcon name="WarningCircle" size={16} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />
                <span className="flex-1 font-medium leading-relaxed">{formError}</span>
              </div>
              {formError.toLowerCase().includes('already registered') && authMode === 'register' && (
                <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between">
                  <span className="text-[11px] text-rose-600">Already registered this account?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setFormError('');
                    }}
                    className="text-[11px] font-bold text-brand-700 hover:text-brand-800 underline flex items-center gap-1"
                  >
                    Sign In →
                  </button>
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            className="w-full justify-center font-semibold py-2.5 mt-2 rounded-xl text-sm shadow-sm shadow-brand-500/20"
          >
            {authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        {authMode === 'signin' && (
          <div className="pt-1">
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Quick Access
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              type="button"
              id="modal-demo-signin-btn"
              onClick={handleDemoSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/70 hover:bg-brand-100/70 text-brand-700 hover:text-brand-800 text-xs font-semibold transition-all hover:border-brand-400 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <PhosphorIcon name="Sparkle" size={15} weight="fill" className="text-brand-500" />
              <span>One-Click Demo Sign In</span>
              <span className="text-[10px] text-brand-600/80 font-normal bg-white/90 border border-brand-200/80 px-1.5 py-0.5 rounded ml-0.5">
                demo / demo1234
              </span>
            </button>
          </div>
        )}

        {authMode === 'signin' && (
          <div className="pt-2 border-t border-slate-100 text-center text-[11px] text-slate-500">
            Don't have an account yet?{' '}
            <button
              type="button"
              onClick={() => handleTabChange('register')}
              className="font-medium text-slate-900 underline hover:text-brand-600 transition-colors"
            >
              Create an account
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default AuthModal;
