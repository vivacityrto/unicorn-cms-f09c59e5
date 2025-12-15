import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, FileText, Calendar, User, Mail, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CreateEmailDialog from "@/components/CreateEmailDialog";
type EmailRow = {
  id: number;
  name: string | null;
  description: string | null;
  to: string | null;
  subject: string | null;
  content: string | null;
  order_number: number;
  package_id: number | null;
  automation_enabled: boolean | null;
  created_by: string | null;
  created_at: string | null;
  files: string[] | null;
  creator_name?: string | null;
};
export default function ManageEmails() {
  const {
    toast
  } = useToast();
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<EmailRow | null>(null);
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const fetchEmails = async () => {
    try {
      setLoading(true);
      const {
        data,
        error
      } = await supabase.from("emails").select("*").order("created_at", {
        ascending: false
      });
      if (error) throw error;
      const emailsData = data as EmailRow[] || [];
      const creatorIds = emailsData.map(e => e.created_by).filter(Boolean) as string[];
      if (creatorIds.length > 0) {
        const {
          data: usersData
        } = await supabase.from("users").select("user_uuid, first_name, last_name").in("user_uuid", creatorIds);
        const userNameMap = (usersData || []).reduce((acc, user) => {
          acc[user.user_uuid] = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
          return acc;
        }, {} as Record<string, string>);
        emailsData.forEach(email => {
          if (email.created_by) {
            email.creator_name = userNameMap[email.created_by] || 'Unknown';
          }
        });
      }
      setEmails(emailsData);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message ?? "Failed to load emails",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchEmails();
  }, []);
  const handleDelete = async () => {
    if (!selectedEmailId) return;
    try {
      const {
        error
      } = await supabase.from("emails").delete().eq("id", selectedEmailId);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Email deleted successfully"
      });
      setDeleteDialogOpen(false);
      setSelectedEmailId(null);
      fetchEmails();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message ?? "Failed to delete email",
        variant: "destructive"
      });
    }
  };
  const handleViewFile = (filePath: string) => {
    const {
      data
    } = supabase.storage.from("email-files").getPublicUrl(filePath);
    window.open(data.publicUrl, "_blank");
  };
  const filteredEmails = emails.filter(email => {
    const matchesSearch = email.name?.toLowerCase().includes(searchTerm.toLowerCase()) || email.subject?.toLowerCase().includes(searchTerm.toLowerCase()) || email.description?.toLowerCase().includes(searchTerm.toLowerCase()) || email.creator_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).replace(/\//g, "/");
  };
  if (loading) {
    return <div className="flex flex-col h-full animate-fade-in">
        <div className="flex-shrink-0 p-6 space-y-6 border-b bg-background">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-12 w-full max-w-md" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>;
  }
  return <div className="flex flex-col h-full animate-fade-in">
      {/* Sticky Header */}
      <div className="flex-shrink-0 p-6 space-y-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold">Manage Emails</h1>
            <p className="text-muted-foreground">View and manage all system emails</p>
          </div>
          <Button onClick={() => {
          setEditingEmail(null);
          setCreateDialogOpen(true);
        }} className="gap-2">
            <Plus className="h-4 w-4" />
            Create New Email
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, subject, or creator..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-11 bg-background border-border" />
        </div>
      </div>

      {/* Scrollable Table Content */}
      <div className="flex-1 overflow-auto p-6">
        {filteredEmails.length === 0 ? <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No emails found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search or create a new email</p>
            </CardContent>
          </Card> : <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                  <TableHead className="font-semibold text-foreground border-r border-border">Name</TableHead>
                  <TableHead className="font-semibold text-foreground border-r border-border">Description</TableHead>
                  <TableHead className="font-semibold text-foreground border-r border-border">To</TableHead>
                  <TableHead className="font-semibold text-foreground border-r border-border">Subject</TableHead>
                  <TableHead className="font-semibold text-foreground border-r border-border">Files</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmails.map(email => <TableRow key={email.id} className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => {
              setEditingEmail(email);
              setCreateDialogOpen(true);
            }}>
                    {/* Name Column */}
                    <TableCell className="py-4 border-r border-border">
                      <span className="text-sm font-medium text-foreground">
                        {email.name || "Untitled"}
                      </span>
                    </TableCell>

                    {/* Description Column */}
                    <TableCell className="py-4 border-r border-border">
                      <span className="text-sm text-foreground line-clamp-2">
                        {email.description || "-"}
                      </span>
                    </TableCell>

                    {/* To Column */}
                    <TableCell className="py-4 border-r border-border">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {email.to || "Client"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Subject Column */}
                    <TableCell className="py-4 border-r border-border">
                      <span className="text-sm text-foreground font-medium">
                        {email.subject || "-"}
                      </span>
                    </TableCell>

                    {/* Files Column */}
                    <TableCell className="py-4 border-r border-border" onClick={e => e.stopPropagation()}>
                      {email.files && email.files.length > 0 ? (
                        <Badge 
                          className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] font-medium cursor-pointer"
                          onClick={() => {
                            if (email.files!.length === 1) {
                              handleViewFile(email.files![0]);
                            } else {
                              setSelectedFiles(email.files!);
                              setFilesDialogOpen(true);
                            }
                          }}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          {email.files.length} {email.files.length === 1 ? 'File' : 'Files'}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Actions Column */}
                    <TableCell className="text-right py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => {
                    setEditingEmail(email);
                    setCreateDialogOpen(true);
                  }} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                    setSelectedEmailId(email.id);
                    setDeleteDialogOpen(true);
                  }} className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </div>}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Email</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this email? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Email Dialog */}
      <CreateEmailDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} editingEmail={editingEmail} onSuccess={() => {
      fetchEmails();
      setEditingEmail(null);
    }} totalEmails={emails.length} />

      {/* Files Dialog */}
      <Dialog open={filesDialogOpen} onOpenChange={setFilesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email Attachments</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {selectedFiles.map((filePath, index) => {
              const fileName = filePath.split('/').pop() || `File ${index + 1}`;
              return (
                <Button
                  key={filePath}
                  variant="outline"
                  className="w-full justify-start gap-2 h-auto py-3"
                  onClick={() => handleViewFile(filePath)}
                >
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="truncate text-left">{fileName}</span>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}