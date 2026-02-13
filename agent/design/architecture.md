# Google Calendar and Gmail MCP Server Architecture

**Package**: `@prmichaelsen/google-calendar-mcp`
**Concept**: MCP server providing Google Calendar and Gmail integration via service accounts
**Created**: 2026-02-13
**Status**: Implemented

---

## Overview

The calendar-mcp-server is an MCP (Model Context Protocol) server that exposes Google Calendar and Gmail functionality to AI agents through a standardized tool-based interface. It uses service account authentication with domain-wide delegation to enable automated calendar and email management without requiring OAuth2 browser flows.

## Problem Statement

AI agents need to:
- Create and manage calendar events programmatically
- Send and read emails on behalf of users
- Access Google Workspace data without user interaction
- Operate in server/CLI environments without browser access

Traditional OAuth2 flows require:
- Browser-based authentication
- User interaction for each session
- Token refresh management
- Per-user credential storage

## Solution

Implement an MCP server that:
1. Uses service account authentication with domain-wide delegation
2. Impersonates users within a Google Workspace domain
3. Exposes Calendar and Gmail operations as MCP tools
4. Handles authentication and API complexity internally
5. Provides simple, type-safe tool interfaces

## Architecture

### High-Level Architecture

```
┌─────────────────┐
│   AI Agent      │
│  (MCP Client)   │
└────────┬────────┘
         │ MCP Protocol (stdio)
         │
┌────────▼────────────────────────────────────┐
│         Calendar MCP Server                 │
│  ┌──────────────────────────────────────┐  │
│  │   MCP Request Handler                │  │
│  │  - ListTools                         │  │
│  │  - CallTool                          │  │
│  └──────────┬───────────────────────────┘  │
│             │                               │
│  ┌──────────▼───────────────────────────┐  │
│  │   Tool Handlers                      │  │
│  │  - create_calendar_event             │  │
│  │  - list_calendar_events              │  │
│  │  - update_calendar_event             │  │
│  │  - send_email                        │  │
│  │  - list_emails                       │  │
│  │  - read_email                        │  │
│  └──────────┬───────────────────────────┘  │
│             │                               │
│  ┌──────────▼───────────────────────────┐  │
│  │   Google API Clients                 │  │
│  │  - Calendar API (v3)                 │  │
│  │  - Gmail API (v1)                    │  │
│  └──────────┬───────────────────────────┘  │
│             │                               │
│  ┌──────────▼───────────────────────────┐  │
│  │   Service Account Auth               │  │
│  │  - Domain-Wide Delegation            │  │
│  │  - User Impersonation                │  │
│  └──────────────────────────────────────┘  │
└────────────┬────────────────────────────────┘
             │ HTTPS
             │
┌────────────▼────────────────────────────────┐
│         Google APIs                         │
│  - Calendar API                             │
│  - Gmail API                                │
└─────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. MCP Server Layer
- **Technology**: `@modelcontextprotocol/sdk`
- **Transport**: Stdio (standard input/output)
- **Responsibilities**:
  - Protocol handling
  - Tool registration
  - Request routing
  - Error response formatting

#### 2. Tool Handler Layer
- **Technology**: TypeScript async functions
- **Responsibilities**:
  - Input validation
  - Business logic
  - API orchestration
  - Response formatting
  - Error handling

#### 3. Google API Client Layer
- **Technology**: `googleapis` npm package
- **APIs Used**:
  - Calendar API v3
  - Gmail API v1
- **Responsibilities**:
  - API communication
  - Request/response serialization
  - HTTP handling

#### 4. Authentication Layer
- **Technology**: `google.auth.GoogleAuth`
- **Method**: Service account with domain-wide delegation
- **Responsibilities**:
  - Credential loading
  - User impersonation
  - Token management
  - Scope authorization

## Authentication Flow

```
1. Server Startup
   ├─> Load service account key from file
   ├─> Configure domain-wide delegation
   └─> Set subject (user to impersonate)

2. API Request
   ├─> GoogleAuth creates JWT
   ├─> JWT includes subject claim
   ├─> Google validates service account
   ├─> Google validates delegation
   ├─> Access token issued for user
   └─> API call made as user

3. Calendar/Gmail Operation
   ├─> Use access token
   ├─> Perform operation as user
   └─> Return result
```

## Data Flow

### Calendar Event Creation

```
Agent Request
  ├─> MCP CallTool: create_calendar_event
  │   └─> Parameters: {summary, start_time, end_time, attendees, ...}
  │
  ├─> Tool Handler: createCalendarEvent()
  │   ├─> Validate parameters
  │   ├─> Build event object
  │   └─> Add attendees, reminders
  │
  ├─> Calendar API: events.insert()
  │   ├─> Authenticate as user
  │   ├─> Create event
  │   └─> Send invitations
  │
  └─> Response
      ├─> Event URL
      └─> Event ID
```

### Email Sending

```
Agent Request
  ├─> MCP CallTool: send_email
  │   └─> Parameters: {to, subject, body, is_html, ...}
  │
  ├─> Tool Handler: sendEmail()
  │   ├─> Build MIME message
  │   ├─> Handle HTML/plain text
  │   ├─> Add CC/BCC
  │   └─> Base64 encode
  │
  ├─> Gmail API: users.messages.send()
  │   ├─> Authenticate as user
  │   └─> Send message
  │
  └─> Response
      └─> Message ID
```

## Implementation Details

### Tool Schemas

Each tool has a JSON schema defining:
- Parameter names and types
- Required vs optional parameters
- Parameter descriptions
- Default values
- Enums for restricted values

Example:
```typescript
{
  type: "object",
  properties: {
    summary: { type: "string", description: "Event title" },
    start_time: { type: "string", description: "ISO 8601 format" },
  },
  required: ["summary", "start_time", "end_time"]
}
```

### Error Handling Strategy

1. **Startup Validation**: Check environment variables, exit if missing
2. **Request Validation**: Validate tool parameters
3. **API Error Wrapping**: Wrap Google API errors with context
4. **Structured Responses**: Return MCP error format with `isError: true`
5. **Logging**: Use stderr for all logs (stdout reserved for MCP)

### Configuration Management

Environment variables:
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account key
- `GOOGLE_CALENDAR_ID`: Calendar to use (email or "primary")
- `GOOGLE_CALENDAR_SUBJECT`: User email to impersonate

Loaded at startup, validated before server starts.

## Benefits

### For AI Agents
- **Simple Interface**: 6 tools with clear parameters
- **No Auth Complexity**: Server handles all authentication
- **Type Safety**: JSON schemas validate inputs
- **Rich Functionality**: Calendar and email in one server

### For Developers
- **No OAuth Flow**: Service accounts eliminate browser flow
- **Automated Access**: No user interaction required
- **Multi-User Support**: Can impersonate any domain user
- **Centralized Management**: Admin controls via Google Admin Console

### For Organizations
- **Security**: Centralized credential management
- **Auditability**: Service account actions are logged
- **Control**: Admin can revoke access anytime
- **Compliance**: Domain-wide delegation is auditable

## Trade-offs

### Advantages ✅
- No browser-based OAuth flow
- Automated, unattended operation
- Multi-user support via impersonation
- Centralized access control
- Simple MCP tool interface

### Disadvantages ❌
- Requires Google Workspace (not personal Gmail)
- Requires admin access for setup
- Domain-wide delegation setup complexity
- Service account key file security responsibility
- Limited to domain users only

## Security Considerations

### Service Account Key Protection
- Store key file outside version control
- Use environment variables for path
- Restrict file permissions (600)
- Rotate keys periodically
- Use separate keys per environment

### Scope Minimization
- Only request necessary API scopes
- Calendar: `https://www.googleapis.com/auth/calendar`
- Gmail: `gmail.send`, `gmail.readonly`, `gmail.modify`
- Don't request admin scopes unless needed

### Domain-Wide Delegation
- Limit to specific service accounts
- Audit delegation grants regularly
- Revoke unused delegations
- Monitor service account activity

## Scalability

### Current Design
- Single-threaded Node.js process
- Stdio transport (one client at a time)
- Stateless operations (no session management)
- Google API rate limits apply

### Scaling Considerations
- Google Calendar API: 1,000,000 queries/day
- Gmail API: 1,000,000,000 quota units/day
- Rate limiting handled by Google
- Can run multiple server instances for different users

## Future Enhancements

### Potential Features
- Event deletion support
- Recurring event management
- Calendar creation/deletion
- Email attachments
- Advanced Gmail features (labels, filters)
- Calendar ACL management
- Free/busy queries

### Technical Improvements
- Unit tests with mocked APIs
- Integration tests
- Health check endpoint
- Metrics collection
- Structured logging
- Docker containerization

## References

### Documentation
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Gmail API](https://developers.google.com/gmail/api)
- [Service Account Auth](https://cloud.google.com/iam/docs/service-accounts)
- [Domain-Wide Delegation](https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority)
- [MCP Protocol](https://modelcontextprotocol.io/)

### Implementation Files
- [`src/index.ts`](../../src/index.ts) - Main server implementation
- [`README.md`](../../README.md) - User documentation
- [`package.json`](../../package.json) - Dependencies

---

**Status**: Production architecture in use  
**Recommendation**: Architecture is solid for current scope. Consider adding tests and monitoring for production deployments.
