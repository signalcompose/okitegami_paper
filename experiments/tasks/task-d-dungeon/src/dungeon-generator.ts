import { DungeonMap, DungeonType } from "./types.js";

/**
 * Generate a dungeon map from a string seed and dungeon type.
 *
 * Requirements:
 * - Convert string seed to numeric seed (e.g., djb2 hash)
 * - Use a seeded PRNG (e.g., xorshift32) for all random decisions
 * - Same seed + type must always produce the same output
 *
 * Labyrinth constraints:
 * - 12-18 rooms
 * - Size distribution (tolerance +/-1 room per category):
 *   small(1x1): 30%, medium(2x2): 40%, large(3x3): 20%, boss(4x4): 10%
 * - Dead ends (rooms with exactly 1 corridor connection): 30-50%
 * - All rooms reachable from rooms[0]
 * - All rooms within 32x32 cell grid
 *
 * Arena constraints:
 * - 8-12 rooms
 * - rooms[0] is boss(4x4) — central arena
 * - large + boss rooms: 60%+ of total
 * - All rooms connected
 * - All rooms within 32x32 cell grid
 */
export function generate(seed: string, type: DungeonType): DungeonMap {
  throw new Error("Not implemented");
}
