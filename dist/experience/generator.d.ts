/**
 * ExperienceGenerator — SPECIFICATION.md Section 3.6
 *
 * Stateless: receives SessionSummary + signals, returns ExperienceEntry candidates.
 * Caller is responsible for persistence via ExperienceStore.create().
 */
import type { ExperienceEntry } from "../store/types.js";
import type { SessionSummary } from "../signals/signal-collector.js";
import type { SessionSignal } from "../signals/types.js";
export interface GenerationInput {
    session_id: string;
    summary: SessionSummary;
    signals: SessionSignal[];
}
export type GenerationResult = Array<Omit<ExperienceEntry, "id">>;
export interface ExperienceGeneratorOptions {
    capture_turns: number;
    promotion_threshold: number;
}
export declare class ExperienceGenerator {
    private options;
    constructor(options: ExperienceGeneratorOptions);
    generate(input: GenerationInput): GenerationResult;
    private buildSignalIndex;
    private buildTrigger;
    private buildAction;
    private buildOutcome;
    private buildInterruptContext;
}
//# sourceMappingURL=generator.d.ts.map