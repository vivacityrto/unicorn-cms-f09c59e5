import { Link } from "react-router-dom";
import { useHelpCenter } from "@/components/help-center";
import { useOpenDocumentRequest } from "@/components/layout/ClientLayout";

export function ClientFooter() {
  const currentYear = new Date().getFullYear();
  const { openHelpCenter } = useHelpCenter();
  const openDocumentRequest = useOpenDocumentRequest();

  return (
    <footer className="w-full" style={{ backgroundColor: "hsl(270 47% 26%)" }}>
      {/* Gradient strip top */}
      <div
        className="h-1"
        style={{
          background: "linear-gradient(90deg, hsl(270 55% 41%), hsl(330 86% 51%))",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Column 1 – Vivacity */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white/80">Vivacity</h4>
            <p className="text-sm text-white">
              Vivacity Coaching &amp; Consulting Pty Ltd
            </p>
            <p className="text-sm text-white/70">ABN 40 140 059 016</p>
            <p className="text-sm text-white/70">
              Phone:{" "}
              <a
                href="tel:1300729455"
                className="text-white hover:text-white/90 transition-colors"
              >
                1300 729 455
              </a>
            </p>
            <p className="text-sm text-white/70">
              Support:{" "}
              <span className="text-white/90">support@vivacity.com.au</span>
            </p>
          </div>

          {/* Column 2 – Get Help */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white/80">Get Help</h4>
            <ul className="space-y-1.5">
              <li>
                <button
                  onClick={() => openHelpCenter("chatbot")}
                  className="text-sm text-white hover:text-white/80 transition-colors"
                >
                  Ask the chatbot
                </button>
              </li>
              <li>
                <button
                  onClick={() => openDocumentRequest()}
                  className="text-sm text-white hover:text-white/80 transition-colors"
                >
                  Message your CSC
                </button>
              </li>
              <li>
                <button
                  onClick={() => openHelpCenter("support")}
                  className="text-sm text-white hover:text-white/80 transition-colors"
                >
                  Contact support
                </button>
              </li>
            </ul>
            <p className="text-xs text-white/50 mt-2">
              Messages are saved to your account.
            </p>
          </div>

          {/* Column 3 – Quick Links */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white/80">Quick Links</h4>
            <ul className="space-y-1.5">
              <li>
                <Link
                  to="/client/documents"
                  className="text-sm text-white hover:text-white/80 transition-colors"
                >
                  Documents
                </Link>
              </li>
              <li>
                <Link
                  to="/client/calendar"
                  className="text-sm text-white hover:text-white/80 transition-colors"
                >
                  Calendar
                </Link>
              </li>
              <li>
                <Link
                  to="/client/notifications"
                  className="text-sm text-white hover:text-white/80 transition-colors"
                >
                  Notifications
                </Link>
              </li>
              <li>
                <Link
                  to="/client/resource-hub"
                  className="text-sm text-white hover:text-white/80 transition-colors"
                >
                  Resource Hub
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="text-center py-3 text-xs text-white/50 border-t border-white/10">
        © {currentYear} Vivacity Coaching &amp; Consulting Pty Ltd
      </div>
    </footer>
  );
}
