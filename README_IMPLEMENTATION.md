# Magic Link Flow Implementation

## Summary
Successfully unified the magic link and password reset flow using Supabase's official `generateLink` API with backward compatibility for legacy links.

## ✅ What Was Implemented

### 1. **Unified Edge Function** (`supabase/functions/send-magic-link/index.ts`)
- Uses `supabase.auth.admin.generateLink()` for official token generation
- Supports both `magiclink` and `recovery` types
- Extracts tokens and normalizes to canonical format: `?token=<JWT>&type=<type>`
- Sends emails via Mailgun with `{{action_link}}` template variable
- Handles CORS and comprehensive error logging

### 2. **Unified Callback Route** (`src/pages/AuthCallback.tsx`)
- New `/auth/callback` route handles all auth callbacks
- Uses existing `extractAuthTokenFromUrl()` for backward compatibility
- Supports legacy formats: `token`, `t`, `magictoken`, `#access_token`
- Proper error handling with actionable messages
- Auto-redirect to `/app` on success with toast notifications
- Clean URL cleanup after token processing

### 3. **Auth Service Layer** (`src/lib/authService.ts`)
- Wrapper functions for `sendMagicLink()` and `sendPasswordReset()`
- Consistent interface for both magic link and recovery flows
- Proper TypeScript types and error handling

### 4. **Mailgun Templates**
- `templates/mailgun/unicorn-magic-link.html` - Beautiful HTML template
- `templates/mailgun/unicorn-password-reset.html` - Password reset template  
- Text versions for both templates
- Uses `{{action_link}}` variable from Supabase (no hardcoded tokens)
- Mobile-friendly responsive design

### 5. **Router Updates**
- Added `/auth/callback` route to main App router
- Updated `linkBuilder.ts` to use callback route for magic/reset links
- Maintains backward compatibility with existing routes

## 🔧 Technical Details

### Token Flow
1. **Generation**: Supabase `generateLink` creates secure action_link
2. **Normalization**: Edge function extracts token and creates canonical URL
3. **Email**: Mailgun sends template with `{{action_link}}`
4. **Callback**: Frontend extracts token using universal helper
5. **Verification**: Different paths for magic vs recovery tokens
6. **Session**: Creates Supabase session and redirects to `/app`

### Backward Compatibility
- Frontend accepts all legacy token formats (`magictoken`, `t`, etc.)
- Keeps tolerance for 30 days during migration
- Existing routes still work during transition

### Error Handling
- Clear user messages: "Link expired or already used. Request a new link"
- Actionable error states with retry buttons
- Comprehensive logging for debugging

## 🚀 Next Steps

### Required Supabase Configuration
1. **Redirect URLs**: Add `https://unicorn-cms.au/auth/callback` to Auth settings
2. **Environment Variables**: Ensure these are set in Edge Functions:
   - `MAILGUN_API_KEY`
   - `MAILGUN_DOMAIN` 
   - `MAILGUN_FROM_EMAIL`
   - `MAILGUN_FROM_NAME`
   - `APP_URL`

### Mailgun Setup
1. Upload templates to Mailgun dashboard:
   - `unicorn-magic-link` 
   - `unicorn-password-reset`
2. Test template rendering with variables

### Migration Path
1. **Phase 1**: Deploy new system (parallel to existing)
2. **Phase 2**: Update internal systems to use `sendAuthLink()`
3. **Phase 3**: Monitor usage analytics 
4. **Phase 4**: After 30 days, remove legacy token support

### Testing Checklist
- [ ] Magic link: Email → Click → Sign in → Redirect to `/app`
- [ ] Password reset: Email → Click → Reset flow
- [ ] Legacy links still work (magictoken, #access_token)
- [ ] Error scenarios: expired, malformed, missing tokens
- [ ] Mobile email client compatibility
- [ ] Template rendering with all variables

## 🎯 Benefits Achieved

1. **Security**: Uses Supabase's official token generation (no custom crypto)
2. **Reliability**: Official APIs with proper error handling
3. **Maintainability**: Unified flow for both magic links and password reset
4. **UX**: Clear error messages and smooth redirect flow
5. **Compatibility**: Tolerant of legacy link formats during migration
