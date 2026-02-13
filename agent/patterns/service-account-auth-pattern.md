# Service Account Authentication Pattern

**Created**: 2026-02-13  
**Status**: Implemented  

---

## Overview

Pattern for authenticating with Google APIs using service accounts with domain-wide delegation. This enables server-side applications to access user data without OAuth2 browser flows.

## Core Principles

1. **Service Account**: Use service account credentials instead of user OAuth
2. **Domain-Wide Delegation**: Impersonate users within a Google Workspace domain
3. **Scope-Based Access**: Request only necessary API scopes
4. **Environment Configuration**: Store credentials in environment variables
5. **Subject Impersonation**: Specify which user to act as

## Implementation

### Environment Variables

```bash
# Path to service account JSON key file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Calendar ID to use (email or "primary")
GOOGLE_CALENDAR_ID=user@domain.com

# User email to impersonate for domain-wide delegation
GOOGLE_CALENDAR_SUBJECT=user@domain.com
```

### Authentication Setup

```typescript
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
  clientOptions: {
    subject: process.env.GOOGLE_CALENDAR_SUBJECT, // User to impersonate
  },
});

// Initialize API clients
const calendar = google.calendar({ version: "v3", auth });
const gmail = google.gmail({ version: "v1", auth });
```

### Validation

```typescript
// Validate required environment variables
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Error: GOOGLE_APPLICATION_CREDENTIALS required");
  process.exit(1);
}

if (!process.env.GOOGLE_CALENDAR_SUBJECT) {
  console.error("Error: GOOGLE_CALENDAR_SUBJECT required for domain-wide delegation");
  process.exit(1);
}
```

## Google Cloud Console Setup

### 1. Create Service Account
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create Credentials → Service Account
3. Download JSON key file

### 2. Enable APIs
- Enable Google Calendar API
- Enable Gmail API

### 3. Configure Domain-Wide Delegation
1. Go to Google Admin Console → Security → API Controls
2. Manage Domain Wide Delegation
3. Add service account client ID
4. Authorize scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`

## Benefits

- **No Browser Flow**: Works in server/CLI environments
- **Automated Access**: No user interaction required
- **Centralized Management**: Admin controls access
- **Multi-User Support**: Can impersonate any domain user
- **Secure**: Credentials stored as files, not in code

## Security Considerations

✅ **Do**:
- Store service account key files securely
- Use environment variables for paths
- Limit API scopes to minimum required
- Rotate service account keys periodically
- Use separate service accounts per application

❌ **Don't**:
- Commit service account keys to version control
- Share service account keys
- Grant excessive API scopes
- Use personal accounts for automation
- Hardcode credentials in code

## Anti-Patterns

❌ **Don't use user OAuth for automation**: Service accounts are designed for this
❌ **Don't skip domain-wide delegation**: Required for multi-user access
❌ **Don't over-scope**: Only request necessary API permissions
❌ **Don't ignore validation**: Always check environment variables exist
❌ **Don't log credentials**: Never log service account keys or tokens

## Troubleshooting

### "Service accounts cannot invite attendees"
- Enable domain-wide delegation in Google Admin Console
- Verify correct scopes are authorized

### "The user must be signed up for Google Calendar"
- User specified in GOOGLE_CALENDAR_SUBJECT must visit calendar.google.com once

### "Failed to create calendar event: Forbidden"
- Verify domain-wide delegation is configured
- Check Calendar API is enabled
- Ensure correct scopes are authorized

## Example Usage

```typescript
// Create calendar event as impersonated user
const response = await calendar.events.insert({
  calendarId: GOOGLE_CALENDAR_ID,
  requestBody: {
    summary: "Team Meeting",
    start: { dateTime: "2024-12-25T10:00:00-08:00" },
    end: { dateTime: "2024-12-25T11:00:00-08:00" },
    attendees: [{ email: "alice@example.com" }],
  },
  sendUpdates: "all",
});
```

---

**Status**: Production pattern in use  
**Recommendation**: Use this pattern for all Google API automation requiring user impersonation
