export function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

/** `1m 04s` from start to end (or to now, while still going). */
export function duration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = Math.max(0, Math.round(((end ? Date.parse(end) : Date.now()) - Date.parse(start)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function timeout(ms: number): string {
  return ms % 3_600_000 === 0 ? `${ms / 3_600_000}h` : ms % 60_000 === 0 ? `${ms / 60_000}m` : `${ms / 1000}s`;
}
