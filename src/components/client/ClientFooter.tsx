import { Link } from "react-router-dom";

const quickLinks = [
  { label: "Documents", path: "/manage-documents" },
  { label: "Calendar", path: "/client/calendar" },
  { label: "Notifications", path: "/client/notifications" },
  { label: "Contact Consultant", path: "#" },
];

export function ClientFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1 – Vivacity */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-secondary">Vivacity</h4>
            <p className="text-sm text-foreground">
              Vivacity Coaching &amp; Consulting Pty Ltd
            </p>
            <p className="text-sm text-muted-foreground">ABN 40 140 059 016</p>
            <p className="text-sm text-muted-foreground">
              Phone:{" "}
              <a
                href="tel:1300729455"
                className="text-foreground hover:text-brand-fuchsia transition-colors"
              >
                1300 729 455
              </a>
            </p>
          </div>

          {/* Column 2 – Quick Links */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-secondary">
              Quick Links
            </h4>
            <ul className="space-y-1.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.path}
                    className="text-sm text-foreground hover:text-brand-fuchsia transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 – Support */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-secondary">Support</h4>
            <p className="text-sm text-muted-foreground">
              Need help? Contact your consultant.
            </p>
            <p className="text-sm text-muted-foreground">
              Email:{" "}
              <a
                href="mailto:support@vivacity.com.au"
                className="text-foreground hover:text-brand-fuchsia transition-colors"
              >
                support@vivacity.com.au
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Gradient accent bar */}
      <div
        className="h-0.5"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--brand-purple)), hsl(var(--brand-fuchsia)))",
        }}
      />

      {/* Copyright */}
      <div className="text-center py-3 text-xs text-muted-foreground">
        © {currentYear} Vivacity Coaching &amp; Consulting Pty Ltd
      </div>
    </footer>
  );
}
