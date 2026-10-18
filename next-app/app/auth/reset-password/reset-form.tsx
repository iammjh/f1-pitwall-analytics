'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { validatePassword } from '@/lib/password-validation';

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Retain the token only in this form, removing it from the address bar/history.
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError('');
    const checked = validatePassword(password, true);
    if (!checked.ok) { setError(checked.error); return; }
    if (password !== confirmation) { setError('Passwords must match.'); return; }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Could not change your password. Please try again.');
      setPassword('');
      setConfirmation('');
      setMessage(body?.message || 'Password changed. Sign in with your new password.');
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'Could not connect. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div>
        <p role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-red-300 text-sm">This reset link is invalid. Request a new recovery link.</p>
        <Link href="/auth/forgot-password" className="inline-block text-f1-red hover:underline text-sm mt-5">Request a new link →</Link>
      </div>
    );
  }

  if (message) {
    return (
      <div>
        <p role="status" className="rounded-xl border border-green-800 bg-green-950/30 p-4 text-green-200 text-sm">{message}</p>
        <p className="text-white/40 text-sm mt-4">Previous sessions have been signed out.</p>
        <Link href="/auth/signin" className="inline-block text-f1-red hover:underline text-sm mt-5">Sign in →</Link>
      </div>
    );
  }

  const inputStyle = 'w-full px-4 py-3 bg-f1-black border border-f1-grid rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-f1-red focus:ring-1 focus:ring-f1-red transition text-sm disabled:opacity-50';
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
      {error && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-red-300 text-sm">{error}</p>}
      <div>
        <label htmlFor="reset-password" className="block text-sm font-medium text-white/60 mb-1.5">New password</label>
        <input id="reset-password" name="password" type="password" autoComplete="new-password" required minLength={6}
          value={password} onChange={event => setPassword(event.target.value)} disabled={loading} aria-describedby="reset-password-help" className={inputStyle} />
        <p id="reset-password-help" className="text-white/40 text-xs mt-2">At least 6 characters and at most 72 UTF-8 bytes. Accented letters and emoji can use multiple bytes.</p>
      </div>
      <div>
        <label htmlFor="reset-confirmation" className="block text-sm font-medium text-white/60 mb-1.5">Confirm new password</label>
        <input id="reset-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={6}
          value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={loading} className={inputStyle} />
      </div>
      <button type="submit" disabled={loading} className="w-full py-3 bg-f1-red hover:bg-red-700 disabled:opacity-50 rounded-xl font-black text-white transition text-sm">
        {loading ? 'Changing password…' : 'Change password'}
      </button>
      <Link href="/auth/forgot-password" className="block text-center text-f1-red hover:underline text-sm">Request a new recovery link</Link>
    </form>
  );
}
