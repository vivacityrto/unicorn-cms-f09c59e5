import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Download, Calendar } from "lucide-react";

const certificates = [
  {
    id: 1,
    title: "RTO Compliance Fundamentals",
    issuedDate: "2024-01-15",
    expiryDate: "2027-01-15",
    credentialId: "VIV-RCF-2024-001",
  },
  {
    id: 2,
    title: "Student Management Essentials",
    issuedDate: "2024-02-20",
    expiryDate: "2027-02-20",
    credentialId: "VIV-SME-2024-002",
  },
  {
    id: 3,
    title: "Quality Management Systems",
    issuedDate: "2023-11-10",
    expiryDate: "2026-11-10",
    credentialId: "VIV-QMS-2023-003",
  },
];

const AcademyCertificates = () => {
  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificates</h1>
          <p className="text-muted-foreground">View and download your earned certificates</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Certificates</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{certificates.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Award className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{certificates.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
              <Calendar className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
            </CardContent>
          </Card>
        </div>

        {/* Certificates List */}
        <div className="space-y-4">
          {certificates.map((cert) => (
            <Card key={cert.id}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Award className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{cert.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Credential ID: {cert.credentialId}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span>Issued: {new Date(cert.issuedDate).toLocaleDateString()}</span>
                    <span>Expires: {new Date(cert.expiryDate).toLocaleDateString()}</span>
                  </div>
                </div>
                <Badge variant="secondary">Active</Badge>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AcademyLayout>
  );
};

export default AcademyCertificates;
