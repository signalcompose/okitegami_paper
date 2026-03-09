import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { SessionSignalStore } from "../signals/session-store.js";
import { SignalCollector } from "../signals/signal-collector.js";
import { EVENT_TYPES } from "../signals/types.js";

const VERSION = "0.1.0";

export interface AcmServerOptions {
  db?: Database.Database;
  capture_turns?: number;
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
      capture_turns: options.capture_turns ?? 5,
    });

    server.tool(
      "acm_record_signal",
      "Record a session signal (for hook integration and testing)",
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
        const summary = collector.getSessionSummary(params.session_id);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(summary) },
          ],
        };
      }
    );
  }

  return server;
}
