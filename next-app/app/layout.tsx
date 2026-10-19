import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './providers';
import { getGoogleSiteVerification } from '@/lib/google-site-verification';
import ScrollToTop from '@/components/ScrollToTop';
import PwaRegister from '@/components/PwaRegister';
import { SITE_URL } from '@/lib/site-config';
import { Analytics } from '@vercel/analytics/next';

const googleSiteVerification = getGoogleSiteVerification();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Pitwall Analytics: F1 Telemetry, Standings and Race Strategy',
    template: '%s | Pitwall Analytics',
  },
  description: 'Formula 1 analytics hub with championship standings, driver and constructor comparisons, race stories, race replays and pit-stop strategy. Seasons from 1996.',
  applicationName: 'Pitwall Analytics',
  icons: {
    icon: '/F1-Logo.png',
    shortcut: '/F1-Logo.png',
    apple: '/F1-Logo.png',
  },
  keywords: [
    'F1',
    'Formula 1',
    'Telemetry',
    'Race Analytics',
    'Championship Standings',
    'Lap Times',
    'Live Timing',
    'F1 Strategy',
    'OpenF1',
    'Motorsport Data',
  ],
  authors: [{ name: 'mjahid', url: 'https://iammjh.github.io' }],
  creator: 'mjahid',
  publisher: 'mjahid',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: googleSiteVerification
    ? { google: googleSiteVerification }
    : undefined,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'Pitwall Analytics: F1 Telemetry, Standings and Race Strategy',
    description: 'Formula 1 analytics hub with championship standings, driver and constructor comparisons, race stories, race replays and pit-stop strategy.',
    siteName: 'Pitwall Analytics',
    images: [
      {
        url: '/f1_home.png?v=2',
        width: 1200,
        height: 630,
        alt: 'Pitwall Analytics Hub Dashboard Preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pitwall Analytics: F1 Telemetry, Standings and Race Strategy',
    description: 'Formula 1 analytics hub with championship standings, driver and constructor comparisons, race stories, race replays and pit-stop strategy.',
    images: ['/f1_home.png?v=2'],
    creator: '@iammjh',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#E10600',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32" />
      </head>
      <body className="bg-f1-black text-white">
        <AuthProvider>
          {children}
          <ScrollToTop />
          <PwaRegister />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}

