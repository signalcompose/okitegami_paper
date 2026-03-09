/**
 * Shared test helpers for experience tests
 */

import type { SessionSummary } from "../../src/signals/signal-collector.js";
import type { EventType, SessionSignal } from "../../src/signals/types.js";

export function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  const defaultCounts: Record<EventType, number> = {
    interrupt: 0,
    post_interrupt_turn: 0,
    corrective_instruction: 0,
    tool_success: 0,
    stop: 0,
    rewind: 0,
  };
  return {
    session_id: "test-session",
    total_signals: 0,
    counts: defaultCounts,
    was_interrupted: false,
    corrective_instruction_count: 0,
    has_test_pass: false,
    ...overrides,
  };
}

export function makeSignal(
  eventType: SessionSignal["event_type"],
  data: Record<string, unknown> | null = null
): SessionSignal {
  return {
    id: 1,
    session_id: "test-session",
    event_type: eventType,
    data,
    timestamp: new Date().toISOString(),
  };
}
