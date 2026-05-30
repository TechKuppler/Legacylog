'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { Spinner } from '@/components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setBusy(true); setError('');
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner dark />
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="login-logo">LegacyLog</div>
          <div className="login-tagline">Kuppler Internal Knowledge Base</div>
        </div>

        {/* Error */}
        {error && (
          <div className="alert-error" style={{ marginBottom: '1.25rem' }}>
            <span>⚠</span>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} noValidate>
          <div>
            <label className="field-label" htmlFor="email">Email address</label>
            <input
              id="email" type="email" className="input"
              placeholder="you@kuppler.in"
              value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" autoFocus disabled={busy}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">Password</label>
            <input
              id="password" type="password" className="input"
              placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" disabled={busy}
            />
          </div>

          <button
            type="submit" className="btn btn-primary"
            style={{ width: '100%', padding: '0.625rem', marginTop: '0.25rem', fontSize: '0.9375rem' }}
            disabled={busy}
          >
            {busy ? <><Spinner /> Signing in…</> : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '1.5rem' }}>
          Access restricted to authorised Kuppler staff only.
        </p>
      </div>
    </div>
  );
}
