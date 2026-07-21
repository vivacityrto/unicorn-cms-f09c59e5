import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminHelpThreads } from './useAdminHelpThreads';
import { AdminHelpThreadsList } from './AdminHelpThreadsList';
import { AdminHelpThreadDetail } from './AdminHelpThreadDetail';

export function ClientMessagesPanel() {
  const { data: rows = [], isLoading } = useAdminHelpThreads();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const splitOpen = !!selected;

  return (
    <div
      className={cn(
        'grid transition-[grid-template-columns] duration-200 bg-white',
        // Full-width list when nothing selected, split when a thread is open.
        splitOpen ? 'lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]' : 'grid-cols-1',
        'min-h-[70vh]',
      )}
    >
      <div className={cn('min-w-0 border-r border-gray-200', splitOpen ? '' : 'border-r-0')}>
        <AdminHelpThreadsList
          rows={rows}
          isLoading={isLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          compact={splitOpen}
        />
      </div>

      {splitOpen && selected && (
        <div className="min-w-0 hidden lg:block">
          <AdminHelpThreadDetail
            thread={selected}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* Mobile drawer: on <lg the detail replaces the list */}
      {splitOpen && selected && (
        <div className="lg:hidden fixed inset-0 z-40 bg-white flex flex-col">
          <AdminHelpThreadDetail
            thread={selected}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* Empty placeholder only for wide screens when there are threads but none selected */}
      {!splitOpen && !isLoading && rows.length === 0 && (
        <div className="hidden">
          <Inbox />
        </div>
      )}
    </div>
  );
}
