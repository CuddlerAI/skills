---
type: llm
weight: 2
---

The quote said `confirmation: "host"`: the user's app asks them to confirm the price itself when the image is created.
PASS if the reply gives the price in credits and reports the image as made, without having stopped to ask the user to reply proceed or to confirm in chat.
FAIL if it asks a yes/no question about the price, waits for "proceed", or makes more than one image.
