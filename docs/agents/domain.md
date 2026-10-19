# Domain Docs

本仓库采用 single-context 布局：根目录的 `GLOSSARY.md` 与 `docs/adr/`。

## Before exploring, read these

- 根目录 `GLOSSARY.md`。
- 如果存在根目录 `GLOSSARY-MAP.md`，按其索引读取与当前任务相关的术语表。
- `docs/adr/` 中涉及当前工作范围的架构决策记录。

文件尚不存在时直接继续，无需提示缺失或建议预先创建。术语和决策明确后，由 `/domain-modeling` 按需创建。

## File structure

```text
/
├── GLOSSARY.md
└── docs/
    └── adr/
        └── NNNN-<decision>.md
```

## Use the glossary's vocabulary

Issue 标题、重构建议、假设与测试名中的领域概念使用术语表定义的词汇。
缺少所需概念时，先核对是否符合项目用语；确有缺口则记为后续 `/domain-modeling` 的输入。

## Flag ADR conflicts

输出与现有 ADR 冲突时，明确引用 ADR 编号、冲突内容与重新讨论的理由。
