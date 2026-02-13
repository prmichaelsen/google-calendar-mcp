/**
 * Email tool implementations for Gmail MCP Server
 */

export async function sendEmail(gmail: any, args: any): Promise<string> {
  try {
    const to = Array.isArray(args.to) ? args.to.join(", ") : args.to;
    const cc = args.cc && Array.isArray(args.cc) ? args.cc.join(", ") : "";
    const bcc = args.bcc && Array.isArray(args.bcc) ? args.bcc.join(", ") : "";
    
    let message: string;
    
    if (args.is_html) {
      // For HTML emails, create a multipart/alternative message with both plain text and HTML
      const boundary = "===============" + Date.now() + "==";
      const plainText = args.body.replace(/<[^>]*>/g, ''); // Strip HTML tags for plain text version
      
      // Build MIME multipart message - blank lines are critical!
      const parts = [];
      parts.push(`To: ${to}`);
      if (cc) parts.push(`Cc: ${cc}`);
      if (bcc) parts.push(`Bcc: ${bcc}`);
      parts.push(`Subject: ${args.subject}`);
      parts.push(`MIME-Version: 1.0`);
      parts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      parts.push(``); // CRITICAL blank line after headers
      parts.push(`--${boundary}`);
      parts.push(`Content-Type: text/plain; charset=utf-8`);
      parts.push(`Content-Transfer-Encoding: 7bit`);
      parts.push(``); // CRITICAL blank line before content
      parts.push(plainText);
      parts.push(``); // blank line after content
      parts.push(`--${boundary}`);
      parts.push(`Content-Type: text/html; charset=utf-8`);
      parts.push(`Content-Transfer-Encoding: 7bit`);
      parts.push(``); // CRITICAL blank line before content
      parts.push(args.body);
      parts.push(``); // blank line after content
      parts.push(`--${boundary}--`);
      
      const messageParts = parts;
      
      message = messageParts.join("\r\n");
    } else {
      // For plain text emails, use simple format
      const messageParts = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : "",
        bcc ? `Bcc: ${bcc}` : "",
        `Subject: ${args.subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        "",
        args.body,
      ].filter(Boolean);
      
      message = messageParts.join("\r\n");
    }
    
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

export async function listEmails(gmail: any, args: any): Promise<string> {
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
      messages.map(async (msg: any) => {
        const details = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        
        const headers = details.data.payload?.headers || [];
        const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "(No subject)";
        const date = headers.find((h: any) => h.name === "Date")?.value || "";
        
        return `- ${subject}\n  From: ${from}\n  Date: ${date}\n  ID: ${msg.id}`;
      })
    );
    
    return `Emails:\n${emailDetails.join("\n\n")}`;
  } catch (error: any) {
    throw new Error(`Failed to list emails: ${error.message}`);
  }
}

export async function readEmail(gmail: any, args: any): Promise<string> {
  try {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: args.email_id,
      format: "full",
    });
    
    const headers = response.data.payload?.headers || [];
    const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
    const to = headers.find((h: any) => h.name === "To")?.value || "";
    const cc = headers.find((h: any) => h.name === "Cc")?.value || "";
    const bcc = headers.find((h: any) => h.name === "Bcc")?.value || "";
    const subject = headers.find((h: any) => h.name === "Subject")?.value || "(No subject)";
    const date = headers.find((h: any) => h.name === "Date")?.value || "";
    
    // Extract email body
    let body = "";
    if (response.data.payload?.parts) {
      const textPart = response.data.payload.parts.find(
        (part: any) => part.mimeType === "text/plain"
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
