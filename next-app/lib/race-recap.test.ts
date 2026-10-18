import { describe, expect, it, vi } from 'vitest';
import { buildRaceFacts, generateRecap, RecapError } from '@/lib/race-recap';
import type { RaceStoryPayload } from '@/lib/race-story-data';

// Three drivers over three laps. Beta leads on lap 2, alpha takes it back on lap 3.
const payload: RaceStoryPayload = {
  available: true,
  season: 2025,
  round: 9,
  raceName: 'Test Grand Prix',
  circuitId: null,
  story: {
    laps: [1, 2, 3],
    drivers: ['alpha', 'beta', 'gamma'],
    times: {
      alpha: [90, 180, 270],
      beta: [95, 190, 285],
      gamma: [100, null, null],
    },
    positions: {
      alpha: [2, 2, 1],
      beta: [1, 1, 2],
      gamma: [3, null, null],
    },
    gaps: {
      alpha: [0.5, 1.2, 0],
      beta: [0, 0, 2.5],
      gamma: [4, null, null],
    },
  },
  drivers: [
    { driverId: 'alpha', code: 'ALP', name: 'Ann Alpha', constructorId: 'red', constructorName: 'Red Team', finalPosition: 1, grid: 2, status: 'Finished', fastest: true },
    { driverId: 'beta', code: 'BET', name: 'Ben Beta', constructorId: 'blue', constructorName: 'Blue Team', finalPosition: 2, grid: 1, status: '+1 Lap', fastest: false },
    { driverId: 'gamma', code: 'GAM', name: 'Cy Gamma', constructorId: 'green', constructorName: 'Green Team', finalPosition: 20, grid: 0, status: 'Engine', fastest: false },
  ],
};

describe('buildRaceFacts', () => {
  const facts = buildRaceFacts(payload);

  it('lists the podium with start positions', () => {
    expect(facts.podium.map((p) => [p.position, p.name, p.startedP])).toEqual([
      [1, 'Ann Alpha', 2],
      [2, 'Ben Beta', 1],
    ]);
  });

  it('counts lead changes and reports the margin of the second-place finisher from the last timed lap', () => {
    expect(facts.leadChanges).toBe(1); // beta leads laps 1-2, alpha takes over on lap 3
    expect(facts.winnerMarginSeconds).toBe(2.5); // beta's last cumulative gap to the leader
  });

  it('finds the biggest gainer and loser among classified finishers who started from the grid', () => {
    expect(facts.biggestGain).toEqual({ name: 'Ann Alpha', placesGained: 1 });
    expect(facts.biggestDrop).toEqual({ name: 'Ben Beta', placesLost: 1 });
  });

  it('lists retirements with their reason and counts classified finishers', () => {
    expect(facts.retirements).toEqual([{ name: 'Cy Gamma', reason: 'Engine' }]);
    expect(facts.classifiedFinishers).toBe(2);
    expect(facts.fastestLap).toBe('Ann Alpha');
  });
});

describe('generateRecap', () => {
  const facts = buildRaceFacts(payload);

  function stub(status: number, body: unknown) {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    return fetcher;
  }

  const ok = (content: string, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content } }] });

  it('sends the facts to the free Groq chat endpoint with the bearer key', async () => {
    const fetcher = stub(200, ok('A recap.'));
    await generateRecap('test-key', facts, fetcher);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.messages[1].content).toContain('"raceName": "Test Grand Prix"');
  });

  it('returns the message text, trimmed', async () => {
    const fetcher = stub(200, ok('  Ann Alpha won the Test Grand Prix.  '));
    await expect(generateRecap('k', facts, fetcher)).resolves.toBe('Ann Alpha won the Test Grand Prix.');
  });

  it('maps the free-tier limit, provider errors, truncation and empty replies to typed errors', async () => {
    await expect(generateRecap('k', facts, stub(429, {}))).rejects.toMatchObject({ reason: 'rate-limited' });
    await expect(generateRecap('k', facts, stub(500, {}))).rejects.toMatchObject({ reason: 'provider' });
    await expect(generateRecap('k', facts, stub(200, ok('Cut', 'length')))).rejects.toMatchObject({ reason: 'truncated' });
    await expect(generateRecap('k', facts, stub(200, ok('')))).rejects.toBeInstanceOf(RecapError);
  });
});
