// Deterministic name -> colour mapping for Outlook category chips.
//
// Microsoft's real category colour (the one shown in Outlook itself) is only
// available via the MailboxSettings.Read scope, which this app doesn't
// request (adding it would force every already-connected user to reconnect
// once — see docs/audit-log for the reconnect-churn fix this trades off
// against). Instead, the same category name always renders the same colour
// in-app, which is enough for scanability even though it won't always match
// the exact shade in the user's real mailbox.
const PALETTE = [
  "bg-red-100 text-red-700 border-red-200",
  "bg-orange-100 text-orange-700 border-orange-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-yellow-100 text-yellow-700 border-yellow-200",
  "bg-lime-100 text-lime-700 border-lime-200",
  "bg-green-100 text-green-700 border-green-200",
  "bg-teal-100 text-teal-700 border-teal-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "bg-purple-100 text-purple-700 border-purple-200",
  "bg-pink-100 text-pink-700 border-pink-200",
] as const;

export function categoryColorClass(categoryName: string): string {
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = (hash * 31 + categoryName.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}
