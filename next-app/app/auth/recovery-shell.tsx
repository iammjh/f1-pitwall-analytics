import Image from 'next/image';
import Link from 'next/link';

export default function RecoveryShell({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-f1-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/auth/signin" className="inline-flex items-center text-white/40 hover:text-white text-sm mb-8 transition">
          ← Back to sign in
        </Link>
        <div className="bg-f1-dark border border-f1-grid rounded-2xl p-8">
          <Image src="/F1-Logo.png" alt="F1" width={90} height={23} className="h-auto mx-auto mb-6" />
          <h1 className="text-2xl font-black text-white font-f1-display">{title}</h1>
          <p className="text-white/50 text-sm mt-2 mb-6 leading-relaxed">{description}</p>
          {children}
        </div>
      </div>
    </main>
  );
}
