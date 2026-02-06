import { useState } from 'react';
import { usePortalDocuments, useShareDocument, useUnshareDocument, useDownloadPortalDocument, useSoftDeleteDocument, PortalDocument } from '@/hooks/usePortalDocuments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Download, Eye, EyeOff, Trash2, FileText, Calendar, User, Package, Tag } from 'lucide-react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface SharedDocumentsTabProps {
  tenantId: number;
  isClientView?: boolean;
}

export function SharedDocumentsTab({ tenantId, isClientView = false }: SharedDocumentsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDoc, setDeleteDoc] = useState<PortalDocument | null>(null);

  // For client view, only show client-visible docs from Vivacity
  // For staff view, show all Vivacity→Client docs
  const { data: documents = [], isLoading } = usePortalDocuments(tenantId, 'vivacity_to_client');
  
  const shareDoc = useShareDocument();
  const unshareDoc = useUnshareDocument();
  const downloadDoc = useDownloadPortalDocument();
  const softDelete = useSoftDeleteDocument();

  // Filter for client view: only visible docs
  const filteredDocs = documents
    .filter(doc => isClientView ? doc.is_client_visible : true)
    .filter(doc => 
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.category_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const handleDownload = (doc: PortalDocument) => {
    downloadDoc.mutate({ doc, tenantId });
  };

  const handleToggleVisibility = (doc: PortalDocument) => {
    if (doc.is_client_visible) {
      unshareDoc.mutate({ docId: doc.id, tenantId });
    } else {
      shareDoc.mutate({ docId: doc.id, tenantId });
    }
  };

  const handleDelete = () => {
    if (deleteDoc) {
      softDelete.mutate({ docId: deleteDoc.id, tenantId });
      setDeleteDoc(null);
    }
  };

  const getStatusBadge = (doc: PortalDocument) => {
    if (doc.is_client_visible) {
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500">Shared</Badge>;
    }
    return <Badge variant="outline" className="bg-muted text-muted-foreground">Draft</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Documents Table */}
      {filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No documents found</p>
            <p className="text-sm mt-1">
              {isClientView 
                ? 'Documents shared by Vivacity will appear here.'
                : 'Upload documents to share with this client.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Package</TableHead>
                {!isClientView && <TableHead>Status</TableHead>}
                <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocs.map((doc) => (
                <TableRow key={doc.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{doc.file_name}</p>
                        {doc.uploader_name && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {doc.uploader_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {doc.category_name ? (
                      <Badge variant="secondary" className="gap-1">
                        <Tag className="h-3 w-3" />
                        {doc.category_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {doc.package_name ? (
                      <Badge variant="outline" className="gap-1">
                        <Package className="h-3 w-3" />
                        {doc.package_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {!isClientView && (
                    <TableCell>{getStatusBadge(doc)}</TableCell>
                  )}
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(doc.created_at), 'MMM d, yyyy')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadDoc.isPending}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {!isClientView && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleVisibility(doc)}
                            disabled={shareDoc.isPending || unshareDoc.isPending}
                            title={doc.is_client_visible ? 'Hide from client' : 'Share with client'}
                          >
                            {doc.is_client_visible ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteDoc(doc)}
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deleteDoc?.file_name}" from the portal. This action can be undone by an administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
