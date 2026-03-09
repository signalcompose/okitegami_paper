import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAcmServer } from "../../src/server/tools.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";

describe("Signal MCP Tools", () => {
  let db: Database.Database;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    db = initializeDatabase(":memory:");
    server = createAcmServer({ db });
    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    db?.close();
  });

  it("lists acm_record_signal and acm_session_summary tools", async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain("acm_record_signal");
    expect(toolNames).toContain("acm_session_summary");
  });

  it("acm_record_signal records a signal and returns it", async () => {
    const result = await client.callTool({
      name: "acm_record_signal",
      arguments: {
        session_id: "s1",
        event_type: "interrupt",
        data: JSON.stringify({ tool_name: "Bash", error: "interrupted" }),
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.id).toBeGreaterThan(0);
    expect(parsed.session_id).toBe("s1");
    expect(parsed.event_type).toBe("interrupt");
  });

  it("acm_record_signal rejects invalid event_type", async () => {
    const result = await client.callTool({
      name: "acm_record_signal",
      arguments: {
        session_id: "s1",
        event_type: "bogus",
      },
    });

    expect(result.isError).toBe(true);
  });

  it("acm_session_summary returns session summary", async () => {
    // Record some signals
    await client.callTool({
      name: "acm_record_signal",
      arguments: {
        session_id: "s1",
        event_type: "interrupt",
        data: JSON.stringify({ tool_name: "Bash" }),
      },
    });
    await client.callTool({
      name: "acm_record_signal",
      arguments: {
        session_id: "s1",
        event_type: "stop",
      },
    });

    const result = await client.callTool({
      name: "acm_session_summary",
      arguments: { session_id: "s1" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.session_id).toBe("s1");
    expect(parsed.total_signals).toBe(2);
    expect(parsed.was_interrupted).toBe(true);
  });

  it("acm_session_summary returns empty for unknown session", async () => {
    const result = await client.callTool({
      name: "acm_session_summary",
      arguments: { session_id: "nonexistent" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.total_signals).toBe(0);
  });
});
