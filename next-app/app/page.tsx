import type { Metadata } from 'next';
import HomeDashboard from '@/components/home/HomeDashboard';
import { SITE_URL } from '@/lib/site-config';

const TITLE = 'Pitwall Analytics: F1 Telemetry, Standings and Race Strategy';
const DESCRIPTION =
  'Formula 1 analytics hub with championship standings, driver and constructor profiles, head-to-head comparisons, race results, lap-by-lap race stories, race replays and pit-stop strategy. Seasons from 1996.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Pitwall Analytics',
    images: [{ url: '/f1_home.png?v=2', width: 1200, height: 630, alt: 'Pitwall Analytics homepage' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/f1_home.png?v=2'] },
};

// Structured data tells search engines what the site is. The values are static, so inlining them is safe.
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Pitwall Analytics',
      description: DESCRIPTION,
      inLanguage: 'en',
    },
    {
      '@type': 'WebApplication',
      name: 'Pitwall Analytics Hub',
      url: SITE_URL,
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any',
      description: DESCRIPTION,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <HomeDashboard />
    </>
  );
}
