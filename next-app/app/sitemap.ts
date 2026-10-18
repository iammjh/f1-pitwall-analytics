import type { MetadataRoute } from 'next';
import { getJolpicaJson } from '@/lib/jolpica-fetch';
import { getLatestSeason } from '@/lib/seasons';
import { SITE_URL } from '@/lib/site-config';

// Race and driver results change only after a race, so a daily rebuild of the list is plenty.
export const revalidate = 86400;

/**
 * Public pages only. The dashboard and the sign-in pages are private or noindex, so they are left out.
 * Share pages for the latest season's completed races and current drivers give search engines real content.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const season = getLatestSeason(now);
  const entries: MetadataRoute.Sitemap = [{ url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 }];

  try {
    const racesData = await getJolpicaJson(`${season}.json?limit=40`);
    const races: any[] = racesData?.MRData?.RaceTable?.Races ?? [];
    for (const race of races) {
      const start = new Date(`${race.date}T${race.time || '23:59:59Z'}`);
      if (Number.isNaN(start.getTime()) || start >= now) continue;
      entries.push({
        url: `${SITE_URL}/share/race/${season}/${race.round}`,
        lastModified: start,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  } catch {
    // Without the race list the sitemap still lists the homepage, which is better than failing the build.
  }

  try {
    const driversData = await getJolpicaJson(`${season}/drivers.json?limit=100`);
    const drivers: any[] = driversData?.MRData?.DriverTable?.Drivers ?? [];
    for (const driver of drivers) {
      if (!driver?.driverId) continue;
      entries.push({
        url: `${SITE_URL}/share/driver/${encodeURIComponent(driver.driverId)}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.5,
      });
    }
  } catch {
    // Same fallback as above.
  }

  return entries;
}
