import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

export function RegisterPage() {
  const { status, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await register(email, password, displayName || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full place-items-center px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-zinc-400">Tutor accounts get sheet access by default.</p>

        <label className="mt-5 block text-sm">
          <span className="text-zinc-300">Display name</span>
          <input className="input mt-1" maxLength={120}
            value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-zinc-300">Email</span>
          <input className="input mt-1" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-zinc-300">Password <span className="text-zinc-500">(min 12 chars)</span></span>
          <input className="input mt-1" type="password" required minLength={12} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="mt-3 rounded-md bg-rose-950/60 px-3 py-2 text-sm text-rose-200">{error}</div>}

        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="mt-4 text-center text-xs text-zinc-500">
          Already have one? <Link to="/login" className="text-indigo-300 hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
