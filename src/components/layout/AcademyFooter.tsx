import { ExternalLink, HelpCircle, FileText, MessageSquare, GraduationCap } from "lucide-react";

export function AcademyFooter() {
  const footerLinks = [
    {
      label: "Help Centre",
      href: "https://help.vivacity.com.au",
      icon: HelpCircle,
    },
    {
      label: "FAQs",
      href: "https://vivacity.com.au/faqs",
      icon: HelpCircle,
    },
    {
      label: "Terms",
      href: "https://vivacity.com.au/terms",
      icon: FileText,
    },
    {
      label: "Privacy",
      href: "https://vivacity.com.au/privacy",
      icon: FileText,
    },
    {
      label: "Support",
      href: "mailto:support@vivacity.com.au",
      icon: MessageSquare,
    },
  ];

  return (
    <footer className="w-full bg-muted/30 border-t py-3 px-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {/* Left: Academy Branding */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded bg-gradient-to-br from-primary to-primary/70">
            <GraduationCap className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground/80">
            Vivacity Academy
          </span>
          <span className="text-muted-foreground/50">|</span>
          <span className="text-muted-foreground">
            © {new Date().getFullYear()} Vivacity Coaching & Consulting
          </span>
        </div>

        {/* Right: Quick Links */}
        <div className="flex items-center gap-4">
          {footerLinks.map((link) => (
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
          ))}
        </div>
      </div>
    </footer>
  );
}
