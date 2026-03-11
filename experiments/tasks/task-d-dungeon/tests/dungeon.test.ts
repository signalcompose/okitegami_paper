import { describe, it, expect } from "vitest";
import { generate } from "../src/dungeon-generator.js";
import { isConnected, countDeadEnds } from "../src/graph-utils.js";
import { DungeonMap, RoomSize, ROOM_DIMENSIONS } from "../src/types.js";

// ─── helpers ────────────────────────────────────────────────

function roomSizeDist(map: DungeonMap): Record<RoomSize, number> {
  const dist: Record<RoomSize, number> = { small: 0, medium: 0, large: 0, boss: 0 };
  for (const r of map.rooms) dist[r.size]++;
  return dist;
}

function allWithinGrid(map: DungeonMap): boolean {
  return map.rooms.every(
    (r) =>
      r.x >= 0 && r.y >= 0 && r.x + r.width <= map.gridWidth && r.y + r.height <= map.gridHeight
  );
}

function deadEndRatio(map: DungeonMap): number {
  const de = countDeadEnds(map.rooms.length, map.corridors);
  return map.rooms.length === 0 ? 0 : de / map.rooms.length;
}

const LAB_SEEDS = ["alpha", "bravo", "charlie"];
const ARENA_SEEDS = ["delta", "echo", "foxtrot"];

// ─── Labyrinth tests ────────────────────────────────────────

describe("Labyrinth", () => {
  it("produces 12-18 rooms", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      expect(m.rooms.length).toBeGreaterThanOrEqual(12);
      expect(m.rooms.length).toBeLessThanOrEqual(18);
    }
  });

  it("has correct room dimensions for each size", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      for (const r of m.rooms) {
        const dim = ROOM_DIMENSIONS[r.size];
        expect(r.width).toBe(dim);
        expect(r.height).toBe(dim);
      }
    }
  });

  it("small rooms are ~30% of total (tolerance +/-1)", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      const expected = Math.round(m.rooms.length * 0.3);
      const dist = roomSizeDist(m);
      expect(dist.small).toBeGreaterThanOrEqual(expected - 1);
      expect(dist.small).toBeLessThanOrEqual(expected + 1);
    }
  });

  it("medium rooms are ~40% of total (tolerance +/-1)", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      const expected = Math.round(m.rooms.length * 0.4);
      const dist = roomSizeDist(m);
      expect(dist.medium).toBeGreaterThanOrEqual(expected - 1);
      expect(dist.medium).toBeLessThanOrEqual(expected + 1);
    }
  });

  it("large rooms are ~20% of total (tolerance +/-1)", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      const expected = Math.round(m.rooms.length * 0.2);
      const dist = roomSizeDist(m);
      expect(dist.large).toBeGreaterThanOrEqual(expected - 1);
      expect(dist.large).toBeLessThanOrEqual(expected + 1);
    }
  });

  it("boss rooms are ~10% of total (tolerance +/-1)", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      const expected = Math.round(m.rooms.length * 0.1);
      const dist = roomSizeDist(m);
      expect(dist.boss).toBeGreaterThanOrEqual(Math.max(1, expected - 1));
      expect(dist.boss).toBeLessThanOrEqual(expected + 1);
    }
  });

  it("dead-end ratio is 30-50%", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      const ratio = deadEndRatio(m);
      expect(ratio).toBeGreaterThanOrEqual(0.3);
      expect(ratio).toBeLessThanOrEqual(0.5);
    }
  });

  it("all rooms are connected from rooms[0]", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      expect(isConnected(m.rooms.length, m.corridors)).toBe(true);
    }
  });

  it("all rooms fit within 32x32 grid", () => {
    for (const s of LAB_SEEDS) {
      const m = generate(s, "labyrinth");
      expect(m.gridWidth).toBeLessThanOrEqual(32);
      expect(m.gridHeight).toBeLessThanOrEqual(32);
      expect(allWithinGrid(m)).toBe(true);
    }
  });
});

// ─── Arena tests ────────────────────────────────────────────

describe("Arena", () => {
  it("produces 8-12 rooms", () => {
    for (const s of ARENA_SEEDS) {
      const m = generate(s, "arena");
      expect(m.rooms.length).toBeGreaterThanOrEqual(8);
      expect(m.rooms.length).toBeLessThanOrEqual(12);
    }
  });

  it("rooms[0] is a boss room (4x4)", () => {
    for (const s of ARENA_SEEDS) {
      const m = generate(s, "arena");
      expect(m.rooms[0].size).toBe("boss");
      expect(m.rooms[0].width).toBe(4);
      expect(m.rooms[0].height).toBe(4);
    }
  });

  it("large + boss rooms are 60%+ of total", () => {
    for (const s of ARENA_SEEDS) {
      const m = generate(s, "arena");
      const dist = roomSizeDist(m);
      const bigRatio = (dist.large + dist.boss) / m.rooms.length;
      expect(bigRatio).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("all rooms are connected", () => {
    for (const s of ARENA_SEEDS) {
      const m = generate(s, "arena");
      expect(isConnected(m.rooms.length, m.corridors)).toBe(true);
    }
  });

  it("all rooms fit within 32x32 grid", () => {
    for (const s of ARENA_SEEDS) {
      const m = generate(s, "arena");
      expect(m.gridWidth).toBeLessThanOrEqual(32);
      expect(m.gridHeight).toBeLessThanOrEqual(32);
      expect(allWithinGrid(m)).toBe(true);
    }
  });

  it("has correct room dimensions for each size", () => {
    for (const s of ARENA_SEEDS) {
      const m = generate(s, "arena");
      for (const r of m.rooms) {
        const dim = ROOM_DIMENSIONS[r.size];
        expect(r.width).toBe(dim);
        expect(r.height).toBe(dim);
      }
    }
  });
});

// ─── Seed determinism ───────────────────────────────────────

describe("Seed determinism", () => {
  it("same seed + type produces identical output", () => {
    const a = generate("determinism-test", "labyrinth");
    const b = generate("determinism-test", "labyrinth");
    expect(a).toEqual(b);
  });

  it("different seeds produce different outputs", () => {
    const a = generate("seed-one", "labyrinth");
    const b = generate("seed-two", "labyrinth");
    const posA = a.rooms.map((r) => `${r.x},${r.y}`).join(";");
    const posB = b.rooms.map((r) => `${r.x},${r.y}`).join(";");
    expect(posA).not.toBe(posB);
  });

  it("same seed with different types produces different outputs", () => {
    const lab = generate("cross-type", "labyrinth");
    const arena = generate("cross-type", "arena");
    expect(lab.type).toBe("labyrinth");
    expect(arena.type).toBe("arena");
    // Arena spec requires rooms[0] to be boss; labyrinth has no such requirement
    expect(arena.rooms[0].size).toBe("boss");
  });
});

// ─── graph-utils unit tests ─────────────────────────────────

describe("graph-utils", () => {
  it("empty graph (0 rooms) is connected", () => {
    expect(isConnected(0, [])).toBe(true);
  });

  it("single room with no corridors is connected", () => {
    expect(isConnected(1, [])).toBe(true);
  });

  it("two rooms with no corridor are not connected", () => {
    expect(isConnected(2, [])).toBe(false);
  });

  it("chain of 5 rooms is connected with 2 dead ends", () => {
    const corridors = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ];
    expect(isConnected(5, corridors)).toBe(true);
    expect(countDeadEnds(5, corridors)).toBe(2);
  });

  it("star topology: center + 4 leaves has 4 dead ends", () => {
    const corridors = [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 0, to: 4 },
    ];
    expect(isConnected(5, corridors)).toBe(true);
    expect(countDeadEnds(5, corridors)).toBe(4);
  });
});
