import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { ExperienceStore } from "../store/experience-store.js";
import { Embedder } from "../retrieval/embedder.js";
export interface AcmServerOptions {
    db?: Database.Database;
    capture_turns?: number;
    promotion_threshold?: number;
    experienceStore?: ExperienceStore;
    embedder?: Embedder;
}
export declare function createAcmServer(options?: AcmServerOptions): McpServer;
//# sourceMappingURL=tools.d.ts.map