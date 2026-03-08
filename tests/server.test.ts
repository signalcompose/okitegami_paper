import { describe, it, expect } from "vitest";
import { createAcmServer } from "../src/server/tools.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("ACM MCP Server", () => {
  it("lists acm_health tool", async () => {
    const server = createAcmServer();
    const client = new Client({ name: "test-client", version: "1.0.0" });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain("acm_health");

    await client.close();
    await server.close();
  });

  it("acm_health returns status ok", async () => {
    const server = createAcmServer();
    const client = new Client({ name: "test-client", version: "1.0.0" });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({ name: "acm_health", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");

    const parsed = JSON.parse(content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.version).toBeDefined();

    await client.close();
    await server.close();
  });
});
