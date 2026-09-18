"use client";

const PRESETS: { label: string; value: string }[] = [
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every weekday at 9am", value: "0 9 * * 1-5" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Best-effort plain-English description of a 5-field cron expression — not exhaustive, falls back to the raw value. */
function describeCron(expr: string): string | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (dayOfMonth !== "*" || month !== "*") return null;

  const stepMatch = minute.match(/^\*\/(\d+)$/);
  if (stepMatch && hour === "*" && dayOfWeek === "*") return `Every ${stepMatch[1]} minutes`;

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    if (dayOfWeek === "*") return `Every day at ${time}`;
    if (dayOfWeek === "1-5") return `Every weekday at ${time}`;
    const days = dayOfWeek.split(",").map((d) => WEEKDAYS[Number(d)] ?? d);
    if (days.every(Boolean)) return `Every ${days.join(", ")} at ${time}`;
  }

  if (minute === "*" && hour === "*" && dayOfWeek === "*") return "Every minute";
  return null;
}

export default function CronScheduleInput({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const description = value ? describeCron(value) : null;

  return (
    <div className="field">
      <label htmlFor={id}>Schedule (5-field cron, blank = manual only)</label>
      <div className="row">
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="0 9 * * *" style={{ flex: 1 }} />
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        >
          <option value="">Presets…</option>
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {value && <p className="muted">{description ?? "Custom schedule"}</p>}
    </div>
  );
}
