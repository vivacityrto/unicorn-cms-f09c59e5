import { NoteCard } from './NoteCard';
import { DailyNote } from './types';

interface Props {
  results: DailyNote[];
  userId: string;
  onEdit: (note: DailyNote) => void;
  isLoading?: boolean;
  query: string;
}

export function SearchResultsList({ results, userId, onEdit, isLoading, query }: Props) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground text-center py-8">Searching…</div>;
  }
  if (results.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No notes matching “{query}”.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {results.map((n) => (
        <NoteCard key={n.id} note={n} userId={userId} onEdit={onEdit} showDateChip />
      ))}
    </div>
  );
}
