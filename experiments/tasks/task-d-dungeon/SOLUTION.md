# Task D: Solution

## Seeded PRNG

### String-to-seed (djb2)

```
hash = 5381
for each char c in seed:
  hash = ((hash << 5) + hash) + charCode(c)
return hash >>> 0  // ensure unsigned 32-bit
```

### xorshift32 PRNG

```
state = seed (non-zero)
function next():
  state ^= state << 13
  state ^= state >>> 17
  state ^= state << 5
  return state >>> 0
```

Use `next() / 0x100000000` for float in [0, 1), or `next() % n` for integer in [0, n).

## graph-utils.ts

### isConnected

BFS from room 0. Build adjacency list from corridors (bidirectional). Return true if visited set size equals roomCount. Edge cases: 0 rooms → true, 1 room → true.

### countDeadEnds

Build degree map from corridors (each corridor increments degree of both `from` and `to`). Count rooms with degree === 1.

## dungeon-generator.ts

### Labyrinth Algorithm

1. Decide room count: `12 + prng() % 7` → range [12, 18]
2. Compute size distribution targets from percentages, rounding to nearest integer
3. Create room list with assigned sizes
4. Place rooms on 32x32 grid without overlap:
   - For each room, try random positions until one fits (no overlap)
   - Use a 2D occupancy grid for collision detection
5. Connect rooms:
   - Start with rooms[0], add to connected set
   - Iteratively connect nearest unconnected room to connected set via corridor
   - This guarantees connectivity (spanning tree)
6. Adjust dead-end ratio to stay within 30-50%:
   - If ratio < 30% (too few dead ends): remove some non-essential corridors to increase dead-end count
   - If ratio > 50% (too many dead ends): add extra corridors connecting pairs of dead-end rooms
   - Target: 30-50% of rooms have exactly 1 connection
7. Set gridWidth/gridHeight to bounding box of all rooms

### Arena Algorithm

1. Decide room count: `8 + prng() % 5` → range [8, 12]
2. Place rooms[0] as boss (4x4) near center of grid
3. Compute remaining rooms to satisfy 60%+ large+boss ratio:
   - At least `ceil(0.6 * totalRooms) - 1` more large/boss rooms
   - Fill remainder with small/medium
4. Place surrounding rooms in ring around center
5. Connect all rooms to boss room or to each other (star or ring topology)
6. Set gridWidth/gridHeight to bounding box

### Key Challenges

- **Size distribution**: The tolerance is +/-1 room per category. Must round carefully.
- **Dead-end ratio**: After building spanning tree, most leaves are dead ends. May need to add extra corridors to adjust ratio within 30-50%.
- **Room placement**: Larger rooms (3x3, 4x4) need more space. Place largest rooms first to avoid running out of space.
- **Grid bounds**: All rooms must fit within 32x32. Place rooms carefully and track bounding box.
