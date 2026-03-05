const MINUTE = 60_000;

export const localDayStart = (day: string, tzOffset: number) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() + tzOffset * MINUTE);

export const localDayEnd = (day: string, tzOffset: number) => {
  const start = localDayStart(day, tzOffset);

  start.setUTCDate(start.getUTCDate() + 1);

  return start;
};

export const localDayOf = (instant: Date, tzOffset: number) =>
  new Date(instant.getTime() - tzOffset * MINUTE).toISOString().slice(0, 10);

export const localMonthStart = (instant: Date, tzOffset: number) =>
  localDayStart(`${localDayOf(instant, tzOffset).slice(0, 7)}-01`, tzOffset);
