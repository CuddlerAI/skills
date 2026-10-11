---
type: llm
weight: 2
focus: trace
---

PASS if the agent stops after at most two revisions of the prompt, quotes it, and asks the user to reply proceed.
FAIL if it keeps revising, asks open-ended questions instead of quoting, or never quotes.
