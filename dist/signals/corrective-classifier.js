/**
 * CorrectiveClassifier — Ollama LLM classification + interrupt fallback
 * Issue #83: transcript-based corrective instruction detection
 *
 * Primary: Uses local Ollama LLM to classify user messages as corrective or not.
 * Fallback: When Ollama is unavailable, uses structural detection (interrupt-only).
 */
// --- Defaults ---
const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "gemma2:2b";
const DEFAULT_MIN_CONFIDENCE = 0.5;
const DEFAULT_TIMEOUT_MS = 10_000;
const AVAILABILITY_TIMEOUT_MS = 2_000;
// --- LLM Classification Prompt ---
function buildClassificationPrompt(messages) {
    const messageList = messages.map((m) => `${m.index}. "${m.text.slice(0, 200)}"`).join("\n");
    return `You are analyzing a conversation between a user and an AI coding assistant.
For each user message below, determine if it is a "corrective instruction" —
meaning the user is expressing dissatisfaction, requesting a change of approach,
undoing previous work, or redirecting the AI's behavior.

A message is NOT corrective if:
- It is a new instruction or request (not changing a previous one)
- It is positive feedback or acknowledgment
- It is a follow-up question

Messages:
${messageList}

Respond ONLY with a JSON array (no other text):
[{"index":N,"corrective":true/false,"confidence":0.0-1.0,"reason":"brief explanation"}]`;
}
// --- Ollama API ---
export async function isOllamaAvailable(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);
        try {
            const response = await fetch(`${url}/api/tags`, { signal: controller.signal });
            return response.ok;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
            console.error(`[ACM] isOllamaAvailable: probe to "${url}/api/tags" failed: ` +
                `${err instanceof Error ? err.message : String(err)}`);
        }
        return false;
    }
}
async function classifyWithOllama(messages, config) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
        const response = await fetch(`${config.ollamaUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: config.model,
                prompt: buildClassificationPrompt(messages),
                stream: false,
                options: { temperature: 0 },
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            console.error(`[ACM] classifyWithOllama: Ollama returned HTTP ${response.status}`);
            return null;
        }
        const data = (await response.json());
        let parsed;
        try {
            parsed = JSON.parse(data.response);
        }
        catch {
            console.error(`[ACM] classifyWithOllama: Ollama response is not valid JSON: ${data.response.slice(0, 100)}`);
            return null;
        }
        if (!Array.isArray(parsed)) {
            console.error(`[ACM] classifyWithOllama: expected JSON array, got ${typeof parsed}`);
            return null;
        }
        return parsed;
    }
    catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            console.error(`[ACM] classifyWithOllama: request timed out after ${config.timeoutMs}ms`);
        }
        else {
            console.error(`[ACM] classifyWithOllama: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
        }
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
// --- Structural Fallback ---
function structuralFallback(transcript) {
    const results = [];
    for (const turn of transcript.turns) {
        if (turn.index === 0)
            continue; // First message cannot be corrective
        if (turn.isAfterInterrupt) {
            results.push({
                message: turn.humanMessage,
                corrective: true,
                confidence: 0.9,
                reason: "message immediately follows user interrupt",
                method: "structural",
            });
        }
    }
    return results;
}
// --- Main Classification ---
export async function classifyCorrections(transcript, config) {
    if (transcript.turns.length <= 1)
        return [];
    const resolvedConfig = {
        ollamaUrl: config?.ollamaUrl ?? DEFAULT_OLLAMA_URL,
        model: config?.model ?? DEFAULT_MODEL,
        minConfidence: config?.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
        timeoutMs: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
    // Check Ollama availability
    const ollamaUp = await isOllamaAvailable(resolvedConfig.ollamaUrl);
    if (!ollamaUp) {
        console.error(`[ACM] classifyCorrections: Ollama unavailable at "${resolvedConfig.ollamaUrl}", ` +
            `using structural fallback`);
        return structuralFallback(transcript);
    }
    // Prepare messages for LLM (skip first message — cannot be corrective)
    const messagesToClassify = transcript.turns
        .filter((t) => t.index > 0)
        .map((t) => ({ index: t.index, text: t.humanMessage.text }));
    if (messagesToClassify.length === 0)
        return [];
    // Try LLM classification
    const llmResults = await classifyWithOllama(messagesToClassify, resolvedConfig);
    if (!llmResults) {
        console.error("[ACM] classifyCorrections: LLM classification failed, using structural fallback");
        return structuralFallback(transcript);
    }
    // Map LLM results back to transcript turns
    const results = [];
    for (const classification of llmResults) {
        if (typeof classification.index !== "number" ||
            typeof classification.corrective !== "boolean" ||
            typeof classification.confidence !== "number") {
            continue;
        }
        if (!classification.corrective)
            continue;
        if (classification.confidence < resolvedConfig.minConfidence)
            continue;
        const turn = transcript.turns.find((t) => t.index === classification.index);
        if (!turn)
            continue;
        results.push({
            message: turn.humanMessage,
            corrective: true,
            confidence: classification.confidence,
            reason: classification.reason ?? "no reason provided",
            method: "llm",
        });
    }
    return results;
}
//# sourceMappingURL=corrective-classifier.js.map