# Google Calendar MCP Server

**Package**: `@prmichaelsen/google-calendar-mcp`

A TypeScript-based Model Context Protocol (MCP) server for Google Calendar and Gmail integration using service account authentication with domain-wide delegation.

**Note:** This is a minimal implementation covering the most common use cases. The Google Calendar API has many more features (recurring events, calendar management, ACLs, etc.) that are not implemented here. This server focuses on basic event CRUD operations with reminders and attendee management.

## Features

- ✅ Create calendar events with title, description, start/end times, location, and attendees
- ✅ Update existing calendar events
- ✅ List upcoming calendar events
- ✅ Custom event reminders (popup/email at any interval)
- ✅ Service account authentication with domain-wide delegation
- ✅ Automatic email notifications to attendees
- ✅ TypeScript implementation with full type safety

## Prerequisites

- Node.js v18 or later
- Google Workspace account with admin access (for domain-wide delegation)
- Google Cloud Console project with Calendar API enabled
- Service account with Calendar API access and domain-wide delegation
- Service account JSON key file

## Setup

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Calendar API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. Create Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in service account details:
   - Name: `calendar-mcp` (or your choice)
   - ID: `calendar-mcp@your-project.iam.gserviceaccount.com`
4. Click "Create and Continue"
5. Grant appropriate roles (optional)
6. Click "Done"

### 3. Create Service Account Key

1. Click on the newly created service account
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select "JSON" and click "Create"
5. Save the downloaded JSON file as `~/calendar-mcp-server/service-account-key.json`
6. **Note the `client_id` from the JSON file** - you'll need this for domain-wide delegation

### 4. Enable Domain-Wide Delegation (REQUIRED for attendee invitations)

**This step is critical for sending calendar invitations to attendees.**

1. **In Google Admin Console:**
   - Go to [Google Admin Console](https://admin.google.com/)
   - Navigate to: **Security** → **Access and data control** → **API Controls**
   - Click **Manage Domain Wide Delegation**
   - Click **Add new**

2. **Configure delegation:**
   - **Client ID:** Paste the `client_id` from your service account JSON key
   - **OAuth Scopes:** `https://www.googleapis.com/auth/calendar`
   - Click **Authorize**

3. **Verify setup:**
   - The service account should now appear in the Domain-Wide Delegation list
   - Status should show "Authorized"

**Without domain-wide delegation:** Events can be created but attendee invitations will fail with error:
```
Service accounts cannot invite attendees without Domain-Wide Delegation of Authority
```

### 5. Install Dependencies

```bash
cd ~/calendar-mcp-server
npm install
```

### 6. Build the Project

```bash
npx tsc
```

## Configuration

### Environment Variables

The server requires three environment variables:

- **`GOOGLE_APPLICATION_CREDENTIALS`**: Path to your service account JSON key file
- **`GOOGLE_CALENDAR_ID`**: Calendar ID to use (e.g., email address or "primary")
- **`GOOGLE_CALENDAR_SUBJECT`**: Email address to impersonate for domain-wide delegation

### MCP Settings

Add to your MCP settings file (`.vscode-server/data/User/globalStorage/kilocode.kilo-code/settings/mcp_settings.json`):

```json
{
  "mcpServers": {
    "@prmichaelsen/google-calendar-mcp": {
      "command": "node",
      "args": ["/path/to/calendar-mcp-server/build/index.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/calendar-mcp-server/service-account-key.json",
        "GOOGLE_CALENDAR_ID": "your-email@your-domain.com",
        "GOOGLE_CALENDAR_SUBJECT": "your-email@your-domain.com"
      },
      "alwaysAllow": [
        "create_calendar_event",
        "list_calendar_events",
        "update_calendar_event",
        "send_email",
        "list_emails",
        "read_email"
      ]
    }
  }
}
```

**Note:** Replace paths and email addresses with your actual values.

## Available Tools

### create_calendar_event

Create a new calendar event with optional reminders and attendees.

**Parameters:**
- `summary` (required): Event title
- `start_time` (required): Start time in ISO 8601 format
- `end_time` (required): End time in ISO 8601 format
- `description` (optional): Event description
- `location` (optional): Event location
- `attendees` (optional): Array of attendee email addresses
- `send_notifications` (optional): Send email notifications (default: true)
- `reminders` (optional): Array of reminder objects with `method` ("email" or "popup") and `minutes`

**Example:**
```typescript
{
  "summary": "Team Meeting",
  "description": "Weekly team sync",
  "start_time": "2024-12-25T10:00:00-08:00",
  "end_time": "2024-12-25T11:00:00-08:00",
  "location": "Conference Room A",
  "attendees": ["alice@example.com", "bob@example.com"],
  "reminders": [
    {
      "method": "popup",
      "minutes": 10
    },
    {
      "method": "email",
      "minutes": 1440
    }
  ]
}
```

**Common Reminder Times:**
- 10 minutes before: `{method: "popup", minutes: 10}`
- 1 hour before: `{method: "popup", minutes: 60}`
- 1 day before: `{method: "email", minutes: 1440}`
- 2 days before: `{method: "email", minutes: 2880}`
- 1 week before: `{method: "email", minutes: 10080}`

### list_calendar_events

List upcoming calendar events with their IDs.

**Parameters:**
- `max_results` (optional): Maximum number of events to return (default: 10)
- `time_min` (optional): Lower bound for event start time in ISO 8601 format (default: now)
- `time_max` (optional): Upper bound for event start time in ISO 8601 format

**Example:**
```typescript
{
  "max_results": 20,
  "time_min": "2024-12-01T00:00:00Z",
  "time_max": "2024-12-31T23:59:59Z"
}
```

### update_calendar_event

Update an existing calendar event by its ID.

**Parameters:**
- `event_id` (required): Event ID to update
- `summary` (optional): New event title
- `description` (optional): New event description
- `start_time` (optional): New start time in ISO 8601 format
- `end_time` (optional): New end time in ISO 8601 format
- `location` (optional): New event location
- `attendees` (optional): New array of attendee email addresses
- `send_notifications` (optional): Send update notifications (default: true)
- `reminders` (optional): New reminder configuration

**Example:**
```typescript
{
  "event_id": "abc123xyz",
  "summary": "Updated Team Meeting",
  "attendees": ["alice@example.com", "charlie@example.com"],
  "reminders": [
    {
      "method": "popup",
      "minutes": 30
    }
  ]
}
```

## Development

```bash
# Build
cd ~/calendar-mcp-server
npx tsc

# The compiled server will be at build/index.js
```

## Troubleshooting

### "Error: GOOGLE_CALENDAR_SUBJECT environment variable is required"

- Ensure `GOOGLE_CALENDAR_SUBJECT` is set in your MCP settings
- This should be the email address you want to impersonate (e.g., your Google Workspace email)

### "Service accounts cannot invite attendees without Domain-Wide Delegation"

- Follow step 4 above to enable domain-wide delegation in Google Admin Console
- Ensure the OAuth scope `https://www.googleapis.com/auth/calendar` is authorized
- Verify the service account's `client_id` is correctly entered in Admin Console

### "The user must be signed up for Google Calendar"

- The email specified in `GOOGLE_CALENDAR_SUBJECT` needs to visit [calendar.google.com](https://calendar.google.com) once to activate Google Calendar
- This is a one-time setup requirement

### "Failed to create calendar event: Forbidden"

- Verify domain-wide delegation is properly configured
- Ensure Calendar API is enabled in Google Cloud Console
- Check that the service account has the calendar scope authorized

## Architecture

**Domain-Wide Delegation Flow:**
1. Service account (`calendar-mcp@your-project.iam.gserviceaccount.com`) impersonates user
2. User email specified in `GOOGLE_CALENDAR_SUBJECT` environment variable
3. Calendar operations performed as that user
4. Attendee invitations sent from that user's calendar

**Benefits:**
- No OAuth2 browser flow required
- Automated calendar management
- Ability to send attendee invitations
- Suitable for server-side/bot applications

## License

MIT