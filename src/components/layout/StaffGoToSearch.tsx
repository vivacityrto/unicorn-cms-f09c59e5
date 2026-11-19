import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { StaffSection } from "./staffMenu";

/** Opens the go-to search from anywhere (the top bar's search button uses this). */
export const OPEN_STAFF_GO_TO_EVENT = "staff-go-to:open";

/**
 * Go to any page in the staff menu by typing its name: Ctrl + K (or Cmd + K). It lists exactly the pages this person's menu
 * shows, grouped as the menu groups them, so it never offers a page the role cannot open.
 */
export function StaffGoToSearch({ sections }: { sections: readonly StaffSection[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_STAFF_GO_TO_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_STAFF_GO_TO_EVENT, onOpen);
    };
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to a page…" />
      <CommandList>
        <CommandEmpty>No page matches.</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.key} heading={section.title}>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.path} value={`${section.title} ${item.label}`} onSelect={() => go(item.path)}>
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
