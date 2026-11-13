import { useCallback, useEffect, useRef, useState } from 'react';
import { account, ApiError } from '../services/account';
import { hasUnsynced as hasUnsyncedChanges, markUnsynced, type LocalShopData } from '../lib/storage';

export type SyncStatus = 'off' | 'saved' | 'saving' | 'pending' | 'offline' | 'error';

/** Big photos stay on this phone only; the server keeps the scan results and small thumbnails. */
const MAX_SYNCED_IMAGE_CHARS = 80_000;

function forServer(d: LocalShopData): LocalShopData {
  return {
    ...d,
    scans: d.scans.map((s) => (s.image_ref.length > MAX_SYNCED_IMAGE_CHARS ? { ...s, image_ref: '' } : s)),
  };
}

/**
 * Saves the shop's khata to the server a moment after every change (logged-in shops only).
 * The browser keeps working offline; the next change or a retry uploads everything again.
 */
export function useShopSync(enabled: boolean, data: LocalShopData) {
  const [status, setStatus] = useState<SyncStatus>(enabled ? 'saved' : 'off');
  const latest = useRef(data);
  const timer = useRef<number | null>(null);
  const first = useRef(true);
  latest.current = data;

  const save = useCallback(async () => {
    if (!enabled) return;
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // No signal: everything is already saved on the phone; it goes up when the network is back.
      setStatus('offline');
      return;
    }
    setStatus('saving');
    try {
      await account.saveData(forServer(latest.current));
      markUnsynced(false);
      setStatus('saved');
    } catch (err) {
      setStatus(err instanceof ApiError && err.status === 0 ? 'offline' : 'error');
      if (err instanceof ApiError && err.status === 401) {
        // Session expired or account suspended: go back to the login screen.
        window.location.reload();
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      // Data was just loaded from the server: nothing to save, unless offline changes are still waiting.
      if (hasUnsyncedChanges()) timer.current = window.setTimeout(save, 500);
      return;
    }
    markUnsynced(true);
    setStatus(navigator.onLine === false ? 'offline' : 'pending');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 1200);
  }, [enabled, save, data.profile, data.customers, data.transactions, data.reminders, data.catalog, data.scans, data.reorder, data.leads, data.templates, data.scheduled]);

  // While offline or failing, retry every 30 seconds as well.
  useEffect(() => {
    if (!enabled || (status !== 'offline' && status !== 'error')) return;
    const id = window.setInterval(save, 30_000);
    return () => window.clearInterval(id);
  }, [enabled, status, save]);

  // Retry when the phone comes back online.
  useEffect(() => {
    if (!enabled) return;
    const onOnline = () => save();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [enabled, save]);

  const flush = useCallback(async () => {
    if (enabled && (timer.current || status === 'pending' || status === 'error' || status === 'offline')) await save();
  }, [enabled, save, status]);

  return { status, flush, retry: save };
}
