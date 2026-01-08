# TGA Integration Configuration

Unicorn 2.0 integrates with training.gov.au (TGA) using TGA Web Services Specification v13r1.

## Current Configuration

| Setting | Value |
|---------|-------|
| **Environment** | Production |
| **Username** | support@vivacity.com.au |
| **Access Level** | Web Services Read |
| **Auth Method** | HTTP Basic Authentication |

## Required Secrets

Configure these in Supabase Edge Function Secrets:

| Secret Name | Description | Status |
|-------------|-------------|--------|
| `TGA_WS_USERNAME` | TGA Web Services username (email) | Required |
| `TGA_WS_PASSWORD` | TGA Web Services password | Required |

## TGA Web Services Endpoints (Production)

| Service | Endpoint |
|---------|----------|
| Organisation | `https://ws.training.gov.au/Deewr.Tga.WebServices/OrganisationServiceV13.svc` |
| Training Component | `https://ws.training.gov.au/Deewr.Tga.WebServices/TrainingComponentServiceV13.svc` |
| Classification | `https://ws.training.gov.au/Deewr.Tga.WebServices/ClassificationServiceV13.svc` |

## Sync Scope

The integration provides **read-only** access to:

- Organisation details (RTOs)
- RTO registration status
- Scope of registration
- Qualifications, units, skill sets
- Delivery locations

## How to Configure

1. Go to **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. Add `TGA_WS_USERNAME` with value: `support@vivacity.com.au`
3. Add `TGA_WS_PASSWORD` with the confirmed password

## Validation

After configuring secrets, validate authentication:

1. Navigate to **Admin** → **TGA Integration**
2. Click **Test Connection**
3. Verify successful response with a test component

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `TGA_WS_USERNAME secret not configured` | Missing secret | Add secret in Supabase |
| `Authentication failed` | Wrong credentials | Verify username/password |
| `Access denied` | No permissions | Contact TGA for Web Services Read access |
| `Cannot connect` | Network issue | Check Supabase function network |

## Security Notes

- Credentials are stored as Supabase Edge Function secrets (encrypted)
- Never commit credentials to version control
- Secrets are only accessible server-side in Edge Functions
- Read-only access means no data can be modified in TGA

## Reference

- TGA Web Services Specification v13r1
- TGA Logical Data Model v1.14.0
