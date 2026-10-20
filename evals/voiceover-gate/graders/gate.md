---
type: llm
weight: 2
---

PASS if the agent quotes the line with quote_speech on a model and a voice taken from the list_models `speech` section, then gives the price in credits and asks one yes/no question ending in "reply proceed" (or the same words in the user's language), saying nothing has been made yet.
FAIL if it calls create_speech before the user's go-ahead, uses a model or voice that isn't in the list, asks several questions, or gives no price.
