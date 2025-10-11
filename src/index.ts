#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { readFileSync } from "fs";

// Environment variables
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";
const GOOGLE_CALENDAR_SUBJECT = process.env.GOOGLE_CALENDAR_SUBJECT;

// Validate environment variables
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Error: GOOGLE_APPLICATION_CREDENTIALS environment variable is required");
  process.exit(1);
}

if (!GOOGLE_CALENDAR_SUBJECT) {
  console.error("Error: GOOGLE_CALENDAR_SUBJECT environment variable is required for domain-wide delegation");
  process.exit(1);
}

// Initialize service account auth with domain-wide delegation
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_APPLICATION_CREDENTIALS,
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
  clientOptions: {
    subject: GOOGLE_CALENDAR_SUBJECT, // User to impersonate for domain-wide delegation
  },
});

// Initialize Calendar API
const calendar = google.calendar({ version: "v3", auth });

// Initialize Gmail API
const gmail = google.gmail({ version: "v1", auth });

// Define tools
const CREATE_EVENT_TOOL: Tool = {
  name: "create_calendar_event",
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
};

const LIST_EVENTS_TOOL: Tool = {
  name: "list_calendar_events",
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
};

const UPDATE_EVENT_TOOL: Tool = {
  name: "update_calendar_event",
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
};

const SEND_EMAIL_TOOL: Tool = {
  name: "send_email",
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
};

const LIST_EMAILS_TOOL: Tool = {
  name: "list_emails",
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
};

const READ_EMAIL_TOOL: Tool = {
  name: "read_email",
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
};

// Tool handlers
async function createCalendarEvent(args: any): Promise<string> {
  try {
    const event: any = {
      summary: args.summary,
      description: args.description,
      location: args.location,
      start: {
        dateTime: args.start_time,
      },
      end: {
        dateTime: args.end_time,
      },
    };

    if (args.attendees && Array.isArray(args.attendees)) {
      event.attendees = args.attendees.map((email: string) => ({ email }));
    }

    if (args.reminders && Array.isArray(args.reminders)) {
      event.reminders = {
        useDefault: false,
        overrides: args.reminders,
      };
    }

    const sendUpdates = args.send_notifications !== false ? "all" : "none";
    
    const response = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      requestBody: event,
      sendUpdates,
    });

    return `Event created successfully: ${response.data.htmlLink}\nEvent ID: ${response.data.id}`;
  } catch (error: any) {
    throw new Error(`Failed to create calendar event: ${error.message}`);
  }
}

async function listCalendarEvents(args: any): Promise<string> {
  try {
    const response = await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: args.time_min || new Date().toISOString(),
      timeMax: args.time_max,
      maxResults: args.max_results || 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;
    if (!events || events.length === 0) {
      return "No upcoming events found.";
    }

    const eventList = events.map((event: any) => {
      const start = event.start?.dateTime || event.start?.date;
      return `- ${event.summary} (${start})${event.location ? ` at ${event.location}` : ""} [ID: ${event.id}]`;
    });

    return `Upcoming events:\n${eventList.join("\n")}`;
  } catch (error: any) {
    throw new Error(`Failed to list calendar events: ${error.message}`);
  }
}

async function updateCalendarEvent(args: any): Promise<string> {
  try {
    // First, get the existing event
    const existingEvent = await calendar.events.get({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId: args.event_id,
    });

    // Build update object with only provided fields
    const updates: any = {};
    if (args.summary) updates.summary = args.summary;
    if (args.description) updates.description = args.description;
    if (args.location) updates.location = args.location;
    if (args.start_time) {
      updates.start = { dateTime: args.start_time };
    }
    if (args.end_time) {
      updates.end = { dateTime: args.end_time };
    }
    if (args.attendees && Array.isArray(args.attendees)) {
      updates.attendees = args.attendees.map((email: string) => ({ email }));
    }
    if (args.reminders && Array.isArray(args.reminders)) {
      updates.reminders = {
        useDefault: false,
        overrides: args.reminders,
      };
    }

    // Merge with existing event data
    const updatedEvent = {
      ...existingEvent.data,
      ...updates,
    };

    const sendUpdates = args.send_notifications !== false ? "all" : "none";
    
    const response = await calendar.events.update({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId: args.event_id,
      requestBody: updatedEvent,
      sendUpdates,
    });

    return `Event updated successfully: ${response.data.htmlLink}\nEvent ID: ${response.data.id}`;
  } catch (error: any) {
    throw new Error(`Failed to update calendar event: ${error.message}`);
  }
}
async function sendEmail(args: any): Promise<string> {
  try {
    const to = Array.isArray(args.to) ? args.to.join(", ") : args.to;
    const cc = args.cc && Array.isArray(args.cc) ? args.cc.join(", ") : "";
    const bcc = args.bcc && Array.isArray(args.bcc) ? args.bcc.join(", ") : "";
    
    const contentType = args.is_html ? "text/html" : "text/plain";
    
    const messageParts = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      bcc ? `Bcc: ${bcc}` : "",
      `Subject: ${args.subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      "",
      args.body,
    ].filter(Boolean);
    
    const message = messageParts.join("\r\n");
    const encodedMessage = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });
    
    return `Email sent successfully!\nMessage ID: ${response.data.id}\nTo: ${to}${cc ? `\nCC: ${cc}` : ""}`;
  } catch (error: any) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

async function listEmails(args: any): Promise<string> {
  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: args.query || "",
      maxResults: Math.min(args.max_results || 10, 100),
    });
    
    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
      return "No emails found.";
    }
    
    // Fetch details for each message
    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        const details = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        
        const headers = details.data.payload?.headers || [];
        const from = headers.find((h) => h.name === "From")?.value || "Unknown";
        const subject = headers.find((h) => h.name === "Subject")?.value || "(No subject)";
        const date = headers.find((h) => h.name === "Date")?.value || "";
        
        return `- ${subject}\n  From: ${from}\n  Date: ${date}\n  ID: ${msg.id}`;
      })
    );
    
    return `Emails:\n${emailDetails.join("\n\n")}`;
  } catch (error: any) {
    throw new Error(`Failed to list emails: ${error.message}`);
  }
}

async function readEmail(args: any): Promise<string> {
  try {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: args.email_id,
      format: "full",
    });
    
    const headers = response.data.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "Unknown";
    const to = headers.find((h) => h.name === "To")?.value || "";
    const cc = headers.find((h) => h.name === "Cc")?.value || "";
    const bcc = headers.find((h) => h.name === "Bcc")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "(No subject)";
    const date = headers.find((h) => h.name === "Date")?.value || "";
    
    // Extract email body
    let body = "";
    if (response.data.payload?.parts) {
      const textPart = response.data.payload.parts.find(
        (part) => part.mimeType === "text/plain"
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    } else if (response.data.payload?.body?.data) {
      body = Buffer.from(response.data.payload.body.data, "base64").toString("utf-8");
    }
    
    // Mark as read if requested
    if (args.mark_as_read) {
      await gmail.users.messages.modify({
        userId: "me",
        id: args.email_id,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    }
    
    const ccLine = cc ? `\nCC: ${cc}` : "";
    const bccLine = bcc ? `\nBCC: ${bcc}` : "";
    
    return `From: ${from}\nTo: ${to}${ccLine}${bccLine}\nSubject: ${subject}\nDate: ${date}\n\n${body}`;
  } catch (error: any) {
    throw new Error(`Failed to read email: ${error.message}`);
  }
}


// Create MCP server
const server = new Server(
  {
    name: "calendar-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      CREATE_EVENT_TOOL,
      LIST_EVENTS_TOOL,
      UPDATE_EVENT_TOOL,
      SEND_EMAIL_TOOL,
      LIST_EMAILS_TOOL,
      READ_EMAIL_TOOL,
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    let result: string;
    switch (name) {
      case "create_calendar_event":
        result = await createCalendarEvent(args);
        break;
      case "list_calendar_events":
        result = await listCalendarEvents(args);
        break;
      case "update_calendar_event":
        result = await updateCalendarEvent(args);
        break;
      case "send_email":
        result = await sendEmail(args);
        break;
      case "list_emails":
        result = await listEmails(args);
        break;
      case "read_email":
        result = await readEmail(args);
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

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Calendar MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});