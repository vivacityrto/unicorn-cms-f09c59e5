# TGA Sync Troubleshooting Guide

## Overview

The TGA (Training.gov.au) integration uses SOAP web services to fetch RTO organisation details, contacts, addresses, and scope data.

## Correlation IDs

Every TGA request generates a unique correlation ID in the format `tga-{timestamp}-{random}`. This ID is:

- Logged in the Edge Function logs
- Returned in error responses
- Displayed in the UI when an error occurs

When reporting issues, include the correlation ID to help trace the request through the logs.

## Common Errors

### Authentication Failed

**Error:** `TGA authentication failed. Check TGA_WS_USERNAME and TGA_WS_PASSWORD.`

**Cause:** The credentials stored in Supabase secrets are incorrect or expired.

**Fix:**
1. Go to Supabase Dashboard → Edge Functions → Secrets
2. Verify `TGA_WS_USERNAME` and `TGA_WS_PASSWORD` are set correctly
3. Ensure credentials are for the production TGA web services, not the sandbox

### SOAP Action Mismatch

**Error:** `SOAP action not supported` or `ContractFilter mismatch`

**Cause:** The SOAPAction header doesn't match what the endpoint expects.

**Fix:** This is a code issue. The current implementation uses:
- Endpoint: `https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc`
- SOAPAction: `http://www.tga.deewr.gov.au/IOrganisationServiceV13/GetOrganisation`

### Request Timeout

**Error:** `Request timed out`

**Cause:** The TGA service took longer than 30 seconds to respond.

**Fix:**
- This is often a transient issue; retry the sync
- If persistent, check TGA service status

### Network Errors

The system automatically retries failed requests up to 2 times with exponential backoff (500ms, 1500ms).

## Testing with Probe Endpoint

Admins can test the SOAP connection without running a full import:

```
GET /tga-rto-import?probe=1&rto=91020
Authorization: Bearer {token}
```

This returns:
```json
{
  "success": true,
  "probe": true,
  "correlation_id": "tga-123456-abc",
  "rto_code": "91020",
  "endpoint": "https://ws.training.gov.au/...",
  "summary": { ... },
  "contacts_count": 2,
  "addresses_count": 1
}
```

## Secrets Required

| Secret | Description |
|--------|-------------|
| `TGA_WS_USERNAME` | Production TGA web service username |
| `TGA_WS_PASSWORD` | Production TGA web service password |
| `TGA_ORG_ENDPOINT` | (Optional) Override the organisation service endpoint |
| `TGA_WS_BASE` | (Optional) Override the base URL (default: `https://ws.training.gov.au`) |

## Endpoint URLs

Production endpoints (no `/Organisation` suffix):
- Organisation Service: `https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc`
- Training Component Service: `https://ws.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc`
- Classification Service: `https://ws.training.gov.au/Deewr.Tga.Webservices/ClassificationServiceV13.svc`

## Viewing Logs

To view TGA sync logs:
1. Go to Supabase Dashboard → Edge Functions → `tga-rto-import`
2. Search for the correlation ID or RTO code
3. Look for `[TGA] [correlation-id]` prefixed log entries
