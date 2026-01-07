import { useState } from 'react';
import { useExcelBindings, MERGE_FIELD_SOURCES, TokenInfo, DropdownInfo, TokenBinding, LookupList } from '@/hooks/useExcelBindings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { 
  FileSpreadsheet, RefreshCw, Check, AlertTriangle, XCircle,
  Link2, Settings2, CheckCircle2, Plus, Loader2
} from 'lucide-react';

interface ExcelFieldsTabProps {
  documentId: number;
}

export function ExcelFieldsTab({ documentId }: ExcelFieldsTabProps) {
  const {
    binding,
    lookupLists,
    loading,
    scanning,
    validating,
    scanDocument,
    updateTokenBinding,
    updateDropdownBinding,
    validateBindings,
    createLookupList,
    refresh
  } = useExcelBindings(documentId);

  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [tokenSourceType, setTokenSourceType] = useState<string>('');
  const [tokenSourceField, setTokenSourceField] = useState<string>('');
  const [tokenStaticValue, setTokenStaticValue] = useState<string>('');

  const [dropdownDialogOpen, setDropdownDialogOpen] = useState(false);
  const [selectedDropdown, setSelectedDropdown] = useState<DropdownInfo | null>(null);
  const [selectedListId, setSelectedListId] = useState<string>('');

  const [createListDialogOpen, setCreateListDialogOpen] = useState(false);
  const [newListKey, setNewListKey] = useState('');
  const [newListName, setNewListName] = useState('');
  const [newListItems, setNewListItems] = useState('');

  const handleBindToken = (token: TokenInfo) => {
    setSelectedToken(token);
    const existingBinding = binding?.token_bindings[token.token];
    if (existingBinding) {
      setTokenSourceType(existingBinding.source_type);
      setTokenSourceField(existingBinding.source_field || '');
      setTokenStaticValue(existingBinding.static_value || '');
    } else {
      setTokenSourceType('');
      setTokenSourceField('');
      setTokenStaticValue('');
    }
    setTokenDialogOpen(true);
  };

  const handleSaveTokenBinding = async () => {
    if (!selectedToken || !tokenSourceType) return;

    const newBinding: TokenBinding = {
      source_type: tokenSourceType as TokenBinding['source_type'],
      source_field: tokenSourceType !== 'static' ? tokenSourceField : undefined,
      static_value: tokenSourceType === 'static' ? tokenStaticValue : undefined
    };

    await updateTokenBinding(selectedToken.token, newBinding);
    setTokenDialogOpen(false);
  };

  const handleBindDropdown = (dropdown: DropdownInfo) => {
    setSelectedDropdown(dropdown);
    const existingBinding = binding?.dropdown_bindings[dropdown.dropdown_id];
    setSelectedListId(existingBinding?.list_id || '');
    setDropdownDialogOpen(true);
  };

  const handleSaveDropdownBinding = async () => {
    if (!selectedDropdown || !selectedListId) return;
    const list = lookupLists.find(l => l.id === selectedListId);
    await updateDropdownBinding(selectedDropdown.dropdown_id, selectedListId, list?.name || '');
    setDropdownDialogOpen(false);
  };

  const handleCreateList = async () => {
    if (!newListKey || !newListName) return;
    const items = newListItems.split('\n').map(s => s.trim()).filter(Boolean);
    const list = await createLookupList(newListKey, newListName, items);
    if (list) {
      setCreateListDialogOpen(false);
      setNewListKey('');
      setNewListName('');
      setNewListItems('');
    }
  };

  const getStatusBadge = () => {
    if (!binding) {
      return <Badge variant="outline" className="text-muted-foreground">Not Scanned</Badge>;
    }
    switch (binding.status) {
      case 'ready':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Ready</Badge>;
      case 'error':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Errors</Badge>;
      default:
        return <Badge variant="secondary"><Settings2 className="h-3 w-3 mr-1" /> Draft</Badge>;
    }
  };

  const getTokenStatus = (token: TokenInfo) => {
    const bound = binding?.token_bindings[token.token];
    if (bound) {
      return <Check className="h-4 w-4 text-green-500" />;
    }
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  const getDropdownStatus = (dropdown: DropdownInfo) => {
    const bound = binding?.dropdown_bindings[dropdown.dropdown_id];
    if (bound) {
      const list = lookupLists.find(l => l.id === bound.list_id);
      const hasItems = list?.items && list.items.length > 0;
      if (hasItems) {
        return <Check className="h-4 w-4 text-green-500" />;
      }
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  const selectedSourceConfig = MERGE_FIELD_SOURCES.find(s => s.type === tokenSourceType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-green-600" />
          <div>
            <h3 className="text-lg font-semibold">Excel Template Fields</h3>
            <p className="text-sm text-muted-foreground">
              Configure merge tokens and dropdown bindings
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={scanDocument}
            disabled={scanning}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
            {binding ? 'Re-Scan' : 'Scan Template'}
          </Button>
          <Button
            size="sm"
            onClick={validateBindings}
            disabled={validating || !binding}
          >
            {validating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Validate
          </Button>
        </div>
      </div>

      {/* Validation Errors */}
      {binding?.validation_errors && binding.validation_errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Validation Issues</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc list-inside space-y-1">
              {binding.validation_errors.map((err, i) => (
                <li key={i} className="text-sm">
                  {err.location && <code className="mr-2">{err.location}</code>}
                  {err.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No Binding Yet */}
      {!loading && !binding && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <h4 className="font-medium mb-2">No Template Analysis</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Scan this Excel template to detect merge fields and dropdown validations
            </p>
            <Button onClick={scanDocument} disabled={scanning}>
              <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
              Scan Template
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Detected Tokens */}
      {binding && binding.detected_tokens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Merge Tokens ({binding.detected_tokens.length})
            </CardTitle>
            <CardDescription>
              Map each token to a data source
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Bound To</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {binding.detected_tokens.map((token, idx) => {
                  const tokenBinding = binding.token_bindings[token.token];
                  return (
                    <TableRow key={idx}>
                      <TableCell>{getTokenStatus(token)}</TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
                                {token.format === 'double_brace' && `{{${token.token}}}`}
                                {token.format === 'double_angle' && `<<${token.token}>>`}
                                {token.format === 'double_bracket' && `[[${token.token}]]`}
                                {token.format === 'mergefield' && token.token}
                              </code>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">{token.sample_text}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {token.sheet}!{token.cell}
                      </TableCell>
                      <TableCell>
                        {tokenBinding ? (
                          <Badge variant="secondary">
                            {tokenBinding.source_type === 'static' 
                              ? `"${tokenBinding.static_value}"`
                              : `${tokenBinding.source_type}.${tokenBinding.source_field}`}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not bound</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBindToken(token)}
                        >
                          {tokenBinding ? 'Edit' : 'Bind'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detected Dropdowns */}
      {binding && binding.detected_dropdowns.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Dropdown Validations ({binding.detected_dropdowns.length})
              </CardTitle>
              <CardDescription>
                Bind dropdowns to lookup lists
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setCreateListDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New List
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Source Type</TableHead>
                  <TableHead>Current Source</TableHead>
                  <TableHead>Bound List</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {binding.detected_dropdowns.map((dropdown, idx) => {
                  const dropdownBinding = binding.dropdown_bindings[dropdown.dropdown_id];
                  const boundList = dropdownBinding 
                    ? lookupLists.find(l => l.id === dropdownBinding.list_id)
                    : null;
                  
                  return (
                    <TableRow key={idx}>
                      <TableCell>{getDropdownStatus(dropdown)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {dropdown.sheet}!{dropdown.cell}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{dropdown.source_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {dropdown.source_ref}
                      </TableCell>
                      <TableCell>
                        {boundList ? (
                          <Badge variant="secondary">
                            {boundList.name} ({boundList.items?.length || 0})
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not bound</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBindDropdown(dropdown)}
                        >
                          {dropdownBinding ? 'Edit' : 'Bind'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No tokens/dropdowns detected */}
      {binding && binding.detected_tokens.length === 0 && binding.detected_dropdowns.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Fields Detected</AlertTitle>
          <AlertDescription>
            No merge tokens or dropdown validations were found in this template.
            Make sure tokens use one of: {"{{Token}}"}, {"<<Token>>"}, or {"[[Token]]"} format.
          </AlertDescription>
        </Alert>
      )}

      {/* Token Binding Dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bind Token</DialogTitle>
            <DialogDescription>
              Map <code className="bg-muted px-1.5 py-0.5 rounded">{selectedToken?.token}</code> to a data source
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={tokenSourceType} onValueChange={(v) => {
                setTokenSourceType(v);
                setTokenSourceField('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source type" />
                </SelectTrigger>
                <SelectContent>
                  {MERGE_FIELD_SOURCES.map(source => (
                    <SelectItem key={source.type} value={source.type}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tokenSourceType === 'static' ? (
              <div className="space-y-2">
                <Label>Static Value</Label>
                <Input
                  value={tokenStaticValue}
                  onChange={(e) => setTokenStaticValue(e.target.value)}
                  placeholder="Enter static value"
                />
              </div>
            ) : selectedSourceConfig && selectedSourceConfig.fields.length > 0 ? (
              <div className="space-y-2">
                <Label>Field</Label>
                <Select value={tokenSourceField} onValueChange={setTokenSourceField}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSourceConfig.fields.map(field => (
                      <SelectItem key={field.key} value={field.key}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : tokenSourceType ? (
              <div className="space-y-2">
                <Label>Field Key</Label>
                <Input
                  value={tokenSourceField}
                  onChange={(e) => setTokenSourceField(e.target.value)}
                  placeholder="Enter field key"
                />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTokenBinding}
              disabled={!tokenSourceType || (tokenSourceType === 'static' ? !tokenStaticValue : !tokenSourceField)}
            >
              Save Binding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dropdown Binding Dialog */}
      <Dialog open={dropdownDialogOpen} onOpenChange={setDropdownDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bind Dropdown</DialogTitle>
            <DialogDescription>
              Map dropdown at <code className="bg-muted px-1.5 py-0.5 rounded">
                {selectedDropdown?.sheet}!{selectedDropdown?.cell}
              </code> to a lookup list
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Lookup List</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  {lookupLists.map(list => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.items?.length || 0} items)
                      {list.tenant_id === null && ' • Global'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedListId && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">Preview:</p>
                <div className="flex flex-wrap gap-1">
                  {lookupLists.find(l => l.id === selectedListId)?.items?.slice(0, 10).map((item, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {item.label || item.value}
                    </Badge>
                  ))}
                  {(lookupLists.find(l => l.id === selectedListId)?.items?.length || 0) > 10 && (
                    <Badge variant="outline" className="text-xs">
                      +{(lookupLists.find(l => l.id === selectedListId)?.items?.length || 0) - 10} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDropdownDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDropdownBinding} disabled={!selectedListId}>
              Save Binding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create List Dialog */}
      <Dialog open={createListDialogOpen} onOpenChange={setCreateListDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Lookup List</DialogTitle>
            <DialogDescription>
              Create a new list to use for dropdown validations
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>List Key</Label>
              <Input
                value={newListKey}
                onChange={(e) => setNewListKey(e.target.value)}
                placeholder="e.g., delivery_modes"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for this list (no spaces)
              </p>
            </div>

            <div className="space-y-2">
              <Label>List Name</Label>
              <Input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="e.g., Delivery Modes"
              />
            </div>

            <div className="space-y-2">
              <Label>Items (one per line)</Label>
              <Textarea
                value={newListItems}
                onChange={(e) => setNewListItems(e.target.value)}
                placeholder="Face to face&#10;Online&#10;Blended&#10;Workplace"
                rows={6}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateListDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={!newListKey || !newListName}>
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
