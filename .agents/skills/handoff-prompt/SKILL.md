---
name: handoff-prompt
description: >
  Distill the conclusion of a discussion (usually after /grill me) into a high-level
  implementation prompt. Deliberately captures only the background and the intended
  approach, leaving out file-, function-, or field-level detail so the implementing
  session still has room to explore. Use when a direction has been decided and you
  want to hand it off to another session for implementation.
---

# Skill: Handoff Prompt

Turn a discussion's conclusion into a **handoff prompt for implementation**. The point is to "explain the background clearly + state the intended approach" while staying high-level, so whoever picks it up still has room to work out the finer cuts.

## Trigger

The user says something like "turn this into a prompt", "write it up as md", "handoff prompt", or — after a round of discussion / `/grill me` — asks to capture the conclusion as a handoff document.

## Core Principles

- **Write direction, not detail.** State the intended approach; do not pin down which files to change, queryKeys, function signatures, or field names.
- **No acceptance checklists, no code, no POC references.** These lock the reader into one implementation.
- **Preserve room to explore.** List the points still to be resolved or weighed, but do not hand down final answers; close by inviting the reader to propose better cuts.
- **Write as if delegating a task** to the picking-up session, not as a transcript of the discussion.
- **Background must stand on its own** — someone who wasn't in the discussion should still understand why this matters.
- Write in the user's working language (default zh-TW unless the user asks otherwise).

## Output Structure

Add or drop sections to fit the conclusion, but roughly:

```markdown
# Task: <one-line title>

## Background

Explain the current state, the problem to solve, and why it matters.
Enough for an outsider to grasp the motivation — but keep it short, not exhaustive.

## Intended Approach

Lead with the core idea in one sentence, then list the direction as a few
numbered points (conceptual level, not file level):

1. ...
2. ...
3. ...

## Things to Weigh

- **<topic>**: describe the trade-off to consider, without giving a final answer.
- **<topic>**: ...

## Expected Outcome

Roughly what "done" looks like at a high level, e.g. "everything moves to X,
so the old Y can be retired."

Close with an invitation: investigate and plan along these lines first, and
raise any better cut or trade-off worth revisiting for discussion.
```

## Notes

- The sections are not a fixed template — add or remove based on the conclusion; but "Background" and "Intended Approach" are almost always required.
- If the discussion settled a topic, fold it into "Intended Approach"; only undecided topics go under "Things to Weigh".
- When in doubt, write too shallow rather than too deep — too much detail constrains the reader.
- Unsure how detailed to go? Ask yourself: "Is this line explaining a direction, or making a decision for the reader?" If the latter, cut it.
