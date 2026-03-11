/**
 * Shared type definitions for orbitscore refactoring task
 * (Extracted from orbitscore parser and sequence types)
 */

// Random value types for parameter managers
export type RandomValue =
  | { type: "full-random" }
  | { type: "random-walk"; center: number; range: number };

// Gain parameter options
export interface GainOptions {
  valueDb: number | RandomValue;
  isSeamless?: boolean;
}

// Pan parameter options
export interface PanOptions {
  value: number | RandomValue;
  isSeamless?: boolean;
}

// Play structure types (for timing calculation)
export type PlayElement = number | PlayNested | PlayWithModifier;

export type PlayNested = {
  type: "nested";
  elements: PlayElement[];
};

export type PlayWithModifier = {
  type: "modified";
  value: number | PlayNested;
  modifiers: PlayModifier[];
};

export type PlayModifier = {
  method: "chop";
  value: number;
};

// Timed event (output of timing calculation)
export interface TimedEvent {
  sliceNumber: number;
  startTime: number;
  duration: number;
  depth: number;
}

// Minimal Sequence interface for transport utilities
export interface SequenceLike {
  stop(): void;
  loop(): Promise<void>;
  mute(): void;
  unmute(): void;
}

// Minimal interpreter state for transport utilities
export interface TransportState {
  sequences: Map<string, SequenceLike>;
  loopGroup: Set<string>;
  muteGroup: Set<string>;
}
