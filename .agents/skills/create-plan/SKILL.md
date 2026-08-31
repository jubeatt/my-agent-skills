---
name: create-plan
description: 建立實作計畫檔（輸出到 .plan/）。適用於新功能、重構、套件升級，或架構、基礎設施變更前，需要一份可被 AI 或人類逐步執行的結構化計畫。
---

# 建立實作計畫

為使用者指定的主題產出一份實作計畫檔，內容具體到可以直接照著執行：明確的檔案路徑、
函式名稱、任務描述，不把判斷留給執行者臨場處理。

## 輸出

- **位置**：每個任務一個資料夾 `.plan/<slug>/`（不存在就建立；若 gather-context 已為同一任務建了資料夾就沿用，別另開）。同一個 worktree 可並存多個任務資料夾。
- **資料夾名（`<slug>`）**：`<purpose>-<component>`。`purpose` 取
  `feature｜refactor｜upgrade｜data｜infrastructure｜architecture｜design` 之一。
  - 例：`feature-auth-module/`、`refactor-plan-schema/`。
- **檔名**：資料夾內固定 `task.md`（資料夾名已帶主題，檔名不再重複）。與 context.md／question.md／term.md（gather-context 產出）並存於同一資料夾。

## 撰寫原則

- 計畫拆成數個階段（phase），每個階段有一個明確目標與一組任務。
- 分階段採 **Vertical Slice**：每個階段切成一條貫穿各層（資料 → 邏輯 → 介面）、能獨立交付的薄片，收尾時 build 過、lint 過、可獨立 review，而不是照技術層水平切（先做完所有 DB、再做完所有 API）。水平切會產出中途 build／lint 不過、也無法單獨 review 的階段。
- 任務盡量切成彼此獨立、可平行；每個任務在「依賴」欄標明所依賴的前置 TASK ID，無則填 `無`。執行者據此找出沒有未完成前置的任務，同時派 sub agent 並行、加快速度。
- 每個項目用 ID 標記（`REQ`／`GOAL`／`TASK` 等），同一份計畫內 ID 不重複，方便後續交叉引用與回寫。
- 照下方 template 的章節與格式產出。用不到的章節（如測試、風險）直接省略。

## Template

```md
---
goal: [一句話描述這份計畫的目標]
date: [YYYY-MM-DD]
status: Planned | In progress | Completed
---

# [計畫標題]

[簡短說明這份計畫要做什麼、為什麼做。]

## 1. 需求與限制

- **REQ-001**: 需求描述
- **CON-001**: 限制描述

## 2. 實作步驟

### 階段一

- **GOAL-001**: [這個階段的目標]

| 任務 | 檔案 | 描述 | 依賴 | 完成 | 日期 |
|------|------|------|------|------|------|
| TASK-001 | `path/to/file` | 任務描述 | 無 |  |  |
| TASK-002 | `path/to/file` | 任務描述 | TASK-001 |  |  |

## 3. 測試

> 依價值決定是否寫自動化測試：核心邏輯、易回歸、高風險處值得寫；
> 一次性或成本遠大於價值者，改列人工測試。沒有值得寫的測試時整個章節省略。

### 3.1 自動化測試

#### TEST-001 · unit · `path/to/module.test.ts`

測什麼、預期結果。可自由分段說明，需要時用條列列出案例：

- 正常輸入 → 預期回傳值
- 邊界／空值 → 預期行為
- 錯誤輸入 → 預期拋錯

#### TEST-002 · e2e · `path/to/flow.spec.ts`

從使用者視角描述一條流程：操作步驟 → 預期畫面／狀態。

### 3.2 人工測試

#### TEST-003

難以或不值得自動化的驗證（視覺呈現、跨裝置手感、一次性遷移抽查）。步驟：

1. 操作步驟一
2. 操作步驟二 → 預期結果

## 4. 風險與假設

- **RISK-001**: 風險描述
- **ASSUMPTION-001**: 假設描述
```

## 編輯保護旗標

`.plan/<slug>/task-edit-approved`（純文字、無副檔名、內容 `false`）：建立後 agent 要編輯 task.md 會被 hook 擋下，直到 user 把內容改成 `true`——給 user 鎖住計畫、防止被擅自改動的開關。

task.md 產出後決定是否建立此檔：

- prompt 已提到要編輯保護，或帶了 `-p` flag → 直接建立，不再問。
- 都沒提到 → 詢問 user 要不要建立，答要才建。

預設不建。
