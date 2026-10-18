const TZ = 'Asia/Kolkata';

export function rupees(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function rupeesShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).toLowerCase();
}

export function dayTime(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const today = todayISO();
  if (day === today) return time(iso);
  if (day === shiftISO(today, -1)) return `yesterday ${time(iso)}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })}, ${time(iso)}`;
}

export function longDate(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
}

export function maskMobile(m: string): string {
  return m.length === 10 ? `${m.slice(0, 2)}xxxxxx${m.slice(8)}` : m;
}
