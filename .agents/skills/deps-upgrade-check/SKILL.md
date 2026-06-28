---
name: deps-upgrade-check
description: >
  驗證 dependabot PR 的依賴升級是否安全。透過 git worktree 在隔離環境中執行 install、lint、build、test，
  並查詢官方 changelog 整理成結構化的 summary 報告。適用於收到 dependabot PR 需要確認是否可以 merge 的場景。
---

# Skill: Dependency Upgrade Check

驗證 dependabot PR 的依賴升級是否安全，產出包含驗證結果與 changelog 的結構化報告。

## 觸發條件

使用者提到「deps 升級」、「dependabot PR 驗證」、「確認是否可以升版」，或提供 dependabot PR 連結要求檢查。

## 輸入

- 一或多個 GitHub PR URL（dependabot 產生的依賴升級 PR）

## 流程

### 1. 取得 PR 資訊

從 PR URL 解析 repo 和 PR 編號，取得分支名稱和升級內容：

```bash
gh pr view <number> --repo <owner/repo> --json title,headRefName --jq '{title: .title, branch: .headRefName}'
```

### 2. 建立隔離 Worktree

對每個 PR 建立獨立的 worktree 進行驗證：

```bash
# Fetch 遠端分支
git fetch origin <branch-name>

# 建立 worktree（使用 /tmp + 當前專案名稱避免污染主目錄）
# <project> 為當前工作目錄的資料夾名稱（basename of cwd）
git worktree add /tmp/<project>-upgrade-<package> origin/<branch-name>
```

### 3. 執行驗證步驟

在 worktree 中依序執行，逐一記錄結果（某步驟失敗仍繼續後續步驟以收集完整資訊）：

```bash
cd /tmp/<project>-upgrade-<package>
pnpm install
pnpm check          # lint + format (Biome)
pnpm build          # tsc + vite build
pnpm test           # unit tests (Vitest)
```

注意：E2E tests 若已知有既有問題可跳過。

### 4. 查詢官方 Changelog

從套件的 GitHub releases 頁面或 CHANGELOG.md 取得升級範圍內每個版本的具體更新內容：

- Features
- Bug Fixes
- Breaking Changes
- 其他（refactor、docs 等）

來源優先順序：
1. GitHub raw CHANGELOG.md（`https://raw.githubusercontent.com/<org>/<repo>/main/CHANGELOG.md`）
2. GitHub Releases 頁面（`https://github.com/<org>/<repo>/releases`）

### 5. 產出 Summary 報告

寫入 `<project-root>/summary-<package-name>.md`（不寫在 worktree 內），格式如下：

```markdown
# <package> <from-version> → <to-version> 升級驗證

## 結論
✅ 可以升級 / ❌ 不建議升級

## 驗證結果
| 步驟 | 結果 |
|------|------|
| pnpm install | ✅ / ❌ |
| pnpm check | ✅ / ❌ |
| pnpm build | ✅ / ❌ |
| pnpm test | ✅ / ❌ |

## 錯誤訊息（如有）
...

## 更新內容

### <version> (<date>)

#### Features
- ...

#### Bug Fixes
- ...

（逐版列出）

## Breaking Changes
無 / 有（列出具體內容）

## 風險評估
- 低/中/高風險，說明原因

## 原始 Changelog
[<package> Changelog](<url>)
```

### 6. 清理 Worktree

驗證完畢後移除 worktree，確保不污染 git 狀態：

```bash
git worktree remove /tmp/<project>-upgrade-<package> --force
```

## 平行處理

多個 PR 可同時派出多個 sub agent 平行驗證，每個 agent 負責一個 PR 的完整流程（worktree → 驗證 → changelog → summary → 清理）。

## Agent 指派

執行此 skill 時，**必須**將任務指派給 `worker` agent。此 skill 需要執行 bash 指令（git、pnpm）和檔案寫入，且不走 plan 流程，只有 worker agent 可以在無 plan 驗證的情況下執行。不可指派給 explorer、researcher 或其他唯讀 agent。

## 注意事項

- Worktree 路徑統一使用 `/tmp/<project>-upgrade-<package>`（`<project>` = 當前目錄名稱）避免與主 worktree 衝突
- Summary 檔案寫到專案根目錄，不是 worktree 裡面
- Changelog 必須從官方來源取得，不可自行推測
- 即使驗證步驟失敗，仍要完成 changelog 查詢和 summary 產出
- 最終一定要移除 worktree，即使中途有錯誤
