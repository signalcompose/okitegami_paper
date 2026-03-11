/**
 * Part A: GainManager/PanManager generic base class extraction
 *
 * Tests verify that:
 * 1. A generic NumericParameterManager base class exists
 * 2. GainManager extends NumericParameterManager
 * 3. PanManager extends NumericParameterManager
 * 4. Existing gain/pan behavior is preserved
 */
import { describe, it, expect } from "vitest";
import { GainManager } from "../src/gain-manager.js";
import { PanManager } from "../src/pan-manager.js";

// Dynamic import to check the base class exists
async function importParameterManager() {
  return import("../src/numeric-parameter-manager.js");
}

describe("Part A: NumericParameterManager base class", () => {
  it("NumericParameterManager class should be exported from numeric-parameter-manager.ts", async () => {
    const mod = await importParameterManager();
    expect(mod.NumericParameterManager).toBeDefined();
    expect(typeof mod.NumericParameterManager).toBe("function");
  });

  it("GainManager should extend NumericParameterManager", async () => {
    const mod = await importParameterManager();
    const gain = new GainManager();
    expect(gain).toBeInstanceOf(mod.NumericParameterManager);
  });

  it("PanManager should extend NumericParameterManager", async () => {
    const mod = await importParameterManager();
    const pan = new PanManager();
    expect(pan).toBeInstanceOf(mod.NumericParameterManager);
  });

  describe("GainManager preserves existing behavior", () => {
    it("should set fixed gain with clamping to [-60, 12]", () => {
      const gm = new GainManager();
      const result = gm.setGain({ valueDb: -6 });
      expect(result.gainDb).toBe(-6);
      expect(result.gainRandom).toBeUndefined();
    });

    it("should clamp gain above 12 dB", () => {
      const gm = new GainManager();
      const result = gm.setGain({ valueDb: 20 });
      expect(result.gainDb).toBe(12);
    });

    it("should clamp gain below -60 dB", () => {
      const gm = new GainManager();
      const result = gm.setGain({ valueDb: -100 });
      expect(result.gainDb).toBe(-60);
    });

    it("should allow -Infinity for complete silence", () => {
      const gm = new GainManager();
      const result = gm.setGain({ valueDb: -Infinity });
      expect(result.gainDb).toBe(-Infinity);
    });

    it("should handle random-walk spec", () => {
      const gm = new GainManager();
      const result = gm.setGain({
        valueDb: { type: "random-walk", center: -3, range: 2 },
      });
      expect(result.gainDb).toBe(-3);
      expect(result.gainRandom).toEqual({
        type: "random-walk",
        center: -3,
        range: 2,
      });
    });

    it("should return description for fixed gain", () => {
      const gm = new GainManager();
      gm.setGain({ valueDb: -6 });
      expect(gm.getGainDescription()).toBe("-6 dB");
    });

    it("should return description for random gain", () => {
      const gm = new GainManager();
      gm.setGain({ valueDb: { type: "full-random" } });
      expect(gm.getGainDescription()).toBe("random");
    });
  });

  describe("PanManager preserves existing behavior", () => {
    it("should set fixed pan with clamping to [-100, 100]", () => {
      const pm = new PanManager();
      const result = pm.setPan({ value: 50 });
      expect(result.pan).toBe(50);
      expect(result.panRandom).toBeUndefined();
    });

    it("should clamp pan above 100", () => {
      const pm = new PanManager();
      const result = pm.setPan({ value: 200 });
      expect(result.pan).toBe(100);
    });

    it("should clamp pan below -100", () => {
      const pm = new PanManager();
      const result = pm.setPan({ value: -200 });
      expect(result.pan).toBe(-100);
    });

    it("should handle full-random spec", () => {
      const pm = new PanManager();
      const result = pm.setPan({ value: { type: "full-random" } });
      expect(result.pan).toBe(0);
      expect(result.panRandom).toEqual({ type: "full-random" });
    });

    it("should return description for fixed pan", () => {
      const pm = new PanManager();
      pm.setPan({ value: -30 });
      expect(pm.getPanDescription()).toBe("-30");
    });

    it("should return description for random-walk pan", () => {
      const pm = new PanManager();
      pm.setPan({ value: { type: "random-walk", center: 10, range: 5 } });
      expect(pm.getPanDescription()).toBe("random(10±5)");
    });
  });
});
