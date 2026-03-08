import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAcmServer } from "./server/tools.js";

async function main(): Promise<void> {
  const server = createAcmServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ACM server failed to start: ${message}`);
  process.exit(1);
});
