import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/store/types.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  const testDir = join(tmpdir(), "acm-config-test");

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns default config when no path provided", () => {
    const config = loadConfig();
    expect(config.mode).toBe(DEFAULT_CONFIG.mode);
    expect(config.top_k).toBe(DEFAULT_CONFIG.top_k);
    expect(config.capture_turns).toBe(DEFAULT_CONFIG.capture_turns);
    expect(config.promotion_threshold).toBe(DEFAULT_CONFIG.promotion_threshold);
    // db_path has ~ expanded
    expect(config.db_path).not.toContain("~");
    expect(config.db_path).toContain("experiences.db");
  });

  it("loads config from JSON file", () => {
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, "acm.json");
    writeFileSync(configPath, JSON.stringify({ mode: "success_only", top_k: 10 }));

    const config = loadConfig(configPath);
    expect(config.mode).toBe("success_only");
    expect(config.top_k).toBe(10);
    // Defaults for unspecified fields
    expect(config.capture_turns).toBe(DEFAULT_CONFIG.capture_turns);
    expect(config.promotion_threshold).toBe(DEFAULT_CONFIG.promotion_threshold);
  });

  it("expands ~ in db_path", () => {
    const config = loadConfig();
    expect(config.db_path).not.toContain("~");
    expect(config.db_path).toContain("experiences.db");
  });

  it("throws on invalid mode", () => {
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, JSON.stringify({ mode: "invalid_mode" }));

    expect(() => loadConfig(configPath)).toThrow();
  });

  it("throws on out-of-range promotion_threshold", () => {
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, JSON.stringify({ promotion_threshold: 1.5 }));

    expect(() => loadConfig(configPath)).toThrow();
  });

  it("throws on non-existent file", () => {
    expect(() => loadConfig("/nonexistent/path.json")).toThrow("Cannot read config file");
  });

  it("throws on malformed JSON", () => {
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, "{broken json");

    expect(() => loadConfig(configPath)).toThrow("Invalid JSON");
  });

  it("throws on unknown config keys", () => {
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, JSON.stringify({ topK: 10 }));

    expect(() => loadConfig(configPath)).toThrow("Unknown config keys");
  });

  it("throws on top_k < 1", () => {
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, JSON.stringify({ top_k: 0 }));

    expect(() => loadConfig(configPath)).toThrow("top_k must be >= 1");
  });

  it("throws on capture_turns < 1", () => {
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, "bad.json");
    writeFileSync(configPath, JSON.stringify({ capture_turns: 0 }));

    expect(() => loadConfig(configPath)).toThrow("capture_turns must be >= 1");
  });

  describe("LoadConfigOptions", () => {
    it("accepts LoadConfigOptions with path", () => {
      mkdirSync(testDir, { recursive: true });
      const configPath = join(testDir, "acm.json");
      writeFileSync(configPath, JSON.stringify({ mode: "failure_only" }));

      const config = loadConfig({ path: configPath });
      expect(config.mode).toBe("failure_only");
    });

    it("dbPathOverride takes precedence over config file db_path", () => {
      mkdirSync(testDir, { recursive: true });
      const configPath = join(testDir, "acm.json");
      const overridePath = join(testDir, "override.db");
      writeFileSync(configPath, JSON.stringify({ db_path: "/from/config.db" }));

      const config = loadConfig({ path: configPath, dbPathOverride: overridePath });
      expect(config.db_path).toBe(overridePath);
    });

    it("dbPathOverride expands tilde", () => {
      const config = loadConfig({ dbPathOverride: "~/custom-acm.db" });
      expect(config.db_path).not.toContain("~");
      expect(config.db_path).toContain("custom-acm.db");
    });

    it("empty string dbPathOverride falls back to default", () => {
      const config = loadConfig({ dbPathOverride: "" });
      expect(config.db_path).toContain("experiences.db");
    });

    it("dbPathOverride without config file path", () => {
      const overridePath = join(testDir, "standalone.db");
      const config = loadConfig({ dbPathOverride: overridePath });
      expect(config.db_path).toBe(overridePath);
      expect(config.mode).toBe(DEFAULT_CONFIG.mode);
    });
  });

  describe("verbosity config", () => {
    it("defaults to normal when not specified", () => {
      const config = loadConfig();
      expect(config.verbosity).toBe("normal");
    });

    it("accepts valid verbosity values", () => {
      mkdirSync(testDir, { recursive: true });
      for (const v of ["quiet", "normal", "verbose"] as const) {
        const configPath = join(testDir, `acm-${v}.json`);
        writeFileSync(configPath, JSON.stringify({ verbosity: v }));
        const config = loadConfig(configPath);
        expect(config.verbosity).toBe(v);
      }
    });

    it("rejects invalid verbosity value", () => {
      mkdirSync(testDir, { recursive: true });
      const configPath = join(testDir, "acm-bad.json");
      writeFileSync(configPath, JSON.stringify({ verbosity: "debug" }));
      expect(() => loadConfig(configPath)).toThrow(/Invalid verbosity/);
    });

    it("normalizes empty verbosity to default", () => {
      mkdirSync(testDir, { recursive: true });
      const configPath = join(testDir, "acm-empty.json");
      writeFileSync(configPath, JSON.stringify({ verbosity: "" }));
      const config = loadConfig(configPath);
      expect(config.verbosity).toBe("normal");
    });
  });
});
