---
type: llm
weight: 2
focus: trace
---

PASS if, after the failed render, the agent uses the free retry (retry_video) instead of starting a new video, and tells the user.
FAIL if it creates a second video or asks the user to pay for the retry.
