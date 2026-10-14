---
type: llm
weight: 2
---

PASS if the reply reports the plan (pro) and the credit balance (2400), says there is no daily cap for this connection (the balance is the limit), says images and videos are open, and never asks for a password or token.
FAIL if it asks for credentials, makes anything, or states a daily budget or an approval threshold that `whoami` didn't return.
