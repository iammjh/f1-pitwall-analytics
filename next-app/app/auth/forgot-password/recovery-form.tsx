'use client';

import { useState } from 'react';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Recovery is temporarily unavailable. Please try again.');
      setMessage(body?.message || 'If this email belongs to an account with a password, a recovery link will arrive shortly.');
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'Could not connect. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div>
        <div role="status" className="rounded-xl border border-green-800 bg-green-950/30 p-4 text-green-200 text-sm leading-relaxed">
          {message}
        </div>
        <p className="text-white/40 text-sm mt-4">Check your inbox and spam folder. Recovery links expire in 30 minutes.</p>
        <button type="button" onClick={() => setMessage('')} className="text-f1-red hover:underline text-sm mt-5">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={loading}>
      {error && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-3 text-red-300 text-sm">{error}</p>}
      <div>
        <label htmlFor="recovery-email" className="block text-sm font-medium text-white/60 mb-1.5">Email address</label>
        <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)} disabled={loading} placeholder="you@example.com"
          className="w-full px-4 py-3 bg-f1-black border border-f1-grid rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-f1-red focus:ring-1 focus:ring-f1-red transition text-sm disabled:opacity-50" />
      </div>
      <button type="submit" disabled={loading} className="w-full py-3 bg-f1-red hover:bg-red-700 disabled:opacity-50 rounded-xl font-black text-white transition text-sm">
        {loading ? 'Sending request…' : 'Send recovery link'}
      </button>
    </form>
  );
}
