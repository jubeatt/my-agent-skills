---
name: gh-comment
description: >
  讀取 GitHub PR 的 review comments，比對最新 commit 的 diff，產生結構化的 feedback 修正紀錄 comment。
  適用於 PR 經過 code review 後，需要回覆哪些項目已修正、哪些暫不處理的場景。
---

# Skill: Review Feedback

讀取 PR 的所有 review comment，比對指定 commit 的修改內容，產生結構化的 feedback 修正紀錄並留在 PR comment。

## 觸發條件

使用者提到「gh comment」、「留 feedback」、「review feedback」、「修正紀錄」，或指定某個 PR 需要回覆 review。

## 流程

### 1. 收集資訊

需要從使用者取得：

- **PR URL 或編號**（必要）
- **對應的 commit hash**（可選）
- **dry run**（可選，若使用者在 prompt 中提到 dry run 則啟用）

若未提供 commit hash，自動從目前分支找出所有 commit message 以 `fix: ai` 開頭的 commit，取其範圍的 diff：

```bash
# 找出所有 fix: ai 開頭的 commit hash（限定目前分支）
COMMITS=$(git --no-pager log origin/main..HEAD --oneline --grep='^fix: ai' --format='%H')
```

若 `COMMITS` 為空，提示使用者手動提供 commit hash 或 commit 範圍，不繼續執行。

```bash
# 讀取 PR 資訊
gh pr view <number> --repo <owner/repo> --json title,body,comments,commits

# 取得 diff（多筆 commit 時取最早到最新的範圍）
OLDEST=$(echo "$COMMITS" | tail -1)
LATEST=$(echo "$COMMITS" | head -1)
git --no-pager diff "$OLDEST"^.."$LATEST"
```

### 2. 讀取所有 Review Comments

從 PR comments 中篩選出所有 `github-actions` bot 留下的 review comment（以 `# PR Review` 開頭），全部讀取並合併分析。

```bash
# 列出所有 comments 的作者和前 120 字，確認哪些是 review comment
gh pr view <number> --json comments --jq '.comments[] | {author: .author.login, preview: (.body[:120])}'
```

將所有 review comment 中的 findings 合併為一份完整清單，去除重複項目（同一個位置、同一個問題只保留最新一筆）。

### 3. 分析 Review Comments

從所有 review comment 中識別每個 finding 的：
- **嚴重度**：Critical / Important / Suggestion
- **類別**：Correctness / Architecture / Readability / Performance
- **位置**：檔案路徑和行號
- **問題描述**

### 4. 整合舊 Feedback

產生新的 feedback 內容前，先讀取使用者在該 PR 上的舊 feedback comment（以 `## AI Review` 開頭、非 `github-actions` bot 留的）。若舊 comment 中某些「暫不處理」項目已填寫原因，將原因帶入新的 feedback，不以 `（待補原因）` 覆蓋。

### 5. 比對 Diff

將 commit diff 與每個 finding 逐一比對：

- **已修正**：diff 中有對應的修改，且修改方向與建議一致
- **暫不處理**：diff 中沒有對應修改

### 6. 產生 Feedback Comment

使用以下格式：

```markdown
## AI Review 修正紀錄

### ✅ 已修正

1. **[Critical]** `file.tsx` — 簡短描述問題
   → 簡短描述怎麼修的

2. **[Important]** `file.tsx` — 簡短描述問題
   → 說明修了什麼

### ❌ 暫不處理

N. **[Suggestion]** `file.tsx` — 簡短描述問題
   → （待補原因）
```

#### 格式規則

- 每個 section 只在有內容時才出現（例如沒有「暫不處理」就不要有 `### ❌ 暫不處理`）
- 編號從 1 開始連續編號，跨 section 連續
- 使用 `**[嚴重度]**` 標註嚴重度（Critical / Important / Suggestion）
- 用反引號標註檔案名或變數名，以 ` — ` 連接問題描述
- 修正說明或原因以 `→` 開頭，換行縮排
- 若使用者未提供暫不處理的原因，填入 `（待補原因）` 讓使用者之後自行編輯

### 7. 輸出

#### Dry Run 模式

若使用者在 prompt 中提到 dry run，將 feedback 內容寫入本地檔案，不發送到 GitHub：

```bash
# 檔名使用 LATEST commit hash 前 7 碼
# 輸出至專案根目錄
cat > comment-<short-hash>.md << 'EOF'
<feedback content>
EOF
```

#### 正式模式

1. 刪除舊 feedback comment（如果有的話）
2. 新增新的 feedback comment
3. 將 bot 的 review comment 標記為 outdated（minimize）

```bash
# 找到使用者舊的 feedback comment ID（以 "## AI Review 修正紀錄" 開頭的）
# 可能有多筆，逐一刪除
COMMENT_IDS=$(gh api repos/<owner>/<repo>/issues/<number>/comments \
  --jq '[.[] | select(.user.login != "github-actions" and (.body | startswith("## AI Review"))) | .id] | .[]')

for ID in $COMMENT_IDS; do
  gh api repos/<owner>/<repo>/issues/comments/$ID -X DELETE
done

# 新增 feedback comment
gh pr comment <number> --repo <owner/repo> --body '<content>'

# 將 bot 的 review comment minimize 為 outdated
# 取得 github-actions bot 留下的 comment node IDs
NODE_IDS=$(gh api repos/<owner>/<repo>/issues/<number>/comments \
  --jq '[.[] | select(.user.login == "github-actions[bot]" and (.body | startswith("# PR Review"))) | .node_id] | .[]')

for NODE_ID in $NODE_IDS; do
  gh api graphql -f query='
    mutation($id: ID!) {
      minimizeComment(input: {subjectId: $id, classifier: OUTDATED}) {
        minimizedComment {
          isMinimized
        }
      }
    }' -f id="$NODE_ID"
done
```

## 注意事項

- 嚴重度保留 review 原文的分類（Critical / Important / Suggestion），不自行調整
- 比對 diff 時注意：有些修改可能用了不同於建議的方案，只要問題被解決就算「已修正」
- 若使用者主動說明某些項目的處理方式或不處理原因，直接採用使用者的說法
- 多筆 review comment 中若有重複的 finding（同檔案同位置同問題），只保留最新一筆
