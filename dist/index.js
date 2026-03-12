import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAcmServer } from "./server/tools.js";
import { loadConfig } from "./config.js";
import { ExperienceStore } from "./store/experience-store.js";
import { Embedder } from "./retrieval/embedder.js";
async function main() {
    const config = loadConfig({
        path: process.env.ACM_CONFIG_PATH || undefined,
        dbPathOverride: process.env.ACM_DB_PATH || undefined,
    });
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
    console.error("ACM server failed to start:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map