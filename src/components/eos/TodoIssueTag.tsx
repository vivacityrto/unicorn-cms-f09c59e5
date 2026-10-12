interface TodoIssueTagProps {
  /** Title of the IDS issue the to-do was created from, or null/undefined when it was not. */
  issueTitle?: string | null;
}

/** Small tag on a To-Do List row saying which IDS issue the to-do came from. */
export function TodoIssueTag({ issueTitle }: TodoIssueTagProps) {
  const title = issueTitle?.trim();
  if (!title) return null;
  return (
    <span
      className="ml-2 inline-block max-w-[16rem] truncate rounded bg-primary/10 px-1.5 py-0.5 align-bottom text-[10px] font-medium text-primary"
      title={`From IDS: ${title}`}
    >
      From IDS: {title}
    </span>
  );
}
