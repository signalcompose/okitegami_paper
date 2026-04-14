/**
 * SessionEnd hook — experience generation with embedding
 * Issue #39: feat(hooks): session-end hook
 * Issue #76: fix: generate embedding at session-end
 * Issue #83: transcript-based corrective instruction detection
 * Issue #90: migrate from Stop to SessionEnd event (fires once per session)
 *
 * Parses transcript → classifies corrections → records signals →
 * aggregates → generates experience entries → embeds → stores.
 *
 * SessionEnd fires exactly once per session, so idempotency guards are
 * retained only as safety nets (e.g., PreCompact may have already stored
 * corrective signals for this session).
 */
import { bootstrapHook, requireInputString, runAsHookScript } from "./_common.js";
import { ExperienceGenerator } from "../experience/generator.js";
import { buildEmbeddingText } from "../retrieval/embedding-text.js";
import { parseTranscript } from "../signals/transcript-parser.js";
import { classifyCorrections } from "../signals/corrective-classifier.js";
import { formatSessionEndMessage } from "./verbosity-formatter.js";
function emitSummary(correctiveDetails, entriesGenerated, entriesPersisted, verbosity) {
    const systemMsg = formatSessionEndMessage({
        corrective_count: correctiveDetails.length,
        entries_generated: entriesGenerated,
        entries_persisted: entriesPersisted,
        corrective_details: correctiveDetails.length > 0 ? correctiveDetails : undefined,
    }, verbosity);
    if (systemMsg) {
        console.error(systemMsg);
    }
}
export async function handleSessionEnd(stdin) {
    const ctx = await bootstrapHook(stdin);
    if (!ctx)
        return;
    let embedder = null;
    try {
        const { input, config, signalStore, experienceStore, collector } = ctx;
        const sessionId = requireInputString(input, "session_id", "SessionEnd");
        const correctiveDetails = [];
        // --- Phase 1: Transcript-based corrective instruction detection ---
        let transcriptAnalysisSkipped = false;
        if (signalStore.hasSignalOfType(sessionId, "corrective_instruction")) {
            console.error(`[ACM] session-end: corrective signals already exist for "${sessionId}", skipping transcript analysis`);
            transcriptAnalysisSkipped = true;
            ctx.logger.log("skip", "transcript_analysis_skipped", {
                session_id: sessionId,
                reason: "corrective_signals_already_exist",
            });
        }
        else {
            const transcriptPath = input.transcript_path;
            if (typeof transcriptPath === "string" && transcriptPath) {
                try {
                    const parsed = parseTranscript(transcriptPath);
                    if (parsed.turns.length > 1) {
                        const corrections = await classifyCorrections(parsed, {
                            ollamaUrl: config.ollama_url,
                            model: config.ollama_model,
                        });
                        for (const c of corrections) {
                            const prompt = c.message.text.slice(0, 200);
                            signalStore.addSignal(sessionId, "corrective_instruction", {
                                prompt,
                                reason: c.reason,
                                confidence: c.confidence,
                                method: c.method,
                            });
                            correctiveDetails.push({
                                prompt,
                                method: c.method,
                                confidence: c.confidence,
                            });
                        }
                        ctx.logger.log("detection", "correctives_detected", {
                            session_id: sessionId,
                            count: corrections.length,
                            methods: corrections.map((c) => c.method),
                            confidences: corrections.map((c) => c.confidence),
                        });
                    }
                }
                catch (err) {
                    console.error(`[ACM] session-end: transcript analysis failed for "${transcriptPath}", ` +
                        `continuing without corrective signals: ` +
                        `${err instanceof Error ? err.message : String(err)}`);
                    ctx.logger.log("error", "transcript_analysis_failed", {
                        session_id: sessionId,
                        transcript_path: transcriptPath,
                        error: err instanceof Error ? err.message : String(err),
                        stack: err instanceof Error ? err.stack : undefined,
                    });
                }
            }
        }
        // --- Phase 1b: Build corrective summary from signal store ---
        // When transcript analysis was skipped because PreCompact already stored
        // corrective signals for this session, populate correctiveDetails from
        // the stored signals for the summary output.
        if (transcriptAnalysisSkipped && correctiveDetails.length === 0) {
            try {
                const storedSignals = signalStore.getBySession(sessionId);
                for (const sig of storedSignals) {
                    if (sig.event_type === "corrective_instruction") {
                        const data = sig.data != null && typeof sig.data === "object"
                            ? sig.data
                            : {};
                        correctiveDetails.push({
                            prompt: typeof data.prompt === "string" ? data.prompt : "",
                            method: typeof data.method === "string" ? data.method : "unknown",
                            confidence: typeof data.confidence === "number" ? data.confidence : undefined,
                        });
                    }
                }
            }
            catch (err) {
                console.error(`[ACM] session-end: failed reading stored corrective signals for "${sessionId}": ` +
                    `${err instanceof Error ? err.message : String(err)}`);
                ctx.logger.log("error", "stored_signals_read_failed", {
                    session_id: sessionId,
                    error: err instanceof Error ? err.message : String(err),
                    stack: err instanceof Error ? err.stack : undefined,
                });
            }
        }
        // --- Phase 2: Experience generation (existing flow) ---
        if (experienceStore.hasEntriesForSession(sessionId)) {
            console.error(`[ACM] session-end: experience entries already exist for "${sessionId}", skipping generation`);
            ctx.logger.log("skip", "experience_generation_skipped", {
                session_id: sessionId,
                reason: "entries_already_exist",
            });
            emitSummary(correctiveDetails, 0, 0, config.verbosity);
            return;
        }
        // Get session summary and signals
        const summary = collector.getSessionSummary(sessionId);
        if (summary.total_signals === 0) {
            ctx.logger.log("skip", "no_signals_recorded", { session_id: sessionId });
            emitSummary(correctiveDetails, 0, 0, config.verbosity);
            return;
        }
        const signals = signalStore.getBySession(sessionId);
        // Generate experience entries
        const generator = new ExperienceGenerator({
            capture_turns: config.capture_turns,
            promotion_threshold: config.promotion_threshold,
        });
        const entries = generator.generate({ session_id: sessionId, summary, signals });
        if (entries.length === 0) {
            ctx.logger.log("skip", "no_entries_generated", { session_id: sessionId });
            emitSummary(correctiveDetails, 0, 0, config.verbosity);
            return;
        }
        // Dynamic import to avoid loading @xenova/transformers WASM at module level
        // Fallback: if Embedder fails, store entries without embedding so they can be
        // backfilled later via acm_store_embedding. This preserves experience data
        // even when the ML model is unavailable (e.g. first-run model download timeout).
        let embedderReady = false;
        try {
            const { Embedder } = await import("../retrieval/embedder.js");
            embedder = new Embedder();
            await embedder.initialize();
            embedderReady = true;
        }
        catch (err) {
            console.error(`[ACM] session-end: Embedder initialization failed, storing entries without embedding: ` +
                `${err instanceof Error ? err.message : String(err)}`);
            ctx.logger.log("error", "embedder_init_failed", {
                session_id: sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
        // Persist each entry with project name (and embedding if available)
        let persisted = 0;
        for (const entryData of entries) {
            let saved;
            if (embedderReady && embedder) {
                const text = buildEmbeddingText(entryData);
                const embedding = await embedder.embed(text);
                saved = experienceStore.createWithEmbedding({ ...entryData, project: ctx.projectName }, embedding);
            }
            else {
                saved = experienceStore.create({ ...entryData, project: ctx.projectName });
            }
            if (saved)
                persisted++;
        }
        if (persisted < entries.length) {
            console.error(`[ACM] session-end: ${entries.length - persisted} of ${entries.length} ` +
                `experience entries failed to persist for session "${sessionId}"`);
        }
        ctx.logger.log("generation", "experiences_created", {
            session_id: sessionId,
            generated: entries.length,
            persisted,
            types: entries.map((e) => e.type),
            embedded: embedderReady,
        });
        emitSummary(correctiveDetails, entries.length, persisted, config.verbosity);
    }
    finally {
        if (embedder)
            embedder.dispose();
        ctx.cleanup();
    }
}
runAsHookScript(handleSessionEnd, "session-end");
//# sourceMappingURL=session-end.js.map