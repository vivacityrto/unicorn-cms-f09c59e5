# Mailgun Setup Guide

## 1. Domain Authentication Setup 

### DNS Records Required
Add these DNS records to your domain registrar:

```
Type: TXT
Name: @
Value: v=spf1 include:mailgun.org ~all

Type: TXT  
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:postmaster@your-domain.com

Type: CNAME
Name: email
Value: mailgun.org

Type: TXT
Name: smtp._domainkey
Value: [Get from Mailgun dashboard]

Type: TXT
Name: k1._domainkey  
Value: [Get from Mailgun dashboard]
```

## 2. Supabase Secrets Configuration

Add these secrets in your Supabase project:

```bash
# Go to Project Settings > Edge Functions > Environment Variables
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.your-domain.com  
MAILGUN_FROM_EMAIL=noreply@your-domain.com
MAILGUN_FROM_NAME=Your App Name
```

## 3. Mailgun Dashboard Configuration

### Email Templates
Create these templates in Mailgun:
- `magic_link_login_v1` - Magic link login email
- `reset_password_v1` - Password reset email  
- `verify_email_v1` - Email verification
- `set_password_v1` - Set password invite
- `accept_invite_v1` - Organization invite

### Webhook Setup (Optional but Recommended)
1. Go to Sending > Webhooks
2. Add webhook URL: `https://your-project.supabase.co/functions/v1/mailgun-webhooks`
3. Enable events: delivered, opened, clicked, bounced, complained

## 4. Testing Your Setup

Use the Admin Email Test page at `/admin/email-test` to verify:
1. Templates load correctly
2. Emails send successfully  
3. Variable substitution works
4. Links are properly formatted

## 5. Common Issues & Solutions

### Issue: SPF/DKIM Authentication Failures
**Solution**: Verify all DNS records are properly set and propagated (can take 24-48 hours)

### Issue: High Bounce Rate
**Solution**: 
- Use double opt-in for email verification
- Maintain clean email lists
- Monitor bounce notifications

### Issue: Emails in Spam
**Solution**:
- Complete domain authentication (SPF, DKIM, DMARC)
- Use consistent from addresses
- Avoid spam trigger words
- Maintain good sender reputation

### Issue: Rate Limiting
**Solution**: 
- Implement exponential backoff in edge functions
- Monitor sending quotas
- Use batch sending for bulk emails

## 6. Production Checklist

- ✅ Domain fully authenticated (green checkmarks in Mailgun)
- ✅ All email templates created and tested
- ✅ Webhooks configured for delivery tracking
- ✅ Rate limits appropriate for your use case
- ✅ Monitoring and alerting set up
- ✅ GDPR compliance measures in place

## 7. Monitoring & Analytics

Track these metrics:
- Delivery rates (should be >95%)
- Open rates (varies by industry, typically 15-25%)
- Click rates
- Bounce rates (should be <5%)
- Complaint rates (should be <0.1%)
