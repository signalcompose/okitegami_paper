import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAcmServer } from "./server/tools.js";
import { loadConfig, expandTilde } from "./config.js";
import { ExperienceStore } from "./store/experience-store.js";
import { Embedder } from "./retrieval/embedder.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env.ACM_CONFIG_PATH || undefined);

  if (process.env.ACM_DB_PATH) {
    config.db_path = expandTilde(process.env.ACM_DB_PATH);
  }

  const experienceStore = new ExperienceStore(config);
  const embedder = new Embedder();

  const server = createAcmServer({
    db: experienceStore.getDb(),
    capture_turns: config.capture_turns,
    promotion_threshold: config.promotion_threshold,
    experienceStore,
    embedder,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ACM server failed to start: ${message}`);
  process.exit(1);
});
