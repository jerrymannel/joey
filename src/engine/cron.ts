function matchesField(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const step = part.match(/^(\*|\d+-\d+|\d+)\/(\d+)$/);
    if (step) {
      const [, range, stepStr] = step;
      const start = range === "*" ? 0 : Number(range.split("-")[0]);
      return value >= start && (value - start) % Number(stepStr) === 0;
    }
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) return value >= Number(range[1]) && value <= Number(range[2]);
    return Number(part) === value;
  });
}

/** Standard 5-field cron ("minute hour dayOfMonth month dayOfWeek"), matched to the minute. */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return (
    matchesField(minute, date.getMinutes()) &&
    matchesField(hour, date.getHours()) &&
    matchesField(dayOfMonth, date.getDate()) &&
    matchesField(month, date.getMonth() + 1) &&
    matchesField(dayOfWeek, date.getDay())
  );
}
