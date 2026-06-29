---
name: deps-upgrade-check
description: >
  驗證 dependabot PR 的依賴升級是否安全。先在隔離 worktree 進行供應鏈安全檢查（install 前的閘門），
  通過後才執行 install、lint、build、test，並查詢官方 changelog 整理成結構化的 summary 報告。
  適用於收到 dependabot PR 需要確認是否可以 merge 的場景。
---

# Skill: Dependency Upgrade Check

驗證 dependabot PR 的依賴升級是否安全，產出包含供應鏈安全檢查、驗證結果與 changelog 的結構化報告。

**核心原則：先驗安全、再執行。** `pnpm install` 會執行依賴的 lifecycle script（`postinstall` 等），那正是供應鏈攻擊的引爆點。因此所有安全檢查都必須在 install **之前**完成；安全檢查全部只靠 `npm view` / `npm diff` / `pnpm audit` / `git diff`，不需要 install 即可執行。

## 觸發條件

使用者提到「deps 升級」、「dependabot PR 驗證」、「確認是否可以升版」，或提供 dependabot PR 連結要求檢查。

## 輸入

- 一或多個 GitHub PR URL（dependabot 產生的依賴升級 PR）

## 流程

順序：取得 PR 資訊 → 建立 worktree → **供應鏈安全檢查（閘門）** → 通過才 install/build/test → changelog → summary → 清理。

### 1. 取得 PR 資訊

從 PR URL 解析 repo 和 PR 編號，取得分支名稱和升級內容：

```bash
gh pr view <number> --repo <owner/repo> --json title,headRefName --jq '{title: .title, branch: .branch}'
```

並從 PR 標題解析出 `<pkg>`、`<from-version>`、`<to-version>`，供後續安全檢查使用。

### 2. 建立隔離 Worktree

對每個 PR 建立獨立的 worktree。

**⚠️ 必須停用 git hook 來建立 worktree。** 本專案 `core.hooksPath` 指向 `.husky/_`，其中 `post-checkout` 在「checkout 且 `node_modules` 不存在」時會自動執行 `pnpm install`。由於 `git worktree add` 是一次 branch checkout，新 worktree 又沒有 `node_modules`，**預設會在建立當下就觸發 install（連帶跑白名單內的 build script）**，等於在安全檢查前就執行了。用 `-c core.hooksPath=/dev/null` 停用 hook 即可避免：

```bash
# Fetch 遠端分支
git fetch origin <branch-name>

# 停用 hook 建立 worktree（避免 .husky/post-checkout 自動 pnpm install）
# <project> 為當前工作目錄的資料夾名稱（basename of cwd）
git -c core.hooksPath=/dev/null worktree add /tmp/<project>-upgrade-<package> origin/<branch-name>
cd /tmp/<project>-upgrade-<package>
```

建立後 worktree 內只有原始碼、沒有 `node_modules`；step 3 的安全檢查全部不需要 install 即可執行，待通過閘門後才在 step 4 明確 install。

### 3. 供應鏈安全檢查（install 前的閘門）

**這一步必須在 `pnpm install` 之前完成。** 在 worktree 內執行（皆不需 install）。逐項記錄，任何 ⚠️ 都要在 summary 標記並影響風險評估。

**判讀原則：告警要對照「本次 diff」才算數。** network / eval / shell 等是套件既有能力，只有「這次升版**新引入**」的危險碼才是真風險；`dist/`、`lib/` 的 minify / bundle 產物不要誤判成惡意混淆。

```bash
# 3-1 安裝腳本：新版是否新增 postinstall / preinstall / install
npm view <pkg>@<from> scripts --json
npm view <pkg>@<to> scripts --json

# 3-2 原始碼 diff 危險樣式掃描
npm diff --diff=<pkg>@<from> --diff=<pkg>@<to> > /tmp/<pkg>-diff.txt
grep -nE 'child_process|execSync|spawn|[^a-zA-Z]eval\(|new Function|process\.env|Buffer\.from\([^,]+,[ ]*.base64.|atob\(|\.npmrc|/\.ssh|/\.aws|credentials' /tmp/<pkg>-diff.txt

# 3-3 維護者是否變動
npm view <pkg>@<from> maintainers --json
npm view <pkg>@<to> maintainers --json

# 3-4 發布時效（新版發布距今天數；< 3 天標記 ⚠️）
npm view <pkg> time --json

# 3-5 Provenance 來源證明（比對 from 與 to，看的是「有沒有從有變無」而非絕對有無）
npm view <pkg>@<from> dist.attestations --json
npm view <pkg>@<to> dist.attestations --json

# 3-6 已知漏洞（pnpm audit 讀 lockfile + 查 registry，不需 install）
pnpm audit --prod

# 3-7 新增的 transitive 依賴（看 lockfile diff，留意 typosquatting 仿冒名）
git diff origin/main..HEAD -- pnpm-lock.yaml | grep -E "^\+" | head -50
```

判讀重點：

- **3-1 安裝腳本**：新版若新增 `postinstall` / `preinstall` / `install` 而舊版沒有 → **高風險**，是供應鏈攻擊最常見手法。
- **3-2 危險樣式**：命中的若落在本次 diff 新增的 source code（非既有 minify 產物）→ ⚠️，記錄關鍵字與位置。
- **3-3 維護者**：清單冒出陌生帳號或 email 變更 → ⚠️。
- **3-4 發布時效**：版本發布距今 < 3 天 → ⚠️（呼應 pnpm `minimumReleaseAge` 觀念，剛發布的惡意版尚未被社群發現）。
- **3-5 Provenance**：**比對版本之間有沒有變化，而非只看絕對有無**。`dist.attestations` 為空=無 provenance。判讀：
  - 一直都沒有（多數老牌套件、習慣手動發布的作者如此）→ baseline，**不可疑**，只是不能拿 provenance 當正面加分，改靠其他訊號（維護者、時效、scripts、diff）判斷。
  - 一直有 → 這版突然消失 → **真正的 ⚠️**，可能代表發布管線被換或從非官方來源發布，須深查。
  - 本來無 → 這版開始有 → 信任度提升。
  - 確認「是否一直都沒有」可掃歷史版本，或用 `npm audit signatures` 驗整棵樹。
- **3-6 漏洞**：列出 audit 報出的 CVE。
- **3-7 transitive**：列出本次新增的間接依賴，逐一確認非 typosquatting 仿冒名。

**閘門判定（決定要不要往下 install）：**

- **🚫 高風險直接中止，不得執行 install**：3-1 新增安裝腳本、或 3-2 在本次新增 source code 命中危險樣式、或 3-7 出現疑似 typosquatting 的全新套件。直接產出 summary（結論 ❌）、清理 worktree、回報，**絕不執行 step 4**。
- **⚠️ 低度疑慮可往下，但標記待複查**：僅 3-4 / 3-5 等弱訊號（時效短、無 provenance baseline）→ 可繼續 step 4，summary 結論降為 ⚠️。
- **✅ 全部乾淨**：繼續 step 4。

### 4. 執行驗證步驟（僅在通過 step 3 閘門後執行）

確認無明顯供應鏈風險後，才在 worktree 中依序執行，逐一記錄結果（某步驟失敗仍繼續後續步驟以收集完整資訊）：

```bash
cd /tmp/<project>-upgrade-<package>
pnpm install
pnpm check          # lint + format (Biome)
pnpm build          # tsc + vite build
pnpm test           # unit tests (Vitest)
```

注意：E2E tests 若已知有既有問題可跳過。

### 5. 查詢官方 Changelog

從套件的 GitHub releases 頁面或 CHANGELOG.md 取得升級範圍內每個版本的具體更新內容：

- Features
- Bug Fixes
- Breaking Changes
- 其他（refactor、docs 等）

來源優先順序：
1. GitHub raw CHANGELOG.md（`https://raw.githubusercontent.com/<org>/<repo>/main/CHANGELOG.md`）
2. GitHub Releases 頁面（`https://github.com/<org>/<repo>/releases`）

### 6. 產出 Summary 報告

寫入 `<project-root>/summary-<package-name>.md`（不寫在 worktree 內），格式如下：

```markdown
# <package> <from-version> → <to-version> 升級驗證

## 結論
✅ 可以升級 / ⚠️ 可升級但需人工複查（說明原因） / ❌ 不建議升級

## 安全性檢查（install 前閘門）
| 項目 | 結果 |
|------|------|
| 安裝腳本 (postinstall 等) | ✅ 無新增 / 🚫 新增 `<script>` |
| 原始碼危險樣式掃描 | ✅ 無命中 / 🚫 命中 `<pattern>`（位置） |
| 維護者變動 | ✅ 一致 / ⚠️ `<detail>` |
| 發布時效 | ✅ ≥3 天 / ⚠️ 僅 N 天 |
| Provenance | ✅ 有/baseline 無 / ⚠️ 由有變無 |
| 已知漏洞 (pnpm audit) | ✅ 無 / ⚠️ `<CVE>` |
| 新增 transitive 依賴 | 無 / 列出：`<pkg>` |

## 驗證結果
（若因安全閘門中止，本區標記「未執行（安全閘門中止）」）
| 步驟 | 結果 |
|------|------|
| pnpm install | ✅ / ❌ / 未執行 |
| pnpm check | ✅ / ❌ / 未執行 |
| pnpm build | ✅ / ❌ / 未執行 |
| pnpm test | ✅ / ❌ / 未執行 |

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
- 任一安全檢查為 ⚠️ 時，結論不得為純 ✅，須降為 ⚠️ 並指出待複查項目
- 命中高風險（🚫）時，結論為 ❌ 且不執行 install/build/test

## 原始 Changelog
[<package> Changelog](<url>)
```

### 7. 清理 Worktree

驗證完畢後移除 worktree，確保不污染 git 狀態：

```bash
git worktree remove /tmp/<project>-upgrade-<package> --force
```

## 平行處理

多個 PR 可同時派出多個 sub agent 平行驗證，每個 agent 負責一個 PR 的完整流程（worktree → 安全檢查 → 驗證 → changelog → summary → 清理）。

## Agent 指派

執行此 skill 時，**必須**將任務指派給 `worker` agent。此 skill 需要執行 bash 指令（git、pnpm、npm）和檔案寫入，且不走 plan 流程，只有 worker agent 可以在無 plan 驗證的情況下執行。不可指派給 explorer、researcher 或其他唯讀 agent。

## 注意事項

- **安全檢查一定在 `pnpm install` 之前完成**；命中高風險（新增安裝腳本、新增危險碼、typosquatting）直接中止，不得 install。
- **建立 worktree 必須用 `git -c core.hooksPath=/dev/null worktree add ...`**：本專案 `.husky/post-checkout` 會在 checkout 時自動 `pnpm install`，不停用 hook 會在安全檢查前就觸發 install。
- 補充防線：`pnpm-workspace.yaml` 的 `allowBuilds` 白名單使非白名單套件的 lifecycle script（`postinstall` 等）預設不執行，但仍以「閘門先於 install」為主要防護。
- Worktree 路徑統一使用 `/tmp/<project>-upgrade-<package>`（`<project>` = 當前目錄名稱）避免與主 worktree 衝突
- Summary 檔案寫到專案根目錄，不是 worktree 裡面
- Changelog 必須從官方來源取得，不可自行推測
- 安全檢查的告警須對照本次 diff 判讀：既有能力（network / eval 等）非本次新增則不算風險；dist / lib 的 minify 產物勿誤判為惡意混淆
- 任一安全檢查為 ⚠️ 時，結論須降為「⚠️ 需人工複查」並在風險評估指明
- 即使後續驗證步驟失敗（或因閘門未執行），仍要完成 changelog 查詢和 summary 產出
- 最終一定要移除 worktree，即使中途有錯誤
