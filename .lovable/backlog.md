# Unicorn 2.0 Backlog

Technical debt and TODO items tracked for future implementation.

---

## Open Items

### 1. Browse Library Flow (Audits)
**File:** `src/pages/Audits.tsx:228`  
**Priority:** Low  
**Description:** Implement the browse library dialog for audit templates.  
```typescript
// TODO: Implement browse library flow
```

---

### 2. Send Note to Client (ClientStructuredNotesTab)
**File:** `src/components/client/ClientStructuredNotesTab.tsx:548`  
**Priority:** Medium  
**Description:** Implement email sending functionality to send structured notes to clients.  
```typescript
// TODO: Implement email sending functionality
```

---

### 3. Email Notification on Document Release (ReleaseDocumentsDialog)
**File:** `src/components/document/ReleaseDocumentsDialog.tsx:137`  
**Priority:** Medium  
**Description:** When `sendEmail` is true during document release, trigger email notification to relevant parties.  
```typescript
// TODO: If sendEmail is true, trigger email notification
```

---

### 4. Accountability Chart Version Preview (ChartBuilder)
**File:** `src/components/eos/accountability/ChartBuilder.tsx:488`  
**Priority:** Low  
**Description:** Implement version preview functionality for accountability chart history.  
```typescript
// TODO: Implement version preview
```

---

### 5. Accountability Chart Version Restore (ChartBuilder)
**File:** `src/components/eos/accountability/ChartBuilder.tsx:492`  
**Priority:** Low  
**Description:** Implement restore functionality to revert accountability chart to a previous version.  
```typescript
// TODO: Implement restore
```

---

## Summary

| # | Item | File | Priority |
|---|------|------|----------|
| 1 | Browse Library Flow | Audits.tsx | Low |
| 2 | Send Note to Client | ClientStructuredNotesTab.tsx | Medium |
| 3 | Email on Document Release | ReleaseDocumentsDialog.tsx | Medium |
| 4 | Chart Version Preview | ChartBuilder.tsx | Low |
| 5 | Chart Version Restore | ChartBuilder.tsx | Low |

---

*Last updated: 2026-02-07*
