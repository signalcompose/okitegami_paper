/**
 * PreCompact hook — corrective signal preservation before compaction
 * Issue #90: feat: migrate to SessionEnd + PreCompact hook pair
 *
 * Runs before context compaction to analyze the current transcript and
 * preserve corrective signals that would otherwise be lost when the
 * transcript is truncated. Blocks compaction (via decision: "block")
 * until signal preservation is complete.
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { parseTranscript } from "../signals/transcript-parser.js";
import { classifyCorrections } from "../signals/corrective-classifier.js";
export async function handlePreCompact(stdin) {
    const ctx = await bootstrapHook(stdin);
    if (!ctx)
        return;
    try {
        const { input, config, signalStore } = ctx;
        const sessionId = requireInputString(input, "session_id", "PreCompact");
        // Skip if corrective signals already exist for this session
        if (signalStore.hasSignalOfType(sessionId, "corrective_instruction")) {
            ctx.logger.log("skip", "pre_compact_skipped", {
                session_id: sessionId,
                reason: "corrective_signals_already_exist",
            });
            return;
        }
        const transcriptPath = input.transcript_path;
        if (typeof transcriptPath !== "string" || !transcriptPath) {
            ctx.logger.log("skip", "pre_compact_skipped", {
                session_id: sessionId,
                reason: "no_transcript_path",
            });
            return;
        }
        try {
            const parsed = parseTranscript(transcriptPath);
            if (parsed.turns.length <= 1) {
                ctx.logger.log("skip", "pre_compact_skipped", {
                    session_id: sessionId,
                    reason: "single_turn_transcript",
                });
                return;
            }
            const corrections = await classifyCorrections(parsed, {
                ollamaUrl: config.ollama_url,
                model: config.ollama_model,
            });
            for (const c of corrections) {
                signalStore.addSignal(sessionId, "corrective_instruction", {
                    prompt: c.message.text.slice(0, 200),
                    reason: c.reason,
                    confidence: c.confidence,
                    method: c.method,
                    source: "pre_compact",
                });
            }
            ctx.logger.log("detection", "pre_compact_signals_preserved", {
                session_id: sessionId,
                corrective_count: corrections.length,
                methods: corrections.map((c) => c.method),
            });
            if (corrections.length > 0) {
                console.error(`[ACM] pre-compact: preserved ${corrections.length} corrective signal(s) for session "${sessionId}"`);
            }
        }
        catch (err) {
            console.error(`[ACM] pre-compact: transcript analysis failed for "${transcriptPath}": ` +
                `${err instanceof Error ? err.message : String(err)}`);
            ctx.logger.log("error", "pre_compact_analysis_failed", {
                session_id: sessionId,
                transcript_path: transcriptPath,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    finally {
        ctx.cleanup();
    }
}
runAsHookScript(handlePreCompact, "pre-compact");
//# sourceMappingURL=pre-compact.js.map