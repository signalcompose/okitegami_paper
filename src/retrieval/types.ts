/**
 * Retrieval types — SPECIFICATION Section 4.3
 */
import type { ExperienceEntry, AcmMode } from "../store/types.js";

export interface RetrievalResult {
  entry: ExperienceEntry;
  similarity: number; // cosine similarity (0-1)
  score: number; // similarity * signal_strength
}
