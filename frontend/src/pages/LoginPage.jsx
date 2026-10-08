import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { PhosphorIcon } from '../components/ui/PhosphorIcon';

export function LoginPage() {
  const { handleLogin, handleRegister, loading, authMode, setAuthMode, setActiveTab } = useApp();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const mode = authMode || 'signin';

  const handleTabChange = (targetMode) => {
    setAuthMode(targetMode);
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (mode === 'signin') {
      const res = await handleLogin(user, pass);
      if (res && !res.ok) {
        setFormError(res.error || 'Invalid username or password');
      }
    } else {
      const res = await handleRegister({
        username: user,
        password: pass,
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
    setUser('demo');
    setPass('demo1234');
    setFormError('');
    const res = await handleLogin('demo', 'demo1234');
    if (res && !res.ok) {
      setFormError(res.error || 'Demo sign-in failed');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-canvas-light flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center space-y-2 mb-5 sm:mb-6">
        {/* Brand Icon */}
        <div
          onClick={() => setActiveTab('landing')}
          className="w-12 h-12 rounded-2xl siblix-logo-badge text-white flex items-center justify-center mx-auto shadow-sm cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          title="Back to Landing Page"
        >
          <PhosphorIcon name="Boat" size={26} weight="duotone" />
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {mode === 'signin' ? 'Sign in to SIBLIX' : 'Create SIBLIX Account'}
            <span className="text-[#717486]">.AI</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Intelligent Shipping Document Verification Platform
          </p>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="bg-white py-6 sm:py-7 px-5 sm:px-6 rounded-2xl border border-slate-200/90 shadow-lift space-y-4">
          {/* Tab Switcher (Sign In vs Create Account) */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/70 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleTabChange('signin')}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                mode === 'signin'
                  ? 'bg-white text-slate-900 font-bold shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('register')}
              className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                mode === 'register'
                  ? 'bg-white text-slate-900 font-bold shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
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
                  minLength={mode === 'register' ? 3 : undefined}
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
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
                  minLength={mode === 'register' ? 8 : undefined}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
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

            {mode === 'register' && (
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
                {formError.toLowerCase().includes('already registered') && mode === 'register' && (
                  <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-rose-600">Already registered this account?</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleTabChange('signin');
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
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          {mode === 'signin' && (
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
                id="demo-signin-btn"
                onClick={handleDemoSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/70 hover:bg-brand-100/70 text-brand-700 hover:text-brand-800 text-xs font-semibold transition-all hover:border-brand-400 active:scale-[0.99] disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <PhosphorIcon name="Sparkle" size={16} weight="fill" className="text-brand-500" />
                <span>One-Click Demo Sign In</span>
                <span className="text-[11px] text-brand-600/80 font-normal bg-white/90 border border-brand-200/80 px-1.5 py-0.5 rounded ml-1">
                  demo / demo1234
                </span>
              </button>
            </div>
          )}

          {mode === 'signin' && (
            <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-500">
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => handleTabChange('register')}
                className="font-semibold text-brand-600 underline hover:text-brand-700 transition-colors"
              >
                Create an account
              </button>
            </div>
          )}

          <div className="text-center pt-1">
            <button
              onClick={() => setActiveTab('landing')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors inline-flex items-center gap-1.5"
            >
              <PhosphorIcon name="ArrowLeft" size={13} />
              Return to Website
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

