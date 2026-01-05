# TGA Production Integration

This document describes the Training.gov.au (TGA) production integration for Unicorn 2.0.

## Overview

The TGA integration provides:
- **Read-only access** to training.gov.au production SOAP services
- **Local caching** of training products, units, and organisations
- **Background sync** with full and delta update support
- **Admin UI** for health checks, probing, and sync management

## Architecture

```
┌─────────────────┐     ┌───────────────┐     ┌──────────────────┐
│  Admin UI       │────▶│  Edge Function │────▶│  TGA SOAP APIs   │
│  /admin/tga     │     │  tga-sync      │     │  (Production)    │
└─────────────────┘     └───────────────┘     └──────────────────┘
        │                       │
        │                       ▼
        │               ┌───────────────┐
        └──────────────▶│  Supabase DB  │
                        │  (Cache)      │
                        └───────────────┘
```

## TGA SOAP Endpoints

| Service | Endpoint |
|---------|----------|
| Organisation | `https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc` |
| Training Component | `https://ws.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc` |
| Classification | `https://ws.training.gov.au/Deewr.Tga.Webservices/ClassificationServiceV13.svc` |

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `tga_training_products` | Qualifications, skill sets, accredited courses |
| `tga_units` | Units of competency |
| `tga_organisations` | RTOs (Registered Training Organisations) |
| `tga_sync_jobs` | Sync job history and status |
| `tga_sync_status` | Singleton table for current sync state |

### RLS Policies

- **Read access**: All authenticated users can read cached TGA data
- **Sync/Admin access**: SuperAdmin only for sync jobs and status
- **No direct writes**: Data is only written via Edge Functions

## Edge Functions

### tga-sync

Primary sync function with multiple actions:

| Action | Method | Description |
|--------|--------|-------------|
| `?action=test` | GET | Test connection to TGA |
| `?action=health` | GET | Run health check |
| `?action=probe&code=XXX` | GET | Probe a code without DB write |
| `?action=sync` | POST | Execute sync job |

### Authentication

All requests require a valid JWT. The function verifies SuperAdmin status for sync operations.

## RPC Functions

| Function | Access | Description |
|----------|--------|-------------|
| `tga_health_check()` | SuperAdmin | Check connection and data status |
| `tga_sync_status()` | SuperAdmin | Get current sync status |
| `tga_sync_full()` | SuperAdmin | Queue full sync job |
| `tga_sync_delta(since)` | SuperAdmin | Queue delta sync job |

## Secrets Required

| Secret | Description |
|--------|-------------|
| `TGA_WS_USERNAME` | SOAP username (production) |
| `TGA_WS_PASSWORD` | SOAP password (production) |

Configure in Supabase Dashboard → Project Settings → Edge Functions → Secrets

## RBAC Model

| Role | Permissions |
|------|-------------|
| **SuperAdmin** | Full access: sync, probe, health check, view all data |
| **Admin** | View cached TGA data (read-only) |
| **General User** | View cached TGA data (read-only) |

## Usage

### Admin UI

Access the TGA integration panel at `/admin/integrations/tga`

Features:
- Connection status indicator
- Data counts (products, units, organisations)
- Test Connection / Health Check buttons
- Full Sync / Delta Sync triggers
- Code probe tool
- Sync job history
- Data browser with search

### Frontend Integration

```typescript
import { useTgaSync } from '@/hooks/useTgaSync';

// In a component
const { products, units, fetchProducts, fetchUnits } = useTgaSync();

// Search products
await fetchProducts('BSB30120', 100);

// Access cached data
products.forEach(p => console.log(p.code, p.title));
```

### Querying Cached Data

```typescript
import { supabase } from '@/integrations/supabase/client';

// Get all current qualifications
const { data } = await supabase
  .from('tga_training_products')
  .select('*')
  .eq('product_type', 'qualification')
  .eq('is_current', true);

// Search units by code
const { data } = await supabase
  .from('tga_units')
  .select('*')
  .ilike('code', '%BSBOPS%');

// Get organisation details
const { data } = await supabase
  .from('tga_organisations')
  .select('*')
  .eq('code', '0275')
  .single();
```

## Sync Strategies

### Full Sync

Fetches all current training products. Use sparingly due to API load.

```typescript
const { triggerFullSync } = useTgaSync();
await triggerFullSync();
```

### Delta Sync

Fetches only records modified since the last sync. Recommended for regular updates.

```typescript
const { triggerDeltaSync } = useTgaSync();
await triggerDeltaSync(); // Uses last sync timestamp
await triggerDeltaSync(new Date('2024-01-01')); // Custom date
```

### Specific Codes

Sync specific product codes on demand.

```typescript
const { syncCodes } = useTgaSync();
await syncCodes(['BSB30120', 'CHC33021', 'HLTAID009']);
```

## Audit Logging

All sync operations are logged to `client_audit_log`:

| Action | Description |
|--------|-------------|
| `health_check` | Health check performed |
| `sync_full_queued` | Full sync job queued |
| `sync_delta_queued` | Delta sync job queued |
| `sync_full_completed` | Full sync completed |
| `sync_delta_completed` | Delta sync completed |

## Troubleshooting

### Connection Failed

1. Check secrets are configured correctly
2. Verify credentials are for production (not sandbox)
3. Check TGA service status

### Sync Errors

1. Check job status in admin UI
2. View error details in job history
3. Check Edge Function logs

### Missing Data

1. Run health check to verify counts
2. Trigger delta sync to fetch updates
3. Search for specific codes using probe tool

## Security Notes

- Credentials are never exposed to the frontend
- All TGA API calls are made server-side via Edge Functions
- SOAP complexity is isolated from UI components
- RLS enforces read-only access for non-SuperAdmin users
