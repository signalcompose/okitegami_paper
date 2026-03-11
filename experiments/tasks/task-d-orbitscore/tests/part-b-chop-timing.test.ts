/**
 * Part B: calculateEventTiming chop modification support
 *
 * Tests verify that:
 * 1. chop(n) subdivides an element's time slot into n equal parts
 * 2. Each sub-slot plays the same slice number
 * 3. Nested structures with chop work correctly
 * 4. Existing behavior (no chop) is preserved
 */
import { describe, it, expect } from "vitest";
import { calculateEventTiming } from "../src/calculate-event-timing.js";
import { PlayElement } from "../src/types.js";

describe("Part B: chop modification in calculateEventTiming", () => {
  const BAR = 1000; // 1000ms bar for easy math

  describe("existing behavior (no chop)", () => {
    it("should calculate timing for simple elements", () => {
      const elements: PlayElement[] = [1, 2, 3, 4];
      const events = calculateEventTiming(elements, BAR);
      expect(events).toHaveLength(4);
      expect(events[0]).toEqual({
        sliceNumber: 1,
        startTime: 0,
        duration: 250,
        depth: 0,
      });
      expect(events[3]).toEqual({
        sliceNumber: 4,
        startTime: 750,
        duration: 250,
        depth: 0,
      });
    });

    it("should handle nested elements", () => {
      // [1, {nested: [2, 3]}] -> 1 gets 500ms, then 2 and 3 each get 250ms
      const elements: PlayElement[] = [1, { type: "nested", elements: [2, 3] }];
      const events = calculateEventTiming(elements, BAR);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        sliceNumber: 1,
        startTime: 0,
        duration: 500,
        depth: 0,
      });
      expect(events[1]).toEqual({
        sliceNumber: 2,
        startTime: 500,
        duration: 250,
        depth: 1,
      });
    });
  });

  describe("chop(n) modification", () => {
    it("chop(2) should subdivide element into 2 equal parts", () => {
      // Element 1 with chop(2): slice 1 plays twice in the time slot
      const elements: PlayElement[] = [
        {
          type: "modified",
          value: 1,
          modifiers: [{ method: "chop", value: 2 }],
        },
        2,
      ];
      const events = calculateEventTiming(elements, BAR);
      // Element 1 gets 500ms, chop(2) splits into 2x250ms
      // Element 2 gets 500ms
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        sliceNumber: 1,
        startTime: 0,
        duration: 250,
        depth: 0,
      });
      expect(events[1]).toEqual({
        sliceNumber: 1,
        startTime: 250,
        duration: 250,
        depth: 0,
      });
      expect(events[2]).toEqual({
        sliceNumber: 2,
        startTime: 500,
        duration: 500,
        depth: 0,
      });
    });

    it("chop(4) should subdivide element into 4 equal parts", () => {
      const elements: PlayElement[] = [
        {
          type: "modified",
          value: 3,
          modifiers: [{ method: "chop", value: 4 }],
        },
      ];
      const events = calculateEventTiming(elements, BAR);
      expect(events).toHaveLength(4);
      for (let i = 0; i < 4; i++) {
        expect(events[i]).toEqual({
          sliceNumber: 3,
          startTime: i * 250,
          duration: 250,
          depth: 0,
        });
      }
    });

    it("chop(3) should subdivide element into 3 equal parts", () => {
      const elements: PlayElement[] = [
        {
          type: "modified",
          value: 5,
          modifiers: [{ method: "chop", value: 3 }],
        },
      ];
      const events = calculateEventTiming(elements, 900);
      expect(events).toHaveLength(3);
      expect(events[0].duration).toBeCloseTo(300);
      expect(events[1].startTime).toBeCloseTo(300);
      expect(events[2].startTime).toBeCloseTo(600);
    });

    it("chop(1) should behave like no chop", () => {
      const elements: PlayElement[] = [
        {
          type: "modified",
          value: 1,
          modifiers: [{ method: "chop", value: 1 }],
        },
      ];
      const events = calculateEventTiming(elements, BAR);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        sliceNumber: 1,
        startTime: 0,
        duration: 1000,
        depth: 0,
      });
    });

    it("chop on nested play structure should subdivide each sub-element", () => {
      // Nested [1, 2] with chop(2): each of the 2 sub-elements gets chopped
      const elements: PlayElement[] = [
        {
          type: "modified",
          value: {
            type: "nested",
            elements: [1, 2],
          },
          modifiers: [{ method: "chop", value: 2 }],
        },
      ];
      const events = calculateEventTiming(elements, BAR);
      // Nested [1,2] in 1000ms: each gets 500ms
      // chop(2) on each: 1 plays 2x250ms, 2 plays 2x250ms
      expect(events).toHaveLength(4);
      expect(events[0].sliceNumber).toBe(1);
      expect(events[0].duration).toBe(250);
      expect(events[1].sliceNumber).toBe(1);
      expect(events[1].startTime).toBe(250);
      expect(events[2].sliceNumber).toBe(2);
      expect(events[2].startTime).toBe(500);
      expect(events[3].sliceNumber).toBe(2);
      expect(events[3].startTime).toBe(750);
    });

    it("multiple elements with mixed chop and no-chop", () => {
      const elements: PlayElement[] = [
        1,
        {
          type: "modified",
          value: 2,
          modifiers: [{ method: "chop", value: 2 }],
        },
        3,
      ];
      const events = calculateEventTiming(elements, 900);
      // 1: 300ms, 2 chopped(2): 2x150ms, 3: 300ms
      expect(events).toHaveLength(4);
      expect(events[0].sliceNumber).toBe(1);
      expect(events[0].duration).toBeCloseTo(300);
      expect(events[1].sliceNumber).toBe(2);
      expect(events[1].duration).toBeCloseTo(150);
      expect(events[2].sliceNumber).toBe(2);
      expect(events[2].startTime).toBeCloseTo(450);
      expect(events[3].sliceNumber).toBe(3);
      expect(events[3].startTime).toBeCloseTo(600);
    });
  });
});
