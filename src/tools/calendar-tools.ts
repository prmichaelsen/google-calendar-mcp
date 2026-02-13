/**
 * Calendar tool implementations for Google Calendar MCP Server
 */

export async function createCalendarEvent(
  calendar: any,
  calendarId: string,
  args: any
): Promise<string> {
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
      calendarId: calendarId,
      requestBody: event,
      sendUpdates,
    });

    return `Event created successfully: ${response.data.htmlLink}\nEvent ID: ${response.data.id}`;
  } catch (error: any) {
    throw new Error(`Failed to create calendar event: ${error.message}`);
  }
}

export async function listCalendarEvents(
  calendar: any,
  calendarId: string,
  args: any
): Promise<string> {
  try {
    const response = await calendar.events.list({
      calendarId: calendarId,
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

export async function updateCalendarEvent(
  calendar: any,
  calendarId: string,
  args: any
): Promise<string> {
  try {
    // First, get the existing event
    const existingEvent = await calendar.events.get({
      calendarId: calendarId,
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
      calendarId: calendarId,
      eventId: args.event_id,
      requestBody: updatedEvent,
      sendUpdates,
    });

    return `Event updated successfully: ${response.data.htmlLink}\nEvent ID: ${response.data.id}`;
  } catch (error: any) {
    throw new Error(`Failed to update calendar event: ${error.message}`);
  }
}
