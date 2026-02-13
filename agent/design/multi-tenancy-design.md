# Multi-Tenancy Design for Google Calendar MCP

**Concept**: Support multiple users in a single MCP server instance with per-request user identification  
**Created**: 2026-02-13  
**Status**: Design Proposal  

---

## Overview

Enable a single MCP server instance to serve multiple users by accepting a `userId` parameter with each tool call and dynamically creating authenticated Google API clients per user.

## Problem Statement

Current architecture limitations:
- One server instance = one user (fixed at startup)
- Cannot serve multiple users from single instance
- Requires separate server instances per user
- No runtime user switching capability

## Proposed Solution

### Architecture Changes

1. **Remove Global Auth Client**
   - Don't create auth client at startup
   - Create auth clients dynamically per request

2. **Add userId Parameter to All Tools**
   - Each tool accepts optional `userId` parameter
   - Falls back to `GOOGLE_CALENDAR_SUBJECT` if not provided
   - Validates userId is in allowed domain

3. **Per-Request Authentication**
   - Create GoogleAuth client with userId as subject
   - Cache auth clients per user for performance
   - Reuse cached clients for same user

4. **Security Considerations**
   - Validate userId format (email address)
   - Ensure userId is in authorized domain
   - Optional: Maintain allowlist of authorized users
   - Log all operations with userId for auditing

## Implementation

### 1. Auth Client Factory

```typescript
// Cache auth clients per user
const authClients = new Map<string, any>();

function getAuthForUser(userId: string) {
  // Validate userId
  if (!userId || !userId.includes('@')) {
    throw new Error('Invalid userId: must be email address');
  }

  // Check cache
  if (authClients.has(userId)) {
    return authClients.get(userId);
  }

  // Create new auth client
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    clientOptions: {
      subject: userId, // Dynamic user impersonation
    },
  });

  // Cache for reuse
  authClients.set(userId, auth);
  return auth;
}
```

### 2. Updated Tool Schema

```typescript
const CREATE_EVENT_TOOL: Tool = {
  name: "create_calendar_event",
  description: "Create a new event in Google Calendar",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description: "Email address of user to act as (optional, defaults to GOOGLE_CALENDAR_SUBJECT)",
      },
      summary: {
        type: "string",
        description: "Event title/summary",
      },
      // ... other fields
    },
    required: ["summary", "start_time", "end_time"],
  },
};
```

### 3. Updated Tool Handler

```typescript
async function createCalendarEvent(args: any): Promise<string> {
  try {
    // Get userId from args or fall back to default
    const userId = args.userId || GOOGLE_CALENDAR_SUBJECT;
    
    // Get auth client for this user
    const auth = getAuthForUser(userId);
    
    // Create API client for this user
    const calendar = google.calendar({ version: "v3", auth });
    
    // Build event object
    const event: any = {
      summary: args.summary,
      start: { dateTime: args.start_time },
      end: { dateTime: args.end_time },
      // ... other fields
    };

    // Make API call as this user
    const response = await calendar.events.insert({
      calendarId: args.calendarId || "primary",
      requestBody: event,
      sendUpdates: args.send_notifications !== false ? "all" : "none",
    });

    return `Event created for ${userId}: ${response.data.htmlLink}\nEvent ID: ${response.data.id}`;
  } catch (error: any) {
    throw new Error(`Failed to create calendar event: ${error.message}`);
  }
}
```

### 4. Optional: User Allowlist

```typescript
// Environment variable with comma-separated allowed users
const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',') || [];

function validateUser(userId: string): void {
  // If allowlist is configured, enforce it
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId)) {
    throw new Error(`User ${userId} is not authorized`);
  }
  
  // Validate email format
  if (!userId.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    throw new Error(`Invalid email format: ${userId}`);
  }
}

function getAuthForUser(userId: string) {
  validateUser(userId);
  // ... rest of implementation
}
```

## Configuration

### Environment Variables

```bash
# Required
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Optional: Default user if userId not provided
GOOGLE_CALENDAR_SUBJECT=default-user@company.com

# Optional: Comma-separated list of allowed users
ALLOWED_USERS=alice@company.com,bob@company.com,charlie@company.com
```

### MCP Settings

```json
{
  "mcpServers": {
    "@prmichaelsen/google-calendar-mcp": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account-key.json",
        "GOOGLE_CALENDAR_SUBJECT": "default@company.com",
        "ALLOWED_USERS": "alice@company.com,bob@company.com"
      }
    }
  }
}
```

## Usage Examples

### Create Event for Specific User

```typescript
{
  "userId": "alice@company.com",
  "summary": "Team Meeting",
  "start_time": "2024-12-25T10:00:00-08:00",
  "end_time": "2024-12-25T11:00:00-08:00"
}
```

### Create Event for Default User

```typescript
{
  // userId omitted, uses GOOGLE_CALENDAR_SUBJECT
  "summary": "Team Meeting",
  "start_time": "2024-12-25T10:00:00-08:00",
  "end_time": "2024-12-25T11:00:00-08:00"
}
```

## Benefits

✅ **Single Server Instance**: One server serves all users
✅ **Dynamic User Switching**: Change user per request
✅ **Backward Compatible**: Falls back to default user if userId not provided
✅ **Performance**: Auth clients cached per user
✅ **Security**: Optional allowlist enforcement
✅ **Auditability**: Log all operations with userId

## Trade-offs

### Advantages ✅
- Reduced infrastructure (one server vs many)
- Easier deployment and maintenance
- Centralized logging and monitoring
- Shared auth client cache

### Disadvantages ❌
- More complex implementation
- Shared memory space (one user's error could affect others)
- Need to manage auth client cache lifecycle
- Potential security risk if userId validation is weak
- All users share same service account permissions

## Security Considerations

### Critical Security Requirements

1. **Validate All UserIds**
   - Must be valid email format
   - Must be in authorized domain
   - Optional: Check against allowlist

2. **Audit Logging**
   - Log every operation with userId
   - Log authentication attempts
   - Log authorization failures

3. **Rate Limiting**
   - Consider per-user rate limits
   - Prevent one user from exhausting quotas

4. **Error Handling**
   - Don't leak user information in errors
   - Sanitize error messages
   - Log detailed errors server-side only

5. **Cache Management**
   - Implement cache eviction policy
   - Clear cache on configuration changes
   - Monitor cache size

### Example Audit Logging

```typescript
function logOperation(operation: string, userId: string, details: any) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    operation,
    userId,
    details,
  }));
}

async function createCalendarEvent(args: any): Promise<string> {
  const userId = args.userId || GOOGLE_CALENDAR_SUBJECT;
  
  logOperation('create_calendar_event', userId, {
    summary: args.summary,
    start: args.start_time,
  });
  
  // ... rest of implementation
}
```

## Migration Path

### Phase 1: Add Optional userId Parameter
- Add userId to all tool schemas (optional)
- Implement auth client factory
- Fall back to current behavior if userId not provided
- **Backward compatible**

### Phase 2: Enable Multi-Tenancy
- Update documentation with userId usage
- Add user validation
- Implement audit logging
- Deploy with ALLOWED_USERS configuration

### Phase 3: Optimize
- Implement cache eviction
- Add per-user rate limiting
- Add monitoring and metrics
- Performance tuning

## Testing Strategy

### Unit Tests
- Auth client factory
- User validation
- Cache behavior
- Error handling

### Integration Tests
- Multiple users in sequence
- Concurrent user requests
- Cache hit/miss scenarios
- Authorization failures

### Security Tests
- Invalid userId formats
- Unauthorized users
- SQL injection attempts in userId
- Cross-user data access attempts

## Alternative Approaches

### 1. User Context in MCP Protocol
- Extend MCP protocol to include user context
- Would require MCP SDK changes
- More standardized approach

### 2. Separate Server Instances (Current)
- Keep current architecture
- Deploy multiple instances
- Simpler, more isolated
- Higher infrastructure cost

### 3. API Gateway Pattern
- Add API gateway in front
- Gateway handles user routing
- Server remains single-user
- More complex architecture

## Recommendation

**Implement multi-tenancy with userId parameter** if:
- ✅ You have many users (>10)
- ✅ Infrastructure cost is a concern
- ✅ You can implement proper security controls
- ✅ You need centralized logging/monitoring

**Keep current architecture** if:
- ✅ You have few users (<10)
- ✅ Maximum isolation is required
- ✅ Simpler is better for your use case
- ✅ Infrastructure cost is not a concern

---

**Status**: Design proposal ready for implementation  
**Recommendation**: Implement as optional feature with backward compatibility
