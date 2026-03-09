import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { SessionSignalStore } from "../signals/session-store.js";
import { SignalCollector } from "../signals/signal-collector.js";
import { EVENT_TYPES } from "../signals/types.js";
import { DEFAULT_CONFIG } from "../store/types.js";
import { ExperienceStore } from "../store/experience-store.js";
import { ExperienceGenerator } from "../experience/generator.js";

const VERSION = "0.1.0";

export interface AcmServerOptions {
  db?: Database.Database;
  capture_turns?: number;
  promotion_threshold?: number;
  experienceStore?: ExperienceStore;
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
                    `Failed to persist ${entry.type} entry (signal_type: ${entry.signal_type}): create returned null`
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
              isError: errors.length > 0 && persisted.length === 0,
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
  }

  return server;
}
