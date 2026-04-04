/**
 * TranscriptParser — Claude Code transcript JSONL parsing
 * Issue #83: transcript-based corrective instruction detection
 *
 * Parses JSONL transcript files to extract real user messages
 * and detect interrupt patterns. Uses `permissionMode` field
 * as the discriminator for real human input (vs tool results).
 */
export interface HumanMessage {
    text: string;
    timestamp: string;
    promptId: string;
    uuid: string;
}
export interface TranscriptTurn {
    index: number;
    humanMessage: HumanMessage;
    isAfterInterrupt: boolean;
}
export interface ParsedTranscript {
    turns: TranscriptTurn[];
    interruptCount: number;
    totalHumanMessages: number;
}
export declare function parseTranscript(transcriptPath: string): ParsedTranscript;
//# sourceMappingURL=transcript-parser.d.ts.map