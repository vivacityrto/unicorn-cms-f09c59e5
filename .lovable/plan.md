Replace the label `<span>` in all three checklist item rendering variants (regular checkbox, `access.unicorn_provisioned`, and `access_revoke.unicorn`) so that checked items show `line-through` and `text-muted-foreground` styling using the already-imported `cn()` utility.

Locations in `src/pages/admin/StaffEngagementDetail.tsx`:
- Line 746 (unicorn provisioned variant)
- Line 793 (unicorn revoke variant)  
- Line 835 (regular checkbox variant)

Change pattern for each:
```
<span className="text-sm">{item.label}</span>
```
to:
```
<span className={cn("text-sm", checked && "line-through text-muted-foreground")}>
  {item.label}
</span>
```

No other changes to any file.