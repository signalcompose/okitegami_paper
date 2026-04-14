import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAcmServer } from "./server/tools.js";
import { loadConfig } from "./config.js";
import { initializeDatabase } from "./store/schema.js";
import { ExperienceStore } from "./store/experience-store.js";
import { Embedder } from "./retrieval/embedder.js";

async function main(): Promise<void> {
  const config = loadConfig({
    path: process.env.ACM_CONFIG_PATH || undefined,
    dbPathOverride: process.env.ACM_DB_PATH || undefined,
  });

  const db = await initializeDatabase(config.db_path);
  const experienceStore = new ExperienceStore(db, config);
  const embedder = new Embedder();

  const server = createAcmServer({
    db,
    capture_turns: config.capture_turns,
    promotion_threshold: config.promotion_threshold,
    recency_half_life_days: config.recency_half_life_days,
    experienceStore,
    embedder,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("ACM server failed to start:", error);
  process.exit(1);
});
