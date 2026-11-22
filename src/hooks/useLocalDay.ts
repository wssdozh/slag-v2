// Tracks the device's calendar date at midnight and after a suspended window wakes.
import { useEffect, useState } from 'react';
import { getTodayIso } from '../lib/time/dateUtils';

export function useLocalDay(): string {
  const [today, setToday] = useState(getTodayIso);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    };
    const refresh = () => {
      setToday(getTodayIso());
      schedule();
    };
    schedule();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}
