import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/authStore';


// ─── Validation Schemas ────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z
  .object({
    username:        z.string().min(3, 'Must be at least 3 characters').max(50),
    email:           z.string().email('Must be a valid email').or(z.literal('')).optional(),
    firstName:       z.string().optional(),
    lastName:        z.string().optional(),
    password:        z.string().min(8, 'Must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type LoginFormValues    = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

// ─── Sub-components ────────────────────────────────────────────────────────

interface InputFieldProps {
  label:       string;
  name:        string;
  type?:       string;
  placeholder: string;
  icon:        string;
  error?:      string;
  autoComplete?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registration: any;
}

function InputField({
  label,
  type = 'text',
  placeholder,
  icon,
  error,
  autoComplete,
  registration,
}: InputFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="flex flex-col gap-2">
      <label className="label tracking-wider">{label}</label>
      <div className="relative">
        <span
          className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 select-none"
          style={{
            fontSize: '17px',
            lineHeight: 1,
            color: error ? 'var(--color-status-err)' : '#6b6960',
          }}
        >{icon}</span>
        <input
          {...registration}
          type={resolvedType}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={[
            'w-full depth-input rounded pl-11 pr-9 py-3',
            'text-[13px] font-sans text-(--color-text-warm)',
            'placeholder:text-slate-500 placeholder:text-[13px]',
            'focus:outline-none focus:border-(--color-primary) focus:shadow-none',
            'focus:ring-1 focus:ring-[rgba(79,142,247,0.3)]',
            'transition-all duration-150',
            error ? 'border-(--color-status-err)!' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '17px', lineHeight: 1 }}
            >
              {showPassword ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1 text-[11px] font-mono" style={{ color: 'var(--color-status-err)' }}>
          <span className="material-symbols-outlined text-[11px]">error</span>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Login Form ────────────────────────────────────────────────────────────

interface LoginFormProps {
  onSuccess:  () => void;
  onRegister: () => void;
}

function LoginForm({ onSuccess, onRegister }: LoginFormProps) {
  const { login, isLoading, error, clearError } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data);
      onSuccess();
    } catch {
      // error is already set in the store
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      {error && (
        <div
          className="flex items-start gap-2.5 rounded px-3 py-2.5 text-[12px] fade-in"
          style={{
            background: 'rgba(192,57,57,0.1)',
            border: '1px solid rgba(192,57,57,0.3)',
            color: 'var(--color-status-err)',
          }}
        >
          <span className="material-symbols-outlined text-sm mt-px">warning</span>
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="ml-auto hover:opacity-70 transition-opacity cursor-pointer"
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      <InputField
        label="Username or Email"
        name="username"
        placeholder="john_doe or john@example.com"
        icon="person"
        autoComplete="username"
        error={errors.username?.message}
        registration={register('username')}
      />

      <InputField
        label="Password"
        name="password"
        type="password"
        placeholder="••••••••"
        icon="lock"
        autoComplete="current-password"
        error={errors.password?.message}
        registration={register('password')}
      />

      <div className="flex items-center justify-end">
        <button
          type="button"
          className="label-o hover:opacity-80 transition-opacity"
        >
          Forgot password?
        </button>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded
          font-mono text-[11px] font-semibold uppercase tracking-widest text-white
          transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          hover:brightness-110 active:scale-[0.99] mt-1"
        style={{
          background: isLoading
            ? 'var(--color-border-muted)'
            : 'var(--color-primary)',
          boxShadow: isLoading ? 'none' : '0 4px 14px rgba(79,142,247,0.25)',
        }}
      >
        {isLoading ? (
          <>
            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            Signing in…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-base">login</span>
            Sign in
          </>
        )}
      </button>

      <p className="text-center text-[12px]" style={{ color: '#5a6380' }}>
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onRegister}
          className="font-mono uppercase tracking-wide text-[11px] hover:opacity-80 transition-opacity cursor-pointer"
          style={{ color: 'var(--color-primary)' }}
        >
          Create one
        </button>
      </p>
    </form>
  );
}

// ─── Register Form ─────────────────────────────────────────────────────────

interface RegisterFormProps {
  onSuccess: () => void;
  onLogin:   () => void;
}

function RegisterForm({ onSuccess, onLogin }: RegisterFormProps) {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      await registerUser({
        username:    data.username,
        password:    data.password,
        email:       data.email || undefined,
        firstName:   data.firstName || undefined,
        lastName:    data.lastName || undefined,
      });
      onSuccess();
    } catch {
      // error is already set in the store
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {error && (
        <div
          className="flex items-start gap-2.5 rounded px-3 py-2.5 text-[12px] fade-in"
          style={{
            background: 'rgba(192,57,57,0.1)',
            border: '1px solid rgba(192,57,57,0.3)',
            color: 'var(--color-status-err)',
          }}
        >
          <span className="material-symbols-outlined text-sm mt-px">warning</span>
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="ml-auto hover:opacity-70 transition-opacity cursor-pointer"
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="First name"
          name="firstName"
          placeholder="John"
          icon="badge"
          autoComplete="given-name"
          error={errors.firstName?.message}
          registration={register('firstName')}
        />
        <InputField
          label="Last name"
          name="lastName"
          placeholder="Doe"
          icon="badge"
          autoComplete="family-name"
          error={errors.lastName?.message}
          registration={register('lastName')}
        />
      </div>

      <InputField
        label="Username"
        name="username"
        placeholder="john_doe"
        icon="alternate_email"
        autoComplete="username"
        error={errors.username?.message}
        registration={register('username')}
      />

      <InputField
        label="Email (optional)"
        name="email"
        type="email"
        placeholder="john@example.com"
        icon="mail"
        autoComplete="email"
        error={errors.email?.message}
        registration={register('email')}
      />

      <InputField
        label="Password"
        name="password"
        type="password"
        placeholder="Min. 8 characters"
        icon="lock"
        autoComplete="new-password"
        error={errors.password?.message}
        registration={register('password')}
      />

      <InputField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        placeholder="Repeat password"
        icon="lock_reset"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        registration={register('confirmPassword')}
      />

      <button
        type="submit"
        disabled={isLoading}
        className="flex items-center justify-center gap-2 w-full py-3 px-4 mt-2 rounded
          font-mono text-[11px] font-semibold uppercase tracking-widest text-white
          transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          hover:brightness-110 active:scale-[0.99]"
        style={{
          background: isLoading ? 'var(--color-border-muted)' : 'var(--color-primary)',
          boxShadow: isLoading ? 'none' : '0 4px 14px rgba(79,142,247,0.25)',
        }}
      >
        {isLoading ? (
          <>
            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            Creating account…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-base">person_add</span>
            Create account
          </>
        )}
      </button>

      <p className="text-center text-[12px]" style={{ color: '#5a6380' }}>
        Already have an account?{' '}
        <button
          type="button"
          onClick={onLogin}
          className="font-mono uppercase tracking-wide text-[11px] hover:opacity-80 transition-opacity cursor-pointer"
          style={{ color: 'var(--color-primary)' }}
        >
          Sign in
        </button>
      </p>
    </form>
  );
}

// ─── AuthPage ──────────────────────────────────────────────────────────────

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');

  const handleSuccess = () => {
    window.location.href = '?page=home';
  };

  const switchMode = (next: AuthMode) => {
    useAuthStore.getState().clearError();
    setMode(next);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'var(--color-bg-base)' }}
    >
      {/* Subtle radial glow behind the card */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(79,142,247,0.06) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-105 slide-up">
        {/* ── Logo ── */}
        <div className="flex items-center gap-2.5 mb-8">
          <div
            className="w-8 h-8 rounded flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-primary)' }}
          >
            <span
              className="material-symbols-outlined text-white"
              style={{
                fontSize: '16px',
                fontVariationSettings: "'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 20",
              }}
            >
              terminal
            </span>
          </div>
          <div className="flex flex-col leading-none">
            <span
              className="font-mono font-semibold tracking-widest uppercase text-[13px]"
              style={{ color: 'var(--color-text-warm)' }}
            >
              UniFT
              <span className="opacity-40 ml-0.5">//OS</span>
            </span>
            <span className="label mt-0.5">Unified File Transfer</span>
          </div>
        </div>

        {/* ── Card ── */}
        <div
          className="rounded panel-depth overflow-hidden"
          style={{ background: 'var(--color-surface)' }}
        >
          {/* Tab bar */}
          <div
            className="flex"
            style={{ borderBottom: '1px solid var(--color-border-muted)' }}
          >
            {(['login', 'register'] as AuthMode[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchMode(tab)}
                className="flex-1 py-3 font-mono text-[10px] uppercase tracking-widest transition-all duration-200 cursor-pointer"
                style={
                  mode === tab
                    ? {
                        color: 'var(--color-primary)',
                        borderBottom: '2px solid var(--color-primary)',
                        marginBottom: '-1px',
                        background: 'rgba(79,142,247,0.05)',
                      }
                    : { color: '#5a6380', borderBottom: '2px solid transparent' }
                }
              >
                {tab === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {/* Form area */}
          <div className="p-7 sm:p-8">
            {/* Heading */}
            <div className="mb-6">
              <h1
                className="text-lg font-semibold tracking-tight"
                style={{ color: 'var(--color-text-warm)' }}
              >
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-[12px] mt-0.5" style={{ color: '#5a6380' }}>
                {mode === 'login'
                  ? 'Sign in to access your file system.'
                  : 'Set up your UniFT account in seconds.'}
              </p>
            </div>

            {/* Forms — key forces remount + form reset on tab switch */}
            {mode === 'login' ? (
              <LoginForm
                key="login"
                onSuccess={handleSuccess}
                onRegister={() => switchMode('register')}
              />
            ) : (
              <RegisterForm
                key="register"
                onSuccess={handleSuccess}
                onLogin={() => switchMode('login')}
              />
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <p className="text-center mt-6 label">
          UniFT &copy; {new Date().getFullYear()} &mdash; Self-hosted file management
        </p>
      </div>
    </div>
  );
}
