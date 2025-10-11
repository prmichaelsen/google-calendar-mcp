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
  scopes: ["https://www.googleapis.com/auth/calendar"],
  clientOptions: {
    subject: GOOGLE_CALENDAR_SUBJECT, // User to impersonate for domain-wide delegation
  },
});

// Initialize Calendar API
const calendar = google.calendar({ version: "v3", auth });

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
    tools: [CREATE_EVENT_TOOL, LIST_EVENTS_TOOL, UPDATE_EVENT_TOOL],
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