'use client';

import { useEffect } from 'react';

/** Registers the service worker that makes the hub installable and delivers push alerts. */
export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installation and push are optional; the rest of the hub works without the worker.
    });
  }, []);
  return null;
}
