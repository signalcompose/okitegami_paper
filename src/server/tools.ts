import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { SessionSignalStore } from "../signals/session-store.js";
import { SignalCollector } from "../signals/signal-collector.js";
import { EVENT_TYPES } from "../signals/types.js";
import { DEFAULT_CONFIG } from "../store/types.js";
import { ExperienceStore } from "../store/experience-store.js";
import { ExperienceGenerator } from "../experience/generator.js";
import { Embedder } from "../retrieval/embedder.js";
import { Retriever } from "../retrieval/retriever.js";
import { formatInjection } from "../retrieval/injector.js";

const VERSION = "0.1.0";

export interface AcmServerOptions {
  db?: Database.Database;
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
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "ok",
            version: VERSION,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    };
  });

  if (options?.db) {
    const store = new SessionSignalStore(options.db);
    const collector = new SignalCollector(store, {
      capture_turns: options.capture_turns ?? DEFAULT_CONFIG.capture_turns,
    });

    server.tool(
      "acm_record_signal",
      "Record a raw session signal directly to DB (debug/test only — hooks use SignalCollector)",
      {
        session_id: z.string().describe("Session identifier"),
        event_type: z.string().describe(
          `Signal event type: ${EVENT_TYPES.join(", ")}`
        ),
        data: z.string().optional().describe(
          "Event-specific data as JSON string"
        ),
      },
      (params) => {
        try {
          if (!EVENT_TYPES.includes(params.event_type as any)) {
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
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(signal) },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
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
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(summary) },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
        }
      }
    );

    if (options.experienceStore) {
      const experienceStore = options.experienceStore;
      const captureTurns =
        options.capture_turns ?? DEFAULT_CONFIG.capture_turns;
      const promotionThreshold =
        options.promotion_threshold ?? DEFAULT_CONFIG.promotion_threshold;
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
                  `Failed to persist ${entry.type} entry (signal_type: ${entry.signal_type}): ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`
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
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result),
                },
              ],
              isError: errors.length > 0,
            };
          } catch (err) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `Error generating experience: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
            };
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
          try {
            if (!embedder.initialized) {
              await embedder.initialize();
            }
            const queryEmbedding = await embedder.embed(params.query);
            const topK = params.top_k ?? DEFAULT_CONFIG.top_k;
            const results = retriever.retrieve(queryEmbedding, topK);
            const injectionText = formatInjection(results);

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    injection_text: injectionText,
                    entries_count: results.length,
                    entries: results.map((r) => ({
                      id: r.entry.id,
                      type: r.entry.type,
                      trigger: r.entry.trigger,
                      similarity: Number(r.similarity.toFixed(4)),
                      score: Number(r.score.toFixed(4)),
                    })),
                  }),
                },
              ],
            };
          } catch (err) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `Error retrieving experiences: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
            };
          }
        }
      );

      server.tool(
        "acm_store_embedding",
        "Generate and store embedding for an experience entry",
        {
          experience_id: z.string().uuid().describe("Experience entry ID"),
        },
        async (params) => {
          try {
            if (!embedder.initialized) {
              await embedder.initialize();
            }
            const entry = experienceStore.getById(params.experience_id);
            if (!entry) {
              return {
                isError: true,
                content: [
                  {
                    type: "text" as const,
                    text: `Experience entry not found: ${params.experience_id}`,
                  },
                ],
              };
            }

            const textToEmbed = [
              entry.trigger,
              ...entry.retrieval_keys,
            ].join(" ");
            const embedding = await embedder.embed(textToEmbed);
            const updated = experienceStore.updateEmbedding(entry.id, embedding);

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    id: entry.id,
                    embedded: updated,
                    dimensions: embedding.length,
                  }),
                },
              ],
            };
          } catch (err) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: `Error storing embedding: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
            };
          }
        }
      );
    }
  }

  return server;
}
