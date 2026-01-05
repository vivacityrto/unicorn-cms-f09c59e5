# TGA Integration Secrets

The following secrets must be configured in Supabase for the TGA integration to work:

## Required Secrets

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `TGA_MODE` | API mode: `REST` or `SOAP` (default: `REST`) | Optional |
| `TGA_API_TOKEN` | Bearer token for TGA REST API | For REST mode |
| `TGA_WS_USERNAME` | Username for TGA SOAP web services | For SOAP mode |
| `TGA_WS_PASSWORD` | Password for TGA SOAP web services | For SOAP mode |

## Optional Secrets

| Secret Name | Description | Default |
|-------------|-------------|---------|
| `TGA_API_BASE` | Base URL for TGA REST API | `https://training.gov.au` |
| `TGA_WS_BASE` | Base URL for TGA SOAP services | `https://ws.sandbox.training.gov.au` |

## How to Configure

1. Go to the Supabase Dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add each secret with its value

## API Modes

### REST Mode (Default)
Uses Training.gov.au's public search API. May work without authentication for basic searches.

### SOAP Mode
Uses the Training.gov.au SOAP web services. Requires valid credentials from training.gov.au.

To obtain SOAP credentials:
1. Visit [training.gov.au](https://training.gov.au)
2. Register for API access
3. Request sandbox credentials for testing
4. Request production credentials when ready

## Security Notes

- Never commit secrets to version control
- Secrets are only accessible in Edge Functions (server-side)
- The TGA API token and credentials are never exposed to the frontend
