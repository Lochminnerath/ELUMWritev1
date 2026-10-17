import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage, isApiError } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { useSafeNext } from '../auth/guards';
import { WriteLockup } from '../components/Brand';
import { Loader } from '../components/Loader';
import { ThemeToggle } from '../theme/ThemeToggle';
import './AuthPage.css';

type Mode = 'signin' | 'signup';
type Field = 'name' | 'email' | 'password';

export function AuthPage({ mode }: { mode: Mode }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const next = useSafeNext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: Field; notice?: boolean } | null>(null);

  const isSignUp = mode === 'signup';
  const switchHref = `${isSignUp ? '/signin' : '/signup'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSignUp) await signUp({ name, email, password, accountType: 'external' });
      else await signIn({ email, password });
      navigate(next, { replace: true });
    } catch (err) {
      const field = isApiError(err) ? (err.details?.field as Field | undefined) : undefined;
      // "Check your email" is the next step, not a mistake.
      setError({ message: errorMessage(err), field, notice: isApiError(err, 'confirm_email') });
      setBusy(false);
    }
  };

  const invalid = (field: Field) => (error?.field === field ? true : undefined);

  return (
    <div className="auth">
      <aside className="auth__art" aria-hidden="true">
        <div className="auth__glow" />
        <div className="auth__discs">
          <span className="auth__disc auth__disc--a" />
          <span className="auth__disc auth__disc--b" />
          <span className="auth__lens" />
          <span className="auth__stop" />
        </div>
        <div className="auth__art-copy">
          <p className="label muted">Built by people. Runs without AI.</p>
          <p className="auth__tagline">Write freely. Share when you are ready.</p>
        </div>
      </aside>

      <main className="auth__main">
        <div className="auth__top">
          <WriteLockup height={32} />
          <ThemeToggle />
        </div>

        <form className="auth__form" onSubmit={submit} noValidate>
          <h1 className="auth__title">{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
          <p className="auth__subtitle muted">
            {isSignUp ? 'One account for Write and the rest of ELUM.' : 'Sign in to pick up where you left off.'}
          </p>

          {isSignUp && (
            <fieldset className="account-type">
              <legend className="field-label">Account</legend>
              <label className="account-type__option">
                <input type="radio" name="account-type" value="external" checked readOnly />
                <span>
                  <span className="account-type__title">Use my own email</span>
                  <span className="account-type__hint muted">Gmail, Outlook or any provider. Shares arrive there.</span>
                </span>
              </label>
              <label className="account-type__option" aria-disabled="true">
                <input type="radio" name="account-type" value="type" disabled />
                <span>
                  <span className="account-type__title">
                    Get an ELUM Type address <span className="account-type__soon">Coming soon</span>
                  </span>
                  <span className="account-type__hint muted">A new inbox from ELUM, with Write built in.</span>
                </span>
              </label>
            </fieldset>
          )}

          {isSignUp && (
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                className="input"
                autoComplete="name"
                value={name}
                maxLength={80}
                aria-invalid={invalid('name')}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              aria-invalid={invalid('email')}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!isSignUp}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="auth__password">
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                aria-invalid={invalid('password')}
                aria-describedby={isSignUp ? 'password-hint' : undefined}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="icon-btn auth__reveal"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
              </button>
            </div>
            {isSignUp && (
              <span id="password-hint" className="muted auth__hint">
                At least 8 characters.
              </span>
            )}
          </div>

          {error && (
            <p className={error.notice ? 'auth__notice' : 'auth__error'} role={error.notice ? 'status' : 'alert'}>
              {error.message}
            </p>
          )}

          <button type="submit" className="elum-btn elum-btn--primary elum-btn--block auth__submit" disabled={busy}>
            {busy ? <Loader size={20} brand label={isSignUp ? 'Creating your account' : 'Signing in'} /> : isSignUp ? 'Create account' : 'Sign in'}
          </button>

          <p className="auth__switch">
            {isSignUp ? 'Already have an account?' : 'New to Write?'} <Link to={switchHref}>{isSignUp ? 'Sign in' : 'Create an account'}</Link>
          </p>

          {api.mode === 'local' && (
            <p className="auth__local muted">
              Preview mode: your account and documents are kept in this browser until the ELUM API is connected.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
