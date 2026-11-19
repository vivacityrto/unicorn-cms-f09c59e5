import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Menu, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RailTip } from "./sidebarKit";
import { sectionForPath, type StaffMenuItem, type StaffSection, type StaffSectionKey } from "./staffMenu";

interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sections: readonly StaffSection[];
  pathname: string;
  /** The person's role in full ("Client Success Champion"). */
  roleName: string;
  /** Shown under the header when a staff member is looking at the portal as a client. */
  isViewingAsClient?: boolean;
}

const CYAN = "hsl(189 74% 50%)";

function Badge({ count }: { count: number }) {
  return (
    <span className="ml-auto min-w-[18px] rounded-full bg-[#ED1878] px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** One page in the menu, drawn like the client portal's: a rounded row, a cyan edge and icon where you are. */
function NavLink({ item, active, nested, onNavigate }: { item: StaffMenuItem; active: boolean; nested?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      data-active={active}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative mb-1 flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm transition-colors",
        nested ? "ml-1 mr-2" : "mx-2",
        active ? "bg-white/15 font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {active && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full" style={{ backgroundColor: CYAN }} />}
      <Icon className="h-[18px] w-[18px] flex-shrink-0" style={{ color: active ? CYAN : "currentColor" }} aria-hidden />
      <span className="leading-snug">{item.label}</span>
      {item.badge ? <Badge count={item.badge} /> : null}
    </Link>
  );
}

/** A group while the sidebar is open: a row that opens to show its pages, indented under a thin guide line. */
function OpenSection({ section, open, onOpenChange, pathname }: { section: StaffSection; open: boolean; onOpenChange: (open: boolean) => void; pathname: string }) {
  const Icon = section.icon;
  const here = section.items.some((i) => i.path === pathname);
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="mb-1">
      <CollapsibleTrigger
        className={cn(
          "group mx-2 flex min-h-[44px] w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
          here && !open ? "text-white" : "text-white/85",
        )}
      >
        <Icon className="h-[18px] w-[18px] flex-shrink-0" style={{ color: here ? CYAN : "currentColor" }} aria-hidden />
        <span className="font-medium">{section.title}</span>
        {section.alert && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#ED1878] ring-2 ring-white/70" aria-label={`${section.title} has items that need you`} />}
        <ChevronRight aria-hidden className={cn("ml-auto h-4 w-4 flex-shrink-0 text-white/60 transition-transform duration-200", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-[1.45rem] mt-1 border-l border-white/20 pb-1 pl-1">
          {section.items.map((item) => (
            <NavLink key={item.path} item={item} active={pathname === item.path} nested />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A group while the sidebar is collapsed to icons: one icon for the group (so every page stays reachable), and pressing it
 * opens a panel beside the rail listing the group's pages. Works from the keyboard and on touch; the label floats on hover.
 */
function RailSection({ section, pathname }: { section: StaffSection; pathname: string }) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(false);
  const Icon = section.icon;
  const here = section.items.some((i) => i.path === pathname);
  const total = section.items.reduce((n, i) => n + (i.badge ?? 0), 0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip open={tip && !open} onOpenChange={setTip}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${section.title}, ${section.items.length} pages`}
              className={cn(
                "relative mx-2 mb-1 flex min-h-[44px] w-[calc(100%-1rem)] items-center justify-center rounded-lg transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                here ? "bg-white/15 text-white" : "text-white/80",
              )}
            >
              {here && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full" style={{ backgroundColor: CYAN }} />}
              <Icon className="h-[18px] w-[18px]" style={{ color: here ? CYAN : "currentColor" }} aria-hidden />
              {(section.alert || total > 0) && <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#ED1878] ring-2 ring-[hsl(300_70%_45%)]" />}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="max-w-[16rem] rounded-xl border-border bg-popover px-3 py-2 shadow-lg">
          <p className="text-[13px] font-semibold leading-tight text-foreground">{section.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">Press to see its {section.items.length} pages</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" sideOffset={12} className="w-64 rounded-xl p-1.5">
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
        <ul className="max-h-[70vh] overflow-y-auto">
          {section.items.map((item) => {
            const ItemIcon = item.icon;
            const active = pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-primary/10 font-semibold text-primary" : "text-foreground",
                  )}
                >
                  <ItemIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? <Badge count={item.badge} /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The staff sidebar: the same look as the client portal's (shared gradient, rounded rows, cyan edge, a thin rail when
 * collapsed), keeping the staff menu's groups and pages in the order people already know. Open, each group opens in place;
 * collapsed, each group is an icon that opens its pages beside the rail. The group you are in opens by itself.
 */
export function StaffSidebar({ sidebarOpen, setSidebarOpen, sections, pathname, roleName, isViewingAsClient }: Props) {
  const navRef = useRef<HTMLElement>(null);
  const [openKeys, setOpenKeys] = useState<ReadonlySet<StaffSectionKey>>(() => {
    const here = sectionForPath(sections, pathname);
    return new Set(here ? [here] : []);
  });

  // Moving to a page in a group that is shut opens that group, and brings the page into view.
  useEffect(() => {
    const here = sectionForPath(sections, pathname);
    if (here) setOpenKeys((prev) => (prev.has(here) ? prev : new Set(prev).add(here)));
  }, [pathname, sections]);

  useLayoutEffect(() => {
    const active = navRef.current?.querySelector('[data-active="true"]');
    if (active) requestAnimationFrame(() => (active as HTMLElement).scrollIntoView?.({ block: "center", behavior: "instant" as ScrollBehavior }));
  }, [pathname, sidebarOpen]);

  const setOpen = (key: StaffSectionKey, open: boolean) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex items-center justify-between border-b border-white/15 px-3 pb-3 pt-4">
        {sidebarOpen ? (
          <>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wider text-white/60">Staff Portal</span>
              <span className="max-w-[160px] truncate text-sm font-semibold text-white" title={roleName}>{roleName}</span>
              {isViewingAsClient && (
                <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                  <span className="keep-light h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  Client view
                </span>
              )}
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Collapse the menu" className="rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <RailTip show label="Open the menu" description="Show the full menu with names">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Expand the menu" className="mx-auto rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <Menu className="h-5 w-5" />
            </button>
          </RailTip>
        )}
      </div>

      <nav ref={navRef} aria-label="Staff menu" className="scrollbar-hide flex-1 overflow-y-auto py-3">
        {sections.map((section) =>
          sidebarOpen ? (
            <OpenSection key={section.key} section={section} open={openKeys.has(section.key)} onOpenChange={(o) => setOpen(section.key, o)} pathname={pathname} />
          ) : (
            <RailSection key={section.key} section={section} pathname={pathname} />
          ),
        )}
      </nav>
    </TooltipProvider>
  );
}
