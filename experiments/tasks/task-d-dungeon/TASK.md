# Task D: 2D Dungeon Generator

## Overview

Implement a seeded 2D dungeon generator that produces two types of dungeons: **Labyrinth** and **Arena**. The generator must be deterministic — the same seed always produces the same dungeon.

## Instructions

1. Run `npm test` to see failing tests
2. Implement the functions in `src/dungeon-generator.ts` and `src/graph-utils.ts`
3. Do not modify `src/types.ts` or any test files
4. Verify all tests pass

## Architecture

### Files to implement

- **`src/dungeon-generator.ts`** — `generate(seed: string, type: DungeonType): DungeonMap`
- **`src/graph-utils.ts`** — `isConnected()` and `countDeadEnds()`

### Pre-defined types (do not modify)

- `src/types.ts` — `Room`, `Corridor`, `DungeonMap`, `RoomSize`, `ROOM_DIMENSIONS`

## Specification

### Seeded PRNG

- Convert the string seed to a numeric seed (e.g., djb2 hash)
- Use a seeded pseudo-random number generator (e.g., xorshift32) for ALL random decisions
- Same seed + same type must always produce identical output

### Labyrinth Type

Generate a maze-like dungeon with branching paths and dead ends.

**Constraints:**
- Room count: 12–18
- Size distribution (tolerance: +/-1 room per category):
  - `small` (1x1 cells): 30% of rooms
  - `medium` (2x2 cells): 40% of rooms
  - `large` (3x3 cells): 20% of rooms
  - `boss` (4x4 cells): 10% of rooms
- Dead ends (rooms with exactly 1 corridor connection): 30–50% of rooms
- All rooms must be reachable from `rooms[0]` via corridors
- All rooms must fit within a 32x32 cell grid (room x + width <= gridWidth, etc.)

### Arena Type

Generate a boss-arena dungeon with a central boss room surrounded by large rooms.

**Constraints:**
- Room count: 8–12
- `rooms[0]` must be a `boss` room (4x4 cells) — the central arena
- `large` + `boss` rooms must be 60%+ of total room count
- All rooms must be connected via corridors
- All rooms must fit within a 32x32 cell grid

### Graph Utilities

- `isConnected(roomCount, corridors)`: Return `true` if all rooms (0 to roomCount-1) are reachable from room 0 via corridors. An empty graph (0 rooms) and a single room are considered connected.
- `countDeadEnds(roomCount, corridors)`: Count rooms with exactly 1 corridor connection. Corridors are bidirectional.

### Room Placement

- Each `Room` has `x`, `y` (top-left cell), `width`, `height` (in cells)
- Room dimensions must match `ROOM_DIMENSIONS[size]` (e.g., `small` = 1x1, `boss` = 4x4)
- Rooms must not overlap each other
- `gridWidth` and `gridHeight` in `DungeonMap` must be <= 32

## Constraints

- Do not modify test files or `src/types.ts`
- Use only the seeded PRNG for randomness — no `Math.random()`
- All 23 tests must pass when complete
