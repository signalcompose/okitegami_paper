/**
 * Common bootstrap module for ACM hooks
 * Issue #37: feat(hooks): common bootstrap module for ACM hooks
 *
 * Each hook script calls bootstrapHook() with raw stdin.
 * Returns null for silent exit (ACM not configured or disabled).
 * Returns initialized stores + parsed input for active hooks.
 */
import { SessionSignalStore } from "../signals/session-store.js";
import { ExperienceStore } from "../store/experience-store.js";
import { SignalCollector } from "../signals/signal-collector.js";
import type { AcmConfig } from "../store/types.js";
export interface HookContext {
    input: Record<string, unknown>;
    config: AcmConfig;
    signalStore: SessionSignalStore;
    experienceStore: ExperienceStore;
    collector: SignalCollector;
    projectName: string;
    cleanup: () => void;
}
export declare function bootstrapHook(stdin: string): Promise<HookContext | null>;
/**
 * Validate that a required string field exists in hook input.
 * Throws a descriptive error if the field is missing or not a string.
 */
export declare function requireInputString(input: Record<string, unknown>, field: string, hookName: string): string;
/**
 * Shared entry point for hook scripts.
 * Reads stdin, calls handler, handles errors.
 * Supports both sync and async handlers.
 * Exits with code 0 on success, code 1 on unhandled errors.
 */
export declare function runAsHookScript(handler: (stdin: string) => void | Promise<void>, hookName: string): void;
//# sourceMappingURL=_common.d.ts.map