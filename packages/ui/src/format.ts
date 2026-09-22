export { formatGel } from '@madart/domain';

const TZ = 'Asia/Tbilisi';

export function formatTime(iso: string | Date | null | undefined, timeZone = TZ): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ka-GE', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function formatDateTime(iso: string | Date | null | undefined, timeZone = TZ): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ka-GE', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** "+3 წთ" / "-12 წთ" style relative minutes. */
export function minutesBetween(from: Date | string, to: Date | string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}

export function formatMinutes(min: number): string {
  const abs = Math.abs(min);
  if (abs < 60) return `${min} წთ`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${min < 0 ? '-' : ''}${h} სთ${m ? ` ${m} წთ` : ''}`;
}

export function formatCountdown(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${sign}${m}:${s.toString().padStart(2, '0')}`;
}
