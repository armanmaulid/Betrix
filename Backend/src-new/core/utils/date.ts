export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function parseDate(str: string): Date | null {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function secondsUntilBrokerMidnight(utcOffset = 3): number {
  const now = new Date();
  const brokerTime = new Date(now.getTime() + utcOffset * 3600 * 1000);
  const tomorrow = new Date(brokerTime);
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const diffMs = tomorrow.getTime() - brokerTime.getTime();
  return Math.ceil(diffMs / 1000);
}