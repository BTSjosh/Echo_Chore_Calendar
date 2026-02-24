import { useEffect, useRef, useState } from 'react';
import { toDateOnly, DAY_BOUNDARY_HOUR, getLogicalNow } from '../utils/dates';

interface UseMidnightRolloverReturn {
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
}

export default function useMidnightRollover(
  autoPostponeUndone: (today: Date) => void
): UseMidnightRolloverReturn {
  // Initialise with the logical current date (before 4am = still yesterday)
  const [currentDate, setCurrentDate] = useState(() => getLogicalNow());
  const autoPostponeRef = useRef(autoPostponeUndone);

  // Keep the ref fresh so the timeout closure never goes stale
  useEffect(() => {
    autoPostponeRef.current = autoPostponeUndone;
  }, [autoPostponeUndone]);

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

      timeoutId = setTimeout(() => {
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
    const checkForMissedRollover = () => {
      const logicalNow = getLogicalNow();
      const prevDate = toDateOnly(currentDateRef.current);
      const nowDate = toDateOnly(logicalNow);

      if (nowDate > prevDate) {
        // Update the ref immediately to prevent double-firing if both
        // visibilitychange and the interval happen to fire close together.
        currentDateRef.current = logicalNow;
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
