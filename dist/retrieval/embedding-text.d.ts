/**
 * Build the text used for embedding generation from an experience entry.
 * Shared between session-end hook (embedding at creation) and
 * acm_store_embedding MCP tool (deferred embedding).
 *
 * Accepts any object with trigger and retrieval_keys fields,
 * supporting both ExperienceEntry and Omit<ExperienceEntry, "id">.
 */
export declare function buildEmbeddingText(entry: {
    trigger: string;
    retrieval_keys: string[];
}): string;
//# sourceMappingURL=embedding-text.d.ts.map