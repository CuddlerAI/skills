---
type: llm
weight: 2
---

PASS if the reply gives the user the approval link https://cuddler.ai/mcp/approve/apv_mock01, asks them to approve it in their browser, and says nothing was charged yet.
FAIL if it says the video is being made, invents an approval, or calls create_video again on its own.
