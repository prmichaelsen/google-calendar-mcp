# Integration Plan: Wrapping Google Calendar MCP with mcp-auth

**Created**: 2026-02-13  
**Status**: Design Proposal  
**Pattern**: Bootstrap Pattern from agentbase-mcp-server  

---

## Overview

Transform the single-user Google Calendar MCP server into a multi-tenant service by wrapping it with `@prmichaelsen/mcp-auth`. This enables Platform JWT authentication and per-user Google Calendar/Gmail access without modifying the core server logic.

## Architecture

```
Client (Platform JWT)
  ↓
Platform JWT Provider (validates JWT → userId)
  ↓
Google Token Resolver (userId → Google credentials via platform API)
  ↓
Google Calendar MCP Server Factory (creates per-user server instance)
  ↓
Google Calendar/Gmail APIs
```

## Key Differences from Standard Pattern

Unlike typical OAuth-based services (Instagram, GitHub, Slack), Google Calendar uses **service account authentication with domain-wide delegation**. This requires special handling:

1. **Service Account Key**: Shared across all users (not per-user tokens)
2. **User Impersonation**: Service account impersonates different users via `subject` parameter
3. **Credentials Storage**: Platform stores user email addresses, not OAuth tokens
4. **Domain Restriction**: All users must be in the same Google Workspace domain

## Implementation Steps

### Step 1: Refactor Current Server to Factory Pattern

Create a new file that exports a server factory function:

**src/server-factory.ts**:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";

export interface GoogleCalendarServerOptions {
  serviceAccountKeyPath: string;
  calendarId?: string;
}

/**
 * Create a Google Calendar MCP server instance for a specific user
 * @param userEmail - Email address to impersonate (must be in Google Workspace domain)
 * @param userId - Platform user ID for tracking
 * @param options - Server configuration options
 */
export function createGoogleCalendarServer(
  userEmail: string,
  userId: string,
  options: GoogleCalendarServerOptions
): Server {
  // Initialize service account auth with user impersonation
  const auth = new google.auth.GoogleAuth({
    keyFile: options.serviceAccountKeyPath,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    clientOptions: {
      subject: userEmail, // Impersonate this user
    },
  });

  const calendar = google.calendar({ version: "v3", auth });
  const gmail = google.gmail({ version: "v1", auth });
  const calendarId = options.calendarId || "primary";

  // Create MCP server
  const server = new Server(
    {
      name: "google-calendar-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools with google_ prefix (required by mcp-auth pattern)
  const tools: Tool[] = [
    {
      name: "google_create_calendar_event",
      description: "Create a new event in Google Calendar",
      inputSchema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title" },
          description: { type: "string", description: "Event description" },
          start_time: { type: "string", description: "Start time (ISO 8601)" },
          end_time: { type: "string", description: "End time (ISO 8601)" },
          location: { type: "string", description: "Event location" },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Attendee email addresses",
          },
          reminders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                method: { type: "string", enum: ["email", "popup"] },
                minutes: { type: "number" },
              },
            },
          },
        },
        required: ["summary", "start_time", "end_time"],
      },
    },
    {
      name: "google_list_calendar_events",
      description: "List upcoming calendar events",
      inputSchema: {
        type: "object",
        properties: {
          max_results: { type: "number", default: 10 },
          time_min: { type: "string" },
          time_max: { type: "string" },
        },
      },
    },
    {
      name: "google_update_calendar_event",
      description: "Update an existing calendar event",
      inputSchema: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID to update" },
          summary: { type: "string" },
          description: { type: "string" },
          start_time: { type: "string" },
          end_time: { type: "string" },
          location: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          reminders: { type: "array" },
        },
        required: ["event_id"],
      },
    },
    {
      name: "google_send_email",
      description: "Send an email via Gmail",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "array", items: { type: "string" } },
          subject: { type: "string" },
          body: { type: "string" },
          cc: { type: "array", items: { type: "string" } },
          bcc: { type: "array", items: { type: "string" } },
          is_html: { type: "boolean", default: false },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "google_list_emails",
      description: "List emails from Gmail inbox",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          max_results: { type: "number", default: 10 },
        },
      },
    },
    {
      name: "google_read_email",
      description: "Read full email content",
      inputSchema: {
        type: "object",
        properties: {
          email_id: { type: "string" },
          mark_as_read: { type: "boolean", default: false },
        },
        required: ["email_id"],
      },
    },
  ];

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      let result: string;
      switch (name) {
        case "google_create_calendar_event":
          result = await createCalendarEvent(calendar, calendarId, args);
          break;
        case "google_list_calendar_events":
          result = await listCalendarEvents(calendar, calendarId, args);
          break;
        case "google_update_calendar_event":
          result = await updateCalendarEvent(calendar, calendarId, args);
          break;
        case "google_send_email":
          result = await sendEmail(gmail, args);
          break;
        case "google_list_emails":
          result = await listEmails(gmail, args);
          break;
        case "google_read_email":
          result = await readEmail(gmail, args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// Tool implementation functions (move from index.ts)
async function createCalendarEvent(calendar: any, calendarId: string, args: any): Promise<string> {
  // ... existing implementation
}

async function listCalendarEvents(calendar: any, calendarId: string, args: any): Promise<string> {
  // ... existing implementation
}

async function updateCalendarEvent(calendar: any, calendarId: string, args: any): Promise<string> {
  // ... existing implementation
}

async function sendEmail(gmail: any, args: any): Promise<string> {
  // ... existing implementation
}

async function listEmails(gmail: any, args: any): Promise<string> {
  // ... existing implementation
}

async function readEmail(gmail: any, args: any): Promise<string> {
  // ... existing implementation
}
```

### Step 2: Create Google Credentials Resolver

**src/auth/google-credentials-resolver.ts**:

```typescript
import type {
  ResourceTokenResolver,
  CredentialsAPIResponse,
} from '@prmichaelsen/mcp-auth';

export interface GoogleCredentialsResolverConfig {
  platformUrl: string;
  authProvider: any; // PlatformJWTProvider reference
  cacheCredentials?: boolean;
  cacheTtl?: number;
}

interface CachedCredentials {
  email: string;
  expiresAt: number;
}

/**
 * Resolves Google Workspace user email addresses from platform API
 * Unlike OAuth tokens, we just need the user's email for service account impersonation
 */
export class GoogleCredentialsResolver implements ResourceTokenResolver {
  private config: GoogleCredentialsResolverConfig;
  private credentialsCache = new Map<string, CachedCredentials>();

  constructor(config: GoogleCredentialsResolverConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log('Google credentials resolver initialized');
  }

  /**
   * Resolve user's Google Workspace email address
   * @param userId - Platform user ID
   * @param resourceType - Should be 'google'
   * @returns User's Google Workspace email address
   */
  async resolveToken(userId: string, resourceType: string): Promise<string | null> {
    try {
      const cacheKey = `${userId}:${resourceType}`;

      // Check cache
      if (this.config.cacheCredentials !== false) {
        const cached = this.credentialsCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
          return cached.email;
        }
      }

      // Get JWT token from auth provider
      const jwtToken = this.config.authProvider.getJWTToken(userId);
      if (!jwtToken) {
        console.warn(`No JWT token found for user ${userId}`);
        return null;
      }

      // Call platform API to get user's Google Workspace email
      const url = `${this.config.platformUrl}/api/credentials/${resourceType}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'X-User-ID': userId,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`No Google credentials for user ${userId}`);
          return null;
        }
        throw new Error(`Platform API error: ${response.status}`);
      }

      const data = await response.json() as CredentialsAPIResponse;
      
      // For Google, the "access_token" field contains the user's email address
      const email = data.access_token;
      
      if (!email || !email.includes('@')) {
        console.warn('Invalid email address returned from platform');
        return null;
      }

      // Cache email
      if (this.config.cacheCredentials !== false) {
        const ttl = this.config.cacheTtl || 300000; // 5 minutes
        this.credentialsCache.set(cacheKey, {
          email,
          expiresAt: Date.now() + ttl,
        });
      }

      return email;
    } catch (error) {
      console.error('Failed to resolve Google credentials:', error);
      return null;
    }
  }

  async cleanup(): Promise<void> {
    this.credentialsCache.clear();
  }
}
```

### Step 3: Create Wrapped Server

**src/index-wrapped.ts**:

```typescript
#!/usr/bin/env node

import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createGoogleCalendarServer } from './server-factory.js';
import { PlatformJWTProvider } from './auth/platform-jwt-provider.js';
import { GoogleCredentialsResolver } from './auth/google-credentials-resolver.js';

// Configuration
const config = {
  platform: {
    url: process.env.PLATFORM_URL!,
    serviceToken: process.env.PLATFORM_SERVICE_TOKEN!,
  },
  google: {
    serviceAccountKeyPath: process.env.GOOGLE_APPLICATION_CREDENTIALS!,
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  },
  server: {
    port: parseInt(process.env.PORT || '8080'),
  },
};

// Validate
if (!config.platform.serviceToken) {
  console.error('Error: PLATFORM_SERVICE_TOKEN required');
  process.exit(1);
}

if (!config.platform.url) {
  console.error('Error: PLATFORM_URL required');
  process.exit(1);
}

if (!config.google.serviceAccountKeyPath) {
  console.error('Error: GOOGLE_APPLICATION_CREDENTIALS required');
  process.exit(1);
}

// Create providers
const authProvider = new PlatformJWTProvider({
  serviceToken: config.platform.serviceToken,
  issuer: 'agentbase.me',
  audience: 'mcp-server',
  cacheResults: true,
  cacheTtl: 60000,
});

const credentialsResolver = new GoogleCredentialsResolver({
  platformUrl: config.platform.url,
  authProvider: authProvider,
  cacheCredentials: true,
  cacheTtl: 300000,
});

// Wrap server
const wrappedServer = wrapServer({
  serverFactory: (userEmail: string, userId: string) => {
    return createGoogleCalendarServer(userEmail, userId, {
      serviceAccountKeyPath: config.google.serviceAccountKeyPath,
      calendarId: config.google.calendarId,
    });
  },
  authProvider,
  tokenResolver: credentialsResolver,
  resourceType: 'google', // Tools must be named google_*
  transport: {
    type: 'sse',
    port: config.server.port,
    host: '0.0.0.0',
    basePath: '/mcp',
  },
  middleware: {
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60 * 60 * 1000,
    },
    logging: {
      enabled: true,
      level: 'info',
    },
  },
});

// Start
async function main() {
  await wrappedServer.start();
  console.log(`Google Calendar MCP Server running on port ${config.server.port}`);
  console.log(`Endpoint: http://0.0.0.0:${config.server.port}/mcp`);
}

process.on('SIGINT', async () => {
  await wrappedServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await wrappedServer.stop();
  process.exit(0);
});

main();
```

### Step 4: Copy Platform JWT Provider

Copy the `PlatformJWTProvider` from the bootstrap pattern (already shown in bootstrap.md).

**src/auth/platform-jwt-provider.ts**: (Use code from bootstrap.md Step 6)

### Step 5: Update package.json

```json
{
  "name": "@prmichaelsen/google-calendar-mcp",
  "version": "2.0.0",
  "description": "Multi-tenant Google Calendar and Gmail MCP Server",
  "type": "module",
  "main": "build/index.js",
  "exports": {
    ".": "./build/index.js",
    "./factory": "./build/server-factory.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "start:wrapped": "node build/index-wrapped.js",
    "dev": "tsc && node build/index.js",
    "dev:wrapped": "tsx watch src/index-wrapped.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@prmichaelsen/mcp-auth": "^4.0.0",
    "googleapis": "^144.0.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/jsonwebtoken": "^9.0.5",
    "tsx": "^4.7.0",
    "typescript": "^5.6.0"
  }
}
```

### Step 6: Environment Configuration

**.env.example**:

```env
# Platform JWT (shared secret for JWT validation)
PLATFORM_SERVICE_TOKEN=your-shared-secret

# Platform API (for user email resolution)
PLATFORM_URL=https://your-platform.com

# Google Service Account
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
GOOGLE_CALENDAR_ID=primary

# Server
PORT=8080
NODE_ENV=development
LOG_LEVEL=info
```

## Platform API Requirements

The platform must implement a credentials endpoint that returns the user's Google Workspace email:

```typescript
// GET /api/credentials/google
// Headers: { Authorization: Bearer <jwt-token>, X-User-ID: <user-id> }

export async function GET(request: Request) {
  // 1. Validate JWT
  const jwtToken = request.headers.get('Authorization')?.replace('Bearer ', '');
  const userId = request.headers.get('X-User-ID');
  
  // 2. Query database for user's Google Workspace email
  const user = await db.query(
    'SELECT google_workspace_email FROM users WHERE id = $1',
    [userId]
  );
  
  if (!user.rows[0]?.google_workspace_email) {
    return Response.json({ error: 'Google Workspace email not configured' }, { status: 404 });
  }
  
  // 3. Return email in access_token field (mcp-auth convention)
  return Response.json({
    access_token: user.rows[0].google_workspace_email,
    // No expires_at needed (email doesn't expire)
  });
}
```

## Key Differences from OAuth Pattern

| Aspect | OAuth Services (Instagram, GitHub) | Google Calendar (Service Account) |
|--------|-----------------------------------|-----------------------------------|
| **Credentials** | Per-user OAuth tokens | Shared service account key |
| **Platform Stores** | OAuth access/refresh tokens | User email addresses |
| **Authentication** | OAuth token per user | Service account impersonates user |
| **Token Expiry** | Yes (need refresh) | No (email doesn't expire) |
| **Setup** | OAuth app per service | One service account for all users |
| **Domain Restriction** | No | Yes (Google Workspace only) |

## Security Considerations

1. **Service Account Key Protection**
   - Store key file securely (not in version control)
   - Use environment variable for path
   - Rotate keys periodically
   - Use separate keys per environment

2. **Domain-Wide Delegation**
   - Only works within single Google Workspace domain
   - Requires admin setup in Google Admin Console
   - All users must be in authorized domain

3. **Email Validation**
   - Validate email format from platform API
   - Ensure email is in authorized domain
   - Log all impersonation attempts

4. **Rate Limiting**
   - Google Calendar API: 1M queries/day
   - Gmail API: 1B quota units/day
   - Implement per-user rate limiting

## Testing

### Local Testing

```bash
# Start wrapped server
npm run dev:wrapped

# Generate test JWT
node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({ userId: 'test-user' }, 'your-service-token', { issuer: 'agentbase.me', audience: 'mcp-server', expiresIn: '1h' }))"

# Test endpoint
curl -X POST http://localhost:8080/mcp/message \
  -H "Authorization: Bearer <jwt-from-above>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Platform API Mock

For testing, create a mock platform API that returns test email addresses:

```typescript
// mock-platform-api.ts
import express from 'express';
import jwt from 'jsonwebtoken';

const app = express();

app.get('/api/credentials/google', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'];
  
  try {
    jwt.verify(token, process.env.PLATFORM_SERVICE_TOKEN!);
    
    // Return test email for this user
    res.json({
      access_token: `${userId}@your-workspace.com`,
    });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

app.listen(3000, () => console.log('Mock platform API on :3000'));
```

## Migration Path

### Phase 1: Refactor to Factory (Backward Compatible)
- Create `server-factory.ts` with factory function
- Keep existing `index.ts` for single-user mode
- Export factory for wrapping
- **No breaking changes**

### Phase 2: Add Wrapped Server
- Create `index-wrapped.ts` with mcp-auth integration
- Add new npm scripts (`start:wrapped`, `dev:wrapped`)
- Both modes available
- **Choose at runtime**

### Phase 3: Deploy Multi-Tenant
- Deploy wrapped server to Cloud Run
- Configure platform API
- Update platform to store user emails
- **Production multi-tenancy**

## Benefits

✅ **Multi-Tenancy**: Single server instance serves all users
✅ **Platform JWT Auth**: Secure authentication via platform
✅ **Per-User Isolation**: Each user accesses only their calendar/email
✅ **Backward Compatible**: Original single-user mode still works
✅ **Zero Core Changes**: Server logic unchanged
✅ **Centralized Credentials**: Platform manages user emails
✅ **Audit Trail**: All operations logged with userId

## Recommendation

**Implement this pattern if**:
- ✅ You have a platform managing multiple users
- ✅ All users are in same Google Workspace domain
- ✅ You want centralized credential management
- ✅ You need audit logging per user
- ✅ Infrastructure cost is a concern

**Keep single-user mode if**:
- ✅ You have only one user
- ✅ Users are in different domains
- ✅ Simpler deployment is preferred
- ✅ No platform integration needed

---

**Status**: Design ready for implementation  
**Next Steps**: Implement Phase 1 (factory refactor) first, then Phase 2 (wrapped server)
