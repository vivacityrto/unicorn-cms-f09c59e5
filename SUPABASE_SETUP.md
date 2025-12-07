# Supabase Authentication Setup for Unicorn 2.0

This guide walks you through setting up Supabase Authentication to work with the custom password reset page.

## 🔧 Step 1: Configure URL Settings in Supabase

### Navigate to Authentication Settings
1. Go to your Supabase dashboard
2. Select your project: **yxkgdalkbrriasiyyrwk**
3. Navigate to **Authentication > URL Configuration**

### Set Site URL
Set your Site URL to your application's domain:
```
https://preview--unicorn-2.lovable.app
```
*Note: Replace with your actual deployed domain when available*

### Configure Redirect URLs
Add these redirect URLs (one per line):
```
https://preview--unicorn-2.lovable.app/reset-password
https://preview--unicorn-2.lovable.app/auth
https://preview--unicorn-2.lovable.app/**
```

## 📧 Step 2: Configure Email Templates

### Password Reset Email Template
1. Navigate to **Authentication > Email Templates**
2. Select **Reset Password** template
3. Ensure the template includes the `{{ .ConfirmationURL }}` variable
4. The default template should work, but you can customize it:

```html
<h2>Reset Your Password</h2>
<p>Follow this link to reset your password for your Unicorn 2.0 account:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>If you didn't request this, you can ignore this email.</p>
<p>Your password won't change until you access the link above and create a new one.</p>
```

## 🚀 Step 3: Test the Flow

### Testing Password Reset
1. Go to `/auth` page
2. Click "Forgot your password?"
3. Enter a valid email address
4. Check your email for the reset link
5. Click the link to go to `/reset-password`
6. Enter and confirm your new password
7. Submit to update your password

## ⚠️ Common Issues & Solutions

### "Invalid or Expired Link" Error
- **Cause**: Token has expired (default: 1 hour)
- **Solution**: Request a new password reset email

### "Requested path is invalid" Error
- **Cause**: Redirect URL not configured in Supabase
- **Solution**: Add your domain to the redirect URLs list

### Email Not Receiving
- **Cause**: Email might be in spam folder
- **Solution**: Check spam/junk folder, or use a different email provider

### "Access Denied" Error
- **Cause**: User might not exist in the system
- **Solution**: Ensure the email is registered in your users table

## 🎨 Customization Options

### Vivacity Branding
The reset password page already includes:
- ✅ Unicorn 2.0 logo and branding
- ✅ Vivacity color scheme (#23C0DD, #7130A0, #ED1878)
- ✅ Gradient background matching the auth page
- ✅ Responsive design

### Email Customization
To use custom Vivacity branding in emails:
1. Go to **Authentication > Email Templates**
2. Customize HTML templates with Vivacity colors and logo
3. Add your logo URL and brand colors

## 🔐 Security Best Practices

### Token Expiration
- Reset tokens expire after 1 hour by default
- Users must complete the reset process within this timeframe

### Password Requirements
- Minimum 6 characters (configurable in the component)
- Password confirmation required
- Passwords are hashed by Supabase automatically

### Rate Limiting
- Supabase automatically rate limits password reset requests
- Users can't spam reset emails

## 📱 Mobile Considerations

The reset password page is fully responsive and works on:
- ✅ Desktop browsers
- ✅ Mobile devices
- ✅ Tablets

## 🔗 Integration Points

### With Existing Auth System
- Uses the same `useAuth` hook
- Integrates with existing user session management
- Redirects to `/auth` after successful reset

### With User Management
- Works with existing `users` table
- Maintains user roles and permissions
- Preserves user profile data

## 🛠️ Development Notes

### Local Testing
When testing locally, ensure your Site URL in Supabase is set to:
```
http://localhost:5173
```

### Production Deployment
Update Supabase URLs when deploying to production:
1. Update Site URL to your production domain
2. Add production domain to redirect URLs
3. Test the full flow in production environment

## 📞 Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify Supabase settings match this guide
3. Test with a different email address
4. Check Supabase logs in the dashboard

---

# Vivacity Mailgun SMTP & Auth Email Templates

## ✅ Configure SMTP in Supabase (Dashboard)
- Authentication → Email Settings → SMTP
  - Host: smtp.mailgun.org
  - Port: 587
  - Username: postmaster@mg.vivacity.com.au
  - Password: [Mailgun SMTP password]
  - Sender name: Vivacity
  - Sender email: noreply@vivacity.com.au

## 🌐 URL Configuration (Production)
- Authentication → URL Configuration
  - Site URL: https://app.vivacity.com.au
  - Redirect URLs (one per line):
    - https://app.vivacity.com.au/
    - https://app.vivacity.com.au/auth
    - https://app.vivacity.com.au/reset-password
    - https://app.vivacity.com.au/**

## 🎨 Replace Supabase Auth Email Templates
Copy the HTML from these files into Supabase → Authentication → Email Templates:
1. Confirm Your Signup: supabase/email-templates/confirm-signup.html
2. Invite User: supabase/email-templates/invite-user.html
3. Magic Link Login: supabase/email-templates/magic-link.html
4. Email Change Confirmation: supabase/email-templates/email-change.html
5. Password Reset: supabase/email-templates/password-reset.html
6. Reauthentication: supabase/email-templates/reauthentication.html

Supported merge fields used: {{ .ConfirmationURL }}, {{ .Token }}, {{ .TokenHash }}, {{ .SiteURL }}, {{ .Email }}, {{ .NewEmail }}, {{ .Data }}, {{ .RedirectTo }}.

## 🧪 Test the SMTP connection
- Go to /superadmin/system/email (Admin only)
- In the "Supabase Magic Link Test" section:
  - Recipient: angela@vivacity.com.au
  - Redirect URL: https://app.vivacity.com.au/auth (or your chosen path)
  - Click "Send Magic Link"
- Verify:
  - Email lands in Inbox (not spam)
  - Branding and button links display correctly
  - Merge fields populate as expected

## 🚀 Finalize
- In Mailgun, ensure the production domain mg.vivacity.com.au is verified and active
- In Supabase, ensure only the production domain is used (no sandbox domain)
- Send a live test from the app and confirm delivery
