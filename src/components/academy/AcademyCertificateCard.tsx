import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Award } from "lucide-react";
import { format } from "date-fns";

interface Props {
  courseTitle: string;
  userName: string;
  certificateNumber: string;
  issuedAt: string | null;
  expiresAt: string | null;
}

export default function AcademyCertificateCard({ courseTitle, userName, certificateNumber, issuedAt, expiresAt }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  const formatDate = (d: string | null) => {
    if (!d) return null;
    try {
      return format(new Date(d), "d MMMM yyyy");
    } catch {
      return d;
    }
  };

  const handleDownload = () => {
    if (!cardRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Certificate - ${courseTitle}</title>
        <style>
          @page { size: A4 landscape; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { width: 297mm; height: 210mm; font-family: system-ui, -apple-system, sans-serif; }
          .cert { width: 100%; height: 100%; display: flex; flex-direction: column; }
          .header { background: linear-gradient(135deg, #7130A0, #ed1878); padding: 40px 60px; display: flex; align-items: center; justify-content: space-between; }
          .header h1 { color: white; font-size: 28px; font-weight: 700; letter-spacing: 2px; }
          .header .logo { color: white; font-size: 16px; opacity: 0.9; }
          .body { flex: 1; padding: 50px 60px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 24px; }
          .label { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 3px; }
          .name { font-size: 36px; font-weight: 700; color: #44235F; }
          .course { font-size: 22px; color: #7130A0; font-weight: 600; }
          .cert-num { display: inline-block; background: #f9cb0c; color: #44235F; padding: 6px 20px; border-radius: 20px; font-size: 13px; font-weight: 700; }
          .dates { font-size: 13px; color: #888; }
          .footer { background: #44235F; padding: 16px 60px; display: flex; justify-content: space-between; align-items: center; }
          .footer span { color: white; font-size: 12px; opacity: 0.8; }
        </style>
      </head>
      <body>
        <div class="cert">
          <div class="header">
            <h1>CERTIFICATE OF COMPLETION</h1>
            <div class="logo">Vivacity Academy</div>
          </div>
          <div class="body">
            <div class="label">This certifies that</div>
            <div class="name">${userName}</div>
            <div class="label">has successfully completed</div>
            <div class="course">${courseTitle}</div>
            <div class="cert-num">${certificateNumber}</div>
            <div class="dates">
              ${issuedAt ? `Issued: ${formatDate(issuedAt)}` : ""}
              ${expiresAt ? ` · Expires: ${formatDate(expiresAt)}` : ""}
            </div>
          </div>
          <div class="footer">
            <span>Vivacity Coaching & Consulting</span>
            <span>rto.complyhub.ai</span>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <div ref={cardRef} className="rounded-xl overflow-hidden border" style={{ borderColor: "hsl(var(--border))" }}>
      {/* Gradient header */}
      <div className="px-6 py-5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #7130A0, #ed1878)" }}>
        <div className="flex items-center gap-3">
          <Award className="h-6 w-6 text-white" />
          <span className="text-white font-bold text-lg tracking-wide">CERTIFICATE</span>
        </div>
        <span className="text-white/80 text-sm">Vivacity Academy</span>
      </div>

      {/* Body */}
      <div className="p-6 space-y-4 text-center" style={{ background: "hsl(var(--card))" }}>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">This certifies that</p>
        <p className="text-2xl font-bold" style={{ color: "#44235F" }}>{userName}</p>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">has successfully completed</p>
        <p className="text-lg font-semibold" style={{ color: "#7130A0" }}>{courseTitle}</p>

        <div className="inline-block px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: "#f9cb0c", color: "#44235F" }}>
          {certificateNumber}
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          {issuedAt && <span>Issued: {formatDate(issuedAt)}</span>}
          {expiresAt && <span>Expires: {formatDate(expiresAt)}</span>}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 flex items-center justify-between" style={{ background: "#44235F" }}>
        <span className="text-white/80 text-xs">Vivacity Coaching & Consulting</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDownload}
          className="text-white hover:text-white hover:bg-white/10 text-xs"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF
        </Button>
      </div>
    </div>
  );
}
