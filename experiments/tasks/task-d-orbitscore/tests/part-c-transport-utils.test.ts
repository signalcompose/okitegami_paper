/**
 * Part C: Transport utility extraction
 *
 * Tests verify that:
 * 1. validateSequences is exported from transport-utils.ts
 * 2. calculateLoopDiff is exported from transport-utils.ts
 * 3. stopSequences is exported from transport-utils.ts
 * 4. Each function works correctly
 * 5. handleLoopCommand in process-statement.ts uses the extracted functions
 */
import { describe, it, expect, vi } from "vitest";
import { SequenceLike, TransportState } from "../src/types.js";

// Dynamic imports to verify exports exist
async function importTransportUtils() {
  return import("../src/transport-utils.js");
}

function createMockSequence(): SequenceLike {
  return {
    stop: vi.fn(),
    loop: vi.fn().mockResolvedValue(undefined),
    mute: vi.fn(),
    unmute: vi.fn(),
  };
}

function createState(seqNames: string[]): {
  state: TransportState;
  sequences: Record<string, SequenceLike>;
} {
  const sequences: Record<string, SequenceLike> = {};
  const seqMap = new Map<string, SequenceLike>();
  for (const name of seqNames) {
    const seq = createMockSequence();
    sequences[name] = seq;
    seqMap.set(name, seq);
  }
  return {
    state: {
      sequences: seqMap,
      loopGroup: new Set<string>(),
      muteGroup: new Set<string>(),
    },
    sequences,
  };
}

describe("Part C: Transport utilities extraction", () => {
  describe("export verification", () => {
    it("validateSequences should be exported from transport-utils.ts", async () => {
      const mod = await importTransportUtils();
      expect(mod.validateSequences).toBeDefined();
      expect(typeof mod.validateSequences).toBe("function");
    });

    it("calculateLoopDiff should be exported from transport-utils.ts", async () => {
      const mod = await importTransportUtils();
      expect(mod.calculateLoopDiff).toBeDefined();
      expect(typeof mod.calculateLoopDiff).toBe("function");
    });

    it("stopSequences should be exported from transport-utils.ts", async () => {
      const mod = await importTransportUtils();
      expect(mod.stopSequences).toBeDefined();
      expect(typeof mod.stopSequences).toBe("function");
    });
  });

  describe("validateSequences", () => {
    it("should return valid sequences and identify not-found ones", async () => {
      const { validateSequences } = await importTransportUtils();
      const { state } = createState(["kick", "snare"]);

      const result = validateSequences(["kick", "hat", "snare"], state);
      expect(result.validSequences).toEqual(["kick", "snare"]);
      expect(result.notFound).toEqual(["hat"]);
    });

    it("should return all valid when all sequences exist", async () => {
      const { validateSequences } = await importTransportUtils();
      const { state } = createState(["kick", "snare"]);

      const result = validateSequences(["kick", "snare"], state);
      expect(result.validSequences).toEqual(["kick", "snare"]);
      expect(result.notFound).toEqual([]);
    });

    it("should handle empty input", async () => {
      const { validateSequences } = await importTransportUtils();
      const { state } = createState(["kick"]);

      const result = validateSequences([], state);
      expect(result.validSequences).toEqual([]);
      expect(result.notFound).toEqual([]);
    });
  });

  describe("calculateLoopDiff", () => {
    it("should calculate sequences to stop, start, and continue", async () => {
      const { calculateLoopDiff } = await importTransportUtils();
      const oldGroup = new Set(["kick", "snare"]);

      const result = calculateLoopDiff(["snare", "hat"], oldGroup);
      expect(result.toStop).toEqual(["kick"]);
      expect(result.toStart).toEqual(["hat"]);
      expect(result.toContinue).toEqual(["snare"]);
    });

    it("should handle empty old group (all new)", async () => {
      const { calculateLoopDiff } = await importTransportUtils();
      const oldGroup = new Set<string>();

      const result = calculateLoopDiff(["kick", "snare"], oldGroup);
      expect(result.toStop).toEqual([]);
      expect(result.toStart).toEqual(["kick", "snare"]);
      expect(result.toContinue).toEqual([]);
    });

    it("should handle empty new group (all stop)", async () => {
      const { calculateLoopDiff } = await importTransportUtils();
      const oldGroup = new Set(["kick", "snare"]);

      const result = calculateLoopDiff([], oldGroup);
      expect(result.toStop).toEqual(["kick", "snare"]);
      expect(result.toStart).toEqual([]);
      expect(result.toContinue).toEqual([]);
    });
  });

  describe("stopSequences", () => {
    it("should call stop() on specified sequences", async () => {
      const { stopSequences } = await importTransportUtils();
      const { state, sequences } = createState(["kick", "snare", "hat"]);

      stopSequences(["kick", "hat"], state);
      expect(sequences["kick"].stop).toHaveBeenCalledOnce();
      expect(sequences["hat"].stop).toHaveBeenCalledOnce();
      expect(sequences["snare"].stop).not.toHaveBeenCalled();
    });

    it("should silently skip sequences not in state", async () => {
      const { stopSequences } = await importTransportUtils();
      const { state } = createState(["kick"]);

      // Should not throw
      stopSequences(["kick", "nonexistent"], state);
    });
  });

  describe("handleLoopCommand uses transport-utils", () => {
    it("should work correctly with extracted utilities", async () => {
      const { handleLoopCommand } = await import("../src/process-statement.js");
      const { state, sequences } = createState(["kick", "snare", "hat"]);

      // First LOOP: start kick and snare
      await handleLoopCommand(["kick", "snare"], state);
      expect(sequences["kick"].loop).toHaveBeenCalled();
      expect(sequences["snare"].loop).toHaveBeenCalled();
      expect(state.loopGroup).toEqual(new Set(["kick", "snare"]));

      // Second LOOP: switch to hat only
      await handleLoopCommand(["hat"], state);
      expect(sequences["kick"].stop).toHaveBeenCalled();
      expect(sequences["snare"].stop).toHaveBeenCalled();
      expect(sequences["hat"].loop).toHaveBeenCalled();
      expect(state.loopGroup).toEqual(new Set(["hat"]));
    });
  });
});
