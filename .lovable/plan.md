## Make DocumentCard clickable to open file

Update `src/components/audit/workspace/DocumentsTab.tsx` only. No new imports needed.

### Changes inside `DocumentCard` (lines 136–222)

1. **Add state** alongside `expanded`:
   ```ts
   const [isOpening, setIsOpening] = useState(false);
   ```

2. **Add open handler**:
   ```ts
   const handleOpen = async () => {
     setIsOpening(true);
     const { data } = await supabase.storage
       .from('audit-documents')
       .createSignedUrl(doc.file_path, 3600);
     setIsOpening(false);
     if (data?.signedUrl) window.open(data.signedUrl, '_blank');
   };
   ```

3. **Make `<Card>` clickable** (line 153):
   ```tsx
   <Card
     onClick={handleOpen}
     className={cn('cursor-pointer hover:shadow-md transition-shadow', isOpening && 'opacity-60')}
   >
   ```

4. **Stop propagation** on expand button (line 179) and delete button (line 183):
   ```tsx
   <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
   <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
   ```

5. **Stop propagation on AI results panel wrapper** (line 191):
   ```tsx
   <div className="mt-4 space-y-3 border-t pt-3" onClick={(e) => e.stopPropagation()}>
   ```

### Will NOT change
- Imports, parent `DocumentsTab`, upload zone, SharePoint button, hooks/types.

### Notes
- Bucket `audit-documents` matches existing delete flow.
- Signed URL TTL: 3600s (1h).

GO.