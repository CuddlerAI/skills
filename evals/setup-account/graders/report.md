---
type: llm
weight: 2
---

PASS if the reply reports the plan (pro) and the credit balance (2400), says images and videos are open, and never asks for a password or token. The account has no daily spending limit for this connection (`budget` is null), so the reply must not claim one; mentioning the plan's daily credit allowance (300), which whoami does report, is fine.
FAIL if it asks for credentials or makes anything.
