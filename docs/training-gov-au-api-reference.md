# Training.gov.au API Reference

Complete reference for the Training.gov.au middleware REST API endpoints.

## Endpoint 1: Search Organisations

**Endpoint:** `POST /functions/v1/search-organisations`

### Request Schema
```typescript
{
  query: string;  // Min 2 characters
}
```

### Response Schema (Success)
```typescript
{
  success: boolean;
  organisations: Array<{
    code: string;           // RTO code (e.g., "12345")
    name: string;           // Organisation name
    trading_name: string | null;
    abn: string | null;     // ABN format: "12 345 678 901"
    address: {
      street: string | null;
      suburb: string | null;
      state: string | null;
      postcode: string | null;
    } | null;
    scope: string | null;   // Brief scope description
  }>;
  count: number;            // Number of results (max 10)
}
```

### Error Scenarios
```typescript
// 400 - Query too short
{
  error: "Search query must be at least 2 characters";
  organisations: [];
}

// 401 - Missing credentials
{
  error: "Authentication required. Please configure TGA_SANDBOX_USERNAME and TGA_SANDBOX_PASSWORD.";
  organisations: [];
  hint: "Register at training.gov.au for sandbox credentials";
}

// 500 - Service error
{
  error: "SOAP service error: 503";
  organisations: [];
}
```

---

## Endpoint 2: Get Organisation Details

**Endpoint:** `POST /functions/v1/get-organisation-details`

### Request Schema
```typescript
{
  code: string;  // RTO code: 4-5 digits (e.g., "12345")
}
```

### Response Schema (Success)
```typescript
{
  success: boolean;
  organisation: {
    // Core Information
    code: string;                    // RTO code
    name: string;                    // Primary organisation name
    trading_name: string | null;     // Trading name (if different)
    legal_name: string | null;       // Legal entity name
    abn: string | null;              // ABN: "12 345 678 901"
    status: string;                  // "Active" | "Inactive" | "Suspended"
    organisation_type: string | null; // "Private RTO" | "TAFE" | "University" etc.
    
    // Address Information
    address: {
      street: string | null;         // Street address
      suburb: string | null;         // Suburb/city
      state: string | null;          // State code: "VIC" | "NSW" etc.
      postcode: string | null;       // 4-digit postcode
      full_address: string;          // Comma-separated full address
    };
    
    // Contact Information
    contact: {
      phone: string | null;          // Phone number
      email: string | null;          // Email address
      website: string | null;        // Website URL
    };
    
    // Training Information
    scope: string | null;            // Detailed scope of registration
    registration_date: string | null; // ISO date: "2010-06-15"
  };
}
```

### Full Example Response
```json
{
  "success": true,
  "organisation": {
    "code": "88888",
    "name": "Melbourne Institute of Technology",
    "trading_name": "MIT Training",
    "legal_name": "Melbourne Institute of Technology Pty Ltd",
    "abn": "88 888 888 888",
    "status": "Active",
    "organisation_type": "Private RTO",
    "address": {
      "street": "123 Collins Street",
      "suburb": "Melbourne",
      "state": "VIC",
      "postcode": "3000",
      "full_address": "123 Collins Street, Melbourne, VIC, 3000"
    },
    "contact": {
      "phone": "03 9999 8888",
      "email": "info@mit.edu.au",
      "website": "https://www.mit.edu.au"
    },
    "scope": "Nationally recognised training in Information Technology, Business, and Healthcare qualifications including Certificate IV to Advanced Diploma levels",
    "registration_date": "2010-06-15"
  }
}
```

### Error Scenarios

#### 400 - Invalid Input
```json
{
  "error": "Organisation code is required",
  "organisation": null
}

// OR

{
  "error": "Invalid RTO code format. Must be 4-5 digits.",
  "organisation": null
}
```

**Frontend Handling:**
- Validate RTO code format before API call
- Show inline error message
- Don't disable form - allow retry

#### 404 - Not Found
```json
{
  "error": "Organisation with RTO code 99999 not found",
  "organisation": null
}
```

**Frontend Handling:**
- Show toast notification: "Organisation not found"
- Clear the RTO code field
- Allow user to search again
- **Important:** This can happen if the sandbox data doesn't include that RTO

#### 401 - Authentication Required
```json
{
  "error": "Authentication required. Please configure TGA_SANDBOX_USERNAME and TGA_SANDBOX_PASSWORD.",
  "organisation": null,
  "hint": "Register at training.gov.au for sandbox credentials"
}
```

**Frontend Handling:**
- Show error message with configuration instructions
- Disable the organisation search feature
- Provide fallback to manual entry

#### 500 - Service Error
```json
{
  "error": "SOAP service error: 503",
  "organisation": null
}
```

**Frontend Handling:**
- Show toast: "Service temporarily unavailable. Please try again."
- Log error for monitoring
- Allow manual form entry as fallback

---

## Common Edge Cases

### 1. Empty/Null Fields
**Scenario:** Organisation has minimal data in the sandbox
```json
{
  "success": true,
  "organisation": {
    "code": "12345",
    "name": "Basic RTO",
    "trading_name": null,
    "legal_name": null,
    "abn": null,
    "status": "Active",
    "organisation_type": null,
    "address": {
      "street": null,
      "suburb": "Melbourne",
      "state": "VIC",
      "postcode": null,
      "full_address": "Melbourne, VIC"
    },
    "contact": {
      "phone": null,
      "email": null,
      "website": null
    },
    "scope": null,
    "registration_date": null
  }
}
```

**Frontend Handling:**
- Use `|| 'N/A'` for display fields
- Don't prefill empty fields in forms
- Show only available data

### 2. Multiple Trading Names
**Scenario:** Some organisations operate under multiple names
- API returns primary trading name only
- Show both `name` and `trading_name` if different

### 3. Inactive/Suspended Status
**Scenario:** RTO is found but not currently active
```json
{
  "status": "Suspended"
}
```

**Frontend Handling:**
- Show warning badge: "This RTO is currently suspended"
- Allow tenant creation but flag for review

### 4. Rate Limiting
**Scenario:** Too many requests to sandbox
- Implement client-side throttling (already done with 300ms debounce)
- Add exponential backoff on errors
- Cache results for 5-10 minutes

---

## Frontend Integration Flow

### Recommended UX Flow

```
1. User types in search box
   ↓
2. Debounced search (300ms) → search-organisations
   ↓
3. Display suggestions (max 10)
   ↓
4. User clicks organisation
   ↓
5. Show loading indicator ("Fetching details...")
   ↓
6. Call get-organisation-details with RTO code
   ↓
7. Success: Auto-populate ALL form fields
   OR
   Error: Show toast, keep search result selected, allow manual edit
```

### Loading States

**During Search:**
```tsx
{isSearching && <Loader2 className="h-4 w-4 animate-spin" />}
```

**During Details Fetch:**
```tsx
{loadingDetails && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="h-3 w-3 animate-spin" />
    Fetching full details...
  </div>
)}
```

### Error Display

**Toast Notifications (use for transient errors):**
```tsx
toast.error("Organisation not found. Please try another search.");
toast.error("Service temporarily unavailable. Please try again.");
```

**Inline Errors (use for validation):**
```tsx
{error && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

---

## TypeScript Types

```typescript
// Search result type
interface OrganisationSearchResult {
  code: string;
  name: string;
  trading_name: string | null;
  abn: string | null;
  address: {
    street: string | null;
    suburb: string | null;
    state: string | null;
    postcode: string | null;
  } | null;
  scope: string | null;
}

// Detailed organisation type
interface OrganisationDetails {
  code: string;
  name: string;
  trading_name: string | null;
  legal_name: string | null;
  abn: string | null;
  status: string;
  organisation_type: string | null;
  address: {
    street: string | null;
    suburb: string | null;
    state: string | null;
    postcode: string | null;
    full_address: string;
  };
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  scope: string | null;
  registration_date: string | null;
}
```

---

## Testing Checklist

- [ ] Test with valid RTO codes (e.g., "88888")
- [ ] Test with invalid format (e.g., "ABC", "1", "999999")
- [ ] Test with non-existent RTO (e.g., "99999")
- [ ] Test without credentials (should show 401)
- [ ] Test loading states and transitions
- [ ] Test error recovery (retry after error)
- [ ] Test with slow network (loading indicators)
- [ ] Test manual entry fallback when API fails
- [ ] Verify all fields populate correctly
- [ ] Test with minimal data response (null fields)
