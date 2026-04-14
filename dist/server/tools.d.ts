import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AdaptedDatabase } from "../store/sqlite-adapter.js";
import { ExperienceStore } from "../store/experience-store.js";
import { Embedder } from "../retrieval/embedder.js";
export interface AcmServerOptions {
    db?: AdaptedDatabase;
    capture_turns?: number;
    promotion_threshold?: number;
    recency_half_life_days?: number;
    experienceStore?: ExperienceStore;
    embedder?: Embedder;
}
export declare function createAcmServer(options?: AcmServerOptions): McpServer;
//# sourceMappingURL=tools.d.ts.map