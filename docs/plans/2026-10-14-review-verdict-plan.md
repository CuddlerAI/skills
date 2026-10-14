# Review Verdict Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Keep repairable first-take defects at fix while preserving reject for content red lines and a failed re-shoot.

**Architecture:** Clarify the verdict decision in the skill and reference it from the checklist. Add behavior evals for the three relevant branches; keep extraction measurements independent of the verdict.

**Tech Stack:** Markdown skills, Claude plugin eval definitions, Node.js validator, ffmpeg, Cursor.

---

### Task 1: Preserve the failing baseline and add regression cases

**Files:** `evals/review-repairable/`, `evals/review-red-line/`, `evals/review-second-failure/`, `evals/README.md`.

1. Retain the previous Cursor first-take result: a six-second landscape clip reviewed against fifteen-second portrait requirements received reject despite no content red line or previous re-shoot. The verdict instructions are unchanged on the current base.
2. Add one decision eval per branch, with explicit already-inspected evidence and no spending calls. These are decision tests; the Cursor run separately exercises a real local file.
3. Keep grader criteria separate from the user-facing prompts.

### Task 2: Clarify the decision and checklist

**Files:** `skills/cuddler-review/SKILL.md`, `skills/cuddler-review/references/checklist.md`.

1. State that machine FAIL and issue severity do not by themselves mean reject.
2. Apply red lines first, then an evidenced failed re-shoot, then fix for remaining repairable defects; reserve pass for a satisfactory applicable review.
3. Apply character checks only to the relevant brief; make any reject cite its actual trigger.
4. Explain that fix is advice and does not authorize a paid re-shoot.

### Task 3: Validate and retest

**Files:** `VERSION`, plugin manifests/marketplace and `CHANGELOG.md`; ignored local test evidence.

1. Bump the patch version consistently and record the verdict clarification.
2. Run `node scripts/validate.mjs`, `node --test scripts/validate.test.mjs`, and `claude plugin validate --strict .`.
3. Load the corrected local skill in Cursor, start a fresh chat, and repeat the original local-file request with the same input bytes. Read the tool trace and measurements as well as the verdict.
4. Check the two reject boundaries in Cursor using the decision prompts. Record the narrower evidence from these prompts separately from the local-file integration test.
5. Review the final task-owned diff once. Leave the changes local and preserve reproducible evidence; do not commit, push or release.
