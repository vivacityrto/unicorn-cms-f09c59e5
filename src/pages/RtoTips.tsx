import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Lightbulb, Search, FileText, Pencil, Trash2, User, Loader2, Calendar, CheckCircle, XCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRtoTips } from "@/hooks/useRtoTips";
import { cn } from "@/lib/utils";

export default function RtoTips() {
  const { tips, isLoading, createTip, updateTip, deleteTip } = useRtoTips();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tipToDelete, setTipToDelete] = useState<string | null>(null);
  const [newTip, setNewTip] = useState({
    title: "",
    details: "",
    category: "",
    status: "active"
  });
  const [editingTip, setEditingTip] = useState<{
    id: string;
    title: string;
    details: string;
    category: string;
    status: string;
  } | null>(null);

  const handleCreateTip = async () => {
    if (!newTip.title || !newTip.details || !newTip.category) {
      return;
    }

    await createTip.mutateAsync(newTip);
    setCreateDialogOpen(false);
    setNewTip({
      title: "",
      details: "",
      category: "",
      status: "active"
    });
  };

  const handleEditTip = (tip: typeof tips[0]) => {
    setEditingTip({
      id: tip.id,
      title: tip.title,
      details: tip.details,
      category: tip.category,
      status: tip.status,
    });
    setEditDialogOpen(true);
  };

  const handleUpdateTip = async () => {
    if (!editingTip || !editingTip.title || !editingTip.details || !editingTip.category) {
      return;
    }

    await updateTip.mutateAsync({
      id: editingTip.id,
      title: editingTip.title,
      details: editingTip.details,
      category: editingTip.category,
      status: editingTip.status,
    });
    setEditDialogOpen(false);
    setEditingTip(null);
  };

  const handleDeleteTip = async (id: string) => {
    setTipToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (tipToDelete) {
      await deleteTip.mutateAsync(tipToDelete);
      setDeleteDialogOpen(false);
      setTipToDelete(null);
    }
  };

  const filteredTips = tips.filter(tip => 
    (tip.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
     tip.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );


  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold">RTO Tips</h1>
            <p className="text-muted-foreground">Manage and organize tips for RTO operations and compliance</p>
          </div>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90">
                <Plus className="h-4 w-4 mr-2" />
                Create Tip
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col border-[3px] border-[#dfdfdf]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create New RTO Tip
              </DialogTitle>
              <DialogDescription>
                Add a new tip or best practice for RTO operations
              </DialogDescription>
            </DialogHeader>
            <Separator />
            <div className="flex-1 overflow-y-auto space-y-6 py-4 px-1">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="Enter tip title..."
                  value={newTip.title}
                  onChange={(e) => setNewTip({ ...newTip, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="details">Description *</Label>
                <Textarea
                  id="details"
                  placeholder="Enter detailed description..."
                  rows={6}
                  className="resize-none"
                  value={newTip.details}
                  onChange={(e) => setNewTip({ ...newTip, details: e.target.value })}
                />
              </div>
              <Separator className="my-1" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={newTip.category}
                    onValueChange={(value) => setNewTip({ ...newTip, category: value })}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Compliance">Compliance</SelectItem>
                      <SelectItem value="Documentation">Documentation</SelectItem>
                      <SelectItem value="Training">Training</SelectItem>
                      <SelectItem value="Quality">Quality</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Technology">Technology</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={newTip.status}
                    onValueChange={(value) => 
                      setNewTip({ ...newTip, status: value })
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Separator className="my-1" />
            <DialogFooter className="gap-3">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="hover:bg-[#40c6e524] hover:text-black">
                Cancel
              </Button>
              <Button onClick={handleCreateTip} disabled={createTip.isPending}>
                {createTip.isPending ? "Creating..." : "Create Tip"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Edit RTO Tip</DialogTitle>
              <DialogDescription>
                Update the tip details
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  placeholder="Enter tip title..."
                  value={editingTip?.title || ""}
                  onChange={(e) => setEditingTip(editingTip ? { ...editingTip, title: e.target.value } : null)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-details">Description *</Label>
                <Textarea
                  id="edit-details"
                  placeholder="Enter detailed description..."
                  rows={4}
                  value={editingTip?.details || ""}
                  onChange={(e) => setEditingTip(editingTip ? { ...editingTip, details: e.target.value } : null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-category">Category *</Label>
                  <Select
                    value={editingTip?.category || ""}
                    onValueChange={(value) => setEditingTip(editingTip ? { ...editingTip, category: value } : null)}
                  >
                    <SelectTrigger id="edit-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Compliance">Compliance</SelectItem>
                      <SelectItem value="Documentation">Documentation</SelectItem>
                      <SelectItem value="Training">Training</SelectItem>
                      <SelectItem value="Quality">Quality</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Technology">Technology</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={editingTip?.status || "active"}
                    onValueChange={(value) => setEditingTip(editingTip ? { ...editingTip, status: value } : null)}
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateTip} disabled={updateTip.isPending}>
                {updateTip.isPending ? "Updating..." : "Update Tip"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the RTO tip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTipToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tips Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredTips.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No tips found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {searchQuery ? "Try adjusting your search" : "Get started by adding a new tip"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTips.map((tip, index) => (
              <Card
                key={tip.id}
                className={cn(
                  "group hover:shadow-xl transition-all duration-300 hover:border-primary/30 animate-fade-in overflow-hidden relative",
                  tip.status === "draft" && "opacity-60"
                )}
                style={{
                  animationDelay: `${index * 30}ms`,
                }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-500" />
                
                <CardHeader className="pb-4 relative">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                      <Lightbulb className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg leading-tight mb-[9px] break-words">
                        {tip.title}
                      </h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span className="font-medium">
                          {new Date(tip.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                      </p>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0 relative">
                  <div className="border-t border-border/50 pt-4 mb-4">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {tip.details}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between pt-3 border-t border-border/50 mb-4">
                    <Badge variant="outline" className="text-xs font-medium">
                      {tip.category}
                    </Badge>
                    <Badge
                      variant={tip.status === "active" ? "default" : "destructive"}
                      className={tip.status === "active" 
                        ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
                        : "bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]"
                      }
                    >
                      {tip.status === "active" ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                      {tip.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="font-medium text-foreground">
                        {tip.creator?.first_name} {tip.creator?.last_name}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditTip(tip)}
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTip(tip.id)}
                        disabled={deleteTip.isPending}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
