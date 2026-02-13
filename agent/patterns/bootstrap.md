# Bootstrap Pattern for Google Calendar MCP Server

**Created**: 2026-02-13  
**Status**: Ready for Implementation  
**Reference Projects**:
- `/home/prmichaelsen/agentbase-mcp-server` - Instagram MCP wrapper
- `/home/prmichaelsen/mcp-auth` - Authentication framework

---

## Overview

This pattern describes how to create a multi-tenant wrapper for the Google Calendar MCP server using `@prmichaelsen/mcp-auth`. The wrapper will enable Platform JWT authentication and per-user Google Calendar/Gmail access.

## Architecture

```
Client (Platform JWT)
  ↓
Platform JWT Provider (validates JWT → userId)
  ↓
Google Credentials Resolver (userId → Google Workspace email via platform API)
  ↓
Google Calendar MCP Server Factory (creates per-user server instance)
  ↓
Google Calendar/Gmail APIs (via service account impersonation)
```

## Key Differences from Standard OAuth Pattern

Unlike typical OAuth-based services (Instagram, GitHub, Slack), Google Calendar uses **service account authentication with domain-wide delegation**:

| Aspect | OAuth Services | Google Calendar (Service Account) |
|--------|----------------|-----------------------------------|
| **Credentials** | Per-user OAuth tokens | Shared service account key |
| **Platform Stores** | OAuth access/refresh tokens | User email addresses |
| **Authentication** | OAuth token per user | Service account impersonates user |
| **Token Expiry** | Yes (need refresh) | No (email doesn't expire) |
| **Setup** | OAuth app per service | One service account for all users |
| **Domain Restriction** | No | Yes (Google Workspace only) |

## Project Structure

```
google-calendar-mcp-server/           # New wrapper project
├── src/
│   ├── index.ts                      # Main entry point with wrapServer
│   └── auth/
│       ├── platform-jwt-provider.ts  # JWT validation
│       └── google-credentials-resolver.ts  # Email resolution
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile                        # For Cloud Run deployment
├── cloudbuild.yaml                   # GCP build configuration
└── README.md
```

## Implementation Steps

### Step 1: Create New Project

```bash
mkdir google-calendar-mcp-server
cd google-calendar-mcp-server
npm init -y
```

### Step 2: Install Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@prmichaelsen/google-calendar-mcp": "^2.0.0",
    "@prmichaelsen/mcp-auth": "^7.0.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^22.10.2",
    "tsx": "^4.7.0",
    "typescript": "^5.7.2"
  }
}
```

### Step 3: Create Platform JWT Provider

**File**: `src/auth/platform-jwt-provider.ts`

```typescript
import type { AuthProvider, AuthResult, RequestContext } from '@prmichaelsen/mcp-auth';
import jwt from 'jsonwebtoken';

export interface PlatformJWTProviderConfig {
  serviceToken: string;      // Shared secret for JWT validation
  issuer?: string;           // Expected issuer (default: 'agentbase.me')
  audience?: string;         // Expected audience (default: 'mcp-server')
  cacheResults?: boolean;    // Cache auth results (default: true)
  cacheTtl?: number;         // Cache TTL in ms (default: 60000)
}

interface CachedAuthResult {
  result: AuthResult;
  expiresAt: number;
  jwtToken: string;
}

export class PlatformJWTProvider implements AuthProvider {
  private config: Required<PlatformJWTProviderConfig>;
  private authCache = new Map<string, CachedAuthResult>();
  public jwtTokenCache = new Map<string, string>();
  
  constructor(config: PlatformJWTProviderConfig) {
    this.config = {
      issuer: 'agentbase.me',
      audience: 'mcp-server',
      cacheResults: true,
      cacheTtl: 60000,
      ...config
    };
  }
  
  async initialize(): Promise<void> {
    console.log('[PlatformJWTProvider] Initialized');
  }
  
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      const authHeader = context.headers?.['authorization'];
      
      if (!authHeader || Array.isArray(authHeader)) {
        return {
          authenticated: false,
          error: 'No authorization header provided'
        };
      }
      
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return {
          authenticated: false,
          error: 'Invalid authorization header format'
        };
      }
      
      const token = parts[1];
      
      // Check cache
      if (this.config.cacheResults) {
        const cached = this.authCache.get(token);
        if (cached && Date.now() < cached.expiresAt) {
          return cached.result;
        }
      }
      
      // Verify JWT
      const decoded = jwt.verify(token, this.config.serviceToken, {
        issuer: this.config.issuer,
        audience: this.config.audience
      }) as jwt.JwtPayload & { userId: string };
      
      if (!decoded.userId) {
        return {
          authenticated: false,
          error: 'Invalid token: missing userId claim'
        };
      }
      
      const result: AuthResult = {
        authenticated: true,
        userId: decoded.userId,
        metadata: {
          issuer: decoded.iss,
          audience: decoded.aud,
          issuedAt: decoded.iat,
          expiresAt: decoded.exp
        }
      };
      
      // Cache result and JWT token
      if (this.config.cacheResults) {
        this.authCache.set(token, {
          result,
          expiresAt: Date.now() + this.config.cacheTtl,
          jwtToken: token
        });
      }
      
      this.jwtTokenCache.set(decoded.userId, token);
      return result;
      
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { authenticated: false, error: 'Token expired' };
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return { authenticated: false, error: `Invalid token: ${error.message}` };
      }
      return {
        authenticated: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }
  
  async cleanup(): Promise<void> {
    this.authCache.clear();
    this.jwtTokenCache.clear();
  }
  
  getJWTToken(userId: string): string | undefined {
    return this.jwtTokenCache.get(userId);
  }
}
```

### Step 4: Create Google Credentials Resolver

**File**: `src/auth/google-credentials-resolver.ts`

```typescript
import type { ResourceTokenResolver, CredentialsAPIResponse } from '@prmichaelsen/mcp-auth';
import type { PlatformJWTProvider } from './platform-jwt-provider.js';

export interface GoogleCredentialsResolverConfig {
  platformUrl: string;
  authProvider: PlatformJWTProvider;
  cacheCredentials?: boolean;
  cacheTtl?: number;
}

interface CachedCredentials {
  email: string;
  expiresAt: number;
}

/**
 * Google Credentials Resolver
 * 
 * Resolves Google Workspace user email addresses from platform API.
 * Unlike OAuth tokens, we just need the user's email for service account impersonation.
 * 
 * The platform API returns the user's Google Workspace email address,
 * which the service account uses to impersonate the user via domain-wide delegation.
 */
export class GoogleCredentialsResolver implements ResourceTokenResolver {
  private config: GoogleCredentialsResolverConfig;
  private credentialsCache = new Map<string, CachedCredentials>();
  
  constructor(config: GoogleCredentialsResolverConfig) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    console.log('[GoogleCredentialsResolver] Initialized');
  }
  
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
        console.warn(`[GoogleCredentialsResolver] No JWT token for user ${userId}`);
        return null;
      }
      
      // Call platform API to get user's Google Workspace email
      const url = `${this.config.platformUrl}/api/credentials/${resourceType}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'X-User-ID': userId,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[GoogleCredentialsResolver] No Google credentials for user ${userId}`);
          return null;
        }
        throw new Error(`Platform API error: ${response.status}`);
      }
      
      const data = await response.json() as CredentialsAPIResponse;
      
      // For Google, the "access_token" field contains the user's email address
      const email = data.access_token;
      
      if (!email || !email.includes('@')) {
        console.warn('[GoogleCredentialsResolver] Invalid email address from platform');
        return null;
      }
      
      // Cache email
      if (this.config.cacheCredentials !== false) {
        const ttl = this.config.cacheTtl || 300000; // 5 minutes
        this.credentialsCache.set(cacheKey, {
          email,
          expiresAt: Date.now() + ttl
        });
      }
      
      console.log(`[GoogleCredentialsResolver] Resolved email for user ${userId}`);
      return email;
      
    } catch (error) {
      console.error('[GoogleCredentialsResolver] Failed to resolve credentials:', error);
      return null;
    }
  }
  
  async cleanup(): Promise<void> {
    this.credentialsCache.clear();
  }
}
```

### Step 5: Create Main Entry Point

**File**: `src/index.ts`

```typescript
#!/usr/bin/env node

import { wrapServer } from '@prmichaelsen/mcp-auth';
import { createGoogleCalendarServer } from '@prmichaelsen/google-calendar-mcp/factory';
import { PlatformJWTProvider } from './auth/platform-jwt-provider.js';
import { GoogleCredentialsResolver } from './auth/google-credentials-resolver.js';

// Configuration
const config = {
  platform: {
    url: process.env.PLATFORM_URL!,
    serviceToken: process.env.PLATFORM_SERVICE_TOKEN!
  },
  google: {
    serviceAccountKeyPath: process.env.GOOGLE_APPLICATION_CREDENTIALS!,
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary'
  },
  server: {
    port: parseInt(process.env.PORT || '8080')
  }
};

// Validate configuration
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

// Create authentication providers
const authProvider = new PlatformJWTProvider({
  serviceToken: config.platform.serviceToken,
  issuer: 'agentbase.me',
  audience: 'mcp-server',
  cacheResults: true,
  cacheTtl: 60000 // 1 minute
});

const credentialsResolver = new GoogleCredentialsResolver({
  platformUrl: config.platform.url,
  authProvider: authProvider,
  cacheCredentials: true,
  cacheTtl: 300000 // 5 minutes
});

// Wrap server
const wrappedServer = wrapServer({
  // Server factory: creates a new Google Calendar server per user
  serverFactory: (userEmail: string, userId: string) => {
    return createGoogleCalendarServer(userEmail, userId, {
      serviceAccountKeyPath: config.google.serviceAccountKeyPath,
      calendarId: config.google.calendarId
    });
  },
  
  // Authentication
  authProvider,
  tokenResolver: credentialsResolver,
  resourceType: 'google', // Tools must be named google_*
  
  // Transport
  transport: {
    type: 'sse',
    port: config.server.port,
    host: '0.0.0.0',
    basePath: '/mcp',
    cors: true,
    corsOrigin: process.env.CORS_ORIGIN || 'https://agentbase.me'
  },
  
  // Middleware
  middleware: {
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60 * 60 * 1000 // 1 hour per user
    },
    logging: {
      enabled: true,
      level: 'info'
    }
  }
});

// Start server
async function main() {
  try {
    await wrappedServer.start();
    console.log(`Google Calendar MCP Server running on port ${config.server.port}`);
    console.log(`Endpoint: http://0.0.0.0:${config.server.port}/mcp`);
    console.log('Ready to accept requests');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await wrappedServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await wrappedServer.stop();
  process.exit(0);
});

main();
```

### Step 6: Configuration Files

**File**: `.env.example`

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

# CORS (optional)
CORS_ORIGIN=https://agentbase.me
```

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**File**: `package.json`

```json
{
  "name": "@prmichaelsen/google-calendar-mcp-server",
  "version": "1.0.0",
  "description": "Multi-tenant Google Calendar MCP server with Platform JWT authentication",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "keywords": [
    "mcp",
    "google-calendar",
    "gmail",
    "multi-tenant",
    "jwt",
    "authentication",
    "platform"
  ],
  "author": "prmichaelsen",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@prmichaelsen/google-calendar-mcp": "^2.0.0",
    "@prmichaelsen/mcp-auth": "^7.0.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node": "^22.10.2",
    "tsx": "^4.7.0",
    "typescript": "^5.7.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### Step 7: Docker Deployment

**File**: `Dockerfile`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy built files
COPY dist ./dist

# Expose port
EXPOSE 8080

# Run server
CMD ["node", "dist/index.js"]
```

**File**: `cloudbuild.yaml` (for Google Cloud Build)

```yaml
steps:
  # Build TypeScript
  - name: 'node:18'
    entrypoint: npm
    args: ['ci']
  - name: 'node:18'
    entrypoint: npm
    args: ['run', 'build']
  
  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/google-calendar-mcp-server:$COMMIT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/google-calendar-mcp-server:latest'
      - '.'
  
  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/google-calendar-mcp-server:$COMMIT_SHA'
  
  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'google-calendar-mcp-server'
      - '--image'
      - 'gcr.io/$PROJECT_ID/google-calendar-mcp-server:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--set-env-vars'
      - 'PLATFORM_URL=${_PLATFORM_URL},PLATFORM_SERVICE_TOKEN=${_PLATFORM_SERVICE_TOKEN}'
      - '--set-secrets'
      - 'GOOGLE_APPLICATION_CREDENTIALS=google-service-account-key:latest'

images:
  - 'gcr.io/$PROJECT_ID/google-calendar-mcp-server:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/google-calendar-mcp-server:latest'
```

## Platform API Requirements

The platform must implement a credentials endpoint:

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
    return Response.json(
      { error: 'Google Workspace email not configured' },
      { status: 404 }
    );
  }
  
  // 3. Return email in access_token field (mcp-auth convention)
  return Response.json({
    access_token: user.rows[0].google_workspace_email,
    // No expires_at needed (email doesn't expire)
  });
}
```

## Testing

### Local Development

```bash
# 1. Set up environment
cp .env.example .env
# Edit .env with your values

# 2. Build
npm run build

# 3. Run in dev mode
npm run dev

# 4. Test with curl
curl -X POST http://localhost:8080/mcp/message \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Generate Test JWT

```javascript
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'test-user' },
  'your-service-token',
  {
    issuer: 'agentbase.me',
    audience: 'mcp-server',
    expiresIn: '1h'
  }
);
console.log(token);
```

## Deployment to Cloud Run

```bash
# 1. Build and push
gcloud builds submit --config cloudbuild.yaml

# 2. Set secrets
echo -n "your-service-token" | gcloud secrets create platform-service-token --data-file=-
gcloud secrets create google-service-account-key --data-file=/path/to/key.json

# 3. Deploy
gcloud run deploy google-calendar-mcp-server \
  --image gcr.io/PROJECT_ID/google-calendar-mcp-server:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars PLATFORM_URL=https://your-platform.com \
  --set-secrets PLATFORM_SERVICE_TOKEN=platform-service-token:latest,GOOGLE_APPLICATION_CREDENTIALS=google-service-account-key:latest
```

## Security Considerations

1. **Service Account Key Protection**
   - Store as Google Cloud Secret
   - Never commit to version control
   - Rotate periodically
   - Use separate keys per environment

2. **JWT Validation**
   - Verify issuer and audience
   - Check expiration
   - Use strong shared secret
   - Rotate service tokens regularly

3. **Email Validation**
   - Validate email format
   - Ensure email is in authorized domain
   - Log all impersonation attempts

4. **Rate Limiting**
   - Per-user rate limits (100 req/hour)
   - Google API quotas apply
   - Monitor and alert on abuse

## Benefits

✅ **Multi-Tenancy**: Single server serves all users  
✅ **Platform JWT Auth**: Secure authentication via platform  
✅ **Per-User Isolation**: Each user accesses only their calendar/email  
✅ **Centralized Credentials**: Platform manages user emails  
✅ **Audit Trail**: All operations logged with userId  
✅ **Scalable**: Cloud Run auto-scales based on demand  

## Next Steps

1. Create new repository for wrapper project
2. Implement authentication providers
3. Set up Cloud Run deployment
4. Configure platform API endpoint
5. Test with real users
6. Monitor and optimize

---

**Status**: Ready for implementation  
**Reference**: See `/home/prmichaelsen/agentbase-mcp-server` for working example
