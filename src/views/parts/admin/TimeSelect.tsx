// Quarter hours from 06:00 to 22:00, as a list: shows 24-hour times on every phone.
export const TIMES = Array.from({ length: 65 }, (_, i) => {
  const minutes = 6 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** A time of day on the owner's forms. A stored time that is not a quarter hour stays in the list. */
export function TimeSelect({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="field min-w-0">
      <span className="field-label text-xs">{label}</span>
      <select name={name} defaultValue={value} dir="ltr" className="input min-w-0">
        {TIMES.includes(value) ? null : <option value={value}>{value}</option>}
        {TIMES.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>
    </label>
  );
}
