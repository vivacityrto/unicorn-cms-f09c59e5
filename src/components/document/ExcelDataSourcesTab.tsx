import { useState } from 'react';
import { useExcelDataSources, DataSource, SourceMapping } from '@/hooks/useExcelDataSources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, Trash2, Download, Plus, Link2, FileSpreadsheet, 
  RefreshCw, Table as TableIcon, AlertCircle 
} from 'lucide-react';
import { format } from 'date-fns';

interface ExcelDataSourcesTabProps {
  documentId: number;
}

export function ExcelDataSourcesTab({ documentId }: ExcelDataSourcesTabProps) {
  const {
    dataSources,
    mappings,
    loading,
    uploadDataSource,
    deleteDataSource,
    addMapping,
    deleteMapping,
    downloadDataSource,
    refresh
  } = useExcelDataSources(documentId);

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [newSourceName, setNewSourceName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [newMappingSourceId, setNewMappingSourceId] = useState('');
  const [newMappingSheet, setNewMappingSheet] = useState('');
  const [newMappingRange, setNewMappingRange] = useState('');
  const [newMappingColumn, setNewMappingColumn] = useState('');

  const handleUpload = async () => {
    if (!selectedFile || !newSourceName.trim()) return;
    
    setUploading(true);
    setUploadProgress(0);
    
    const result = await uploadDataSource(selectedFile, newSourceName.trim(), setUploadProgress);
    
    if (result) {
      setUploadDialogOpen(false);
      setNewSourceName('');
      setSelectedFile(null);
    }
    setUploading(false);
  };

  const handleAddMapping = async () => {
    if (!newMappingSourceId || !newMappingSheet.trim() || !newMappingRange.trim() || !newMappingColumn.trim()) return;
    
    await addMapping(newMappingSourceId, newMappingSheet.trim(), newMappingRange.trim(), newMappingColumn.trim());
    
    setMappingDialogOpen(false);
    setNewMappingSourceId('');
    setNewMappingSheet('');
    setNewMappingRange('');
    setNewMappingColumn('');
  };

  const selectedSource = dataSources.find(s => s.id === newMappingSourceId);

  return (
    <div className="space-y-6">
      {/* Data Sources Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TableIcon className="h-5 w-5" />
              Data Sources
            </CardTitle>
            <CardDescription>
              CSV files used for dropdowns and list populations
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dataSources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No data sources configured</p>
              <p className="text-sm mt-1">Upload CSV files to populate Excel dropdowns</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataSources.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">{source.name}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary">
                              {source.schema?.columns?.length || 0} columns
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[300px]">
                            <p className="font-medium mb-1">Columns:</p>
                            <p className="text-xs">{source.schema?.columns?.join(', ') || 'None'}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>{source.row_count || 0}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(source.updated_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => downloadDataSource(source)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => deleteDataSource(source.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mappings Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Excel Mappings
            </CardTitle>
            <CardDescription>
              Connect data sources to Excel named ranges
            </CardDescription>
          </div>
          <Button 
            size="sm" 
            onClick={() => setMappingDialogOpen(true)}
            disabled={dataSources.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Mapping
          </Button>
        </CardHeader>
        <CardContent>
          {mappings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No mappings configured</p>
              <p className="text-sm mt-1">
                {dataSources.length === 0 
                  ? 'Add data sources first, then create mappings'
                  : 'Map data sources to Excel named ranges'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data Source</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Excel Sheet</TableHead>
                  <TableHead>Named Range</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-medium">
                      {mapping.data_source?.name || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {mapping.source_column}
                      </code>
                    </TableCell>
                    <TableCell>{mapping.excel_sheet}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {mapping.excel_named_range}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteMapping(mapping.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Data Source</DialogTitle>
            <DialogDescription>
              Upload a CSV file to use as a data source for Excel dropdowns
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source-name">Source Name</Label>
              <Input
                id="source-name"
                placeholder="e.g., DeliveryModes"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use a descriptive name that matches the Excel reference
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV File</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                </p>
              )}
            </div>

            {uploading && (
              <div className="space-y-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={!selectedFile || !newSourceName.trim() || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mapping Dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Excel Mapping</DialogTitle>
            <DialogDescription>
              Connect a data source column to an Excel named range
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Data Source</Label>
              <Select value={newMappingSourceId} onValueChange={setNewMappingSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent>
                  {dataSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSource && (
              <div className="space-y-2">
                <Label>Source Column</Label>
                <Select value={newMappingColumn} onValueChange={setNewMappingColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSource.schema?.columns?.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="excel-sheet">Excel Sheet Name</Label>
              <Input
                id="excel-sheet"
                placeholder="e.g., Setup"
                value={newMappingSheet}
                onChange={(e) => setNewMappingSheet(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="named-range">Named Range / Target</Label>
              <Input
                id="named-range"
                placeholder="e.g., DeliveryModesList"
                value={newMappingRange}
                onChange={(e) => setNewMappingRange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The Excel named range that will be populated with this data
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddMapping}
              disabled={!newMappingSourceId || !newMappingSheet.trim() || !newMappingRange.trim() || !newMappingColumn.trim()}
            >
              Add Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
