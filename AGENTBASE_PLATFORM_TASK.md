# TASK: Fix Google Calendar Credentials API for Auto-Attendee Feature

**Project**: agentbase.me (Platform)  
**File**: `src/routes/api/credentials/$provider.tsx`  
**Priority**: HIGH - Required for calendar notifications  
**Estimated Time**: 15 minutes  

---

## 🎯 Objective

Update the `/api/credentials/google-calendar` endpoint to return BOTH:
1. Google Workspace email (for service account impersonation)
2. User's personal email (for auto-attendee notifications)

## 🔍 Current Issue

**Current behavior** (line 97-101):
```typescript
responseData = {
  access_token: credentials.email,  // Returns user's personal email
  email: credentials.email
}
```

**Problem**: 
- Wrapper uses `access_token` for service account impersonation
- Service account cannot impersonate personal Gmail addresses
- User's email not available for auto-attendee feature
- No notifications sent to user

## ✅ Required Fix

**File**: `src/routes/api/credentials/$provider.tsx`  
**Line**: 97-101

### Change This:

```typescript
case 'google-calendar':
  const credentials = await CredentialsDatabaseService.getGoogleCalendarInviteCredentials(userId);
  
  if (!credentials) {
    console.log(`[Credentials API] No Google Calendar invite credentials found for user ${userId}`);
    const error = TenantAPIErrors.credentialsNotFound(userId, provider);
    return new Response(JSON.stringify(error), {
      status: TenantAPIStatusCode.NOT_FOUND,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  responseData = {
    access_token: credentials.email,  // ❌ WRONG - personal email
    email: credentials.email,
    ...(credentials.display_name && { display_name: credentials.display_name }),
  };
```

### To This:

```typescript
case 'google-calendar':
  const credentials = await CredentialsDatabaseService.getGoogleCalendarInviteCredentials(userId);
  
  if (!credentials) {
    console.log(`[Credentials API] No Google Calendar invite credentials found for user ${userId}`);
    const error = TenantAPIErrors.credentialsNotFound(userId, provider);
    return new Response(JSON.stringify(error), {
      status: TenantAPIStatusCode.NOT_FOUND,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  responseData = {
    access_token: "support@agentbase.me",  // ✅ CORRECT - workspace email for impersonation
    user_email: credentials.email,          // ✅ ADD - user's email for attendee
    display_name: credentials.display_name
  };
```

## 📋 What This Enables

### Before Fix:
```
User creates event
  ↓
Platform returns: access_token = "michaelsenpatrick@gmail.com"
  ↓
Wrapper tries to impersonate personal Gmail (fails)
  ↓
No attendee added
  ↓
No notification sent
```

### After Fix:
```
User creates event
  ↓
Platform returns:
  - access_token = "support@agentbase.me" (workspace)
  - user_email = "michaelsenpatrick@gmail.com" (personal)
  ↓
Wrapper impersonates support@agentbase.me (succeeds)
  ↓
Factory receives user_email
  ↓
User added as attendee
  ↓
Notification sent to michaelsenpatrick@gmail.com
```

## 🧪 Testing

### Test 1: Verify API Response

```bash
# Call credentials API
curl https://agentbase.me/api/credentials/google-calendar \
  -H "Authorization: Bearer <jwt-token>" \
  -H "X-User-ID: <user-id>"
```

**Expected Response**:
```json
{
  "access_token": "support@agentbase.me",
  "user_email": "michaelsenpatrick@gmail.com",
  "display_name": "Patrick Michaelsen"
}
```

### Test 2: Create Calendar Event

After deploying the fix:

```
User: "Create a meeting tomorrow at 3 PM"
```

**Expected**:
- ✅ Event created in support@agentbase.me's calendar
- ✅ User's email added as attendee
- ✅ Email notification sent to user
- ✅ Event appears in user's personal calendar

### Test 3: Check Email

User should receive calendar invitation at their configured email address.

## ✅ Success Criteria

- [ ] Code change made to line 97-101
- [ ] `access_token` returns "support@agentbase.me"
- [ ] `user_email` returns user's personal email
- [ ] API response includes both fields
- [ ] Deployed to production
- [ ] Test event created with attendee
- [ ] User receives email notification

## 📝 Notes

### Why Two Emails?

1. **Workspace Email** (`support@agentbase.me`):
   - For service account impersonation
   - Required for domain-wide delegation
   - Shared across all users
   - Creates events in shared calendar

2. **User's Personal Email** (`michaelsenpatrick@gmail.com`):
   - For receiving notifications
   - Can be any email (Gmail, Outlook, etc.)
   - Unique per user
   - Added as event attendee

### Schema Already Correct

The `GoogleCalendarInviteCredentialsSchema` already has the email field:
```typescript
{
  email: z.string().email(),
  display_name: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
}
```

No schema changes needed!

### Backward Compatibility

This change is backward compatible:
- Adds new field (`user_email`)
- Keeps existing field (`email`)
- Changes `access_token` to workspace email

Existing integrations may need updates if they rely on `access_token` being the user's email.

---

**Status**: Ready to implement  
**File**: `src/routes/api/credentials/$provider.tsx`  
**Lines**: 97-101  
**Change**: 3 lines (access_token value + add user_email field)  
**Impact**: Enables auto-attendee notifications for all users
