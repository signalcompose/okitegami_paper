import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AdaptedDatabase } from "../store/sqlite-adapter.js";
import { SessionSignalStore } from "../signals/session-store.js";
import { SignalCollector } from "../signals/signal-collector.js";
import { EVENT_TYPES } from "../signals/types.js";
import { DEFAULT_CONFIG } from "../store/types.js";
import { ExperienceStore } from "../store/experience-store.js";
import { ExperienceGenerator } from "../experience/generator.js";
import { Embedder } from "../retrieval/embedder.js";
import { Retriever } from "../retrieval/retriever.js";
import { formatInjection } from "../retrieval/injector.js";
import { buildEmbeddingText } from "../retrieval/embedding-text.js";

const VERSION = "0.1.0";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export interface AcmServerOptions {
  db?: AdaptedDatabase;
  capture_turns?: number;
  promotion_threshold?: number;
  experienceStore?: ExperienceStore;
  embedder?: Embedder;
}

export function createAcmServer(options?: AcmServerOptions): McpServer {
  const server = new McpServer({
    name: "acm",
    version: VERSION,
  });

  server.tool("acm_health", "Check ACM server health status", {}, () => {
    return toolResult({
      status: "ok",
      version: VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  if (options?.db) {
    const store = new SessionSignalStore(options.db);
    const collector = new SignalCollector(store, {
      capture_turns: options.capture_turns ?? DEFAULT_CONFIG.capture_turns,
    });

    server.tool(
      "acm_record_signal",
      'Record a session signal. Use to report corrective feedback: event_type=\'corrective_instruction\', data=\'{"prompt":"...","reason":"..."}\'.',
      {
        session_id: z.string().describe("Session identifier"),
        event_type: z.string().describe(`Signal event type: ${EVENT_TYPES.join(", ")}`),
        data: z.string().optional().describe("Event-specific data as JSON string"),
      },
      (params) => {
        try {
          if (!EVENT_TYPES.includes(params.event_type as (typeof EVENT_TYPES)[number])) {
            throw new Error(
              `Invalid event_type "${params.event_type}". Must be one of: ${EVENT_TYPES.join(", ")}`
            );
          }
          const parsedData = params.data
            ? (JSON.parse(params.data) as Record<string, unknown>)
            : null;
          const signal = store.addSignal(
            params.session_id,
            params.event_type as (typeof EVENT_TYPES)[number],
            parsedData
          );
          return toolResult(signal);
        } catch (err) {
          return toolError(`Error: ${errorMessage(err)}`);
        }
      }
    );

    server.tool(
      "acm_session_summary",
      "Get aggregated signal summary for a session (debug tool)",
      {
        session_id: z.string().describe("Session identifier"),
      },
      (params) => {
        try {
          const summary = collector.getSessionSummary(params.session_id);
          return toolResult(summary);
        } catch (err) {
          return toolError(`Error: ${errorMessage(err)}`);
        }
      }
    );

    if (options.experienceStore) {
      const experienceStore = options.experienceStore;
      const captureTurns = options.capture_turns ?? DEFAULT_CONFIG.capture_turns;
      const promotionThreshold = options.promotion_threshold ?? DEFAULT_CONFIG.promotion_threshold;
      const generator = new ExperienceGenerator({
        capture_turns: captureTurns,
        promotion_threshold: promotionThreshold,
      });

      server.tool(
        "acm_generate_experience",
        "Generate experience entries from session signals (SessionEnd hook)",
        {
          session_id: z.string().describe("Session identifier"),
        },
        (params) => {
          try {
            const summary = collector.getSessionSummary(params.session_id);
            const signals = store.getBySession(params.session_id);
            const entries = generator.generate({
              session_id: params.session_id,
              summary,
              signals,
            });

            const persisted: string[] = [];
            const errors: string[] = [];
            for (const entry of entries) {
              try {
                const saved = experienceStore.create(entry);
                if (saved) {
                  persisted.push(saved.id);
                } else {
                  errors.push(
                    `Entry ${entry.type} (signal_type: ${entry.signal_type}, strength: ${entry.signal_strength}) rejected by store: below promotion_threshold`
                  );
                }
              } catch (persistErr) {
                errors.push(
                  `Failed to persist ${entry.type} entry (signal_type: ${entry.signal_type}): ${errorMessage(persistErr)}`
                );
              }
            }

            const result: Record<string, unknown> = {
              session_id: params.session_id,
              generated: entries.length,
              persisted: persisted.length,
              ids: persisted,
            };
            if (errors.length > 0) {
              result.errors = errors;
            }

            return {
              ...toolResult(result),
              isError: errors.length > 0,
            };
          } catch (err) {
            return toolError(`Error generating experience: ${errorMessage(err)}`);
          }
        }
      );

      server.tool(
        "acm_report",
        "Cross-project analysis, injection→outcome episode tracing, and natural experiment measurement (4 axes: recurrence rate, temporal trend, injection-outcome correlation, cross-project transfer)",
        {
          project: z.string().optional().describe("Filter by project name"),
          limit: z.number().optional().describe("Max episodes to return (default: 10)"),
        },
        (params) => {
          try {
            const summary = experienceStore.getCrossProjectReport();
            const episodes = experienceStore.getInjectionEpisodes(
              params.project,
              params.limit ?? 10
            );
            const measurement = experienceStore.getMeasurementReport(params.project);
            return toolResult({ summary, episodes, measurement });
          } catch (err) {
            console.error(
              `[ACM] acm_report: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
            );
            return toolError(`Error generating report: ${errorMessage(err)}`);
          }
        }
      );
    }

    if (options.experienceStore && options.embedder) {
      const experienceStore = options.experienceStore;
      const embedder = options.embedder;
      const retriever = new Retriever(experienceStore);

      server.tool(
        "acm_retrieve",
        "Retrieve relevant past experiences for a query and return injection text (SessionStart hook)",
        {
          query: z.string().describe("Query text (e.g., initial user message)"),
          top_k: z.number().optional().describe("Number of results (default: 5)"),
        },
        async (params) => {
          let queryEmbedding: Float32Array;
          try {
            await embedder.initialize();
            queryEmbedding = await embedder.embed(params.query);
          } catch (err) {
            return toolError(`Embedding error: ${errorMessage(err)}`);
          }

          try {
            const topK = params.top_k ?? DEFAULT_CONFIG.top_k;
            const results = retriever.retrieve(queryEmbedding, topK);
            const injectionText = formatInjection(results);

            return toolResult({
              injection_text: injectionText,
              entries_count: results.length,
              entries: results.map((r) => ({
                id: r.entry.id,
                type: r.entry.type,
                trigger: r.entry.trigger,
                similarity: Number(r.similarity.toFixed(4)),
                score: Number(r.score.toFixed(4)),
              })),
            });
          } catch (err) {
            return toolError(`Retrieval error: ${errorMessage(err)}`);
          }
        }
      );

      server.tool(
        "acm_store_embedding",
        "Generate and store embedding for an experience entry (backfill/repair — session-end hook generates embeddings automatically)",
        {
          experience_id: z.string().uuid().describe("Experience entry ID"),
        },
        async (params) => {
          try {
            await embedder.initialize();
            const entry = experienceStore.getById(params.experience_id);
            if (!entry) {
              return toolError(`Experience entry not found: ${params.experience_id}`);
            }

            const textToEmbed = buildEmbeddingText(entry);
            const embedding = await embedder.embed(textToEmbed);
            const updated = experienceStore.updateEmbedding(entry.id, embedding);

            if (!updated) {
              return toolError(
                `Failed to update embedding for entry ${entry.id}: UPDATE affected 0 rows`
              );
            }

            return toolResult({
              id: entry.id,
              embedded: true,
              dimensions: embedding.length,
            });
          } catch (err) {
            return toolError(`Error storing embedding: ${errorMessage(err)}`);
          }
        }
      );
    }
  }

  return server;
}
