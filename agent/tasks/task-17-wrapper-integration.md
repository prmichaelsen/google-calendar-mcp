# Task 17: Update Wrapper to Use Latest Base Package

**Project**: google-calendar-mcp-server (wrapper)  
**Base Package**: @prmichaelsen/google-calendar-mcp  
**Estimated Time**: 30 minutes  
**Dependencies**: Base package must be published to npm  
**Status**: Ready to implement  

---

## Objective

Update the wrapper server to use the latest version of `@prmichaelsen/google-calendar-mcp` which includes:
1. Smart service account key detection (fixes ENOENT error)
2. userId-based event isolation (multi-tenant security)
3. Tool names updated to `google_calendar_*` prefix

## Background

The base package has been updated with critical fixes:
- **Commit ee5d7d5**: userId-based isolation with metadata filtering
- **Commit 18921ac**: Smart credentials detection (object/JSON/path)
- **Commit fc6d7dd**: Tool names changed to `google_calendar_*`

These changes fix the ENOENT error and enable secure multi-tenancy.

## Prerequisites

- [ ] Base package published to npm (requires 2FA code)
- [ ] Wrapper project exists at `/home/prmichaelsen/google-calendar-mcp-server`
- [ ] Platform API endpoint `/api/credentials/google-calendar` implemented

## Steps

### 1. Publish Base Package (If Not Done)

```bash
cd /home/prmichaelsen/calendar-mcp-server

# Get 2FA code from authenticator, then:
npm publish --access public --otp=YOUR_6_DIGIT_CODE
```

### 2. Update Wrapper Dependencies

```bash
cd /home/prmichaelsen/google-calendar-mcp-server

# Update to latest version
npm install @prmichaelsen/google-calendar-mcp@latest

# Verify version
npm list @prmichaelsen/google-calendar-mcp
# Should show: @prmichaelsen/google-calendar-mcp@2.3.5 (or later)
```

### 3. Verify Wrapper Configuration

**File**: `src/index.ts`

Ensure `resourceType` matches tool prefix:

```typescript
const wrappedServer = wrapServer({
  serverFactory: (userEmail: string, userId: string) => {
    return createGoogleCalendarServer(userEmail, userId, {
      serviceAccountKey: config.google.serviceAccountKey  // Can be object, JSON, or path
    });
  },
  authProvider,
  tokenResolver: credentialsResolver,
  resourceType: 'google-calendar',  // ← Must match tool prefix google_calendar_*
  transport: {
    type: 'sse',
    port: config.server.port,
    host: '0.0.0.0',
    basePath: '/mcp'
  }
});
```

### 4. Update Platform API Response

**File**: Platform API `/api/credentials/google-calendar`

Return Google Workspace email (not personal Gmail):

```typescript
export async function GET(request: Request) {
  const userId = request.headers.get('X-User-ID');
  
  // For multi-tenant with shared account (recommended)
  return Response.json({
    access_token: "support@agentbase.me"  // ← Google Workspace email
  });
}
```

**Critical**: Must return `support@agentbase.me` (or other @agentbase.me email), NOT personal Gmail.

### 5. Verify Service Account Key Configuration

The wrapper can now pass credentials in multiple formats:

**Option A: Environment Variable with JSON**
```typescript
const config = {
  google: {
    serviceAccountKey: process.env.GOOGLE_CREDENTIALS  // JSON string or object
  }
};
```

**Option B: File Path**
```typescript
const config = {
  google: {
    serviceAccountKey: process.env.GOOGLE_APPLICATION_CREDENTIALS  // File path
  }
};
```

**Option C: Direct Object**
```typescript
const config = {
  google: {
    serviceAccountKey: JSON.parse(process.env.GOOGLE_CREDENTIALS)  // Parsed object
  }
};
```

All three work! The factory auto-detects the format.

### 6. Rebuild Wrapper

```bash
npm run build
```

### 7. Test Locally (Optional)

```bash
# Set environment variables
export PLATFORM_URL=https://agentbase.me
export PLATFORM_SERVICE_TOKEN=your-service-token
export GOOGLE_CREDENTIALS='{"type":"service_account",...}'

# Run
npm start
```

### 8. Redeploy to Cloud Run

```bash
gcloud builds submit --config cloudbuild.yaml
```

Or manually:
```bash
gcloud run deploy google-calendar-mcp-server \
  --image gcr.io/PROJECT_ID/google-calendar-mcp-server:latest \
  --region us-central1 \
  --set-secrets GOOGLE_CREDENTIALS=google-service-account-key:latest
```

## Verification

### Test 1: Create Event as User A

Use MCP client or curl with JWT for User A:
```json
{
  "tool": "google_calendar_create_calendar_event",
  "arguments": {
    "summary": "User A Event",
    "start_time": "2026-02-15T10:00:00-08:00",
    "end_time": "2026-02-15T11:00:00-08:00"
  }
}
```

**Expected**: Event created, tagged with User A's userId.

### Test 2: List Events as User B

```json
{
  "tool": "google_calendar_list_calendar_events",
  "arguments": {}
}
```

**Expected**: User B should NOT see User A's event (filtered by userId).

### Test 3: Try to Update User A's Event as User B

```json
{
  "tool": "google_calendar_update_calendar_event",
  "arguments": {
    "event_id": "<user-a-event-id>",
    "summary": "Hacked"
  }
}
```

**Expected**: Error: "Unauthorized: Event belongs to different user"

### Test 4: No ENOENT Error

All operations should work without:
```
ENOENT: no such file or directory, open '/app/{...}'
```

## Success Criteria

- [ ] Wrapper builds without errors
- [ ] Wrapper starts without ENOENT error
- [ ] User A can create events
- [ ] User A can list only their events
- [ ] User B cannot see User A's events
- [ ] User B cannot modify User A's events
- [ ] All 6 tools working with `google_calendar_*` prefix
- [ ] Platform API returns `support@agentbase.me`

## Breaking Changes

**Tool Names Changed**:
- `google_create_calendar_event` → `google_calendar_create_calendar_event`
- `google_list_calendar_events` → `google_calendar_list_calendar_events`
- `google_update_calendar_event` → `google_calendar_update_calendar_event`
- `google_send_email` → `google_calendar_send_email`
- `google_list_emails` → `google_calendar_list_emails`
- `google_read_email` → `google_calendar_read_email`

**API Changes**:
- `serviceAccountKeyPath` → `serviceAccountKey` (now accepts object/JSON/path)

## Troubleshooting

### ENOENT Error Still Occurring

**Cause**: Wrapper not using latest package version  
**Fix**:
```bash
npm install @prmichaelsen/google-calendar-mcp@latest
npm run build
# redeploy
```

### "Unknown tool" Error

**Cause**: Tool names not updated  
**Fix**: Use `google_calendar_*` prefix, not `google_*`

### Users Can See Each Other's Events

**Cause**: Base package not updated or userId not passed  
**Fix**:
- Verify base package version is 2.3.5+
- Check mcp-auth is passing userId to factory
- Verify userId is in JWT

### "Unauthorized: Event belongs to different user"

**This is correct behavior!** Security working as intended.

## Notes

- Base package uses Google Calendar's `extendedProperties` for metadata
- Filtering happens at Google API level (efficient)
- No separate calendars needed
- All users share `support@agentbase.me` account
- Perfect isolation with single workspace license

---

**Status**: Ready to implement after npm publish  
**Blockers**: Base package needs 2FA code to publish  
**Next Task**: Test multi-tenant isolation in production
