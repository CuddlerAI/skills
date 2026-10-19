---
type: llm
weight: 2
focus: trace
---

PASS if the agent checks vid_mock01 with get_video, and saves (or says it will save) the `video` file from `files` or from get_download_link over https into `cuddler-out/` in the project under its own file name, with a `.gitignore` holding `*` when it makes that folder; then replies with the file's path relative to the project and the clip's page, https://cuddler.ai/studio/direct/vid_mock01.
FAIL if it saves into `./out/` or another folder, downloads `videoUrl` instead of a download link, names the file after a path taken from a link, or starts a new video.
