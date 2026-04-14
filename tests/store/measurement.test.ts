/**
 * Tests for natural experiment measurement infrastructure (Issue #87)
 * 4 measurement axes: recurrence rate, temporal trend,
 * injection-outcome correlation, cross-project transfer
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExperienceStore } from "../../src/store/experience-store.js";
import { SessionSignalStore } from "../../src/signals/session-store.js";
import { makeEntry, makeStore } from "../retrieval/helpers.js";

describe("Measurement Infrastructure", () => {
  let store: ExperienceStore;
  let signalStore: SessionSignalStore;

  beforeEach(async () => {
    store = await makeStore();
    signalStore = new SessionSignalStore(store.getDb());
  });

  afterEach(() => {
    store.close();
  });

  describe("getRecurrenceRate", () => {
    it("returns empty when no failure experiences exist", () => {
      const result = store.getRecurrenceRate();
      expect(result).toEqual([]);
    });

    it("detects recurrence when same retrieval_key appears in multiple failures", () => {
      // First failure with key "auth"
      store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["auth", "null-check"],
          signal_type: "corrective_instruction",
          session_id: "s1",
          timestamp: "2026-01-01T00:00:00Z",
        })
      );
      // Second failure with overlapping key "auth"
      store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["auth", "timeout"],
          signal_type: "corrective_instruction",
          session_id: "s2",
          timestamp: "2026-01-02T00:00:00Z",
        })
      );
      // Third failure with different key
      store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["ui", "layout"],
          signal_type: "corrective_instruction",
          session_id: "s3",
          timestamp: "2026-01-03T00:00:00Z",
        })
      );

      const result = store.getRecurrenceRate();
      // "auth" appeared in 2 failures → recurrence
      expect(result.length).toBeGreaterThanOrEqual(1);
      const authEntry = result.find((r) => r.key === "auth");
      expect(authEntry).toBeDefined();
      expect(authEntry!.occurrence_count).toBe(2);
    });

    it("filters by project when specified", () => {
      store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["auth"],
          signal_type: "corrective_instruction",
          session_id: "s1",
          project: "projectA",
          timestamp: "2026-01-01T00:00:00Z",
        })
      );
      store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["auth"],
          signal_type: "corrective_instruction",
          session_id: "s2",
          project: "projectB",
          timestamp: "2026-01-02T00:00:00Z",
        })
      );

      // "auth" appears once in projectA, once in projectB → no recurrence within projectA
      const resultA = store.getRecurrenceRate("projectA");
      expect(resultA.length).toBe(0);

      // Without project filter, "auth" appears across 2 entries → recurrence
      const resultAll = store.getRecurrenceRate();
      expect(resultAll.length).toBe(1);
      expect(resultAll[0].key).toBe("auth");
      expect(resultAll[0].occurrence_count).toBe(2);
    });
  });

  describe("getTemporalTrend", () => {
    it("returns empty when no sessions have signals", () => {
      const result = store.getTemporalTrend();
      expect(result).toEqual([]);
    });

    it("calculates corrective_rate per session over time", () => {
      // Session 1: 2 correctives, 10 tool_success
      signalStore.addSignal("s1", "corrective_instruction", { prompt: "fix this" });
      signalStore.addSignal("s1", "corrective_instruction", { prompt: "no, not that" });
      for (let i = 0; i < 10; i++) {
        signalStore.addSignal("s1", "tool_success", { tool: "edit" });
      }

      // Session 2: 1 corrective, 10 tool_success
      signalStore.addSignal("s2", "corrective_instruction", { prompt: "wrong file" });
      for (let i = 0; i < 10; i++) {
        signalStore.addSignal("s2", "tool_success", { tool: "edit" });
      }

      // Session 3: 0 correctives, 10 tool_success
      for (let i = 0; i < 10; i++) {
        signalStore.addSignal("s3", "tool_success", { tool: "edit" });
      }

      const result = store.getTemporalTrend();
      expect(result.length).toBe(3);
      // Rates should be: s1=0.2, s2=0.1, s3=0.0
      expect(result[0].corrective_rate).toBeCloseTo(0.2, 2);
      expect(result[1].corrective_rate).toBeCloseTo(0.1, 2);
      expect(result[2].corrective_rate).toBeCloseTo(0.0, 2);
    });

    it("filters by project when specified", () => {
      // Add experience entries to associate sessions with projects
      store.create(
        makeEntry({ session_id: "s1", project: "projectA", timestamp: "2026-01-01T00:00:00Z" })
      );
      store.create(
        makeEntry({ session_id: "s2", project: "projectB", timestamp: "2026-01-02T00:00:00Z" })
      );

      signalStore.addSignal("s1", "corrective_instruction", { prompt: "fix" });
      signalStore.addSignal("s1", "tool_success", { tool: "edit" });
      signalStore.addSignal("s2", "corrective_instruction", { prompt: "fix" });
      signalStore.addSignal("s2", "tool_success", { tool: "edit" });

      const result = store.getTemporalTrend("projectA");
      expect(result.length).toBe(1);
      expect(result[0].session_id).toBe("s1");
    });

    it("excludes sessions with zero tool_success (avoid division by zero)", () => {
      signalStore.addSignal("s1", "corrective_instruction", { prompt: "fix" });
      // No tool_success for s1

      const result = store.getTemporalTrend();
      expect(result).toEqual([]);
    });
  });

  describe("getInjectionOutcomeCorrelation", () => {
    it("returns empty when no injection episodes exist", () => {
      const result = store.getInjectionOutcomeCorrelation();
      expect(result).toEqual([]);
    });

    it("correlates injected failure keys with session correctives", () => {
      // Create a failure experience about "auth"
      const failure = store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["auth", "null-check"],
          signal_type: "corrective_instruction",
          session_id: "s0",
          timestamp: "2026-01-01T00:00:00Z",
        })
      );

      // Record injection of that failure into session s1
      signalStore.addSignal("s1", "injection", {
        injected_ids: [failure!.id],
        project: "myproject",
      });

      // Session s1 had NO corrective about "auth" → injection was effective
      signalStore.addSignal("s1", "tool_success", { tool: "edit" });

      const result = store.getInjectionOutcomeCorrelation();
      expect(result.length).toBe(1);
      expect(result[0].session_id).toBe("s1");
      expect(result[0].injected_count).toBe(1);
      expect(result[0].corrective_count).toBe(0);
    });

    it("reports corrective count for sessions with injections", () => {
      const failure = store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["auth"],
          signal_type: "corrective_instruction",
          session_id: "s0",
          timestamp: "2026-01-01T00:00:00Z",
        })
      );

      signalStore.addSignal("s1", "injection", {
        injected_ids: [failure!.id],
        project: "myproject",
      });

      // Session s1 had corrective → injected warning didn't help
      signalStore.addSignal("s1", "corrective_instruction", { prompt: "auth issue again" });
      signalStore.addSignal("s1", "tool_success", { tool: "edit" });

      const result = store.getInjectionOutcomeCorrelation();
      expect(result.length).toBe(1);
      expect(result[0].corrective_count).toBe(1);
    });
  });

  describe("getCrossProjectTransfer", () => {
    it("returns empty when no cross-project injections exist", () => {
      const result = store.getCrossProjectTransfer();
      expect(result).toEqual([]);
    });

    it("detects when experiences from project A are injected into project B", () => {
      // Experience from project A
      const expA = store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["config-parse"],
          signal_type: "corrective_instruction",
          session_id: "sA",
          project: "projectA",
          timestamp: "2026-01-01T00:00:00Z",
        })
      );

      // Injection into project B session
      signalStore.addSignal("sB", "injection", {
        injected_ids: [expA!.id],
        project: "projectB",
      });

      // Create experience in project B session to track project
      store.create(
        makeEntry({
          session_id: "sB",
          project: "projectB",
          timestamp: "2026-01-02T00:00:00Z",
        })
      );

      // Add some signals for sB
      signalStore.addSignal("sB", "tool_success", { tool: "edit" });

      const result = store.getCrossProjectTransfer();
      expect(result.length).toBeGreaterThanOrEqual(1);
      const transfer = result.find(
        (t) => t.source_project === "projectA" && t.target_project === "projectB"
      );
      expect(transfer).toBeDefined();
      expect(transfer!.transfer_count).toBe(1);
    });
  });

  describe("getMeasurementReport", () => {
    it("returns all 4 measurement axes in a single call", () => {
      const report = store.getMeasurementReport();
      expect(report).toHaveProperty("recurrence_rate");
      expect(report).toHaveProperty("temporal_trend");
      expect(report).toHaveProperty("injection_outcome_correlation");
      expect(report).toHaveProperty("cross_project_transfer");
      expect(Array.isArray(report.recurrence_rate)).toBe(true);
      expect(Array.isArray(report.temporal_trend)).toBe(true);
      expect(Array.isArray(report.injection_outcome_correlation)).toBe(true);
      expect(Array.isArray(report.cross_project_transfer)).toBe(true);
    });

    it("passes project filter to all axes", () => {
      store.create(
        makeEntry({
          type: "failure",
          retrieval_keys: ["auth"],
          signal_type: "corrective_instruction",
          session_id: "s1",
          project: "projectA",
          timestamp: "2026-01-01T00:00:00Z",
        })
      );

      const report = store.getMeasurementReport("projectA");
      // Should not throw and should return structured data
      expect(report.recurrence_rate).toBeDefined();
    });
  });
});
