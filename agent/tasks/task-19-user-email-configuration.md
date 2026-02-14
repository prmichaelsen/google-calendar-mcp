# Task 19: Configure Platform to Store User Emails for Calendar Access

**For**: Platform/Wrapper Agent  
**Objective**: Enable users to set their email for Google Calendar access  
**Estimated Time**: 1-2 hours  
**Priority**: HIGH - Required for multi-tenant calendar  

---

## Objective

Implement platform functionality to:
1. Store each user's email address (for calendar attendee notifications)
2. Return user's email via `/api/credentials/google-calendar` endpoint
3. Allow users to configure their email in platform settings

## Background

The Google Calendar MCP server now:
- Auto-adds user's email as attendee to their events
- Ensures users receive calendar notifications
- Requires platform to provide user's email address

Currently, the platform returns a hardcoded email (`support@agentbase.me`). This task enables per-user email configuration.

## Architecture

```
User Profile → email field → Platform API → Wrapper → Base Package → Calendar Event
                                                                      ↓
                                                        User added as attendee
                                                                      ↓
                                                        Email notification sent
```

## Implementation Steps

### Step 1: Add Email Field to User Database

**Migration**: Add `calendar_email` field to users table

```sql
-- Add column for user's email (for calendar notifications)
ALTER TABLE users 
ADD COLUMN calendar_email VARCHAR(255);

-- Add index for lookups
CREATE INDEX idx_users_calendar_email ON users(calendar_email);

-- Optional: Add validation
ALTER TABLE users 
ADD CONSTRAINT calendar_email_format 
CHECK (calendar_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
```

### Step 2: Add Email to User Settings UI

**File**: Platform frontend - User Settings page

Add form field for calendar email:

```typescript
// UserSettingsForm.tsx
<FormField>
  <Label>Calendar Email</Label>
  <Input
    type="email"
    value={calendarEmail}
    onChange={(e) => setCalendarEmail(e.target.value)}
    placeholder="your-email@example.com"
  />
  <Description>
    Email address to receive calendar event notifications.
    This will be added as an attendee to events you create.
  </Description>
</FormField>
```

### Step 3: Add API Endpoint to Update Email

**File**: Platform API - `/api/user/calendar-email`

```typescript
// PUT /api/user/calendar-email
export async function PUT(request: Request) {
  const userId = request.headers.get('X-User-ID');
  const { email } = await request.json();
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return Response.json(
      { error: 'Invalid email format' },
      { status: 400 }
    );
  }
  
  // Update database
  await db.query(
    'UPDATE users SET calendar_email = $1 WHERE id = $2',
    [email, userId]
  );
  
  return Response.json({ success: true, email });
}

// GET /api/user/calendar-email
export async function GET(request: Request) {
  const userId = request.headers.get('X-User-ID');
  
  const result = await db.query(
    'SELECT calendar_email FROM users WHERE id = $1',
    [userId]
  );
  
  return Response.json({
    email: result.rows[0]?.calendar_email || null
  });
}
```

### Step 4: Update Credentials API to Return User's Email

**File**: Platform API - `/api/credentials/google-calendar`

```typescript
// GET /api/credentials/google-calendar
export async function GET(request: Request) {
  const userId = request.headers.get('X-User-ID');
  
  // Get user's calendar email from database
  const user = await db.query(
    'SELECT calendar_email FROM users WHERE id = $1',
    [userId]
  );
  
  const calendarEmail = user.rows[0]?.calendar_email;
  
  if (!calendarEmail) {
    return Response.json(
      { error: 'Calendar email not configured. Please set your email in settings.' },
      { status: 404 }
    );
  }
  
  // Return user's email (will be used as attendee)
  return Response.json({
    access_token: "support@agentbase.me",  // Google Workspace account (shared)
    user_email: calendarEmail               // User's email for notifications
  });
}
```

### Step 5: Update Wrapper to Pass User Email

**File**: Wrapper `src/auth/google-credentials-resolver.ts`

```typescript
async resolveToken(userId: string, resourceType: string): Promise<string | null> {
  // ... existing code to get JWT and call API ...
  
  const data = await response.json() as CredentialsAPIResponse;
  
  // Store user's email for attendee notifications
  if (data.user_email) {
    this.userEmailCache.set(userId, data.user_email);
  }
  
  // Return workspace email for impersonation
  return data.access_token;  // support@agentbase.me
}

// Add method to get user's email
getUserEmail(userId: string): string | null {
  return this.userEmailCache.get(userId) || null;
}
```

### Step 6: Update Wrapper Server Factory

**File**: Wrapper `src/index.ts`

```typescript
const wrappedServer = wrapServer({
  serverFactory: (userEmail: string, userId: string) => {
    // Get user's personal email for attendee notifications
    const userPersonalEmail = credentialsResolver.getUserEmail(userId);
    
    return createGoogleCalendarServer(userEmail, userId, {
      serviceAccountKey: config.google.serviceAccountKey,
      userEmail: userPersonalEmail  // Pass user's email for auto-attendee
    });
  },
  // ...
});
```

### Step 7: Update Base Package Factory (If Needed)

**File**: Base package `src/server-factory.ts`

Add optional userEmail to options:

```typescript
export interface GoogleCalendarServerOptions {
  serviceAccountKey: string | any;
  calendarId?: string;
  userEmail?: string;  // User's personal email for attendee notifications
}

export function createGoogleCalendarServer(
  workspaceEmail: string,  // Google Workspace email (support@agentbase.me)
  userId: string,
  options: GoogleCalendarServerOptions
): Server {
  const userPersonalEmail = options.userEmail;  // User's personal email
  
  // Pass to tools
  case "google_calendar_create_calendar_event":
    result = await createCalendarEvent(
      calendar, 
      calendarId, 
      args, 
      userId, 
      userPersonalEmail  // Use user's personal email for attendee
    );
}
```

## User Flow

### 1. User Sets Email in Settings

```
User → Settings → Calendar Email → "alice@example.com" → Save
                                                           ↓
                                                    Database updated
```

### 2. User Creates Calendar Event

```
User → "Create meeting tomorrow at 2 PM"
  ↓
Platform → JWT with userId
  ↓
Wrapper → Resolve credentials
  ↓
Platform API → Returns:
  - access_token: "support@agentbase.me" (workspace)
  - user_email: "alice@example.com" (personal)
  ↓
Factory → Creates server with both emails
  ↓
Create Event → Auto-adds alice@example.com as attendee
  ↓
Google → Sends notification to alice@example.com
```

### 3. User Receives Notification

```
alice@example.com receives:
- Calendar invitation
- Email notification
- Can accept/decline
- Event appears in their personal calendar
```

## Benefits

✅ **Users get notifications**: Auto-added as attendees  
✅ **Flexible**: Users can use any email (Gmail, Outlook, etc.)  
✅ **Privacy**: Users control their notification email  
✅ **Multi-tenant**: Each user has their own email  
✅ **Cost-effective**: Still only 1 Google Workspace license  

## Verification

### Test 1: User Sets Email

```bash
curl -X PUT https://agentbase.me/api/user/calendar-email \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}'
```

**Expected**: Email saved to database.

### Test 2: Create Event

```bash
# User creates event (no attendees specified)
POST /mcp/message
{
  "tool": "google_calendar_create_calendar_event",
  "arguments": {
    "summary": "My Meeting",
    "start_time": "2026-02-15T14:00:00-08:00",
    "end_time": "2026-02-15T15:00:00-08:00"
  }
}
```

**Expected**: 
- Event created in support@agentbase.me's calendar
- alice@example.com added as attendee
- alice@example.com receives email notification

### Test 3: Verify Email Received

Check alice@example.com inbox for calendar invitation.

## Success Criteria

- [ ] Database has `calendar_email` field
- [ ] User settings UI has email input
- [ ] API endpoint to update email works
- [ ] Credentials API returns user's email
- [ ] Wrapper passes email to factory
- [ ] Events auto-add user's email as attendee
- [ ] Users receive email notifications

## Default Behavior

**If user hasn't set email**:
- Platform API returns 404 or null for `user_email`
- Event created without auto-attendee
- User doesn't receive notification
- Event still created successfully

**If user has set email**:
- Platform API returns their email
- Auto-added as attendee
- Receives notification
- Event appears in their personal calendar

## Notes

- User's email can be any email (Gmail, Outlook, corporate, etc.)
- Google Workspace email (support@agentbase.me) is for impersonation only
- User's personal email is for notifications only
- Both emails serve different purposes
- This enables true multi-tenant notifications

---

**Status**: Ready to implement  
**Dependencies**: Base package v2.3.6+ (has auto-attendee feature)  
**Estimated Completion**: 1-2 hours
