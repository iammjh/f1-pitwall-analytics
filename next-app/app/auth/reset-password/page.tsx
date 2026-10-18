import type { Metadata } from 'next';
import RecoveryShell from '../recovery-shell';
import ResetPasswordForm from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string | string[] } }) {
  const token = typeof searchParams.token === 'string' && /^[a-f\d]{64}$/i.test(searchParams.token) ? searchParams.token : '';
  return (
    <RecoveryShell title="Choose a new password" description="Set a new password to recover your account. You will then sign in again.">
      <ResetPasswordForm token={token} />
    </RecoveryShell>
  );
}
