/** Canonical public origin for metadata, sitemap, and robots. Override with NEXT_PUBLIC_SITE_URL for other deployments. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://pitwall-analytics.vercel.app').replace(/\/+$/, '');
