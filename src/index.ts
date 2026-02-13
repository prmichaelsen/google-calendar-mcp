#!/usr/bin/env node

import 'dotenv/config';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGoogleCalendarServer } from "./server-factory.js";

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

// Create server using factory
const server = createGoogleCalendarServer(
  GOOGLE_CALENDAR_SUBJECT,
  "single-user", // userId for single-user mode
  {
    serviceAccountKey: GOOGLE_APPLICATION_CREDENTIALS,
    calendarId: GOOGLE_CALENDAR_ID,
  }
);

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
