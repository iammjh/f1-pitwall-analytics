import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { getAuthOptions } from '@/lib/auth-config';

export default async function SignInLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(getAuthOptions());
  if (session?.user?.id) redirect('/dashboard');
  return children;
}
