/**
 * LoginPage
 * Centered authentication card on a dark bg with subtle radial glow accents.
 * Matches login_screen_refined_industrial/code.html design.
 */

import { useState } from 'react';
import { Input } from '@/components/ui';
import { useAuth } from '@/hooks';

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formData.username.trim()) errors.username = 'Username is required';
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Minimum 6 characters';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      await login(formData);
    } catch {
      // error displayed via hook
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: '' }));
  };

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4 relative overflow-hidden">

      {/* ── Decorative glow blobs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-20" aria-hidden>
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[30%] h-[30%] bg-primary/5  blur-[100px] rounded-full" />
      </div>

      {/* ── Card ── */}
      <div className="w-full max-w-[400px] bg-surface border border-border-subtle shadow-2xl p-8 relative z-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-7 w-7 items-center justify-center bg-primary shrink-0">
              <span
                className="material-symbols-outlined text-bg-base"
                style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
              >
                terminal
              </span>
            </div>
            <span className="font-mono text-[15px] font-bold tracking-tight text-text-warm">
              UniFT<span className="text-primary">//</span>OS
            </span>
          </div>
          <h2 className="text-text-warm text-[15px] font-semibold mb-1">System Authentication</h2>
          <p className="text-slate-500 text-[13px]">Please provide your access credentials to proceed</p>
        </div>

        {/* API error banner */}
        {error && (
          <div className="mb-5 px-3 py-2.5 bg-status-err/10 border border-status-err/30 text-status-err text-[12px] font-mono">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Input
            label="Username"
            name="username"
            type="text"
            placeholder="Enter username"
            autoComplete="username"
            value={formData.username}
            onChange={handleChange}
            error={formErrors.username}
            isRequired
          />

          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={formData.password}
            onChange={handleChange}
            error={formErrors.password}
            isRequired
          />

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-bg-base font-mono font-bold text-[12px] uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-bg-base border-t-transparent rounded-full animate-spin" />
                  Authenticating…
                </>
              ) : (
                'Authenticate'
              )}
            </button>
          </div>

          {/* Footer links */}
          <div className="flex flex-col items-center gap-4 mt-2">
            <a
              href="#"
              className="text-slate-600 hover:text-primary transition-colors text-[13px]"
            >
              Forgot password?
            </a>
            <div className="w-full h-px bg-white/5" />
            <p className="label text-slate-700">Secure Terminal Protocol v2.4</p>
          </div>
        </form>
      </div>
    </div>
  );
}
