import { useState, type FormEvent } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useApp } from '../store/AppContext';

export default function LoginPage() {
  const { signIn, register, authError } = useApp();
  const demoLogin = import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true';
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      if (creatingAccount) {
        await register(
          String(data.get('name') ?? '').trim(),
          String(data.get('email') ?? '').trim(),
          String(data.get('password') ?? ''),
        );
      } else {
        await signIn(
          String(data.get('email') ?? '').trim(),
          String(data.get('password') ?? ''),
        );
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4 py-10">
      <section className="glass w-full max-w-md rounded-2xl p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.jpeg" alt="Premier Brokers" className="h-12 w-24 rounded-lg bg-white object-contain p-1" />
          <div>
            <h1 className="text-lg font-semibold text-white">IBMS</h1>
            <p className="text-xs text-muted">Premier Brokers Pvt. Ltd.</p>
          </div>
        </div>
        <div className="mb-5 flex items-center gap-2">
          <LockKeyhole size={18} className="text-brand-400" />
          <h2 className="text-xl font-semibold text-white">{creatingAccount ? 'Create your account' : 'Sign in'}</h2>
        </div>
        <p className="mb-5 text-sm text-muted">
          {demoLogin
            ? 'Use the temporary local demo credentials to continue.'
            : creatingAccount
              ? 'New registrations receive Client access. A System Admin can assign staff roles.'
              : 'Sign in with your registered email and password.'}
        </p>
        {authError && <p role="alert" className="mb-4 rounded-lg border border-hot/30 bg-hot/10 px-3 py-2 text-sm text-hot">Authentication service unavailable: {authError}</p>}
        <form onSubmit={submit} className="space-y-4">
          {creatingAccount && (
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">Full name</span>
              <input className="input" name="name" autoComplete="name" maxLength={120} required />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Email</span>
            <input
              className="input"
              name="email"
              type={creatingAccount ? 'email' : 'text'}
              autoComplete={creatingAccount ? 'email' : 'username'}
              autoCapitalize="none"
              placeholder={creatingAccount ? undefined : demoLogin ? 'Username' : 'Email or admin'}
              maxLength={254}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Password</span>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete={creatingAccount ? 'new-password' : 'current-password'}
              minLength={creatingAccount ? 12 : undefined}
              maxLength={72}
              required
            />
            {creatingAccount && <span className="mt-1 block text-[11px] text-muted">Use at least 12 characters.</span>}
          </label>
          {error && <p role="alert" className="rounded-lg border border-hot/30 bg-hot/10 px-3 py-2 text-sm text-hot">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            <ShieldCheck size={16} /> {submitting ? 'Please wait…' : creatingAccount ? 'Create Client Account' : 'Sign in'}
          </button>
        </form>
        {!demoLogin && <div className="mt-5 border-t border-ink-600 pt-4 text-center text-sm text-muted">
          {creatingAccount ? 'Already registered?' : 'Need a client account?'}{' '}
          <button
            type="button"
            className="font-medium text-brand-400 hover:text-brand-300"
            onClick={() => { setError(''); setCreatingAccount((value) => !value); }}
          >
            {creatingAccount ? 'Sign in' : 'Create account'}
          </button>
        </div>}
      </section>
    </main>
  );
}