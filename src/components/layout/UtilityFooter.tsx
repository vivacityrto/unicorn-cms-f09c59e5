import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, HelpCircle, Activity, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UtilityFooterProps {
  activeTenantName?: string | null;
}

export function UtilityFooter({ activeTenantName }: UtilityFooterProps) {
  const { profile } = useAuth();
  const [sessionStartTime, setSessionStartTime] = useState<string>("");

  const userRole = profile?.unicorn_role || "User";

  // Format session start time on mount
  useEffect(() => {
    const now = new Date();
    const formattedTime = now.toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    setSessionStartTime(formattedTime);
  }, []);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "Super Admin":
        return "default";
      case "Team Leader":
        return "secondary";
      case "Team Member":
        return "outline";
      default:
        return "outline";
    }
  };

  const quickLinks = [
    {
      label: "Help Centre",
      href: "https://help.vivacity.com.au",
      icon: HelpCircle,
    },
    {
      label: "System Status",
      href: "https://status.vivacity.com.au",
      icon: Activity,
    },
    {
      label: "Release Notes",
      href: "/suggestions?tab=released",
      icon: FileText,
      internal: true,
    },
  ];

  return (
    <footer className="w-full bg-muted/30 border-t py-2 px-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {/* Left: Tenant & Role Info */}
        <div className="flex items-center gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* shrink-0: without it, flexbox's default shrink behaviour was
                    squeezing this span well below its own max-w-[200px] (even
                    "No tenant selected" truncated to "No ten…" at 1000px with
                    plenty of total footer width free) since it's the only
                    unprotected shrinkable item on this side of the footer. */}
                <span className="font-medium text-foreground/80 truncate max-w-[200px] shrink-0">
                  {activeTenantName || "No tenant selected"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Active tenant context</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground/50">|</span>

          {/* leading-none: text-xs's default line-height (16.8px) overflows the
              h-5 badge's available content box (20px - 2px border - 4px padding
              = 14px), so the pill border visually cut through the text's
              ascenders/descenders. Tightening line-height to 1 (12px) fits it
              cleanly within the fixed height. */}
          <Badge variant={getRoleBadgeVariant(userRole)} className="text-xs h-5 leading-none">
            {userRole}
          </Badge>

          <span className="text-muted-foreground/50">|</span>

          <span className="text-muted-foreground">
            Session started {sessionStartTime}
          </span>
        </div>

        {/* Right: Quick Links */}
        <div className="flex items-center gap-4">
          {quickLinks.map((link) =>
            link.internal ? (
              <Link
                key={link.label}
                to={link.href}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
              >
                <link.icon className="h-3.5 w-3.5" />
                <span>{link.label}</span>
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
              >
                <link.icon className="h-3.5 w-3.5" />
                <span>{link.label}</span>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )
          )}
        </div>
      </div>
    </footer>
  );
}
