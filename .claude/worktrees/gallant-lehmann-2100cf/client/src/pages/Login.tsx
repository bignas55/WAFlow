import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Lock, Mail, Shield } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { WAFlowLogo } from '../components/WAFlowLogo';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [totpToken, setTotpToken]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [need2FA, setNeed2FA]         = useState(false);
  const [error, setError]             = useState('');

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => { window.location.href = '/'; },
    onError: (err) => {
      if (err.message === '2FA_REQUIRED') {
        setNeed2FA(true);
        setError('');
      } else if (err.message === 'EMAIL_NOT_VERIFIED') {
        // Redirect to verify page — they can resend from there
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        setError(err.message || 'Login failed. Check your credentials.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ email, password, totpToken: totpToken || undefined });
  };

  return (
    <div className="min-h-screen bg-[#080817] flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-5/12 bg-gradient-to-br from-[#0d1d12] to-[#080817] border-r border-white/5 p-12">
        <Link to="/">
          <WAFlowLogo size="md" theme="dark" />
        </Link>

        <div>
          <p className="text-[#25D366] text-sm font-semibold uppercase tracking-wider mb-3">
            AI WhatsApp Platform
          </p>
          <h2 className="text-3xl font-extrabold text-white leading-tight mb-4">
            Automate your business.<br />
            <span className="text-[#25D366]">Never miss a customer.</span>
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Businesses worldwide use WAFlow to handle bookings, answer customer
            questions, and run WhatsApp campaigns — automatically, 24/7.
          </p>
        </div>

        <div className="space-y-3">
          {[
            "AI receptionist active 24/7",
            "Appointment booking & reminders",
            "CRM, broadcast & loyalty tools",
          ].map(f => (
            <div key={f} className="flex items-center gap-2.5 text-sm text-gray-400">
              <div className="w-5 h-5 rounded-full bg-[#25D366]/20 flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-[#25D366]" />
              </div>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <WAFlowLogo size="md" theme="dark" />
          </div>

          <h1 className="text-3xl font-extrabold text-white mb-1">
            {need2FA ? 'Two-Factor Authentication' : 'Welcome back'}
          </h1>
          <p className="text-gray-400 mb-8">
            {need2FA
              ? 'Enter the 6-digit code from your authenticator app.'
              : <>Don't have an account? <Link to="/register" className="text-[#25D366] hover:underline">Start free</Link></>
            }
          </p>

          {error && (
            <div className="mb-5 bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!need2FA ? (
              <>
                {/* Email */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@yourbusiness.com"
                      className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#25D366] transition"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-gray-400">Password</label>
                    <Link to="/forgot-password" className="text-xs text-[#25D366] hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-[#25D366] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* 2FA code input */
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Authenticator Code</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    autoFocus
                    value={totpToken}
                    onChange={e => setTotpToken(e.target.value.replace(/\D/g, ''))}
                    placeholder="000 000"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:border-[#25D366] transition text-center"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setNeed2FA(false); setTotpToken(''); }}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  ← Back to login
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-black font-bold py-3.5 rounded-xl text-base transition shadow-lg shadow-green-500/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loginMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>{need2FA ? 'Verify' : 'Sign In'} <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t border-white/5 flex justify-between text-xs text-gray-600">
            <Link to="/terms" className="hover:text-gray-400 transition">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-gray-400 transition">Privacy Policy</Link>
            <a href="mailto:hello@waflow.co.za" className="hover:text-gray-400 transition">Support</a>
          </div>
        </div>
      </div>
    </div>
  );
}
