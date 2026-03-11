/**
 * Transport statement processing utilities
 *
 * Contains functions for LOOP command differential calculation,
 * sequence validation, and stop operations.
 *
 * NOTE: These functions are currently embedded in this file.
 * They should be extracted to transport-utils.ts for better modularity.
 */

import { SequenceLike, TransportState } from "./types.js";

/**
 * Validates sequence names and returns valid and not found sequences.
 */
function validateSequences(
  sequenceNames: string[],
  state: TransportState
): { validSequences: string[]; notFound: string[] } {
  const notFound: string[] = [];
  const validSequences: string[] = [];

  for (const seqName of sequenceNames) {
    if (state.sequences.has(seqName)) {
      validSequences.push(seqName);
    } else {
      notFound.push(seqName);
    }
  }

  return { validSequences, notFound };
}

/**
 * Calculates differential sets for efficient LOOP command processing.
 */
function calculateLoopDiff(
  newSequences: string[],
  oldLoopGroup: Set<string>
): { toStop: string[]; toStart: string[]; toContinue: string[] } {
  const newLoopGroup = new Set(newSequences);
  const toStop = [...oldLoopGroup].filter((name) => !newLoopGroup.has(name));
  const toStart = newSequences.filter((name) => !oldLoopGroup.has(name));
  const toContinue = newSequences.filter((name) => oldLoopGroup.has(name));

  return { toStop, toStart, toContinue };
}

/**
 * Stops sequences by name.
 */
function stopSequences(sequenceNames: string[], state: TransportState): void {
  for (const seqName of sequenceNames) {
    const sequence = state.sequences.get(seqName);
    if (sequence) {
      sequence.stop();
    }
  }
}

/**
 * Handle LOOP() command - unidirectional toggle (optimized with differential calculation)
 */
export async function handleLoopCommand(
  sequenceNames: string[],
  state: TransportState
): Promise<void> {
  const { validSequences, notFound } = validateSequences(sequenceNames, state);

  if (notFound.length > 0) {
    console.warn(
      `LOOP(): The following sequences do not exist and will be ignored: ${notFound.join(", ")}`
    );
  }

  const { toStop, toStart, toContinue } = calculateLoopDiff(validSequences, state.loopGroup);

  // Stop sequences removed from LOOP group
  stopSequences(toStop, state);

  // Update LOOP group
  state.loopGroup = new Set(validSequences);

  // Start new sequences
  for (const seqName of toStart) {
    const sequence = state.sequences.get(seqName);
    if (sequence) {
      await sequence.loop();
      if (state.muteGroup.has(seqName)) {
        sequence.mute();
      }
    }
  }

  // Update MUTE state for continuing sequences
  for (const seqName of toContinue) {
    const sequence = state.sequences.get(seqName);
    if (sequence) {
      if (state.muteGroup.has(seqName)) {
        sequence.mute();
      } else {
        sequence.unmute();
      }
    }
  }
}
