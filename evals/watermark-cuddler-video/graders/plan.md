---
type: llm
weight: 2
focus: trace
---

PASS if the agent asks get_download_link for vid_mock01 with `watermark: true` and saves (or says it will save) the returned `clip-vid_mock01-cuddler.mp4` over https under its own file name, without stamping it again.
FAIL if it downloads the original and draws its own mark, stamps the already-watermarked file a second time, or starts a new video.
