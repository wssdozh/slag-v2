// One calendar-day signal for the workspace, independent of task writes.
import { useEffect, useState } from 'react';
import { getISODateString, getTodayIso } from '../../lib/time/dateUtils';

export function useLocalDay(): string {
  const [day, setDay] = useState(getTodayIso);

  useEffect(() => {
    let timer: number;
    const schedule = (now: Date) => {
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(update, Math.max(1, midnight.getTime() - now.getTime()));
    };
    const update = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setDay(getISODateString(now));
      schedule(now);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    schedule(new Date());
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', update);
    };
  }, []);

  return day;
}
