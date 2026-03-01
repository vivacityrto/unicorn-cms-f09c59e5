import { useState } from 'react';
import { useMergeFields } from '@/hooks/useMergeFields';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { Copy, Search, Check, Info } from 'lucide-react';

interface MergeFieldHelperProps {
  onInsert?: (code: string) => void;
}

export function MergeFieldHelper({ onInsert }: MergeFieldHelperProps) {
  const { mergeFields, loading } = useMergeFields();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activeFields = mergeFields.filter(f => f.is_active);
  
  const filteredFields = activeFields.filter(field =>
    field.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    field.tag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCopy = async (tag: string) => {
    const code = `{{${tag}}}`;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(tag);
      toast({ title: 'Copied to clipboard' });
      
      if (onInsert) {
        onInsert(code);
      }
      
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading merge fields...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search merge fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
        <Badge variant="secondary" className="text-xs">
          {activeFields.length} fields
        </Badge>
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-1">
          {filteredFields.map((field) => (
            <TooltipProvider key={field.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer group"
                    onClick={() => handleCopy(field.tag)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                        {`{{${field.tag}}}`}
                      </code>
                      <span className="text-sm text-muted-foreground truncate">
                        {field.name}
                      </span>
                      {field.field_type === 'image' && (
                        <Badge variant="outline" className="text-[10px] h-4">
                          Image
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {copiedCode === field.tag ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[250px]">
                  <div className="space-y-1">
                    <p className="font-medium">{field.name}</p>
                    {field.description && (
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    )}
                    {field.source_table && (
                      <p className="text-xs text-muted-foreground">
                        Source: {field.source_table}.{field.source_column}
                        {field.source_address_type ? ` (${field.source_address_type})` : ''}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
          
          {filteredFields.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No merge fields found
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-start gap-2 p-2 bg-muted/30 rounded-md">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Click a merge field to copy it to your clipboard. Paste it into your document template 
          where you want tenant data to appear.
        </p>
      </div>
    </div>
  );
}
