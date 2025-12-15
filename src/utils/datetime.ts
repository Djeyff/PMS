export function formatDateTimeInTZ(iso: string, timeZone: string | null | undefined) {
  const tz = timeZone && timeZone.trim() !== "" ? timeZone : "UTC";
  // If iso is not a full ISO datetime, construct a Date; show date + time
  const date = new Date(iso);
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt.format(date);
}