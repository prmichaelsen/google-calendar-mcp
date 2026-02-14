# WRAPPER AGENT TASK: Integrate Latest Base Package

**For**: Wrapper Agent working on google-calendar-mcp-server  
**Base Package**: @prmichaelsen/google-calendar-mcp v2.3.6+  
**Priority**: HIGH - Fixes production issues  
**Estimated Time**: 30-45 minutes  

---

## 🎯 Your Mission

Integrate the latest `@prmichaelsen/google-calendar-mcp` base package which fixes critical bugs and adds multi-tenant user isolation.

## 🔥 What This Fixes

1. **ENOENT Error**: "no such file or directory, open '/app/{...credentials...}'"
2. **User Isolation**: Users can now only see their own events
3. **Auto-Notifications**: Users automatically added as attendees

## 📦 What Changed in Base Package

### 1. Smart Credentials Handling (Commit 18921ac)

The factory now accepts credentials in **any format**:

```typescript
// Option 1: Credentials object (Cloud Run)
createGoogleCalendarServer(email, userId, {
  serviceAccountKey: credentialsObject
});

// Option 2: JSON string (environment variable)
createGoogleCalendarServer(email, userId, {
  serviceAccountKey: process.env.GOOGLE_CREDENTIALS
});

// Option 3: File path (local development)
createGoogleCalendarServer(email, userId, {
  serviceAccountKey: "/path/to/key.json"
});
```

The factory **auto-detects** the format!

### 2. User Isolation (Commit ee5d7d5)

Events are now tagged with userId and filtered:

```typescript
// When User A creates event:
event.extendedProperties = {
  private: { userId: "user-a" }
};

// When User B lists events:
// Google API filters: privateExtendedProperty=userId=user-b
// User B only sees their own events
```

### 3. Auto-Attendee (Commit 67f1c6e)

User's email automatically added as attendee:

```typescript
// User creates event
createCalendarEvent({
  summary: "My Meeting",
  start_time: "...",
  end_time: "..."
  // No attendees specified
});

// Result: User's email added as attendee
// User receives calendar notification
```

### 4. Tool Names Changed (Commit fc6d7dd)

**OLD** → **NEW**:
- `google_create_calendar_event` → `google_calendar_create_calendar_event`
- `google_list_calendar_events` → `google_calendar_list_calendar_events`
- `google_update_calendar_event` → `google_calendar_update_calendar_event`
- `google_send_email` → `google_calendar_send_email`
- `google_list_emails` → `google_calendar_list_emails`
- `google_read_email` → `google_calendar_read_email`

## 🛠️ Implementation Steps

### Step 1: Update Base Package Dependency

```bash
cd /home/prmichaelsen/google-calendar-mcp-server

# Update to latest
npm install @prmichaelsen/google-calendar-mcp@latest

# Verify version (should be 2.3.6 or higher)
npm list @prmichaelsen/google-calendar-mcp
```

### Step 2: Verify resourceType Configuration

**File**: `src/index.ts`

```typescript
const wrappedServer = wrapServer({
  serverFactory: (userEmail: string, userId: string) => {
    return createGoogleCalendarServer(userEmail, userId, {
      serviceAccountKey: config.google.serviceAccountKey
    });
  },
  authProvider,
  tokenResolver: credentialsResolver,
  resourceType: 'google-calendar',  // ✅ Must be 'google-calendar'
  // ...
});
```

### Step 3: Update Service Account Key Handling

**File**: `src/index.ts`

The factory now handles any format, so you can simplify:

```typescript
const config = {
  google: {
    // Pass directly - factory will auto-detect format
    serviceAccountKey: process.env.GOOGLE_CREDENTIALS || 
                      process.env.GOOGLE_APPLICATION_CREDENTIALS
  }
};
```

### Step 4: Verify Platform API Returns Workspace Email

**File**: Platform API `/api/credentials/google-calendar`

```typescript
export async function GET(request: Request) {
  const userId = request.headers.get('X-User-ID');
  
  // MUST return Google Workspace email, NOT personal Gmail
  return Response.json({
    access_token: "support@agentbase.me"  // ✅ Workspace email
    // NOT: "michaelsenpatrick@gmail.com"  // ❌ Personal Gmail won't work
  });
}
```

### Step 5: Rebuild

```bash
npm run build
```

### Step 6: Test Locally (Optional)

```bash
export PLATFORM_URL=https://agentbase.me
export PLATFORM_SERVICE_TOKEN=your-token
export GOOGLE_CREDENTIALS='{"type":"service_account",...}'

npm start
```

### Step 7: Deploy to Cloud Run

```bash
gcloud builds submit --config cloudbuild.yaml
```

## ✅ Verification Tests

### Test 1: No ENOENT Error

Create any event - should work without file path errors.

### Test 2: User Isolation

```bash
# As User A - create event
POST /mcp/message
Authorization: Bearer <jwt-user-a>
{
  "method": "tools/call",
  "params": {
    "name": "google_calendar_create_calendar_event",
    "arguments": {
      "summary": "User A's Private Event",
      "start_time": "2026-02-15T10:00:00-08:00",
      "end_time": "2026-02-15T11:00:00-08:00"
    }
  }
}

# As User B - list events
POST /mcp/message
Authorization: Bearer <jwt-user-b>
{
  "method": "tools/call",
  "params": {
    "name": "google_calendar_list_calendar_events",
    "arguments": {}
  }
}
```

**Expected**: User B should NOT see User A's event.

### Test 3: Auto-Attendee

Create event without attendees:
```json
{
  "summary": "My Meeting",
  "start_time": "2026-02-15T14:00:00-08:00",
  "end_time": "2026-02-15T15:00:00-08:00"
}
```

**Expected**: User's email automatically added as attendee, user receives notification.

### Test 4: Ownership Protection

Try to update another user's event:

**Expected**: Error: "Unauthorized: Event belongs to different user"

## 🎯 Success Criteria

- [ ] Wrapper builds without errors
- [ ] No ENOENT errors when creating events
- [ ] User A can create events
- [ ] User A can list only their own events
- [ ] User B cannot see User A's events
- [ ] User B cannot modify User A's events
- [ ] Users receive notifications for their own events
- [ ] All 6 tools work with `google_calendar_*` prefix

## 🚨 Breaking Changes

**Tool Names** - Update any hardcoded tool names:
- Add `_calendar` after `google_`
- Example: `google_create_calendar_event` → `google_calendar_create_calendar_event`

**API Signature** - Factory parameter changed:
- OLD: `serviceAccountKeyPath: string`
- NEW: `serviceAccountKey: string | object` (auto-detects format)

## 📝 Notes

- Base package version must be 2.3.6 or higher
- Platform API must return Google Workspace email (not personal Gmail)
- All users share `support@agentbase.me` account
- Isolation enforced via userId metadata filtering
- Auto-attendee can be disabled with `add_user_as_attendee: false`

---

**Status**: Ready to implement  
**Blockers**: Base package must be published to npm (needs 2FA)  
**Next**: Follow steps 1-7, then verify with tests
