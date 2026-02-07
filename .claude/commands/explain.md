---
description: Find and explain detailed design decisions for any topic in the BetterWorld documentation. Helps humans learn and catch up on specific areas of the system design. Use when someone asks "how does X work?", "explain X", "what is X?", or "teach me about X".
context: fork
handoffs:
  - label: Deep Dive into Sub-topic
    agent: explain
    prompt: Go deeper on...
  - label: Start Implementation Planning
    agent: speckit.plan
    prompt: Plan implementation for the topic I just learned about
  - label: Check Spec Consistency
    agent: speckit.analyze
    prompt: Analyze consistency of artifacts related to this area
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding. If the input is empty, ask the user what topic they want to learn about.

## Goal

Help a human quickly understand a specific topic from the BetterWorld design documentation. Act as an expert guide who **teaches** — not one who dumps raw text. Locate the relevant design details across the 40+ doc suite, build a mental model for the reader, and offer to go deeper.

## Execution Steps

### 1. Parse the Query & Detect Audience

Extract the user's topic of interest from `$ARGUMENTS`. Topics can be:
- A system concept (e.g., "guardrails", "impact tokens", "BYOK")
- A technical area (e.g., "database schema", "WebSocket events", "authentication")
- A product concern (e.g., "cold start problem", "trust model", "evidence verification")
- A process or flow (e.g., "mission lifecycle", "agent registration", "content moderation")
- A specific component (e.g., "BullMQ pipeline", "pgvector search", "rate limiting")

**Audience detection**: Infer the audience level from context clues in the query. Adapt depth accordingly:

| Level | Signal | Adaptation |
|-------|--------|------------|
| **Newcomer** | "what is", "explain", "I'm new to" | Lead with analogy, minimize jargon, define every term |
| **Practitioner** | "how does X work", specific component names | Balance concept + technical detail, assume basic domain knowledge |
| **Deep Dive** | "internals of", "why was X chosen over Y", "edge cases" | Go straight to design rationale, trade-offs, and implementation specifics |

If the query is ambiguous or too broad, ask one clarifying question before proceeding.

### 2. Locate Relevant Documentation

Search across the full documentation suite to find sections relevant to the topic:

1. Start with `docs/INDEX.md` to identify which documents are most likely relevant.
2. Search for the topic keyword(s) across all docs using Grep.
3. Read the most relevant files (typically 2-5 files). Prioritize:
   - The **primary document** where the topic is defined or detailed
   - **Cross-referencing documents** that add context (e.g., a DB doc for a feature described in the API doc)
   - **Challenge research docs** (`docs/challenges/`) if the topic relates to a known technical challenge
   - The **constitution** (`.specify/memory/constitution.md`) if the topic touches guardrails, ethics, or governance
4. Build an internal **knowledge map** before writing anything:
   - What are the key entities/concepts?
   - What are the invariants and constraints?
   - What are the data flows and state transitions?
   - What are the design decisions and their rationale?

**Important**: Read enough to provide a thorough explanation. Do not skim — read the relevant sections fully so you can explain details accurately.

### 3. Synthesize the Explanation (Pedagogical Structure)

Follow this 5-part teaching structure, inspired by effective code explanation patterns:

#### 3a. Analogy First
Open with a **real-world analogy** that maps the concept to something familiar. This anchors understanding before introducing technical details.

> Example: "The 3-layer guardrail system works like airport security — Layer A is the self-check (packing your own bag correctly), Layer B is the X-ray scanner (automated classifier), and Layer C is the human agent who pulls you aside for inspection when something flags."

Keep it to 2-3 sentences. Skip this for deep-dive audience level.

#### 3b. Visual Overview
Provide a **visual representation** of the topic. Choose the most appropriate format:

- **ASCII flow diagram** — for processes, pipelines, request flows
- **Mermaid diagram** — for state machines, entity relationships, sequence diagrams (wrap in ` ```mermaid ` code block)
- **Table** — for comparisons, configurations, enum values, role permissions
- **Tree structure** — for hierarchies, directory layouts, component composition

Always include at least one visual. Reproduce key diagrams from the docs when they exist; create new ones when they'd aid understanding.

#### 3c. Step-by-Step Walkthrough
Walk through the topic using a **concrete scenario** — a specific realistic example that exercises the design end-to-end.

> Example for evidence verification: "Imagine a volunteer in Jakarta photographs a cleaned-up riverbank for their 'Remove Plastic from Sungai Ciliwung' mission. Here's what happens to that photo..."
> 1. Upload: The photo hits the `/evidence` endpoint with GPS coordinates and timestamp...
> 2. Layer A self-audit: The agent's own prompt checks...
> 3. ...

Use numbered steps for processes/flows. Include specific technical details: data structures, field names, algorithms, configurations. Reference exact doc sections.

#### 3d. Key Design Decisions & Gotchas
Highlight the **non-obvious** aspects — what a reader would miss by skimming:

- What choices were made and **why** (rationale, trade-offs considered, alternatives rejected)
- **Common gotchas** or misconceptions about this area
- **Constraints** imposed by the constitution or cross-cutting concerns
- **Open questions** or unresolved TODOs (from PRD Section 9, DECISIONS-NEEDED.md, or inline TODOs)

Format decisions as:
> **Decision**: Use halfvec(1024) instead of full vector(1536)
> **Why**: 50% memory savings with <2% recall loss. Migration to Qdrant planned at 500K+ vectors.
> **Source**: [T6-pgvector-performance-at-scale.md](docs/challenges/T6-pgvector-performance-at-scale.md)

#### 3e. Cross-References & Learning Path
End with a map of where to go next:

```
→ **Related**: [Topic Name] — one-line description (see [doc](path))
```

Organize as a **learning path** — order the related topics by logical dependency (what you should understand first → what builds on this topic).

### 4. Offer Interactive Options

After the explanation, present contextual options based on what was covered:

- **"Go deeper on [specific sub-topic mentioned]"** — Drill into a specific aspect
- **"Walk me through another scenario"** — Different example exercising different code paths
- **"Show me the raw [schema/API/config]"** — Surface the exact technical artifacts
- **"How does this connect to [other topic]?"** — Explain cross-cutting relationships
- **"Quiz me"** — Active learning: pose 2-3 questions to test comprehension (see Section 5)
- **"What's not documented yet?"** — Surface gaps, open questions, and TODOs

Present 3-4 of the most relevant options (not all). Follow the user's lead.

### 5. Active Learning Mode (when user says "quiz me")

If the user requests it, engage active recall to reinforce learning:

1. Ask 2-3 short questions that test understanding of what was just explained.
   - Mix question types: "What would happen if...?", "Why does X use Y instead of Z?", "What's the order of operations when...?"
2. After each answer, confirm or gently correct with a brief explanation.
3. If the user struggles, offer to re-explain the relevant part with a different analogy or example.

This is optional — only activate when explicitly requested via "quiz me" or similar.

### 6. Follow-Up Loop

If the user asks follow-up questions:
- Search for additional relevant docs if needed
- Build on the context already established — don't repeat the overview
- Keep answers focused and progressively more detailed
- Maintain the same pedagogical approach (analogy → visual → walkthrough) at smaller scale
- If a question goes beyond what's documented, say so clearly and note it as a gap

## Output Guidelines

- **Teach, don't dump**: Structure the explanation for a human learning the system. Use your own words, cite docs as sources. Never paste large doc excerpts verbatim.
- **Accuracy over invention**: Only state what the docs actually say. Never invent design details. Clearly distinguish documented facts from reasonable inferences.
- **Always include visuals**: At least one diagram, table, or structured visual per explanation. Prefer Mermaid for anything with relationships or flows.
- **Concrete over abstract**: Every abstract concept must be grounded in at least one specific example scenario using BetterWorld's domain (agents, missions, problems, evidence, tokens).
- **Progressive depth**: Start with the high-level picture, then offer to go deeper. Don't overwhelm with everything at once. Match the audience level detected in Step 1.
- **Cite sources**: Always reference which doc(s) the information comes from, using clickable markdown links like `[doc-name](docs/path/to/file.md)`.

## Behavior Rules

- If no documentation exists for the requested topic, say so and suggest the closest documented topic.
- If the topic spans many docs (e.g., "how does the whole system work?"), offer to break it into sub-topics and let the user choose where to start. Present them as a numbered learning path.
- **Never modify any files** — this is a read-only exploration skill.
- If the user asks about implementation status, remind them the project is pre-implementation (documentation phase complete, no application code yet).
- Respect the constitution as the supreme authority — if the docs disagree with the constitution, note the discrepancy and defer to the constitution.
- Keep the main explanation under ~800 words for newcomer/practitioner level. Offer depth on demand, don't front-load it.
