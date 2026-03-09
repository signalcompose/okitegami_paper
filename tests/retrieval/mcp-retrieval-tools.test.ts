import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAcmServer } from "../../src/server/tools.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { Embedder } from "../../src/retrieval/embedder.js";
import { DEFAULT_CONFIG } from "../../src/store/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";

describe("Retrieval MCP Tools", () => {
  let db: Database.Database;
  let server: McpServer;
  let client: Client;
  let experienceStore: ExperienceStore;
  let embedder: Embedder;

  beforeAll(async () => {
    db = initializeDatabase(":memory:");
    experienceStore = new ExperienceStore({
      ...DEFAULT_CONFIG,
      db_path: ":memory:",
    });
    // Use the same DB for experienceStore by rebuilding with the existing db
    experienceStore.close();
    experienceStore = new ExperienceStore({
      ...DEFAULT_CONFIG,
      db_path: ":memory:",
    });

    embedder = new Embedder();
    await embedder.initialize();

    server = createAcmServer({
      db,
      experienceStore,
      embedder,
    });
    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
    await server.close();
    embedder.dispose();
    experienceStore.close();
    db?.close();
  });

  it("lists acm_retrieve and acm_store_embedding tools", async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain("acm_retrieve");
    expect(toolNames).toContain("acm_store_embedding");
  });

  it("acm_retrieve returns empty when no entries exist", async () => {
    const result = await client.callTool({
      name: "acm_retrieve",
      arguments: { query: "fix authentication bug" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.entries_count).toBe(0);
    expect(parsed.injection_text).toBe("");
  });

  it("acm_store_embedding generates and stores embedding for an entry", async () => {
    const entry = experienceStore.create({
      type: "success",
      trigger: "Fix authentication bug in login module",
      action: "Modified auth.ts to handle null tokens",
      outcome: "Tests pass",
      retrieval_keys: ["auth", "login", "bug-fix"],
      signal_strength: 0.8,
      signal_type: "uninterrupted_completion",
      session_id: "session-test-1",
      timestamp: new Date().toISOString(),
    });
    expect(entry).not.toBeNull();

    const result = await client.callTool({
      name: "acm_store_embedding",
      arguments: { experience_id: entry!.id },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.embedded).toBe(true);
    expect(parsed.dimensions).toBe(384);
  });

  it("acm_store_embedding returns error for non-existent entry", async () => {
    const result = await client.callTool({
      name: "acm_store_embedding",
      arguments: { experience_id: "non-existent-id" },
    });
    expect(result.isError).toBe(true);
  });

  it("acm_retrieve finds entries after embedding is stored", async () => {
    // Entry from previous test should have embedding now
    const result = await client.callTool({
      name: "acm_retrieve",
      arguments: { query: "fix authentication bug", top_k: 3 },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.entries_count).toBeGreaterThan(0);
    expect(parsed.injection_text).toContain("[ACM Context]");
    expect(parsed.entries[0].similarity).toBeGreaterThan(0);
    expect(parsed.entries[0].score).toBeGreaterThan(0);
  });
});
