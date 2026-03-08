import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const VERSION = "0.1.0";

export function createAcmServer(): McpServer {
  const server = new McpServer({
    name: "acm",
    version: VERSION,
  });

  server.tool("acm_health", "Check ACM server health status", {}, () => {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "ok",
            version: VERSION,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    };
  });

  return server;
}
