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

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
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

    const timeoutId = setTimeout(() => {
      setCurrentDate(getLogicalNow());
      autoPostponeRef.current(prevLogicalDay);

      intervalId = setInterval(() => {
        const logicalNow = getLogicalNow();
        setCurrentDate(logicalNow);
        // The day that just ended is 24h before the new logical now
        const justEnded = toDateOnly(new Date(logicalNow.getTime() - 24 * 60 * 60 * 1000));
        autoPostponeRef.current(justEnded);
      }, 24 * 60 * 60 * 1000);
    }, next4am.getTime() - now.getTime());

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return { currentDate, setCurrentDate };
}
