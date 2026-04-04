import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, ChevronRight } from "lucide-react";

interface AcademyPageWrapperProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  accentColour?: string;
  children: ReactNode;
}

export default function AcademyPageWrapper({
  title,
  subtitle,
  icon,
  accentColour = "#23c0dd",
  children,
}: AcademyPageWrapperProps) {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link
          to="/academy"
          className="hover:opacity-80 transition-opacity flex items-center gap-1 font-medium"
          style={{ color: "#ed1878" }}
        >
          <GraduationCap className="h-3.5 w-3.5" />
          Vivacity Academy
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium" style={{ color: "#44235F" }}>
          {title}
        </span>
      </nav>

      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span style={{ color: accentColour }}>{icon}</span>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        </div>
        <p className="text-muted-foreground">{subtitle}</p>
        {/* Accent bar */}
        <div
          className="h-[3px] w-full mt-3 rounded-full"
          style={{
            background: "linear-gradient(to right, #7130A0, #ed1878)",
          }}
        />
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
