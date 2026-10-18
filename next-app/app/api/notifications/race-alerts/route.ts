import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { fetchSeasonRaces } from '@/lib/jolpica-client';
import { isMailConfigured, sendMail } from '@/lib/mailer';
import { isPushConfigured, sendPush } from '@/lib/push';
import {
  RACE_ALERT_CHANNEL,
  buildRaceStartMessage,
  racesStartingWithin,
  raceStartEventKey,
  type AlertRace,
} from '@/lib/race-alerts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_RECIPIENTS = 500;
const PUSH_CHANNEL = 'push';

/**
 * Sends race-start alerts by email and/or browser push to opted-in users. Called by a scheduler
 * (Vercel Cron, or any cron that sends `Authorization: Bearer $CRON_SECRET`). Each user gets each
 * race alert once per channel. Each channel runs only when its own settings are present.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Race alerts are not enabled on this server.' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const emailOn = isMailConfigured();
  const pushOn = isPushConfigured();
  if (!emailOn && !pushOn) {
    return NextResponse.json(
      { error: 'No alert channel is configured (SMTP_HOST/SMTP_FROM for email, VAPID keys for push).' },
      { status: 503 },
    );
  }

  try {
    const now = new Date();
    const season = String(now.getUTCFullYear());
    const races = (await fetchSeasonRaces(season, { limit: 30 })) as AlertRace[];
    const starting = racesStartingWithin(races.map((r) => ({ ...r, season })), now);

    const summary: Record<string, unknown> = { races: starting.length, recipients: 0, sent: 0, alreadySent: 0, failed: 0 };
    if (starting.length === 0) return NextResponse.json(summary);

    const prisma = getPrisma();
    const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    if (emailOn) {
      const recipients = await prisma.userPreferences.findMany({
        where: { emailNotifications: true, notifyRaceStart: true, user: { email: { not: null } } },
        include: { user: { select: { id: true, email: true } } },
        take: MAX_RECIPIENTS,
      });
      summary.recipients = recipients.length;

      for (const race of starting) {
        const eventKey = raceStartEventKey(race);
        for (const { user } of recipients) {
          if (!user.email) continue;

          // Reserve the alert first: the unique key stops a concurrent run from sending it twice.
          try {
            await prisma.notificationLog.create({
              data: { userId: user.id, eventKey, channel: RACE_ALERT_CHANNEL },
            });
          } catch {
            summary.alreadySent = Number(summary.alreadySent) + 1;
            continue;
          }

          const result = await sendMail(buildRaceStartMessage(race, user.email, appUrl, now));
          if (result.sent) {
            summary.sent = Number(summary.sent) + 1;
          } else {
            summary.failed = Number(summary.failed) + 1;
            // Release the reservation so the next run retries this alert.
            await prisma.notificationLog.deleteMany({ where: { userId: user.id, eventKey, channel: RACE_ALERT_CHANNEL } });
            console.error('Race alert email failed:', result.error ?? 'unknown error');
          }
        }
      }
    }

    if (pushOn) {
      const pushRecipients = await prisma.userPreferences.findMany({
        where: { pushNotifications: true, notifyRaceStart: true, user: { pushSubscriptions: { some: {} } } },
        include: { user: { select: { id: true, pushSubscriptions: true } } },
        take: MAX_RECIPIENTS,
      });
      const push = { recipients: pushRecipients.length, sent: 0, alreadySent: 0, failed: 0, removed: 0 };

      for (const race of starting) {
        const eventKey = raceStartEventKey(race);
        const minutes = Math.max(1, Math.round((new Date(`${race.date}T${race.time ?? '00:00:00Z'}`).getTime() - now.getTime()) / 60000));
        for (const { user } of pushRecipients) {
          // One reservation per user per race; every device of that user gets the same alert.
          try {
            await prisma.notificationLog.create({ data: { userId: user.id, eventKey, channel: PUSH_CHANNEL } });
          } catch {
            push.alreadySent += 1;
            continue;
          }

          let anyDelivered = false;
          for (const subscription of user.pushSubscriptions) {
            const result = await sendPush(subscription, {
              title: `${race.raceName} starts in about ${minutes} min`,
              body: race.Circuit?.circuitName ? `${race.Circuit.circuitName} · follow it live` : 'Follow it live in the hub',
              url: '/dashboard?tab=live',
            });
            if (result.sent) {
              anyDelivered = true;
            } else if (result.gone) {
              // The browser unsubscribed or the subscription expired: stop sending to it.
              await prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
              push.removed += 1;
            } else {
              console.error('Push alert failed:', result.error ?? 'unknown error');
            }
          }

          if (anyDelivered) {
            push.sent += 1;
          } else {
            push.failed += 1;
            await prisma.notificationLog.deleteMany({ where: { userId: user.id, eventKey, channel: PUSH_CHANNEL } });
          }
        }
      }
      summary.push = push;
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Race alert run failed:', error);
    return NextResponse.json({ error: 'Race alert run failed.' }, { status: 500 });
  }
}
