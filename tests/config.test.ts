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
    writeFileSync(
      configPath,
      JSON.stringify({ mode: "success_only", top_k: 10 })
    );

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
    writeFileSync(
      configPath,
      JSON.stringify({ promotion_threshold: 1.5 })
    );

    expect(() => loadConfig(configPath)).toThrow();
  });

  it("throws on non-existent file", () => {
    expect(() => loadConfig("/nonexistent/path.json")).toThrow();
  });
});
