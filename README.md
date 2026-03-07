# okitegami_paper

**Associative Context Memory (ACM): Persistent Experience-Based Memory for LLM Coding Agents Beyond Context Window Dependency**

Hiroshi Yamato — Keio University / Signal compose Inc.

---

## Overview

This repository contains the research paper draft and supporting documents for ACM (Associative Context Memory), an external persistent memory architecture for LLM coding agents.

ACM captures success and failure experiences from implicit user feedback signals (interrupt events, rewind operations, corrective instructions) and injects relevant past experiences into new sessions, enabling agents to learn across sessions without relying on context window capacity.

## Key Contribution

A taxonomy of implicit feedback signals in coding agent interactions, with `PostToolUseFailure.is_interrupt` (Claude Code hooks API) identified as the strongest available signal of user dissatisfaction.

## Repository Structure

- `docs/acm-preprint-draft.md` — Paper draft (v0.4)
- `docs/acm-handoff.md` — Research context and design decisions
- `docs/session-log.md` — AI collaboration process log
- `adr/` — Architecture Decision Records
- `src/` — Implementation (in progress)

## Status

- [x] Research design
- [x] Related work review (ADR 0001)
- [x] Phase 0 feasibility probe (ADR 0002)
- [x] Paper draft v0.4
- [ ] arXiv submission
- [ ] Implementation

## Preprint

arXiv submission in progress. Link will be added upon publication.

---

*Signal compose Inc. / Keio University*
