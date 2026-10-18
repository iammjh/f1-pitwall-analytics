import { describe, expect, it } from 'vitest';
import {
  buildRaceStartMessage,
  getRaceStart,
  raceStartEventKey,
  racesStartingWithin,
  type AlertRace,
} from '@/lib/race-alerts';
import { getSmtpConfig, isMailConfigured } from '@/lib/mailer';

const race = (round: string, date: string, time?: string, raceName = `Round ${round} GP`): AlertRace => ({
  season: '2026',
  round,
  raceName,
  date,
  time,
  Circuit: { circuitName: 'Test Circuit', Location: { locality: 'Town', country: 'Land' } },
});

const NOW = new Date('2026-10-18T12:00:00Z');

describe('getRaceStart', () => {
  it('reads the UTC start time', () => {
    expect(getRaceStart(race('5', '2026-10-18', '12:30:00Z'))?.toISOString()).toBe('2026-10-18T12:30:00.000Z');
  });

  it('returns null when the schedule has no time', () => {
    expect(getRaceStart(race('5', '2026-10-18'))).toBeNull();
  });
});

describe('racesStartingWithin', () => {
  it('keeps races starting in the next hour only', () => {
    const races = [
      race('1', '2026-10-18', '12:30:00Z'), // in 30 min: yes
      race('2', '2026-10-18', '13:00:00Z'), // exactly 60 min: yes (inclusive end)
      race('3', '2026-10-18', '13:01:00Z'), // 61 min: no
      race('4', '2026-10-18', '11:59:00Z'), // already started: no
      race('5', '2026-10-18'), // no time: no
    ];
    expect(racesStartingWithin(races, NOW).map((r) => r.round)).toEqual(['1', '2']);
  });
});

describe('raceStartEventKey', () => {
  it('is stable per season and round', () => {
    expect(raceStartEventKey(race('7', '2026-10-18'))).toBe('race-start:2026:7');
  });
});

describe('buildRaceStartMessage', () => {
  it('states the minutes until the start and links to the live tab', () => {
    const message = buildRaceStartMessage(race('5', '2026-10-18', '12:30:00Z', 'Japanese Grand Prix'), 'fan@example.test', 'https://hub.example/', NOW);
    expect(message.to).toBe('fan@example.test');
    expect(message.subject).toBe('F1 alert: Japanese Grand Prix starts in 30 min');
    expect(message.text).toContain('Japanese Grand Prix starts in about 30 minutes.');
    expect(message.text).toContain('https://hub.example/dashboard?tab=live');
  });

  it('escapes race names in the HTML body', () => {
    const message = buildRaceStartMessage(race('5', '2026-10-18', '12:30:00Z', '<b>Evil</b> & Co'), 'fan@example.test', 'https://hub.example', NOW);
    expect(message.html).not.toContain('<b>Evil</b>');
    expect(message.html).toContain('&lt;b&gt;Evil&lt;/b&gt; &amp; Co');
  });
});

describe('mail configuration', () => {
  it('requires SMTP_HOST and SMTP_FROM', () => {
    expect(getSmtpConfig({})).toBeNull();
    expect(isMailConfigured({ SMTP_HOST: 'smtp.example.test' })).toBe(false);
    expect(isMailConfigured({ SMTP_HOST: 'smtp.example.test', SMTP_FROM: 'alerts@example.test' })).toBe(true);
  });

  it('falls back to port 587 for invalid ports', () => {
    const config = getSmtpConfig({ SMTP_HOST: 'h', SMTP_FROM: 'f', SMTP_PORT: 'nope' });
    expect(config?.port).toBe(587);
  });
});
