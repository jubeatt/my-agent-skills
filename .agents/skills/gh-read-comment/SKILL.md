---
name: gh-read-comment
description: >
  讀取 GitHub PR 的 review comments，比對目前分支的 diff，統整成結構化的 review.md 檔案，
  列出已修復與未修復的項目。適用於想快速了解 PR review 狀態的場景。
---

# Skill: Read PR Review Comments

讀取 PR 的所有 review comment，比對目前分支與 main 的 diff，產生結構化的 review 統整檔案。

## 觸發條件

使用者提到「讀取 PR comment」、「統整 review」、「review 狀態」、「哪些修了哪些沒修」，或指定某個 PR 需要整理 review findings。

## 流程

### 1. 確認 Repo 與 PR

從目前 git remote 推斷 `<owner/repo>`，若使用者只提供 PR 編號則自動組合：

```bash
# 取得 repo
git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/'

# 驗證 PR 存在
gh pr view <number> --repo <owner/repo> --json title,url
```

### 2. 讀取 Review Comments

讀取指定 author 留下的 review comment（預設篩選 `smax-admin` 和 `github-actions` bot）：

```bash
gh pr view <number> --repo <owner/repo> --json comments \
  --jq '.comments[] | select(.author.login == "<author>") | .body'
```

從 comment body 中解析所有 findings，識別：
- **嚴重度**：Critical / Important / Suggestion
- **位置**：檔案路徑和行號
- **問題描述**
- **建議修改方式**（若有 diff block）

多筆 review comment 中若有重複的 finding（同檔案同位置同問題），只保留最新一筆。

### 3. 取得目前分支 Diff

```bash
git --no-pager diff origin/main..HEAD --stat
git --no-pager diff origin/main..HEAD
```

若需要更精確，也可讀取相關檔案的目前內容來確認修復狀態。

### 4. 比對修復狀態

將每個 finding 與 diff / 目前程式碼逐一比對：

- **✅ 已修復**：diff 中有對應修改，或目前程式碼已不存在該問題
- **❌ 未修復**：目前程式碼仍存在該問題

判斷原則：
- 修改方式不一定要跟建議完全一致，只要問題被解決就算已修復
- 若檔案被刪除或大幅重構導致問題不再適用，也算已修復
- 不確定時，讀取目前檔案內容確認

### 5. 產生 review.md

輸出至專案根目錄的 `review.md`，格式如下：

```markdown
# PR #<number> Review 統整

> PR: `<title>`
> Reviewer: `<author>`

---

## ✅ 已修復

| # | 嚴重度 | 檔案 | 問題 | 修復方式 |
|---|--------|------|------|----------|
| 1 | Important | `file.tsx` | 問題描述 | 怎麼修的 |

## ❌ 未修復

| # | 嚴重度 | 檔案 | 問題 | 建議方式 | 說明 |
|---|--------|------|------|----------|------|
| 2 | Important | `file.tsx` | 問題描述 | reviewer 建議的修法（無建議則填 N/A） | 目前狀態說明 |

---

## 總結

- **已修復**：N 項
- **未修復**：N 項（M Important + K Suggestion）
```

#### 格式規則

- 每個 section 只在有內容時才出現
- 編號從 1 開始連續編號，跨 section 連續
- 嚴重度保留 review 原文的分類，不自行調整
- 用反引號標註檔案名或變數名
- 若有 React Doctor 等工具的額外報告，獨立列為一個 section
- 總結區列出數量統計

## 注意事項

- 不修改任何程式碼，純粹產出報告
- 若 PR 有多個 reviewer 的 comment，全部合併分析
- 比對時注意：有些修改可能用了不同於建議的方案，只要問題被解決就算已修復
- 輸出檔案固定為 `review.md`，覆蓋既有檔案
- **所有嚴重度的 findings 都必須列出**（包含 Suggestion），不可省略或摘要帶過
