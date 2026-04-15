import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { Embedder } from "../../src/retrieval/embedder.js";
import { Retriever } from "../../src/retrieval/retriever.js";
import { formatInjection } from "../../src/retrieval/injector.js";
import { DEFAULT_CONFIG } from "../../src/store/types.js";
import { initializeDatabase } from "../../src/store/schema.js";
import { makeEntry } from "./helpers.js";

// onnxruntime-web uses blob: URLs for Web Workers, which Node.js 20 worker_threads
// does not support. This test is skipped in CI and runs locally only.
describe.skipIf(process.env.CI)("Phase 4 Integration: write → embed → retrieve → inject", () => {
  let store: ExperienceStore;
  let embedder: Embedder;
  let retriever: Retriever;

  beforeAll(async () => {
    const db = await initializeDatabase(":memory:");
    store = new ExperienceStore(db, {
      ...DEFAULT_CONFIG,
      db_path: ":memory:",
    });
    embedder = new Embedder();
    await embedder.initialize();
    retriever = new Retriever(store);
  }, 60_000);

  afterAll(() => {
    embedder.dispose();
    store.close();
  });

  it("full cycle: create entries, embed, retrieve, and format injection", async () => {
    // 1. Create experience entries
    const authEntry = store.create(
      makeEntry({
        trigger: "Fix authentication bug in login module",
        action: "Modified auth.ts to validate JWT tokens correctly",
        retrieval_keys: ["authentication", "JWT", "login", "bug-fix"],
        signal_strength: 0.85,
      })
    );
    expect(authEntry).not.toBeNull();

    const cssEntry = store.create(
      makeEntry({
        trigger: "Add responsive CSS to homepage",
        action: "Created media queries for mobile layout",
        retrieval_keys: ["CSS", "responsive", "homepage", "mobile"],
        signal_strength: 0.6,
      })
    );
    expect(cssEntry).not.toBeNull();

    const failEntry = store.create(
      makeEntry({
        type: "failure",
        trigger: "Fix database connection pooling",
        action: "Modified db.ts connection pool settings",
        signal_type: "interrupt_with_dialogue",
        signal_strength: 0.95,
        interrupt_context: {
          turns_captured: 4,
          dialogue_summary: "Wrong pool size caused OOM errors",
        },
        retrieval_keys: ["database", "connection-pool", "performance"],
      })
    );
    expect(failEntry).not.toBeNull();

    // 2. Generate and store embeddings
    for (const entry of [authEntry!, cssEntry!, failEntry!]) {
      const text = [entry.trigger, ...entry.retrieval_keys].join(" ");
      const embedding = await embedder.embed(text);
      expect(embedding.length).toBe(384);
      const updated = store.updateEmbedding(entry.id, embedding);
      expect(updated).toBe(true);
    }

    // 3. Retrieve with auth-related query
    const authQuery = await embedder.embed("fix authentication JWT token issue");
    const authResults = retriever.retrieve(authQuery, 3);

    expect(authResults.length).toBeGreaterThan(0);
    // Auth entry should rank first for auth-related query
    expect(authResults[0].entry.id).toBe(authEntry!.id);
    expect(authResults[0].similarity).toBeGreaterThan(0.5);
    expect(authResults[0].score).toBeGreaterThan(0);

    // 4. Format injection text
    const injectionText = formatInjection(authResults);
    expect(injectionText).toContain("[ACM Context]");
    expect(injectionText).toContain("SUCCESS:");
    expect(injectionText.length).toBeLessThanOrEqual(2000);

    // 5. Retrieve with database-related query
    const dbQuery = await embedder.embed("database connection pool optimization");
    const dbResults = retriever.retrieve(dbQuery, 3);

    expect(dbResults.length).toBeGreaterThan(0);
    expect(dbResults[0].entry.id).toBe(failEntry!.id);

    const dbInjection = formatInjection(dbResults);
    expect(dbInjection).toContain("FAILURE:");
    expect(dbInjection).toContain("Wrong pool size caused OOM errors");
  });

  it("mode filtering works in retrieval pipeline", async () => {
    // Create a success-only store
    const successDb = await initializeDatabase(":memory:");
    const successStore = new ExperienceStore(successDb, {
      ...DEFAULT_CONFIG,
      db_path: ":memory:",
      mode: "success_only",
    });
    const successRetriever = new Retriever(successStore);

    const emb = await embedder.embed("test query for mode filter");

    successStore.createWithEmbedding(makeEntry({ type: "success", session_id: "mode-s" }), emb);
    successStore.createWithEmbedding(
      makeEntry({
        type: "failure",
        signal_type: "interrupt_with_dialogue",
        signal_strength: 0.9,
        session_id: "mode-f",
      }),
      emb
    );

    const results = successRetriever.retrieve(emb, 10);
    expect(results).toHaveLength(1);
    expect(results[0].entry.type).toBe("success");

    successStore.close();
  });

  it("createWithEmbedding shortcut works end-to-end", async () => {
    const inlineDb = await initializeDatabase(":memory:");
    const inlineStore = new ExperienceStore(inlineDb, {
      ...DEFAULT_CONFIG,
      db_path: ":memory:",
    });
    const inlineRetriever = new Retriever(inlineStore);

    const text = "deploy Docker container to production";
    const emb = await embedder.embed(text);

    inlineStore.createWithEmbedding(
      makeEntry({
        trigger: "Deploy Docker container",
        retrieval_keys: ["docker", "deploy", "production"],
        signal_strength: 0.7,
      }),
      emb
    );

    const query = await embedder.embed("docker deployment production");
    const results = inlineRetriever.retrieve(query, 1);

    expect(results).toHaveLength(1);
    expect(results[0].entry.trigger).toBe("Deploy Docker container");
    expect(results[0].similarity).toBeGreaterThan(0.5);

    const injection = formatInjection(results);
    expect(injection).toContain("[ACM Context]");
    expect(injection).toContain("Deploy Docker container");

    inlineStore.close();
  });
});
