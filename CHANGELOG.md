# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-13

### Added

#### Multi-Tenancy Support
- **Server Factory Pattern**: New `createGoogleCalendarServer()` factory function for creating per-user server instances
- **Library Exports**: Package can now be imported as a library with exports for:
  - `@prmichaelsen/google-calendar-mcp/factory` - Server factory function
  - `@prmichaelsen/google-calendar-mcp/tools/calendar` - Calendar tool implementations
  - `@prmichaelsen/google-calendar-mcp/tools/email` - Email tool implementations
- **Modular Architecture**: Tool implementations extracted to separate files for reusability
  - `src/tools/calendar-tools.ts` - Calendar operations
  - `src/tools/email-tools.ts` - Email operations
  - `src/server-factory.ts` - Factory function

#### Documentation
- Multi-tenancy design document ([`agent/design/multi-tenancy-design.md`](agent/design/multi-tenancy-design.md))
- MCP Auth integration plan ([`agent/design/mcp-auth-integration-plan.md`](agent/design/mcp-auth-integration-plan.md))
- Factory usage examples in README
- Task 16 documentation for refactoring process

### Changed

#### Breaking Changes
- **Tool Names**: All tools now prefixed with `google_` for multi-tenant compatibility:
  - `create_calendar_event` → `google_create_calendar_event`
  - `list_calendar_events` → `google_list_calendar_events`
  - `update_calendar_event` → `google_update_calendar_event`
  - `send_email` → `google_send_email`
  - `list_emails` → `google_list_emails`
  - `read_email` → `google_read_email`

#### Architecture
- **Refactored `index.ts`**: Now uses factory pattern while maintaining backward compatibility
- **Server Version**: Updated to 2.0.0 in server metadata
- **Package Exports**: Added explicit exports map in `package.json`
- **Files Field**: Added files field to control npm package contents

### Migration Guide

#### For Standalone Users
Update your MCP settings to use new tool names:

```json
{
  "mcpServers": {
    "@prmichaelsen/google-calendar-mcp": {
      "alwaysAllow": [
        "google_create_calendar_event",
        "google_list_calendar_events",
        "google_update_calendar_event",
        "google_send_email",
        "google_list_emails",
        "google_read_email"
      ]
    }
  }
}
```

#### For Library Users
Import and use the factory:

```typescript
import { createGoogleCalendarServer } from '@prmichaelsen/google-calendar-mcp/factory';

const server = createGoogleCalendarServer(
  'user@workspace.com',
  'user-id',
  { serviceAccountKeyPath: '/path/to/key.json' }
);
```

### Technical Details
- Maintained backward compatibility for single-user deployments
- No changes to Google API integration or authentication logic
- All existing features preserved
- TypeScript compilation with declaration files
- Proper module resolution with Node16

---

## [1.0.0] - 2026-02-13

### Added

#### Core Features
- **Calendar Management**
  - `create_calendar_event` - Create events with attendees, reminders, and notifications
  - `list_calendar_events` - List upcoming events with time range filtering
  - `update_calendar_event` - Update existing events by ID
  - Support for custom reminders (popup/email at any interval)
  - Automatic attendee invitation emails

#### Email Management
- **Gmail Integration**
  - `send_email` - Send plain text or HTML emails with CC/BCC support
  - `list_emails` - Query inbox with Gmail search syntax
  - `read_email` - Read full email content with optional mark-as-read
  - Proper MIME formatting for HTML emails

#### Authentication
- Service account authentication with JSON key file
- Domain-wide delegation for user impersonation
- Support for multiple Google API scopes (Calendar, Gmail)
- Environment-based configuration

#### MCP Protocol
- Full MCP SDK integration with stdio transport
- 6 tools with comprehensive JSON schemas
- Structured error responses
- Type-safe tool definitions

#### Documentation
- Comprehensive README with setup instructions
- Google Cloud Console setup guide
- Domain-wide delegation configuration steps
- Troubleshooting guide for common issues
- API documentation with examples for all tools
- Architecture documentation

#### Agent Context Protocol (ACP)
- Complete ACP structure for agent continuity
- Design documents (requirements, architecture)
- Pattern documents (MCP server, authentication, error handling)
- Milestone documents (3 completed milestones)
- Progress tracking with YAML

### Technical Details
- TypeScript implementation with strict type checking
- ES2022 target with Node16 module resolution
- Full type safety with `@types/node`
- Error handling at all levels
- Environment variable validation

### Configuration
- `GOOGLE_APPLICATION_CREDENTIALS` - Service account key path
- `GOOGLE_CALENDAR_ID` - Calendar to use (defaults to "primary")
- `GOOGLE_CALENDAR_SUBJECT` - User email for domain-wide delegation

### Repository
- Initial release as `@prmichaelsen/google-calendar-mcp`
- Published to GitHub: https://github.com/prmichaelsen/calendar-mcp-server
- MIT License

---

## Future Enhancements

### Planned Features
- Event deletion support
- Recurring event management
- Calendar creation/deletion
- Email attachment support
- Advanced Gmail features (labels, filters)
- Calendar ACL management
- Free/busy time queries

### Technical Improvements
- Unit tests with mocked APIs
- Integration tests
- CI/CD pipeline
- Docker containerization
- Health check endpoint
- Metrics and logging

---

[2.0.0]: https://github.com/prmichaelsen/calendar-mcp-server/releases/tag/v2.0.0
[1.0.0]: https://github.com/prmichaelsen/calendar-mcp-server/releases/tag/v1.0.0
