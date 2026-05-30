'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { apiPost } from '@/lib/api';
import { Spinner } from '@/components/ui';

export default function ChangePasswordPage() {
  const { user, loading, getToken, refreshUser } = useAuth();
  const router = useRouter();

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy,            setBusy]            = useState(false);
  const [error,           setError]           = useState('');

  useEffect(() => {
    if (!loading && !user)                     router.replace('/auth/login');
    if (!loading && user && !user.mustChangePassword) router.replace('/dashboard');
  }, [user, loading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setBusy(true); setError('');
    try {
      await apiPost('/auth/change-password', { newPassword }, getToken());
      await refreshUser();
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="login-logo">LegacyLog</div>
          <div className="login-tagline">Set your new password to continue</div>
        </div>

        <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: 'var(--r-md)', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8125rem', color: 'var(--brand)' }}>
          Your account requires a password change before you can continue.
        </div>

        {error && (
          <div className="alert-error" style={{ marginBottom: '1.25rem' }}>
            <span>⚠</span>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} noValidate>
          <div>
            <label className="field-label" htmlFor="newPassword">New Password</label>
            <input
              id="newPassword" type="password" className="input"
              placeholder="Min 8 characters"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              autoFocus disabled={busy}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword" type="password" className="input"
              placeholder="Repeat your new password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          <button
            type="submit" className="btn btn-primary"
            style={{ width: '100%', padding: '0.625rem', marginTop: '0.25rem', fontSize: '0.9375rem' }}
            disabled={busy}
          >
            {busy ? <><Spinner /> Setting password…</> : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
