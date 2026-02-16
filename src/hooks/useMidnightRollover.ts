import { useEffect, useRef, useState } from 'react';

interface UseMidnightRolloverReturn {
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
}

export default function useMidnightRollover(
  autoPostponeUndone: (today: Date) => void
): UseMidnightRolloverReturn {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const autoPostponeRef = useRef(autoPostponeUndone);

  // Keep the ref fresh so the timeout closure never goes stale
  useEffect(() => {
    autoPostponeRef.current = autoPostponeUndone;
  }, [autoPostponeUndone]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);

    const timeoutId = setTimeout(() => {
      setCurrentDate(new Date());
      intervalId = setInterval(() => setCurrentDate(new Date()), 24 * 60 * 60 * 1000);
      autoPostponeRef.current(now);
    }, nextMidnight.getTime() - now.getTime());

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return { currentDate, setCurrentDate };
}
