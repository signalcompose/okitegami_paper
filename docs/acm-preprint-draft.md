# Associative Context Memory: Persistent Experience-Based Memory for LLM Coding Agents Beyond Context Window Dependency

**Yamato Hiroshi**  
Keio University / Signal compose Inc.  
yamato@signalcompose.com

*Preprint — Draft v0.4 — 2026-03-08*

---

## Abstract

Large Language Model (LLM)-based coding agents suffer from a fundamental limitation: their memory is entirely bound to the context window, which degrades in quality as token count increases—a phenomenon known as Context Rot. Existing mitigations such as context compression, session splitting, and retrieval-augmented generation address symptoms but do not resolve the underlying dependency on context window size. We propose **Associative Context Memory (ACM)**, an external persistent memory architecture for LLM coding agents that captures success and failure experiences from implicit user feedback signals, enabling agents to learn across sessions without relying on context window capacity. A key contribution of this work is the taxonomy and strength ordering of implicit feedback signals in coding agent interactions: interrupt events (Ctrl+C / force stop) followed by post-interrupt dialogue, rewind operations, corrective instructions, and uninterrupted task completion. We implement ACM as an MCP (Model Context Protocol) server compatible with existing LLM coding agent ecosystems, and propose an experimental design to evaluate its effectiveness in reducing context window dependency while improving task performance over repeated sessions.

---

## 1. Introduction

LLM-based coding agents such as Claude Code and OpenAI Codex have demonstrated remarkable capability in software development tasks. However, they share a fundamental architectural constraint: all context—conversation history, tool outputs, system prompts, and retrieved documents—must fit within a finite context window. As token count grows within a session, model performance degrades measurably. Recent empirical work has characterized this phenomenon as **Context Rot** [CITE: Chroma Research 2025], showing that attention becomes diluted across tokens, and the probability of successfully completing a given task decreases as context accumulates.

Current approaches to this problem fall into two categories:

**Compression and splitting** approaches (auto-compact, Plan Mode, manual session resets) treat context rot as a session management problem. They mitigate degradation by reducing context size, but provide no mechanism for the agent to carry knowledge across sessions. Each new session begins from zero—what we term the **"amnesiac agent" problem**.

**Retrieval-augmented** approaches (Serena [CITE], RAG-based context augmentation) improve the agent's access to relevant information, but focus on retrieving existing artifacts (code, documentation) rather than capturing experiential knowledge about what worked and what failed.

Neither category addresses a deeper question: **can an agent learn from its own interaction history in a way that persists across context windows and across sessions?**

Human cognition offers an instructive contrast. Experienced developers do not retain verbatim memories of past debugging sessions. Instead, they accumulate *associative patterns*: "when I see this kind of authentication error, the approach that worked was X; the approach that failed was Y." This knowledge is sparse, compressed, and indexed by associative retrieval cues rather than stored as raw episodic detail.

We propose **Associative Context Memory (ACM)**, a persistent external memory layer for LLM coding agents that:

1. Captures success and failure experiences from implicit user feedback signals
2. Stores experiences in a structured, retrievable format indexed by associative keys
3. Injects relevant past experiences into new sessions without consuming excessive context
4. Reduces the agent's dependency on context window size for sustained performance

A central novelty of this work is the **taxonomy of implicit feedback signals** available in coding agent interactions. We identify interrupt events—the act of forcibly stopping an agent mid-execution via Ctrl+C or equivalent—as the strongest available signal of user dissatisfaction, particularly when combined with the dialogue that immediately follows. This signal has been overlooked in prior work on agent feedback despite being readily observable at the PTY (pseudo-terminal) level.

The remainder of this paper is structured as follows. Section 2 reviews related work on context management and agent memory. Section 3 presents the ACM framework. Section 4 defines the implicit feedback signal taxonomy. Section 5 describes the experimental design for evaluating ACM. Section 6 discusses implications and limitations. Section 7 concludes.

---

## 2. Background and Related Work

### 2.1 Context Window Limitations and Context Rot

The Transformer architecture's self-attention mechanism operates over all tokens in the context window, with computational complexity scaling as O(n²) in the number of tokens n. Beyond computational cost, empirical studies have shown that model performance on reasoning and instruction-following tasks degrades as context length increases. Chroma Research [CITE] systematically characterized this as "Context Rot," demonstrating that even state-of-the-art models including Claude Opus 4 and Sonnet 4 exhibit measurable performance degradation as context fills.

Practitioners have observed a rule of thumb: performance is most reliable within approximately the first 40% of the context window (termed the "Smart zone"), with degradation becoming pronounced beyond this threshold [CITE: Geoffrey Huntley].

### 2.2 Context Management in Coding Agents

Existing context management strategies in coding agents include:

**Auto-compact**: Summarization of session history when context approaches capacity. A critical weakness is that summarization is performed by a degraded model operating near context capacity—exactly the condition where summarization quality is lowest.

**Plan Mode (Claude Code)**: Separates planning and implementation into distinct sessions with clean context windows. Effective but requires manual workflow discipline and provides no cross-session memory.

**CLAUDE.md and persistent instructions**: Static documents loaded at session start. Useful for stable project context but not adaptive to interaction history.

### 2.3 Agent Memory Systems

The landscape of persistent memory for LLM agents has developed rapidly. We situate ACM within this landscape by identifying the key dimensions along which approaches differ.

**MemGPT / Letta** [CITE] introduced a tiered memory architecture treating the context window as "RAM" and external storage as "disk," with the agent autonomously paging information in and out. This is the most influential general-purpose agent memory architecture, but it is designed for conversational agents and does not address outcome-weighted memory selection or coding-specific feedback signals.

**Mem0 and A-MEM** [CITE] provide memory layers with semantic search and graph-based organization. A-MEM [CITE: arXiv:2502.12110] improves flexibility through dynamic note construction and link generation. Neither system distinguishes memory entries by outcome quality; all interactions are stored and retrieved without weighting by success or failure.

**A-MAC (Adaptive Memory Admission Control)** [CITE: arXiv:2603.04549, 2026] is the most structurally similar prior work to ACM. A-MAC decomposes memory admission into five value signals: future utility, factual confidence, semantic novelty, temporal recency, and content type prior. However, A-MAC operates on general conversational memory and does not utilize behavioral signals from coding agent interactions (interrupts, rewinds) as admission criteria. Its evaluation targets personal and professional dialogue domains, not software development tasks.

**REMEMBERER** [CITE: Zhang et al., 2023] implements episodic memory as a table of interaction records including Q-values, updated by reinforcement learning without fine-tuning the base LLM. This is structurally related to ACM's experience scoring, but applies reinforcement learning updates rather than using implicit behavioral feedback signals directly observable from the PTY interface.

**Self-Generated In-Context Examples** [CITE: Sarukkai et al., NeurIPS 2025] stores successful task trajectories for use as in-context examples in future tasks, demonstrating significant performance gains (73%→89% on ALFWorld). This validates the core premise of experience-based memory in agents. ACM extends this direction by: (1) including failure experiences alongside successes, (2) introducing a signal strength taxonomy based on behavioral feedback rather than binary task completion, and (3) targeting coding agent interactions specifically.

**Letta Code** is a memory-first coding agent based on the MemGPT/Letta architecture. It achieves strong results on Terminal-Bench but does not expose or exploit PTY-level behavioral signals as memory quality indicators.

**How Memory Management Impacts LLM Agents** [CITE: arXiv:2505.16067, 2025] empirically demonstrates the "experience-following property" of LLM agents—that agents tend to replicate patterns from their memory, including erroneous ones. This finding directly motivates ACM's distinction between success and failure entries: without outcome-weighted memory selection, failure experiences would propagate errors rather than prevent them.

The common limitation across all prior memory systems is the **absence of PTY-level behavioral signals**—interrupt events, rewind operations, and corrective instruction patterns—as first-class memory quality signals. These signals are uniquely available in interactive terminal-based coding agent sessions and provide high-quality implicit feedback without requiring explicit user annotation.

### 2.4 Implicit Feedback in Human-LLM Interaction

Recent work has studied implicit feedback in conversational LLM interactions. An ICML 2025 paper [CITE: arXiv:2507.23158] analyzed implicit user feedback in WildChat and LMSYS datasets, finding that the *content* of feedback (e.g., what the user wanted clarified) improves model performance more than polarity alone. A concurrent study at Google [CITE: arXiv:2509.18361] analyzed telemetry from Cider Chat (an internal coding assistant), finding that explicit thumbs-up/down feedback occurs in only 0.6% of interactions, motivating the use of implicit behavioral signals instead.

Neither study examines PTY-level interrupt events as feedback signals. The Cider Chat study focuses on sentiment in natural language prompts rather than behavioral actions (force-stop, rewind). ACM's signal taxonomy fills this gap specifically for terminal-based coding agents.

### 2.5 Retrieval-Augmented Code Generation

**Serena** [CITE] uses Language Server Protocol (LSP) to build a semantic index of codebases, enabling agents to retrieve relevant code symbols, definitions, and references. ACM is orthogonal to Serena: Serena improves *what codebase information is available*, while ACM improves *what experiential patterns about working in this codebase are available*. We evaluate their combination in our experimental design.

### 2.6 Positioning ACM

The following table summarizes how ACM differs from the most closely related prior work:

| System | Cross-session memory | Failure experiences | PTY/behavioral signals | Coding-agent specific |
|--------|---------------------|--------------------|-----------------------|-----------------------|
| MemGPT / Letta | ✓ | ✗ | ✗ | ✗ |
| Mem0 / A-MEM | ✓ | ✗ | ✗ | ✗ |
| A-MAC | ✓ | partial | ✗ | ✗ |
| REMEMBERER | ✓ | ✓ (Q-value) | ✗ | ✗ |
| Self-Gen ICE | ✓ | ✗ | ✗ | ✗ |
| Letta Code | ✓ | ✗ | ✗ | ✓ |
| **ACM (ours)** | **✓** | **✓** | **✓** | **✓** |

---

## 3. The ACM Framework

### 3.1 Architecture Overview

ACM is implemented as an MCP (Model Context Protocol) server that wraps existing LLM coding agent infrastructure. This design choice ensures compatibility with Claude Code, OpenAI Codex CLI, and any agent that supports MCP.

```
[ACM MCP Server] — Claude Code hooks API-based implementation

  SessionStart hook
    └─ Inject ACM context (relevant past success/failure entries injected at session start)

  UserPromptSubmit hook
    └─ Capture N=3-5 turns after interrupt in real time
    └─ Detect corrective instruction text patterns (rewind fallback)

  PostToolUse hook
    └─ Record successful tool completions

  PostToolUseFailure hook
    └─ is_interrupt=true → begin failure entry generation
    └─ Note: user interrupts during tool execution are available via the official hooks API

  Stop hook
    └─ Normal completion → success entry candidate
    └─ Note: Stop hook does not fire on user interrupt (official specification)
       This "non-firing" also serves as a complementary interrupt detection signal

  SessionEnd hook
    └─ Session end → finalize and persist entries
    └─ Retrieve session log (JSONL) via transcript_path
    └─ Retrieve post-session token usage from ~/.claude.json
```

The ACM layer performs three functions:

1. **Retrieval at session start**: Query the experience DB for entries relevant to the current task, inject a compressed representation into session context
2. **Signal monitoring during session**: Capture implicit feedback signals from the PTY interface and conversation
3. **Experience writing at session end**: Score and store the session as success or failure entries

### 3.2 Experience Entry Structure

ACM maintains two types of entries:

**Success entries** ("do this"):
```json
{
  "type": "success",
  "trigger": "Authentication bug in auth.py, JWT validation failing",
  "action": "Used FileSystemWatcher to detect changes, showed diff before applying",
  "outcome": "Tests passed, no rewind or corrective instructions",
  "retrieval_keys": ["auth", "JWT", "FileSystemWatcher", "diff"],
  "signal_strength": 0.85,
  "session_id": "...",
  "timestamp": "..."
}
```

**Failure entries** ("don't do this"):
```json
{
  "type": "failure",
  "trigger": "Authentication bug in auth.py, JWT validation failing",
  "action": "Attempted bulk rewrite of all related files simultaneously",
  "outcome": "Interrupt event detected. Post-interrupt dialogue: 'not like that, just change the diff'",
  "retrieval_keys": ["auth", "bulk rewrite", "simultaneous changes"],
  "signal_strength": 0.95,
  "interrupt_context": {
    "turns_captured": 3,
    "dialogue_summary": "User wanted incremental diff-based changes, not bulk rewrite"
  },
  "session_id": "...",
  "timestamp": "..."
}
```

### 3.3 Retrieval and Injection

At the start of each session, ACM:

1. Extracts keywords from the user's initial task description
2. Performs vector similarity search over `retrieval_keys` in the experience DB
3. Retrieves top-K relevant entries (both success and failure)
4. Injects a compressed summary into session context:

```
[ACM Context]
Past relevant experience:
- SUCCESS: For JWT auth bugs → use incremental diff approach (strength: 0.85)
- FAILURE: For JWT auth bugs → avoid bulk file rewrites, user interrupted (strength: 0.95)
  Note: "just change the diff, not everything"
Details available at: ~/.acm/experiences/exp_20260215_auth.json
```

The injection is deliberately compact. Detailed entries are stored externally and referenced by path, avoiding context window inflation. This implements the "index not content" principle: the agent knows *where* to find detail if needed, without loading it unconditionally.

### 3.4 Experience Scoring and Promotion

At session end, ACM scores the session using available signals (detailed in Section 4) and writes entries above a promotion threshold to the experience DB. Sessions with mixed signals may generate both a success entry (for sub-tasks that completed cleanly) and a failure entry (for sub-tasks that triggered interrupts or rewinds).

---

## 4. Implicit Feedback Signal Taxonomy

A central contribution of this work is the systematic classification of implicit feedback signals available in LLM coding agent interactions. Unlike explicit feedback (ratings, thumbs up/down), implicit signals are behavioral—observable from the interaction interface without requiring deliberate user action.

We propose the following taxonomy, ordered by signal strength (strongest to weakest):

### Level 1: Interrupt + Post-Interrupt Dialogue (Highest Strength)

**Signal**: User triggers a force-stop of agent execution (Ctrl+C, Esc×2, or equivalent interrupt mechanism) followed by corrective dialogue.

**Observable from**: PTY-level SIGINT/interrupt event; subsequent conversation turns (N=3–5 recommended)

Specifically, Claude Code's `PostToolUseFailure` hook provides an `is_interrupt` boolean field that explicitly flags user-initiated interrupts via the official hooks API, without requiring PTY-level instrumentation. The `Stop` hook's absence of firing when an interrupt occurs provides a complementary confirmation signal.

**Why strongest**: The interrupt event represents the highest-cost user action—actively stopping an ongoing process. The post-interrupt dialogue is uniquely valuable because it typically contains the user's explicit articulation of *why* they stopped: "not like that," "you're changing too much," "that approach is wrong." This constitutes labeled negative feedback with explanatory content.

**Example**:
```
Agent: [begins rewriting 12 files simultaneously]
User:  [Ctrl+C]
User:  "I said fix the bug, not refactor everything"
→ Failure entry: "avoid broad multi-file changes for targeted bug fix requests"
```

### Level 2: Rewind Operation (High Strength)

**Signal**: User invokes the rewind function (/rewind or Esc×2 in Claude Code) to restore conversation to a prior state.

**Observable from**: Session event log / MCP hook

**Why high strength**: Rewind represents deliberate undoing of agent output. Unlike simply ignoring agent output, rewind indicates the user wants to erase the interaction from the record—strong implicit rejection.

**Distinction from interrupt**: Rewind is post-hoc (after completion of an agent action); interrupt is real-time (during execution). Both are strong negative signals but capture different failure modes.

### Level 3: Corrective Instructions (Medium Strength)

**Signal**: User provides natural language correction within the conversation ("that's wrong," "try again," "not what I meant," etc.)

**Observable from**: Conversation text; detectable via pattern matching or LLM classification

**Why medium strength**: Verbal correction is lower cost than interrupt or rewind and may reflect minor misalignment rather than fundamental failure. However, repeated corrective instructions within a session are a reliable failure indicator.

**Compound signal**: Multiple corrective instructions within a session (e.g., 3+ corrections) should be weighted similarly to a rewind event.

### Level 4: Uninterrupted Completion (Baseline / Weak Positive)

**Signal**: Task completes without interrupt, rewind, or corrective instructions; tests pass (where applicable).

**Observable from**: Session completion event; tool execution exit codes

**Why weak**: Absence of negative signal is not strong confirmation of success. The user may have accepted suboptimal output, or may not have reviewed it carefully. However, combined with test passage, uninterrupted completion is a reliable positive signal.

### Signal Strength Summary

| Signal | Strength Score (0–1) | Direction | Capture Method |
|--------|---------------------|-----------|----------------|
| Interrupt + post-interrupt dialogue | 0.90–1.00 | Negative | PTY SIGINT + N turns |
| Rewind | 0.75–0.90 | Negative | Session event log |
| Corrective instruction (3+) | 0.60–0.80 | Negative | Conversation text |
| Corrective instruction (1) | 0.30–0.50 | Negative | Conversation text |
| Test pass + uninterrupted | 0.70–0.85 | Positive | Exit code + session log |
| Uninterrupted (no tests) | 0.40–0.60 | Positive | Session log |

Signal strength scores are used to weight experience entries during retrieval: high-strength entries are surfaced preferentially.

---

## 5. Experimental Design

### 5.1 Research Questions

**RQ1**: Does ACM reduce context window dependency while maintaining or improving task performance over repeated sessions?

**RQ2**: Among ACM-S (success only), ACM-F (failure only), and ACM-SF (both), which memory composition yields the greatest performance improvement?

**RQ3**: Do implicit feedback signal types (interrupt, rewind, corrective instruction) correlate with experience entry quality as measured by downstream task performance?

**RQ4**: Does ACM allow sustained performance under artificially constrained context window sizes?

**RQ5**: Is ACM complementary to retrieval-based approaches (Serena), and does combining them yield additive benefits?

### 5.2 Experimental Conditions

| Condition | Description |
|-----------|-------------|
| Control | Base LLM agent, no context management |
| Baseline-compact | Agent + auto-compact |
| Baseline-Serena | Agent + Serena |
| ACM-S | Agent + ACM (success entries only) |
| ACM-F | Agent + ACM (failure entries only) |
| ACM-SF | Agent + ACM (success + failure entries) |
| ACM-SF + Serena | Combined approach |

To isolate model capability from architecture effects, we use a fixed open-weight model (e.g., Llama 3.1 70B or Qwen2.5-Coder 32B) as the base agent across all conditions. Claude Code / Codex are included as reference points but not as controlled experimental variables.

### 5.3 Context Window Constraint Conditions (for RQ4)

Each condition above is evaluated at three context window sizes:

| Constraint | Token budget |
|-----------|-------------|
| Full | 128k (model default) |
| Half | 64k |
| Smart zone | 50k (~40% of full) |

If ACM enables comparable performance at reduced context sizes, this demonstrates that architectural memory can substitute for context window capacity.

### 5.4 Task Suite

Tasks are designed to exhibit context rot under baseline conditions while providing clear success/failure criteria:

**Task A — Multi-file bug fix**: Fix a seeded bug requiring changes across 5–10 files in a realistic codebase. Evaluated by test suite passage.

**Task B — Feature addition from specification**: Implement a feature described in a natural language specification document. Evaluated by functional tests + human review of specification adherence.

**Task C — Refactoring with design principles**: Apply a stated design principle (e.g., dependency inversion) consistently across a codebase. Evaluated by automated linting + human consistency review.

Each task is executed in 5 repeated sessions per condition. Sessions 1–2 build the experience DB; sessions 3–5 measure retrieval benefits. Cross-session improvement rate is a primary metric.

### 5.5 Evaluation Metrics

| Metric | Measurement | Primary RQ |
|--------|-------------|-----------|
| Task completion rate | Test pass rate / human evaluation (0–1) | RQ1 |
| Interrupt count | PTY SIGINT events per session | RQ1, RQ3 |
| Rewind count | Session event log | RQ1, RQ3 |
| Corrective instruction count | Conversation text analysis | RQ1, RQ3 |
| Context efficiency | Tokens used at completion / task complexity score | RQ4 |
| Cross-session improvement | Δ completion rate, session 1→5 | RQ1, RQ2 |
| Signal-quality correlation | Pearson r: signal strength score × downstream success | RQ3 |

---

## 6. Discussion

### 6.1 The Amnesiac Agent Problem

Current LLM coding agents are, by design, amnesiac: each session begins with no knowledge of prior interactions. Context window management strategies mitigate this within a session but do not address the cross-session knowledge gap. ACM addresses this directly by externalizing experiential knowledge in a form that persists and compounds across sessions.

This has practical implications beyond performance metrics. An agent with ACM can develop *project-specific behavioral patterns*—knowing not just what the codebase contains (retrievable via Serena) but how this particular user prefers to approach problems in this particular codebase.

### 6.2 Interrupt as a First-Class Signal

The interrupt event has been underutilized as a feedback mechanism in agent systems research. In conversational AI, the equivalent would be a user closing the window mid-generation—rare and ambiguous. In coding agents, interrupts are common and semantically rich: an agent pursuing the wrong approach will be stopped, and the user's subsequent explanation is precisely the negative training signal needed to avoid that approach in future.

Capturing N=3–5 post-interrupt turns as part of the failure entry is particularly valuable because this dialogue is typically the most explicit feedback a user provides—prompted by frustration into articulating exactly what went wrong.

### 6.3 Relationship to Reinforcement Learning

The ACM signal taxonomy bears structural similarity to reward signals in reinforcement learning: interrupt events approximate large negative rewards, uninterrupted task completion approximates positive rewards, with intermediate signals filling the gradient. However, ACM does not perform weight updates on the underlying model—it operates at the context level, injecting relevant past experience as soft guidance. This distinction makes ACM deployable with any LLM without requiring fine-tuning infrastructure.

### 6.4 Limitations

**Cold start**: ACM provides no benefit in the first session on a new task type. Performance gains require accumulated experience.

**Experience staleness**: Codebase evolution may render past experiences misleading. We plan to evaluate time-decay weighting in future work.

**Interrupt ambiguity**: Not all interrupts signal dissatisfaction with agent approach—some reflect external interruptions (phone calls, meetings). Disambiguation heuristics based on post-interrupt dialogue content are needed.

**Scope**: The current design targets coding agents specifically. Generalization to other agentic domains (web agents, data analysis agents) requires adaptation of the signal taxonomy.

**Rewind detection**: Claude Code does not provide a dedicated hook event for rewind operations. ACM detects rewinds indirectly via corrective instruction patterns in subsequent UserPromptSubmit events, or by monitoring message count reduction in the session transcript (available via transcript_path). This merges rewind (Level 2) with corrective instructions (Level 3) in practice, though the distinction remains conceptually valid for agent environments that expose rewind as a first-class event.

**Real-time context usage**: Token count within an active session is not accessible via the Claude Code hooks API. ACM uses post-session token counts from the agent configuration file for RQ4 evaluation, and treats PreCompact hook firing (which occurs when context approaches capacity) as a proxy for near-limit conditions.

---

## 7. Conclusion

We have presented Associative Context Memory (ACM), a persistent external memory architecture for LLM coding agents that captures success and failure experiences from implicit user feedback. ACM's key contributions are:

1. A taxonomy of implicit feedback signals in coding agent interactions, with interrupt + post-interrupt dialogue identified as the strongest available signal
2. An experience entry structure that distinguishes success ("do this") from failure ("don't do this") memories, enabling the agent to develop both positive patterns and avoidance behaviors
3. An MCP-compatible implementation design that integrates with existing LLM coding agent ecosystems without model modification
4. An experimental design for evaluating cross-session learning and context window dependency reduction

The central claim of this work—that architectural memory can reduce an agent's dependency on context window capacity—has implications beyond engineering practice. If validated, it suggests that the "amnesiac agent" problem is addressable without scaling context windows, offering a complementary path to sustained agent performance.

We release the experimental framework and ACM implementation at [repository URL to be added].

---

## References

[CITE: Chroma Research 2025] Context Rot: How Increasing Input Tokens Impacts LLM Performance. Chroma Research, 2025. https://research.trychroma.com/context-rot

[CITE: Anthropic 2025] Effective Context Engineering for AI Agents. Anthropic Engineering Blog, 2025. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

[CITE: MemGPT] Packer, C., et al. MemGPT: Towards LLMs as Operating Systems. arXiv:2310.08560, 2023.

[CITE: Mem0] Chhikara, P., et al. Mem0: The Memory Layer for Personalized AI. arXiv:2504.19413, 2025.

[CITE: A-MEM] Xu, W., et al. A-MEM: Agentic Memory for LLM Agents. arXiv:2502.12110, 2025.

[CITE: A-MAC] Adaptive Memory Admission Control for LLM Agents. arXiv:2603.04549, 2026.

[CITE: REMEMBERER] Zhang, Y., et al. REMEMBERER: Equipping Large Language Models with Persistent Memory via Long-Term Interaction. arXiv:2306.07929, NeurIPS 2023.

[CITE: Self-Gen ICE] Sarukkai, V., et al. Self-Generated In-Context Examples Improve LLM Agents for Sequential Decision-Making. arXiv:2505.00234, NeurIPS 2025.

[CITE: Memory Management] Xiong, Z., et al. How Memory Management Impacts LLM Agents: An Empirical Study of Experience-Following Behavior. arXiv:2505.16067, 2025.

[CITE: Implicit Feedback ICML] Implicit User Feedback in Human-LLM Dialogues: Informative to Understand Users yet Noisy as a Learning Signal. ICML 2025. arXiv:2507.23158.

[CITE: Cider Chat] Reading Between the Lines: Scalable User Feedback via Implicit Sentiment in Developer Prompts. arXiv:2509.18361, 2025.

[CITE: Serena] [citation to be added upon publication]

[CITE: Letta] MemGPT open source project / Letta. https://www.letta.com

[CITE: Geoffrey Huntley] Huntley, G. How to Build a Coding Agent. Blog post, 2025. https://ghuntley.com/agent/ (YouTube: https://www.youtube.com/live/fOPvAPdqgPo)

[CITE: Context Rot CADDi] Context Management for Claude Code. CADDi Tech Blog, 2026. https://caddi.tech/claude-code-context-management-202603

---

*Draft v0.4 — 2026-03-08 — Feedback welcome*
*Target venue: arXiv cs.SE / cs.AI — to be submitted after Phase 0 probe results*
