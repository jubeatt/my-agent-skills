# my-agent-skills

個人的 [Agent Skills](https://agentskills.io) 策展庫，收齊我會用到的所有 skill（自建 + 第三方）。全部放在 `.agents/skills/` 一個資料夾，由 Kiro 透過**目錄 symlink 直接讀取**（edit-live），第三方 skill 則用 [`npx skills`](https://github.com/vercel-labs/skills) 從各自上游更新。

## 運作模型

```
.agents/skills/  ←─(symlink)─  ~/.kiro/skills      # Kiro 直接讀，改檔即時生效
      ↑
      └─ npx skills update（在本 repo 內，從上游拉第三方新版）
```

- **自建 skill**：手寫、手改，直接編輯 `.agents/skills/<name>/` 的檔案即可，馬上生效。
- **第三方 skill**：由 `skills-lock.json` 追蹤來源，`npx skills update` 從上游拉新版，透過 symlink 即時反映。**請勿手改**。

## 首次設定（這台 / 新裝置）

```bash
# 1. clone repo
git clone git@github.com:jubeatt/my-agent-skills.git ~/Projects/my-agent-skills

# 2. 把 Kiro 的 skills 目錄指向 repo 的 .agents/skills（單一目錄 symlink）
#    若 ~/.kiro/skills 已存在（舊安裝），先移除
rm -rf ~/.kiro/skills
ln -s ~/Projects/my-agent-skills/.agents/skills ~/.kiro/skills

# 3.（選擇性）把第三方 skill 更新到最新
cd ~/Projects/my-agent-skills && npx skills update

# 4. 啟用 commit 後自動同步 Codex / Claude Code skills
git config core.hooksPath .githooks
chmod +x .githooks/post-commit
```

啟用後，每次 commit 完成時會自動執行
`scripts/sync-skills.sh`，將 `.agents/skills/` 同步到 Codex（`~/.codex/skills`）
與 Claude Code（`~/.claude/skills`）的 skills 目錄。同步會更新各 skill 的內容，
並清除先前由此腳本同步、但主 repo 已不存在的 skill。腳本以目標目錄中的
`.my-agent-skills-manifest` 記錄同步過的 skill，因此不會動到其他來源的 skill
（例如 Codex 的 `.system/`、Claude 的 `synced/`）。

```bash
# Preview sync and pruning
scripts/sync-skills.sh --dry-run

# Update skills without pruning removed ones
scripts/sync-skills.sh --no-prune

# Sync to a specific target only (repeatable)
scripts/sync-skills.sh --target ~/.claude/skills
```

## 日常維護

```bash
# 改自建 skill：直接編輯 .agents/skills/<name>/，存檔即生效（push 保存到遠端）

# 更新第三方 skill（從上游拉新版，透過 symlink 即時反映）
cd ~/Projects/my-agent-skills
npx skills update
git add -A && git commit -m "chore: update third-party skills" && git push

# 新增第三方 skill（-a universal 讓檔案落在 .agents/skills/）
npx skills add <owner>/<repo> --skill <name> -a universal -y

# 移除第三方 skill
npx skills remove <name> -y
```
