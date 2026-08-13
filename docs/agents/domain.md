# 领域文档

本文规定工程技能探索代码库时如何读取本仓库的领域文档。

## 探索前读取

- 优先读取仓库根目录的 `CONTEXT.md`。
- 若根目录存在 `CONTEXT-MAP.md`，按其中的指引读取与当前任务相关的 `CONTEXT.md`。
- 读取 `docs/adr/` 中与当前工作范围相关的 ADR。若以后改为 multi-context 布局，还需检查 `src/<上下文>/docs/adr/`。

缺少上述文件时直接继续工作。`domain-modeling` 技能会在术语或决策实际明确后按需创建这些文件。

## 文件布局

当前仓库采用 single-context 布局：

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-示例决策.md
│   └── 0002-示例决策.md
└── 应用文件
```

若根目录以后出现 `CONTEXT-MAP.md`，则表示仓库已改为 multi-context 布局：

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                         # 系统级决策
└── src/
    ├── <上下文>/
    │   ├── CONTEXT.md
    │   └── docs/adr/                 # 上下文级决策
    └── <其他上下文>/
```

## 使用术语表词汇

当输出内容涉及领域概念时，例如 Issue 标题、重构建议、假设或测试名称，使用 `CONTEXT.md` 中定义的术语，避免改用已明确排除的同义词。

若需要的概念尚未出现在术语表中，先判断是否使用了项目之外的说法；若确属缺失，则记录为 `domain-modeling` 的待办。

## 标记 ADR 冲突

若建议与现有 ADR 冲突，应明确指出，而不是静默覆盖。例如：

> 与 ADR-0007 冲突，但由于……值得重新讨论。
