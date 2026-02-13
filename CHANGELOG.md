# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/prmichaelsen/calendar-mcp-server/releases/tag/v1.0.0
