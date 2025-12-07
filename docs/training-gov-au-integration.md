# Training.gov.au Integration Guide

This document explains the REST API middleware that wraps Training.gov.au's SOAP web services for organisation search.

## Overview

The middleware provides a modern REST API interface to the Training.gov.au sandbox SOAP services, specifically the `OrganisationServiceV13`. This allows your frontend to search for RTOs and training organisations using simple REST calls instead of complex SOAP requests.

## Architecture

```
Frontend (React)
    ↓ REST API call
Edge Function: search-organisations
    ↓ SOAP call (with WS-Security)
Training.gov.au Sandbox SOAP Service
    ↓ XML Response
Edge Function: Parses XML → JSON
    ↓ JSON Response
Frontend receives organisations data
```

## REST Endpoints

### 1. Search Organisations

**Endpoint:** `POST /functions/v1/search-organisations`

**Request Body:**
```json
{
  "query": "search term"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "organisations": [
    {
      "code": "12345",
      "name": "Example Training Organisation",
      "trading_name": "ETO",
      "abn": "12 345 678 901",
      "address": {
        "street": "123 Main St",
        "suburb": "Melbourne",
        "state": "VIC",
        "postcode": "3000"
      },
      "scope": "Nationally recognised training"
    }
  ],
  "count": 1
}
```

**Error Response (401 - Authentication Required):**
```json
{
  "error": "Authentication required. Please configure TGA_SANDBOX_USERNAME and TGA_SANDBOX_PASSWORD.",
  "organisations": [],
  "hint": "Register at training.gov.au for sandbox credentials"
}
```

**Error Response (400 - Invalid Query):**
```json
{
  "error": "Search query must be at least 2 characters",
  "organisations": []
}
```

---

### 2. Get Organisation Details by RTO Code

**Endpoint:** `POST /functions/v1/get-organisation-details`

**Request Body:**
```json
{
  "code": "12345"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "organisation": {
    "code": "12345",
    "name": "Example Training Organisation Pty Ltd",
    "trading_name": "ETO Training",
    "legal_name": "Example Training Organisation Pty Ltd",
    "abn": "12 345 678 901",
    "status": "Active",
    "organisation_type": "Private RTO",
    "address": {
      "street": "123 Training Street",
      "suburb": "Melbourne",
      "state": "VIC",
      "postcode": "3000",
      "full_address": "123 Training Street, Melbourne, VIC, 3000"
    },
    "contact": {
      "phone": "03 1234 5678",
      "email": "info@etotraining.edu.au",
      "website": "https://www.etotraining.edu.au"
    },
    "scope": "Nationally recognised training in Business, IT, and Healthcare",
    "registration_date": "2010-06-15"
  }
}
```

**Error Response (400 - Invalid Code):**
```json
{
  "error": "Invalid RTO code format. Must be 4-5 digits.",
  "organisation": null
}
```

**Error Response (404 - Not Found):**
```json
{
  "error": "Organisation with RTO code 99999 not found",
  "organisation": null
}
```

**Error Response (401 - Authentication Required):**
```json
{
  "error": "Authentication required. Please configure TGA_SANDBOX_USERNAME and TGA_SANDBOX_PASSWORD.",
  "organisation": null,
  "hint": "Register at training.gov.au for sandbox credentials"
}
```

## Setup Instructions

### 1. Register for Sandbox Access

1. Visit [training.gov.au](https://training.gov.au) developer portal
2. Register for sandbox access
3. Obtain your sandbox credentials:
   - Username
   - Password

### 2. Configure Supabase Secrets

Add your Training.gov.au sandbox credentials as Supabase Edge Function secrets:

```bash
# Option 1: Using Supabase CLI
supabase secrets set TGA_SANDBOX_USERNAME=your_username
supabase secrets set TGA_SANDBOX_PASSWORD=your_password

# Option 2: Using Supabase Dashboard
# Navigate to: Project Settings → Edge Functions → Secrets
# Add:
#   - TGA_SANDBOX_USERNAME
#   - TGA_SANDBOX_PASSWORD
```

### 3. Deploy Edge Function

The edge function deploys automatically with your Lovable project. No manual deployment needed.

## Frontend Integration Examples

### Example 1: Search Organisations

The frontend component `AddTenantDialog` already integrates with the search API:

```typescript
import { supabase } from '@/integrations/supabase/client';

// Search organisations
const { data, error } = await supabase.functions.invoke('search-organisations', {
  body: { query: 'Melbourne' }
});

if (!error && data?.organisations) {
  // Handle results
  data.organisations.forEach(org => {
    console.log(`${org.name} (RTO: ${org.code})`);
  });
}
```

### Example 2: Get Organisation Details

Fetch detailed information for a specific RTO code:

```typescript
import { supabase } from '@/integrations/supabase/client';

// Get organisation details by RTO code
const fetchOrganisationDetails = async (rtoCode: string) => {
  const { data, error } = await supabase.functions.invoke('get-organisation-details', {
    body: { code: rtoCode }
  });

  if (error) {
    console.error('Failed to fetch details:', error);
    return null;
  }

  if (data?.organisation) {
    console.log('Organisation Details:', data.organisation);
    // Access detailed fields
    console.log('Full Address:', data.organisation.address.full_address);
    console.log('Contact Email:', data.organisation.contact.email);
    console.log('Scope:', data.organisation.scope);
  }

  return data?.organisation;
};

// Usage in your component
const handleSelectOrganisation = async (org: { code: string }) => {
  const details = await fetchOrganisationDetails(org.code);
  if (details) {
    // Populate form with detailed information
    setFormData({
      name: details.name,
      rtoCode: details.code,
      abn: details.abn,
      address: details.address.full_address,
      phone: details.contact.phone,
      email: details.contact.email,
      website: details.contact.website,
      scope: details.scope
    });
  }
};
```

## SOAP Service Details

### Service Information

- **Base URL:** `https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc`
- **WSDL:** Add `?wsdl` to base URL for WSDL file
- **Authentication:** WS-Security UsernameToken
- **Namespace:** `http://www.tga.deewr.gov.au/`

### SOAP Methods Wrapped

Currently wrapped methods:
- `SearchOrganisation` - Search for organisations by name or code
- `GetOrganisation` - Get detailed organisation information by RTO code

### SOAP Request Example

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:tga="http://www.tga.deewr.gov.au/">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>your_username</wsse:Username>
        <wsse:Password>your_password</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <tga:SearchOrganisation>
      <tga:searchText>Melbourne</tga:searchText>
      <tga:includeInactive>false</tga:includeInactive>
    </tga:SearchOrganisation>
  </soap:Body>
</soap:Envelope>
```

## Testing

### Test the Edge Function

```bash
# Using curl
curl -X POST \
  https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/search-organisations \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "Melbourne"}'

# Using Supabase client (in browser console)
const { data, error } = await window.supabase.functions.invoke(
  'search-organisations',
  { body: { query: 'Melbourne' } }
);
console.log(data);
```

### Verify in Supabase Dashboard

1. Go to Edge Functions in Supabase Dashboard
2. Select `search-organisations` function
3. View logs to see request/response details

## Error Handling

The middleware handles several error scenarios:

1. **Authentication Errors (401)**
   - Missing or invalid credentials
   - Returns helpful error message with setup instructions

2. **Validation Errors (400)**
   - Query too short (< 2 characters)
   - Invalid request format

3. **SOAP Service Errors (500)**
   - Network failures
   - Malformed SOAP responses
   - Service unavailability

4. **XML Parsing Errors**
   - Logged but doesn't crash
   - Returns empty organisations array

## Performance Considerations

- **Response Time:** Typically 1-3 seconds (depends on SOAP service)
- **Rate Limiting:** Subject to Training.gov.au sandbox limits
- **Result Limit:** Returns maximum 10 organisations per query
- **Caching:** Not implemented (consider adding for production)

## Security Notes

- ✅ CORS properly configured for web clients
- ✅ Credentials stored as Edge Function secrets (not in code)
- ✅ Input sanitization (XML escape for SOAP injection prevention)
- ✅ WS-Security headers for authenticated requests
- ⚠️ Sandbox credentials - do not use in production without proper validation

## Future Enhancements

Potential improvements for production:

1. **Additional Methods:**
   - Get organisation details by code
   - Search training packages
   - Get RTO scope information

2. **Caching Layer:**
   - Cache frequent searches
   - Reduce SOAP service calls

3. **Enhanced Parsing:**
   - Use proper XML parser (e.g., DOMParser)
   - Extract more detailed organisation information

4. **Monitoring:**
   - Track API usage
   - Monitor error rates
   - Log SOAP service availability

5. **Rate Limiting:**
   - Implement client-side rate limiting
   - Queue requests during high load

## Troubleshooting

### "InvalidSecurity" Error

**Problem:** SOAP service returns security error

**Solutions:**
1. Verify credentials are correctly set in Supabase secrets
2. Check credentials are valid for sandbox environment
3. Ensure no extra whitespace in secret values
4. Re-deploy edge function after updating secrets

### Empty Results

**Problem:** Search returns no organisations

**Solutions:**
1. Try broader search terms
2. Check if organisation exists in sandbox data
3. Verify search term is at least 2 characters
4. Review edge function logs for SOAP response

### Timeout Errors

**Problem:** Requests timeout

**Solutions:**
1. Check Training.gov.au service status
2. Verify network connectivity
3. Consider implementing retry logic
4. Check Supabase edge function timeout settings

## Support

For issues related to:
- **This middleware:** Check edge function logs in Supabase
- **Training.gov.au API:** Contact training.gov.au support
- **Supabase:** Check Supabase documentation and status page

## Related Documentation

- [Training.gov.au Web Services](https://training.gov.au)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [SOAP Web Services](https://www.w3.org/TR/soap/)
- [WS-Security](http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0.pdf)
