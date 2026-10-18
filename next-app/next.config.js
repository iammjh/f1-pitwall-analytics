/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',

  async headers() {
    return [{
      source: '/auth/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    }];
  },

  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },

  // BUG FIX: `swcMinify` was removed in Next.js 14 — it's on by default and
  // the option throws a warning. Removed.

  images: {
    remotePatterns: [
      // F1 official media
      { protocol: 'https', hostname: 'media.formula1.com' },
      { protocol: 'https', hostname: 'www.formula1.com' },
      // GitHub OAuth avatars
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      // Google OAuth avatars
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com' },
      // OpenF1 / Jolpica driver images
      { protocol: 'https', hostname: 'api.openf1.org' },
    ],
    // Local public/ images (hero-f1-car.jpg etc.) are served automatically.
  },

  experimental: {
    instrumentationHook: true,
    // This Next.js version still expects the Prisma package allowlist under
    // `experimental.serverComponentsExternalPackages`.
    serverComponentsExternalPackages: ['prisma', '@prisma/client', 'bull'],
  },
};

module.exports = nextConfig;
