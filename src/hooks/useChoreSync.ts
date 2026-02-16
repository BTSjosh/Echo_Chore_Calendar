import { useEffect, useRef, useState } from 'react';

import { loadAccessCode } from '../utils/storage';

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ACCESS_CODE,
  syncAccessCodeFromUrl,
  fetchRemoteSnapshot,
} from '../utils/sync';

import type { RemotePayload } from '../types';

export interface UseChoreSyncReturn {
  isReloading: boolean;
  handleReloadData: () => Promise<void>;
}

export default function useChoreSync(
  processRemoteData: (payload: RemotePayload, updated_at: string | null) => boolean
): UseChoreSyncReturn {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);

  // Keep a ref so the polling closure always uses the latest processRemoteData
  const processRef = useRef(processRemoteData);
  useEffect(() => {
    processRef.current = processRemoteData;
  }, [processRemoteData]);

  const lastUpdatedAtRef = useRef(lastUpdatedAt);
  useEffect(() => {
    lastUpdatedAtRef.current = lastUpdatedAt;
  }, [lastUpdatedAt]);

  const checkForUpdates = async (silent = false) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    try {
      const result = await fetchRemoteSnapshot();
      if (!result) return;

      const { payload, updated_at } = result;

      if (
        lastUpdatedAtRef.current &&
        updated_at &&
        new Date(updated_at) <= new Date(lastUpdatedAtRef.current)
      ) {
        if (!silent) console.log('Data is up to date');
        return;
      }

      if (payload) {
        const success = processRef.current(payload, updated_at);
        if (success) {
          setLastUpdatedAt(updated_at);
          if (!silent) console.log('Auto-reloaded new data');
        }
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const handleReloadData = async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      window.alert('Supabase not configured');
      return;
    }

    setIsReloading(true);
    try {
      const result = await fetchRemoteSnapshot();
      if (!result || !result.payload) {
        window.alert('No data found in Supabase');
        setIsReloading(false);
        return;
      }

      const success = processRef.current(result.payload, result.updated_at);
      if (success) {
        setLastUpdatedAt(result.updated_at);
      }
      console.log('Data reloaded successfully');
    } catch (error) {
      console.error('Failed to reload data:', error);
      window.alert('Failed to reload data from cloud');
    } finally {
      setIsReloading(false);
    }
  };

  // Remote sync on mount + visibility/polling
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    syncAccessCodeFromUrl();

    if (ACCESS_CODE) {
      const storedCode = loadAccessCode();
      if (storedCode !== ACCESS_CODE) {
        const isLocalhost =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';
        if (!isLocalhost) {
          return;
        }
      }
    }

    let isActive = true;

    const loadRemote = async () => {
      try {
        const result = await fetchRemoteSnapshot();
        if (!result || !isActive) return;

        const { payload, updated_at } = result;
        if (payload) {
          const success = processRef.current(payload, updated_at);
          if (success) {
            setLastUpdatedAt(updated_at);
          }
        }
      } catch (error) {
        console.error('Failed to load cloud snapshot:', error);
      }
    };

    loadRemote();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdates(true);
      }
    }, 2 * 60 * 1000);

    return () => {
      isActive = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(pollInterval);
    };
  }, []);

  return { isReloading, handleReloadData };
}
