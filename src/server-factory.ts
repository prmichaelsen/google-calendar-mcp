/**
 * Server factory for Google Calendar MCP Server
 * Creates per-user server instances for multi-tenant deployments
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import {
  createCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "./tools/calendar-tools.js";
import {
  sendEmail,
  listEmails,
  readEmail,
} from "./tools/email-tools.js";

export interface GoogleCalendarServerOptions {
  /**
   * Service account credentials - can be:
   * - File path (string): "/path/to/key.json"
   * - JSON string: '{"type":"service_account",...}'
   * - Credentials object: {type:"service_account",...}
   */
  serviceAccountKey: string | any;
  calendarId?: string;
}

/**
 * Create a Google Calendar MCP server instance for a specific user
 * @param userEmail - Email address to impersonate (must be in Google Workspace domain)
 * @param userId - Platform user ID for tracking/logging
 * @param options - Server configuration options
 * @returns Configured MCP Server instance
 */
export function createGoogleCalendarServer(
  userEmail: string,
  userId: string,
  options: GoogleCalendarServerOptions
): Server {
  // Initialize service account auth with user impersonation
  // Auto-detect if serviceAccountKey is a path, JSON string, or object
  const authConfig: any = {
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    clientOptions: {
      subject: userEmail, // Impersonate this user
    },
  };

  const key = options.serviceAccountKey;
  
  if (typeof key === 'string') {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(key);
      if (parsed.type === 'service_account') {
        // It's a JSON string containing credentials
        authConfig.credentials = parsed;
      } else {
        // Not valid service account JSON, treat as file path
        authConfig.keyFile = key;
      }
    } catch {
      // Not JSON, treat as file path
      authConfig.keyFile = key;
    }
  } else if (typeof key === 'object' && key !== null) {
    // It's already a credentials object
    authConfig.credentials = key;
  } else {
    throw new Error('serviceAccountKey must be a file path, JSON string, or credentials object');
  }

  const auth = new google.auth.GoogleAuth(authConfig);

  const calendar = google.calendar({ version: "v3", auth });
  const gmail = google.gmail({ version: "v1", auth });
  const calendarId = options.calendarId || "primary";

  // Create MCP server
  const server = new Server(
    {
      name: "google-calendar-mcp-server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools with google_calendar_ prefix (matches resourceType: 'google-calendar')
  const tools: Tool[] = [
    {
      name: "google_calendar_create_calendar_event",
      description:
        "Create a new event in Google Calendar with specified details including title, description, start/end times, and optional attendees",
      inputSchema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Event title/summary",
          },
          description: {
            type: "string",
            description: "Event description (optional)",
          },
          start_time: {
            type: "string",
            description: "Start time in ISO 8601 format (e.g., 2024-12-25T10:00:00-08:00)",
          },
          end_time: {
            type: "string",
            description: "End time in ISO 8601 format (e.g., 2024-12-25T11:00:00-08:00)",
          },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "List of attendee email addresses (optional)",
          },
          location: {
            type: "string",
            description: "Event location (optional)",
          },
          send_notifications: {
            type: "boolean",
            description: "Send email notifications to attendees (default: true)",
            default: true,
          },
          reminders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                method: {
                  type: "string",
                  enum: ["email", "popup"],
                  description: "Reminder method: 'email' or 'popup'",
                },
                minutes: {
                  type: "number",
                  description: "Minutes before event to send reminder (e.g., 10, 1440 for 1 day)",
                },
              },
              required: ["method", "minutes"],
            },
            description: "Event reminders (optional). Example: [{method: 'popup', minutes: 10}, {method: 'email', minutes: 1440}]",
          },
        },
        required: ["summary", "start_time", "end_time"],
      },
    },
    {
      name: "google_calendar_list_calendar_events",
      description:
        "List upcoming events from Google Calendar within a specified time range",
      inputSchema: {
        type: "object",
        properties: {
          max_results: {
            type: "number",
            description: "Maximum number of events to return (default: 10)",
            default: 10,
          },
          time_min: {
            type: "string",
            description:
              "Lower bound for event start time in ISO 8601 format (default: now)",
          },
          time_max: {
            type: "string",
            description: "Upper bound for event start time in ISO 8601 format (optional)",
          },
        },
      },
    },
    {
      name: "google_calendar_update_calendar_event",
      description:
        "Update an existing calendar event by event ID. Can modify title, description, times, location, and attendees.",
      inputSchema: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "Event ID to update (required)",
          },
          summary: {
            type: "string",
            description: "Event title/summary (optional)",
          },
          description: {
            type: "string",
            description: "Event description (optional)",
          },
          start_time: {
            type: "string",
            description: "Start time in ISO 8601 format (optional)",
          },
          end_time: {
            type: "string",
            description: "End time in ISO 8601 format (optional)",
          },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "List of attendee email addresses (optional)",
          },
          location: {
            type: "string",
            description: "Event location (optional)",
          },
          send_notifications: {
            type: "boolean",
            description: "Send email notifications to attendees about the update (default: true)",
            default: true,
          },
          reminders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                method: {
                  type: "string",
                  enum: ["email", "popup"],
                  description: "Reminder method: 'email' or 'popup'",
                },
                minutes: {
                  type: "number",
                  description: "Minutes before event to send reminder",
                },
              },
              required: ["method", "minutes"],
            },
            description: "Event reminders (optional)",
          },
        },
        required: ["event_id"],
      },
    },
    {
      name: "google_calendar_send_email",
      description:
        "Send an email from the configured Gmail account. Supports plain text and HTML emails with optional attachments.",
      inputSchema: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses",
          },
          subject: {
            type: "string",
            description: "Email subject",
          },
          body: {
            type: "string",
            description: "Email body (plain text or HTML)",
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "CC email addresses (optional)",
          },
          bcc: {
            type: "array",
            items: { type: "string" },
            description: "BCC email addresses (optional)",
          },
          is_html: {
            type: "boolean",
            description: "Whether body is HTML (default: false)",
            default: false,
          },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "google_calendar_list_emails",
      description:
        "List emails from Gmail inbox with optional search query. Returns email metadata including ID, subject, sender, and snippet.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Gmail search query (e.g., 'from:alice@example.com', 'subject:meeting', 'is:unread')",
          },
          max_results: {
            type: "number",
            description: "Maximum number of emails to return (default: 10, max: 100)",
            default: 10,
          },
        },
      },
    },
    {
      name: "google_calendar_read_email",
      description:
        "Read the full content of an email by its ID. Returns subject, sender, recipients, body, and metadata.",
      inputSchema: {
        type: "object",
        properties: {
          email_id: {
            type: "string",
            description: "Email ID to read (from list_emails)",
          },
          mark_as_read: {
            type: "boolean",
            description: "Mark email as read after fetching (default: false)",
            default: false,
          },
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

      if (!args) {
        throw new Error("No arguments provided");
      }

      let result: string;
      switch (name) {
        case "google_calendar_create_calendar_event":
          result = await createCalendarEvent(calendar, calendarId, args);
          break;
        case "google_calendar_list_calendar_events":
          result = await listCalendarEvents(calendar, calendarId, args);
          break;
        case "google_calendar_update_calendar_event":
          result = await updateCalendarEvent(calendar, calendarId, args);
          break;
        case "google_calendar_send_email":
          result = await sendEmail(gmail, args);
          break;
        case "google_calendar_list_emails":
          result = await listEmails(gmail, args);
          break;
        case "google_calendar_read_email":
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

  return server;
}
