# Issue tracker: GitHub

本仓库的任务与规格记录在 CuddlerAI/skills 的 GitHub Issues，使用 `gh` CLI 操作。
以下 `gh issue`、`gh pr` 命令均添加 `--repo CuddlerAI/skills`，明确目标仓库。

## Conventions

- 创建：`gh issue create --title "..." --body-file <file>`。多行正文先写入临时文件。
- 读取：`gh issue view <number> --json number,title,body,labels,comments`。
- 列表：`gh issue list --state open --json number,title,body,labels,comments`；按需添加 `--label`、调整 `--state`。
- 评论：`gh issue comment <number> --body-file <file>`。
- 添加／移除标签：`gh issue edit <number> --add-label "..."`／`--remove-label "..."`。
- 关闭：`gh issue close <number> --comment "..."`。
- 子任务：gh 2.94+ 可用 `gh issue create --parent <parent> ...` 或 `gh issue edit <parent> --add-sub-issue <child>`。旧版使用 `gh api --method POST repos/CuddlerAI/skills/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`。不支持子任务时，在子任务正文顶部写 `Part of #<parent>`，并在父任务中添加任务列表。

## Pull requests as a triage surface

**PRs as a request surface: no.**

启用此标志后，外部 PR 使用相同标签与状态；读取、评论、添加标签和关闭使用对应的 `gh pr` 命令，代码差异使用 `gh pr diff <number>`。
GitHub 的 Issue 与 PR 共用编号；遇到单独的 `#42`，先尝试 `gh pr view 42`，无法解析为 PR 时再读取 Issue。

## When a skill says "publish to the issue tracker"

创建 GitHub Issue。

## When a skill says "fetch the relevant ticket"

按上面的读取方式获取 GitHub Issue。

## Wayfinding operations

- 地图：带 `wayfinder:map` 标签的单个 Issue，正文包含 Notes、Decisions-so-far、Fog。
- 子任务：关联到地图的 GitHub 子任务；不支持时使用父任务列表与 `Part of #<map>`。类型标签为 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。
- 阻塞：优先使用 GitHub 原生依赖，调用 `gh api --method POST repos/CuddlerAI/skills/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`。数据库 ID 通过 `gh api repos/CuddlerAI/skills/issues/<number> --jq .id` 获取；使用数据库 ID，而非 Issue 编号或 node_id。不支持原生依赖时，在正文顶部写 `Blocked by: #<number>`。
- 可领取任务：按地图顺序筛选未关闭、无人认领、没有未关闭阻塞项的子任务。原生依赖使用 `issue_dependencies_summary.blocked_by` 判断；回退格式需检查引用的任务是否关闭。
- 认领：`gh issue edit <number> --add-assignee @me`，作为该工作会话的首次写入。
- 解决：发表评论、关闭子任务，再向地图的 Decisions-so-far 添加结论与链接。
