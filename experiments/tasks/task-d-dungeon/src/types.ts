/** Room size category */
export type RoomSize = "small" | "medium" | "large" | "boss";

/** Dungeon type */
export type DungeonType = "labyrinth" | "arena";

/** Cell dimensions for each room size */
export const ROOM_DIMENSIONS: Record<RoomSize, number> = {
  small: 1,
  medium: 2,
  large: 3,
  boss: 4,
};

/** A room in the dungeon */
export interface Room {
  id: number;
  size: RoomSize;
  /** Top-left cell position (0-based) */
  x: number;
  y: number;
  /** Width in cells */
  width: number;
  /** Height in cells */
  height: number;
}

/** A corridor connecting two rooms */
export interface Corridor {
  from: number; // room id
  to: number; // room id
}

/** Complete dungeon map */
export interface DungeonMap {
  type: DungeonType;
  rooms: Room[];
  corridors: Corridor[];
  /** Grid width in cells */
  gridWidth: number;
  /** Grid height in cells */
  gridHeight: number;
}
