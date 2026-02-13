# Error Handling Pattern

**Created**: 2026-02-13  
**Status**: Implemented  

---

## Overview

Pattern for handling errors in MCP servers and Google API integrations. Provides consistent error handling, meaningful error messages, and proper error propagation through the MCP protocol.

## Core Principles

1. **Catch All Errors**: Never let errors crash the server
2. **Meaningful Messages**: Provide context-specific error messages
3. **Structured Responses**: Use MCP error response format
4. **Validation First**: Validate inputs before operations
5. **Log Appropriately**: Use stderr for error logging

## Implementation

### Environment Validation

```typescript
// Validate required environment variables at startup
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Error: GOOGLE_APPLICATION_CREDENTIALS environment variable is required");
  process.exit(1);
}

if (!process.env.GOOGLE_CALENDAR_SUBJECT) {
  console.error("Error: GOOGLE_CALENDAR_SUBJECT environment variable is required for domain-wide delegation");
  process.exit(1);
}
```

**Rationale**: Fail fast if configuration is invalid. Don't wait for first API call.

### Tool Handler Error Wrapping

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    let result: string;
    switch (name) {
      case "tool_name":
        result = await handleTool(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});
```

**Rationale**: Catch all errors at the handler level and return structured MCP error responses.

### Operation-Specific Error Handling

```typescript
async function createCalendarEvent(args: any): Promise<string> {
  try {
    // Build event object
    const event: any = {
      summary: args.summary,
      start: { dateTime: args.start_time },
      end: { dateTime: args.end_time },
      // ... other fields
    };

    // Make API call
    const response = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      requestBody: event,
      sendUpdates: args.send_notifications !== false ? "all" : "none",
    });

    return `Event created successfully: ${response.data.htmlLink}\nEvent ID: ${response.data.id}`;
  } catch (error: any) {
    // Wrap with context-specific message
    throw new Error(`Failed to create calendar event: ${error.message}`);
  }
}
```

**Rationale**: Wrap API errors with operation context so users know what failed.

### Server Startup Error Handling

```typescript
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Calendar MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
```

**Rationale**: Catch fatal startup errors and exit with non-zero code.

## Error Categories

### Configuration Errors
- Missing environment variables
- Invalid file paths
- Malformed credentials

**Handling**: Validate at startup, exit with error message

### API Errors
- Authentication failures
- Permission denied
- Resource not found
- Rate limiting

**Handling**: Wrap with context, return as MCP error response

### Input Validation Errors
- Missing required parameters
- Invalid parameter types
- Malformed data

**Handling**: Validate early, return clear error message

### Network Errors
- Connection timeouts
- DNS failures
- Network unreachable

**Handling**: Catch and report with retry suggestion

## Error Messages

### Good Error Messages ✅

```
"Error: GOOGLE_APPLICATION_CREDENTIALS environment variable is required"
"Failed to create calendar event: The user must be signed up for Google Calendar"
"Failed to update calendar event: Event not found with ID: abc123"
"Failed to send email: Invalid recipient email address"
```

**Characteristics**:
- Specific about what failed
- Includes context (operation, resource)
- Actionable (tells user what's wrong)
- No internal implementation details

### Bad Error Messages ❌

```
"Error: undefined"
"Failed"
"Error: 403"
"Something went wrong"
```

**Problems**:
- Too vague
- No context
- Not actionable
- Unhelpful for debugging

## Logging Strategy

### Use stderr for Logs

```typescript
// Good: Use stderr for logging
console.error("Calendar MCP Server running on stdio");
console.error("Processing tool request:", toolName);

// Bad: Don't use stdout (reserved for MCP protocol)
console.log("Server started"); // ❌
```

**Rationale**: MCP protocol uses stdout for communication. Logs must go to stderr.

### Log Levels

```typescript
// Startup information
console.error("Server running on stdio");

// Error conditions
console.error("Fatal error running server:", error);

// Don't log sensitive data
// ❌ console.error("Auth token:", token);
// ❌ console.error("Service account key:", key);
```

## Benefits

- **Reliability**: Server doesn't crash on errors
- **Debuggability**: Clear error messages aid troubleshooting
- **User Experience**: Users understand what went wrong
- **Maintainability**: Consistent error handling pattern
- **Security**: No sensitive data in error messages

## Anti-Patterns

❌ **Don't expose internal errors**: Wrap with user-friendly messages
❌ **Don't ignore errors**: Always handle or propagate
❌ **Don't log to stdout**: Use stderr for logs
❌ **Don't crash on API errors**: Catch and return error response
❌ **Don't include sensitive data**: No tokens, keys, or credentials in errors
❌ **Don't use generic messages**: Be specific about what failed

## Testing Error Handling

### Test Cases

1. **Missing environment variables**: Server exits with error
2. **Invalid credentials**: API calls fail with clear message
3. **Missing required parameters**: Validation error returned
4. **API failures**: Wrapped error with context
5. **Unknown tool**: Error response with tool name

### Verification

```bash
# Test missing environment variable
unset GOOGLE_APPLICATION_CREDENTIALS
node build/index.js
# Should exit with error message

# Test invalid event ID
# Should return: "Failed to update calendar event: Event not found"

# Test unknown tool
# Should return: "Unknown tool: invalid_tool_name"
```

## Example: Complete Error Flow

```typescript
// 1. Startup validation
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Error: GOOGLE_APPLICATION_CREDENTIALS required");
  process.exit(1); // Fail fast
}

// 2. Request handler catches all errors
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // 3. Operation-specific error handling
    result = await createCalendarEvent(args);
    return { content: [{ type: "text", text: result }] };
  } catch (error: any) {
    // 4. Return structured error response
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// 5. Fatal error handling
runServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

---

**Status**: Production pattern in use  
**Recommendation**: Apply this pattern consistently across all MCP servers and API integrations
