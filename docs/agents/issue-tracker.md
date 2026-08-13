# Issue 跟踪器：GitHub

本仓库的 Issue 和规格保存在 GitHub Issues 中。所有操作使用 `gh` CLI。

## 操作约定

- **创建 Issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **读取 Issue**：`gh issue view <编号> --comments`，使用 `jq` 筛选评论并一并获取标签。
- **列出 Issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，并按需添加 `--label` 和 `--state` 筛选条件。
- **评论 Issue**：`gh issue comment <编号> --body "..."`。
- **添加或移除标签**：`gh issue edit <编号> --add-label "..."` / `--remove-label "..."`。
- **关闭 Issue**：`gh issue close <编号> --comment "..."`。

仓库信息从 `git remote -v` 推断；在当前仓库内运行时，`gh` 会自动使用 `921179/AIVideo_Canvas`。

## 将 Pull Request 作为 Triage 入口

**PR 作为请求入口：否。** 若以后需要将外部 PR 视为功能请求，可把此项改为“是”，`triage` 技能将读取这一设置。

启用后，PR 使用与 Issue 相同的标签和状态，并通过对应的 `gh pr` 命令处理：

- **读取 PR**：使用 `gh pr view <编号> --comments`，并通过 `gh pr diff <编号>` 读取差异。
- **列出待 Triage 的外部 PR**：运行 `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，仅保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的项目。
- **评论、标记或关闭**：使用 `gh pr comment`、`gh pr edit --add-label` / `--remove-label`、`gh pr close`。

GitHub 的 Issue 与 PR 共用编号空间。遇到 `#42` 这类编号时，先运行 `gh pr view 42`，失败后再运行 `gh issue view 42`。

## 技能指令映射

当技能要求“发布到 Issue 跟踪器”时，创建 GitHub Issue。

当技能要求“获取相关工单”时，运行 `gh issue view <编号> --comments`。

## Wayfinder 操作

`wayfinder` 使用一个 Map Issue 和多个子 Issue：

- **Map**：带 `wayfinder:map` 标签的单个 Issue，正文保存 Notes、Decisions-so-far 和 Fog；使用 `gh issue create --label wayfinder:map` 创建。
- **子工单**：优先使用 GitHub sub-issue 关联到 Map，并使用 `wayfinder:<类型>` 标签，其中类型为 `research`、`prototype`、`grilling` 或 `task`。若仓库未启用 sub-issue，则在 Map 正文中添加任务列表，并在子 Issue 顶部写入 `Part of #<Map 编号>`。工单被领取后，分配给负责开发者。
- **阻塞关系**：优先使用 GitHub 原生 Issue dependencies。通过 `gh api --method POST repos/<owner>/<repo>/issues/<子工单>/dependencies/blocked_by -F issue_id=<阻塞工单数据库 ID>` 添加关系。这里使用的是 `gh api repos/<owner>/<repo>/issues/<编号> --jq .id` 返回的数字数据库 ID，而不是 Issue 编号或 `node_id`。若原生依赖不可用，则在子 Issue 顶部写入 `Blocked by: #<编号>`。
- **查找可执行工单**：按 Map 顺序列出未关闭的子 Issue，排除仍有开放阻塞项或已有负责人者，首个剩余工单即为下一项。
- **领取**：运行 `gh issue edit <编号> --add-assignee @me`，这是会话中的第一次写操作。
- **解决**：先用 `gh issue comment <编号> --body "<结论>"` 写入答案，再关闭 Issue，最后在 Map 的 Decisions-so-far 中追加上下文链接。
