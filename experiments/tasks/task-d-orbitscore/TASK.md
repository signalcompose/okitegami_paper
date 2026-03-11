# Task D: Music DSL Engine Refactoring

## Overview
This is a refactoring task for a music DSL (Domain-Specific Language) engine called "orbitscore". The engine parses text-based music notation and controls audio playback with features like gain/pan control, timing calculation, and transport commands (LOOP, RUN, MUTE).

The codebase has three areas that need refactoring. Complete all three parts. Run `npx vitest run` to verify your changes — all tests must pass.

## Part A: Extract NumericParameterManager Base Class

`GainManager` (gain-manager.ts) and `PanManager` (pan-manager.ts) have nearly identical structures — they both manage a numeric value with clamping, random value support, and description generation. The only differences are the parameter names and value ranges.

**What to do:**
1. Create `src/numeric-parameter-manager.ts` with a generic `NumericParameterManager` base class
2. The base class should handle: set value (with clamping and random support), get value, generate event value, get description
3. Modify `GainManager` to extend `NumericParameterManager` (keep the same public API: `setGain`, `getGain`, `generateEventGain`, `getGainDescription`)
4. Modify `PanManager` to extend `NumericParameterManager` (keep the same public API: `setPan`, `getPan`, `generateEventPan`, `getPanDescription`)

**Key differences to handle:**
- Gain range: -60 to 12 (dB), Pan range: -100 to 100
- Gain allows `-Infinity` for complete silence, Pan does not
- Gain description appends " dB", Pan uses `toString()`

## Part B: Implement chop() Modification in Timing Calculation

`calculateEventTiming` (calculate-event-timing.ts) has a `TODO: Apply chop modifications` comment where chop support is missing. Currently, modified elements with chop are treated as simple numbers, ignoring the chop modifier.

**What chop(n) should do:**
- `chop(n)` subdivides an element's time slot into `n` equal parts
- Each sub-part plays the same slice number
- Example: slice 1 with chop(2) in a 500ms slot → two events: slice 1 at 0ms (250ms duration) and slice 1 at 250ms (250ms duration)
- For nested structures with chop: apply chop to each leaf element in the nested structure

**What to do:**
1. Find the `TODO: Apply chop modifications` in calculate-event-timing.ts
2. Implement chop support: when a `modified` element has a chop modifier, subdivide its time slot
3. Handle both simple number values and nested structures with chop

## Part C: Extract Transport Utilities

`process-statement.ts` contains three utility functions (`validateSequences`, `calculateLoopDiff`, `stopSequences`) that are currently private. These should be extracted to `transport-utils.ts` for reuse.

**What to do:**
1. Move `validateSequences`, `calculateLoopDiff`, and `stopSequences` from process-statement.ts to transport-utils.ts
2. Export all three functions from transport-utils.ts
3. Update process-statement.ts to import and use the functions from transport-utils.ts
4. The `handleLoopCommand` function in process-statement.ts must continue to work correctly

## Constraints
- Do not modify test files
- Do not change the public API of existing classes/functions
- All existing behavior must be preserved
- Run `npx vitest run` to verify — all tests must pass
