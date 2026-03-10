import { Corridor } from "./types.js";

/**
 * Check if all rooms are connected (reachable from room 0).
 * Uses BFS or DFS to traverse the corridor graph.
 *
 * @param roomCount - Total number of rooms
 * @param corridors - List of corridors connecting rooms
 * @returns true if every room is reachable from room 0
 */
export function isConnected(roomCount: number, corridors: Corridor[]): boolean {
  throw new Error("Not implemented");
}

/**
 * Count dead-end rooms (rooms with exactly 1 corridor connection).
 *
 * @param roomCount - Total number of rooms
 * @param corridors - List of corridors connecting rooms
 * @returns Number of rooms with exactly 1 connection
 */
export function countDeadEnds(roomCount: number, corridors: Corridor[]): number {
  throw new Error("Not implemented");
}
