# Task: Refactor for Multi-Tenancy Support

**Milestone**: Multi-Tenancy Preparation  
**Estimated Time**: 4-6 hours  
**Dependencies**: None  
**Status**: Not Started  

---

## Objective

Refactor the Google Calendar MCP server to support multi-tenancy by:
1. Creating a server factory function that accepts user credentials
2. Exporting the factory for use by wrapper projects
3. Maintaining backward compatibility with single-user mode
4. Renaming tools with `google_` prefix for mcp-auth compatibility

## Background

This task prepares the base MCP server to be wrapped by `@prmichaelsen/mcp-auth` for multi-tenant deployments. The refactor enables a separate `google-calendar-mcp-server` project to import and wrap this server without modifying core logic.

See [`agent/design/mcp-auth-integration-plan.md`](../design/mcp-auth-integration-plan.md) for full integration architecture.

## Steps

### 1. Create Server Factory Function

**File**: `src/server-factory.ts`

Create a new file that exports a factory function:

```typescript
export function createGoogleCalendarServer(
  userEmail: string,
  userId: string,
  options: GoogleCalendarServerOptions
): Server
```

**Requirements**:
- Accept `userEmail` for service account impersonation
- Accept `userId` for tracking/logging
- Accept `options` object with:
  - `serviceAccountKeyPath: string` (required)
  - `calendarId?: string` (optional, defaults to "primary")
- Return configured MCP `Server` instance
- Register all 6 tools internally
- All tools must be prefixed with `google_` (e.g., `google_create_calendar_event`)

**Implementation**:
- Move auth initialization inside factory
- Use `userEmail` as `subject` for domain-wide delegation
- Move all tool definitions and handlers into factory
- Keep tool implementation functions separate (can be imported)

### 2. Rename All Tools with `google_` Prefix

**Current Names** → **New Names**:
- `create_calendar_event` → `google_create_calendar_event`
- `list_calendar_events` → `google_list_calendar_events`
- `update_calendar_event` → `google_update_calendar_event`
- `send_email` → `google_send_email`
- `list_emails` → `google_list_emails`
- `read_email` → `google_read_email`

**Why**: The `google_` prefix is required by mcp-auth's tool naming convention. The wrapper strips the prefix when forwarding to the base server.

**Changes Required**:
- Update tool names in tool definitions
- Update switch cases in CallToolRequestSchema handler
- Update documentation and examples

### 3. Extract Tool Implementation Functions

**File**: `src/tools/calendar-tools.ts` and `src/tools/email-tools.ts`

Move tool implementation logic to separate files:

```typescript
// src/tools/calendar-tools.ts
export async function createCalendarEvent(
  calendar: any,
  calendarId: string,
  args: any
): Promise<string> {
  // ... existing implementation
}

export async function listCalendarEvents(
  calendar: any,
  calendarId: string,
  args: any
): Promise<string> {
  // ... existing implementation
}

export async function updateCalendarEvent(
  calendar: any,
  calendarId: string,
  args: any
): Promise<string> {
  // ... existing implementation
}
```

```typescript
// src/tools/email-tools.ts
export async function sendEmail(
  gmail: any,
  args: any
): Promise<string> {
  // ... existing implementation
}

export async function listEmails(
  gmail: any,
  args: any
): Promise<string> {
  // ... existing implementation
}

export async function readEmail(
  gmail: any,
  args: any
): Promise<string> {
  // ... existing implementation
}
```

**Benefits**:
- Cleaner code organization
- Easier to test
- Reusable across factory and standalone modes

### 4. Update package.json Exports

Add factory export to `package.json`:

```json
{
  "name": "@prmichaelsen/google-calendar-mcp",
  "version": "2.0.0",
  "type": "module",
  "main": "build/index.js",
  "exports": {
    ".": "./build/index.js",
    "./factory": "./build/server-factory.js",
    "./tools/calendar": "./build/tools/calendar-tools.js",
    "./tools/email": "./build/tools/email-tools.js"
  },
  "files": [
    "build/**/*",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ]
}
```

**Why**: Allows wrapper project to import factory:
```typescript
import { createGoogleCalendarServer } from '@prmichaelsen/google-calendar-mcp/factory';
```

### 5. Maintain Backward Compatibility

**File**: `src/index.ts`

Keep existing single-user mode working:

```typescript
#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGoogleCalendarServer } from "./server-factory.js";

// Environment variables (existing)
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";
const GOOGLE_CALENDAR_SUBJECT = process.env.GOOGLE_CALENDAR_SUBJECT;

// Validate (existing)
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Error: GOOGLE_APPLICATION_CREDENTIALS required");
  process.exit(1);
}

if (!GOOGLE_CALENDAR_SUBJECT) {
  console.error("Error: GOOGLE_CALENDAR_SUBJECT required");
  process.exit(1);
}

// Create server using factory
const server = createGoogleCalendarServer(
  GOOGLE_CALENDAR_SUBJECT,
  "single-user", // userId for single-user mode
  {
    serviceAccountKeyPath: GOOGLE_APPLICATION_CREDENTIALS,
    calendarId: GOOGLE_CALENDAR_ID,
  }
);

// Start server (existing)
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

**Result**: Existing users can upgrade without breaking changes.

### 6. Update TypeScript Configuration

Ensure proper module resolution for exports:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 7. Update Documentation

**Files to Update**:
- `README.md` - Add factory usage section
- `CHANGELOG.md` - Document v2.0.0 changes
- `agent/progress.yaml` - Add new milestone

**README.md Addition**:

```markdown
## Using as a Library

This package can be used as a base for multi-tenant MCP servers:

```typescript
import { createGoogleCalendarServer } from '@prmichaelsen/google-calendar-mcp/factory';

const server = createGoogleCalendarServer(
  'user@workspace.com',  // User to impersonate
  'user-123',            // User ID for tracking
  {
    serviceAccountKeyPath: '/path/to/key.json',
    calendarId: 'primary'
  }
);
```

See [mcp-auth integration plan](agent/design/mcp-auth-integration-plan.md) for multi-tenant deployment.
```

## Verification Steps

- [ ] TypeScript compiles without errors: `npm run build`
- [ ] Single-user mode still works: `npm start` (with env vars)
- [ ] Factory can be imported: `import { createGoogleCalendarServer } from '@prmichaelsen/google-calendar-mcp/factory'`
- [ ] All 6 tools have `google_` prefix
- [ ] Tool implementations work correctly
- [ ] Package exports are correct
- [ ] Documentation updated

## Testing

### Unit Tests (Optional but Recommended)

```typescript
// test/server-factory.test.ts
import { createGoogleCalendarServer } from '../src/server-factory.js';

describe('createGoogleCalendarServer', () => {
  it('should create server with correct tools', async () => {
    const server = createGoogleCalendarServer(
      'test@workspace.com',
      'test-user',
      { serviceAccountKeyPath: '/path/to/key.json' }
    );
    
    // Verify server is created
    expect(server).toBeDefined();
    
    // Verify tools are registered (would need to expose tool list)
    // This is a placeholder - actual test would verify tool registration
  });
});
```

### Integration Test

```bash
# Test single-user mode
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
export GOOGLE_CALENDAR_SUBJECT=test@workspace.com
npm start

# In another terminal, test MCP protocol
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm start
```

## File Structure After Refactor

```
src/
├── index.ts                      # Single-user mode (uses factory)
├── server-factory.ts             # Factory function (NEW)
├── tools/                        # Tool implementations (NEW)
│   ├── calendar-tools.ts
│   └── email-tools.ts
└── types.ts                      # Shared types (optional)

build/                            # Compiled output
├── index.js
├── index.d.ts
├── server-factory.js
├── server-factory.d.ts
├── tools/
│   ├── calendar-tools.js
│   ├── calendar-tools.d.ts
│   ├── email-tools.js
│   └── email-tools.d.ts
```

## Breaking Changes

**None** - This is a backward-compatible refactor:
- Existing single-user mode continues to work
- Tool names change but only affect new multi-tenant deployments
- Package exports are additive

## Next Steps After This Task

Once this task is complete:

1. **Publish v2.0.0** to npm with factory exports
2. **Create wrapper project** (`google-calendar-mcp-server`) in separate repo
3. **Implement mcp-auth integration** following bootstrap pattern
4. **Deploy multi-tenant server** to Cloud Run

## Notes

- Keep service account authentication logic unchanged
- Don't modify Google API integration
- Focus on structure, not functionality
- Maintain all existing features
- Add factory pattern on top of existing code

---

**Status**: Ready to implement  
**Blockers**: None  
**Estimated Completion**: 4-6 hours
