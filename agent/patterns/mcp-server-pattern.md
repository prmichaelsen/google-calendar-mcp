# MCP Server Pattern

**Created**: 2026-02-13  
**Status**: Implemented  

---

## Overview

Pattern for implementing Model Context Protocol (MCP) servers using the official SDK. This pattern enables AI agents to interact with external services through a standardized protocol.

## Core Principles

1. **Tool-Based Interface**: Expose functionality as discrete tools with clear schemas
2. **Stdio Transport**: Use standard input/output for communication
3. **Type Safety**: Define strict input schemas for all tools
4. **Error Handling**: Return structured errors with meaningful messages
5. **Stateless Operations**: Each tool call is independent

## Implementation

### Server Initialization

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "your-server-name",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
```

### Tool Definition

```typescript
import { Tool } from "@modelcontextprotocol/sdk/types.js";

const EXAMPLE_TOOL: Tool = {
  name: "tool_name",
  description: "Clear description of what this tool does",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Parameter description",
      },
      param2: {
        type: "number",
        description: "Another parameter",
      },
    },
    required: ["param1"],
  },
};
```

### Request Handlers

```typescript
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [TOOL1, TOOL2, TOOL3],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    let result: string;
    switch (name) {
      case "tool_name":
        result = await handleTool(args);
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
```

### Server Startup

```typescript
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

## Benefits

- **Standardized Protocol**: Works with any MCP-compatible client
- **Type Safety**: Input validation through JSON schemas
- **Easy Integration**: Simple to add new tools
- **Error Handling**: Structured error responses
- **Logging**: Use stderr for logs (stdout is for protocol)

## Anti-Patterns

❌ **Don't write to stdout**: Use stderr for logging (stdout is for MCP protocol)
❌ **Don't maintain state**: Each tool call should be independent
❌ **Don't skip validation**: Always validate required parameters
❌ **Don't expose internal errors**: Return user-friendly error messages
❌ **Don't block**: Keep tool operations async and non-blocking

## Example: Calendar MCP Server

The calendar-mcp-server implements this pattern with:
- 6 tools (create_calendar_event, list_calendar_events, update_calendar_event, send_email, list_emails, read_email)
- Strict TypeScript types
- Comprehensive error handling
- Clear tool descriptions and schemas

See [`src/index.ts`](../../src/index.ts) for full implementation.

---

**Status**: Production pattern in use  
**Recommendation**: Follow this pattern for all MCP server implementations
