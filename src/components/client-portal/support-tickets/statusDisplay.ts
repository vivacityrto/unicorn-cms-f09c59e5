// Client-facing relabels for internal status codes.
export const CLIENT_STATUS_LABEL: Record<string, string> = {
  new: 'Submitted',
  triaged: 'Under Review',
  in_progress: 'In Progress',
  blocked: 'On Hold',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const CLIENT_STATUS_CLASS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-600',
  triaged: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-purple-50 text-[#7130A0]',
  blocked: 'bg-red-50 text-red-600',
  resolved: 'bg-green-50 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};
