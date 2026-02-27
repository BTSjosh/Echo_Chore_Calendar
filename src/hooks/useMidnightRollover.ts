import { useEffect, useRef, useState } from 'react';
import { toDateOnly, DAY_BOUNDARY_HOUR, getLogicalNow } from '../utils/dates';

interface UseMidnightRolloverReturn {
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
}

export default function useMidnightRollover(
  autoPostponeUndone: (today: Date) => void,
  onBeforeRollover?: () => Promise<void>
): UseMidnightRolloverReturn {
  // Initialise with the logical current date (before 4am = still yesterday)
  const [currentDate, setCurrentDate] = useState(() => getLogicalNow());
  const autoPostponeRef = useRef(autoPostponeUndone);
  const onBeforeRolloverRef = useRef(onBeforeRollover);

  // Keep the refs fresh so the timeout/interval closures never go stale
  useEffect(() => {
    autoPostponeRef.current = autoPostponeUndone;
  }, [autoPostponeUndone]);

  useEffect(() => {
    onBeforeRolloverRef.current = onBeforeRollover;
  }, [onBeforeRollover]);

  // Mirror currentDate into a ref so the missed-rollover check always sees
  // the latest value without needing it as a dependency (avoids stale closures).
  const currentDateRef = useRef(currentDate);
  useEffect(() => {
    currentDateRef.current = currentDate;
  }, [currentDate]);

  // Primary mechanism: scheduled setTimeout that fires exactly at 4am.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextRollover = () => {
      const now = new Date();

      // Next DAY_BOUNDARY_HOUR o'clock — if we're already past it today,
      // schedule for tomorrow's boundary.
      const next4am = new Date(now);
      next4am.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
      if (next4am <= now) {
        next4am.setDate(next4am.getDate() + 1);
      }

      // Capture the logical day that is currently "today" (before the rollover).
      // This is what autoPostponeUndone uses to know which day's chores to carry over.
      const prevLogicalDay = toDateOnly(getLogicalNow());

      timeoutId = setTimeout(async () => {
        // Sync from Supabase before creating overdue overrides so we have the
        // latest completion state from all devices. Without this, a device with
        // stale local data would create stale overrides and potentially push
        // them, overwriting completions made on other devices.
        try {
          if (onBeforeRolloverRef.current) await onBeforeRolloverRef.current();
        } catch (e) {
          console.error('Pre-rollover sync failed:', e);
        }
        setCurrentDate(getLogicalNow());
        autoPostponeRef.current(prevLogicalDay);
        // Schedule the next rollover from wall-clock time to avoid drift
        scheduleNextRollover();
      }, next4am.getTime() - now.getTime());
    };

    scheduleNextRollover();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Fallback: catch missed rollovers caused by the browser suspending JS timers
  // (e.g. Echo Show Silk entering deep-sleep mode overnight). Checks every 5 minutes
  // and immediately when the page becomes visible again. If the logical day has
  // advanced past currentDate, fires the same rollover logic as the primary path.
  useEffect(() => {
    const checkForMissedRollover = async () => {
      const logicalNow = getLogicalNow();
      const prevDate = toDateOnly(currentDateRef.current);
      const nowDate = toDateOnly(logicalNow);

      if (nowDate > prevDate) {
        // Update the ref immediately to prevent double-firing if both
        // visibilitychange and the interval happen to fire close together.
        currentDateRef.current = logicalNow;
        // Sync from remote before creating overrides (same as primary path)
        try {
          if (onBeforeRolloverRef.current) await onBeforeRolloverRef.current();
        } catch (e) {
          console.error('Pre-rollover sync failed:', e);
        }
        setCurrentDate(logicalNow);
        autoPostponeRef.current(prevDate);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForMissedRollover();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    const intervalId = setInterval(checkForMissedRollover, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(intervalId);
    };
  }, []);

  return { currentDate, setCurrentDate };
}
