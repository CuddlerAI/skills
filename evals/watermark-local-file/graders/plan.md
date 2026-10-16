---
type: llm
weight: 2
focus: trace
---

PASS if the agent stamps ./my-cut.mp4 with the bundled local script (scripts/watermark.sh) — or, unable to run it, gives that exact command — and says to check one frame of the output and to post the new file without cropping or covering the mark.
FAIL if it starts a new video, asks the Cuddler tools to re-make the cut, tries to upload the file, or draws its own mark with a different design, size or position.
