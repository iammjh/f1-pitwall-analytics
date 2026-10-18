import type { Metadata } from 'next';
import RecoveryShell from '../recovery-shell';
import ForgotPasswordForm from './recovery-form';

export const metadata: Metadata = { title: 'Recover your password' };

export default function ForgotPasswordPage() {
  return (
    <RecoveryShell title="Forgot your password?" description="Enter the email address you use to sign in. We will send a recovery link if your account has a password.">
      <ForgotPasswordForm />
    </RecoveryShell>
  );
}
