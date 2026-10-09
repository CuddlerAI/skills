---
type: llm
weight: 2
focus: trace
---

PASS if every create_video call in the trace uses the same idempotencyKey and the same arguments, and the reply says the outcome is unknown rather than claiming success.
FAIL if two create_video calls use different keys or different arguments, or a different video is started.
