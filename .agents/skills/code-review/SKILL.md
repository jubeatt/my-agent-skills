---
name: code-review
description: >
  以 staff engineer 視角進行結構化 code review。針對使用者指定的 commit 取其 diff，
  審查五大面向（正確性、可讀性、架構、安全、效能），將 findings 分為三級嚴重度，
  產出固定格式的報告與 verdict。純唯讀，絕不修改原始碼。適用於本機個人審查某幾個
  commit 的變更。
---

**對原始碼唯讀。** 只檢視變更與必要上下文，絕不修改原始碼、不執行寫入型 git 指令
（`add`、`commit`、`push`、`checkout`、`reset`、`clean`、`rebase`），也不執行會改動
狀態的 build/test。唯一允許的寫入是最終的 review 報告檔（見輸出格式）。

## 審查範圍

審查範圍**一律由使用者指定 commit hash**，可一個或多個。**若使用者沒給 commit，直接
停止並要求指定，不要自行推測範圍或改用 `origin/main..HEAD` 之類的預設。**

- 單一 commit：`git show <hash>`
- 多個 commit：取合併 diff `git diff <最舊 hash>^..<最新 hash>`，或逐一 `git show`
  各 commit。

## 流程

1. 取得指定 commit 的 diff，列出變更檔案。
2. 排除低價值檔案（lockfile、產生檔、snapshot、vendored 目錄、binary、純資料／翻譯
   檔）——這些不計入覆蓋率，但要記錄，不可靜默丟棄。
3. 讀取專案慣例文件（`AGENTS.md`、`CONTRIBUTING.md`、`.editorconfig`、linter／
   formatter 設定、`.kiro/steering/*.md` 等）並視為最高準則；與通用最佳實踐衝突時以
   專案規則為準（例如專案禁止註解，就不開「缺少註解」的 finding）。
4. 逐檔套用下方 review 面向與嚴重度審查；diff 不足以判斷正確性時，讀整個檔案的上下文。
5. 全部檔案處理完後，依輸出格式將報告**寫入 md 檔案**，不要只印在對話窗。

## Review 面向

1. **正確性** —— bug、邏輯／型別錯誤、缺少錯誤處理、edge case、nullability 假設、
   race condition。
2. **可讀性與簡化** —— 命名、複雜度、組織、死碼、可簡化的巢狀邏輯、非必要的抽象、
   難以 debug 的寫法。
3. **架構與慣例遵循** —— 專案慣例文件、分層、耦合、是否遵循既有模式、新抽象是否合理。
4. **安全** —— XSS、injection、程式碼中的 secrets、access control 破口、敏感資料
   寫進 log。
5. **效能** —— hot path 上非必要的 re-render／重算、bundle size、N+1 queries、
   迴圈中可避免的配置。

## 嚴重度

- **Critical** —— 必修。會造成錯誤行為、安全漏洞、資料遺失或 crash。
- **Important** —— 應修。架構／慣例違規、缺少錯誤處理、目前可動但脆弱的程式碼。
- **Suggestion** —— 可選。style、小型優化、替代寫法。

原則：Critical 只保留給真實 defect，不用於風格分歧；專案慣例違規至少是 Important；
不確定是否為真 bug 時，寫成 Suggestion 裡的提問，別灌高嚴重度。

## 輸出格式

將報告**寫入專案根目錄的 md 檔案**（檔名如 `code-review-<commit-short-hash>.md`，多個
commit 時用最新一筆的 short hash），不要只印在對話窗。寫檔後，對話窗只回報檔案路徑與
一兩句摘要（verdict 與各嚴重度數量）。

報告依序包含下列 section，空的群組省略，以繁體中文撰寫。

### What is Done Well
至少列一個具體的正向觀察，引用實際檔案與模式。只在這裡講一次。

### Findings
依嚴重度分組：先 Critical、再 Important、後 Suggestion。每條一行：

```
**[Severity]** Dimension — `path/to/file.ext:line` — 問題描述。
```

能給出具體修法時，接一個 `~~~diff` block（三個 tilde，非 backtick）：

~~~diff
- 有問題的既有程式碼
+ 建議的替換程式碼
~~~

修法屬概念性時改用文字描述。

### Review Coverage
只計算可審查檔案，被排除的低價值檔案不列入分母。
- total_files：`<n>`（僅可審查檔案）
- reviewed_files：`<n>`
- skipped_files：`<n>` —— 每筆 `path — 原因`，無則「無」
- coverage_rate：`<百分比>`
- excluded（不計入）：`<n>`，依原因分類，無則「無」

### Verdict
三選一，後接一句理由：
- **Ready** —— 沒有 Critical 或 Important issue。
- **Needs fixes** —— 有 Critical 或 Important issue 必須處理。
- **Needs discussion** —— 有架構／設計疑慮需要討論。

覆蓋率未達 100% 時不得為 `Ready`，改用 `Needs discussion` 並點名未覆蓋檔案（被排除的
低價值檔案不影響覆蓋率）。空 diff 時仍給 verdict：`Needs discussion` 並說明原因。

## 限制

- 對原始碼唯讀：不改原始碼、不執行寫入型 git、不執行會改動狀態的指令；唯一允許的寫入
  是最終的 review 報告檔。
- 只審查指定 commit 涵蓋的檔案；不擴大到未修改的程式碼，也不把已排除檔案拉回範圍。
- 專案慣例文件在衝突時凌駕於通用最佳實踐。
- Findings 保持具體：確切檔案、行號、用反引號標註符號名、給出具體修法或明確原因。
