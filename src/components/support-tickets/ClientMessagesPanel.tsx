import { useMemo, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
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

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:min-h-[600px]">
        <div className="min-w-0">
          <AdminHelpThreadsList
            rows={rows}
            isLoading={isLoading}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="hidden lg:block">
          {selected ? (
            <AdminHelpThreadDetail thread={selected} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400 border-l border-gray-200 bg-white">
              Select a thread to view messages
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
      >
        <SheetContent side="right" className="p-0 w-full sm:max-w-lg lg:hidden">
          {selected && (
            <AdminHelpThreadDetail thread={selected} onClose={() => setSelectedId(null)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
