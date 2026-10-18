import { describe, expect, it } from 'vitest';
import { isPushConfigured, parsePushSubscription } from '@/lib/push';

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BPublicKeyValue', auth: 'authSecret' },
};

describe('parsePushSubscription', () => {
  it('accepts a browser subscription with an https endpoint', () => {
    expect(parsePushSubscription(valid)).toEqual({
      endpoint: valid.endpoint,
      p256dh: 'BPublicKeyValue',
      auth: 'authSecret',
    });
  });

  it('rejects non-https endpoints', () => {
    expect(parsePushSubscription({ ...valid, endpoint: 'http://push.example.test/x' })).toBeNull();
    expect(parsePushSubscription({ ...valid, endpoint: 'javascript:alert(1)' })).toBeNull();
  });

  it('rejects missing or empty keys', () => {
    expect(parsePushSubscription({ endpoint: valid.endpoint })).toBeNull();
    expect(parsePushSubscription({ ...valid, keys: { p256dh: '', auth: 'x' } })).toBeNull();
    expect(parsePushSubscription({ ...valid, keys: { p256dh: 'x' } })).toBeNull();
  });

  it('rejects non-object input and over-long endpoints', () => {
    expect(parsePushSubscription(null)).toBeNull();
    expect(parsePushSubscription('subscription')).toBeNull();
    expect(parsePushSubscription({ ...valid, endpoint: 'https://a.test/' + 'x'.repeat(2100) })).toBeNull();
  });
});

describe('isPushConfigured', () => {
  it('needs both the public and private VAPID keys', () => {
    expect(isPushConfigured({})).toBe(false);
    expect(isPushConfigured({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub' })).toBe(false);
    expect(isPushConfigured({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toBe(true);
  });
});
