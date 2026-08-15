export function addOperationalDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isInsideOperationalWindow(eventDate: string, todayInSantiago: string, days = 15) {
  return Boolean(eventDate) && eventDate >= todayInSantiago && eventDate <= addOperationalDays(todayInSantiago, days);
}
