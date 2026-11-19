const sydneyTime = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatBroadcastSchedule(value: string): string {
  return `${sydneyTime.format(new Date(value))} Sydney time`;
}
