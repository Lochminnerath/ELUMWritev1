import { HiddenIcon, VerifiedIcon, VisibleIcon, WarningIcon } from '../components/icons/ElumIcons';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage, isApiError } from '../api';
import { handleProblem } from '../api/validation';
import { useAuth } from '../auth/AuthProvider';
import { useSafeNext } from '../auth/guards';
import { WriteLockup } from '../components/Brand';
import { Loader } from '../components/Loader';
import { ThemeToggle } from '../theme/ThemeToggle';
import './AuthPage.css';

type Mode = 'signin' | 'signup';
type Kind = 'external' | 'type';
type Field = 'name' | 'email' | 'handle' | 'password' | 'recoveryEmail';
type HandleState = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok' } | { kind: 'bad'; message: string };

/** ELUM Type addresses can be made here when the ELUM platform (Supabase) is connected. */
const typeAccounts = !!api.handleAvailable && !!api.typeDomain;

export function AuthPage({ mode }: { mode: Mode }) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const next = useSafeNext();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('external');
  const [handle, setHandle] = useState('');
  const [recovery, setRecovery] = useState('');
  const [handleState, setHandleState] = useState<HandleState>({ kind: 'idle' });
  const [typeDomain, setTypeDomain] = useState('type.elum.services');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: Field; notice?: boolean } | null>(null);

  const isSignUp = mode === 'signup';
  const switchHref = `${isSignUp ? '/signin' : '/signup'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  const [resent, setResent] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    if (typeAccounts) void api.typeDomain!().then(setTypeDomain, () => undefined);
    // Opened from a confirmation link that did not work: say why.
    const problem = api.takeLinkProblem?.();
    if (problem) setError({ message: problem, notice: true });
  }, []);

  const resend = async () => {
    setResent('sending');
    try {
      await api.resendConfirmation!(email);
      setResent('sent');
    } catch (err) {
      setResent('idle');
      setError({ message: errorMessage(err), notice: true });
    }
  };

  // Checked as you type: format here, availability on the server.
  useEffect(() => {
    if (!isSignUp || kind !== 'type' || !handle) {
      setHandleState({ kind: 'idle' });
      return;
    }
    const problem = handleProblem(handle);
    if (problem) {
      setHandleState({ kind: 'bad', message: problem });
      return;
    }
    setHandleState({ kind: 'checking' });
    let cancelled = false;
    const t = window.setTimeout(() => {
      api.handleAvailable!(handle).then(
        (ok) => !cancelled && setHandleState(ok ? { kind: 'ok' } : { kind: 'bad', message: 'That name is taken.' }),
        () => !cancelled && setHandleState({ kind: 'idle' }),
      );
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [handle, kind, isSignUp]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSignUp && kind === 'type' && handleState.kind === 'bad') {
      setError({ message: handleState.message, field: 'handle' });
      return;
    }
    setBusy(true);
    setError(null);
    setResent('idle');
    try {
      if (!isSignUp) await signIn({ email, password });
      else if (kind === 'type') await signUp({ name, email: '', password, accountType: 'type', handle, recoveryEmail: recovery || undefined });
      else await signUp({ name, email, password, accountType: 'external' });
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
                <input type="radio" name="account-type" value="external" checked={kind === 'external'} onChange={() => setKind('external')} />
                <span>
                  <span className="account-type__title">Use my own email</span>
                  <span className="account-type__hint muted">Gmail, Outlook or any provider. Shares arrive there.</span>
                </span>
              </label>
              <label className="account-type__option" aria-disabled={typeAccounts ? undefined : true}>
                <input type="radio" name="account-type" value="type" checked={kind === 'type'} disabled={!typeAccounts} onChange={() => setKind('type')} />
                <span>
                  <span className="account-type__title">
                    Get an ELUM Type address{!typeAccounts && <span className="account-type__soon">Needs ELUM</span>}
                  </span>
                  <span className="account-type__hint muted">A new address on {typeDomain}, with an inbox in Type and Write built in.</span>
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

          {isSignUp && kind === 'type' && (
            <div className="field">
              <label htmlFor="handle">Your address</label>
              <div className="handle-input" data-state={handleState.kind}>
                <input
                  id="handle"
                  className="input"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={handle}
                  maxLength={30}
                  aria-invalid={handleState.kind === 'bad' || invalid('handle')}
                  aria-describedby="handle-status"
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  required
                />
                <span className="handle-input__domain">@{typeDomain}</span>
              </div>
              <span id="handle-status" className="handle-status" aria-live="polite" data-state={handleState.kind}>
                {handleState.kind === 'checking' && <Loader size={14} brand label="Checking" />}
                {handleState.kind === 'ok' && (
                  <>
                    <VerifiedIcon size={14} strokeWidth={2} aria-hidden="true" /> {handle}@{typeDomain} is yours to take.
                  </>
                )}
                {handleState.kind === 'bad' && handleState.message}
                {handleState.kind === 'idle' && '3 to 30 letters, numbers, dots, dashes or underscores. Addresses are permanent.'}
              </span>
            </div>
          )}

          {(!isSignUp || kind === 'external') && (
          <div className="field">
            <label htmlFor="email">{isSignUp || !typeAccounts ? 'Email' : 'Email or ELUM Type address'}</label>
            <input
              id="email"
              className="input"
              type={isSignUp || !typeAccounts ? 'email' : 'text'}
              autoComplete={isSignUp ? 'email' : 'username'}
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              placeholder={!isSignUp && typeAccounts ? `you@example.org or name@${typeDomain}` : undefined}
              value={email}
              aria-invalid={invalid('email')}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!isSignUp}
              required
            />
          </div>
          )}

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
                {showPassword ? <HiddenIcon size={18} strokeWidth={1.75} /> : <VisibleIcon size={18} strokeWidth={1.75} />}
              </button>
            </div>
            {isSignUp && (
              <span id="password-hint" className="muted auth__hint">
                At least 8 characters.
              </span>
            )}
          </div>

          {isSignUp && kind === 'type' && (
            <div className="field">
              <label htmlFor="recovery">Recovery email (optional)</label>
              <input
                id="recovery"
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={recovery}
                aria-invalid={invalid('recoveryEmail')}
                aria-describedby="recovery-hint"
                onChange={(e) => setRecovery(e.target.value)}
              />
              <span id="recovery-hint" className="auth__warning" data-empty={!recovery || undefined}>
                <WarningIcon size={14} strokeWidth={2} aria-hidden="true" />
                {recovery
                  ? 'We will send a code to confirm it. It is how you get back in if you forget your password.'
                  : 'Without one, nobody can recover your account if you forget your password, not even us.'}
              </span>
            </div>
          )}

          {error && (
            <div className={error.notice ? 'auth__notice' : 'auth__error'} role={error.notice ? 'status' : 'alert'}>
              <p>{resent === 'sent' ? `We sent a new link to ${email.trim()}. Open it on this device to finish.` : error.message}</p>
              {error.notice && api.resendConfirmation && email.includes('@') && resent !== 'sent' && (
                <button type="button" className="elum-btn elum-btn--secondary elum-btn--sm" disabled={resent === 'sending'} onClick={() => void resend()}>
                  {resent === 'sending' ? 'Sending' : 'Send the link again'}
                </button>
              )}
            </div>
          )}

          <button type="submit" className="elum-btn elum-btn--primary elum-btn--block auth__submit" disabled={busy}>
            {busy ? <Loader size={20} brand label={isSignUp ? 'Creating your account' : 'Signing in'} /> : isSignUp ? 'Create account' : 'Sign in'}
          </button>

          <p className="auth__switch">
            {isSignUp ? 'Already have an account?' : 'New to Write?'} <Link to={switchHref}>{isSignUp ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
