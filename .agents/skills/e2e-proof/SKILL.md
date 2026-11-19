---
name: e2e-proof
description: 用 ego-browser 對 bug 修正或新功能做真實 e2e 驗收，產出含步驟截圖與斷言的 HTML 報告到 .e2e/<slug>/report.html；指定時加做修前／修後對照。
disable-model-invocation: true
---

# E2E Proof

用 ego-browser 實際操作 app，驗收一個 bug 修正或新功能，產出一份可以直接 review 的報告。報告是**證據**：每一步都有截圖、斷言的預期值與實際值。判定一律靠程式比較可觀察的狀態，截圖只給人看。

## 模式

- **驗收模式**（預設）：只跑修後版本，確認最終結果符合判準。
- **對照模式**：使用者明確要求比對修前、修後時才用。修前、修後走同一組步驟，bug 判準要**修前紅、修後綠**才算證明了修正。

模式寫進 `meta.json` 的 `mode`（`verify`｜`compare`）。下文標「對照模式」的段落，驗收模式整段略過。

操作瀏覽器前先照 [`ego-browser`](../ego-browser/SKILL.md) 執行 `ego-browser skill`，讀完它的使用指南。

## 流程

### 1. 取原始素材

- **diff**：使用者指定的 commit／range／PR；沒指定就用目前分支相對預設分支的差異加上未提交變更。
- **原始需求**：使用者給 ticket ID 或連結就讀全文（含重現步驟、預期與實際結果），不只靠口頭轉述。
- **修前 commit**（對照模式）：修正 commit 的 parent，或分支的 merge-base。

**完成判準**：能逐條列出「這次變更改了哪些行為」，每條都指得出 diff 中的位置。

### 2. 定判準

建立 `.e2e/<slug>/`，`<slug>` 用 `<bug|feature>-<topic>`（kebab-case）。資料夾已存在就在尾端加 `-r2`、`-r3`，保留舊報告。

把判準寫進 `meta.json`（格式見[資料格式](#資料格式)）。每條判準是 Given／When／Then，Then 必須是程式檢查得到的狀態：DOM 文字、URL、元素有無、API 回應、重新整理後資料仍在。依 diff 涵蓋：

- **bug**：bug 本身。對照模式標 `failsBefore: true`。
- **主流程**：變更後的正常使用路徑。
- **負向**、**邊界**：diff 碰到的輸入、條件分支、上下限。
- **回歸**：diff 改到、但不是這次目標的既有行為。

判準定好直接進下一步。

**完成判準**：步驟 1 的每條行為變更都對到至少一條判準；有輸入的地方都有負向與邊界判準；對照模式的 bug 修正至少有一條 `failsBefore` 判準。

### 3. 起環境

一律在本機跑。ticket 附的環境連結只用來判斷重現條件需要哪個後端的資料。

- **修後**：使用者已經在跑的 dev server 就直接用；沒有就依專案的 scripts 在背景啟動。重現需要特定後端的資料時（例如 bug 在 SIT 發現），從專案的 env 檔找出指向該後端的模式來啟動。
- **修前**（對照模式）：`git worktree add "$TMPDIR/e2e-proof/<slug>-before" <修前 commit>`，裝好依賴後用同一個模式、在另一個 port 啟動，兩邊才會看到同一份資料。
- server 啟動後，先在背景打開一次目標頁面，讓 dev server 完成第一次編譯。
- 每個 port 是不同 origin，登入狀態各自獨立，每個要跑的 URL 都要確認已登入。
- 把各版本的 commit、URL，以及使用的帳號寫進 `meta.json` 的 `env`。

**完成判準**：每個要跑的版本都能在 ego-browser 打開，而且從畫面確認跑的是對應的 commit，例如修後看得到這次新增的 UI 或文案。

### 4. 執行

對照模式先跑 `before` 再跑 `after`，`failsBefore` 判準在兩邊走同一組步驟。每支 ego-browser script 都用 recorder 記錄步驟：

```js
const { createRecorder } = await import("<skill 目錄>/scripts/recorder.mjs");
const task = await taskSpace(SPACE_ID);
const page = task.page("p1");
// createRecorder sends raw CDP, which invalidates earlier snapshot refs: create it before snapshot().
const rec = await createRecorder({ page, dir: "<專案絕對路徑>/.e2e/<slug>", run: "after" });

await rec.frame("送出前", { highlight: "form button[type=submit]" });
await page.fill("loc=css:input[name=qty]", "0");
await page.click("text=加入購物車", { label: "submit cart form" });
const shown = await page.waitForSelector("#msg:not(:empty)", { timeout: 5000 }).then(() => true, () => false);
const actual = await page.evaluate(() => document.querySelector("#msg").textContent);
console.log(await rec.step({
  criterion: "AC-1",
  action: "數量填 0，按「加入購物車」",
  assert: { what: "顯示數量錯誤訊息", expected: "數量需為 1–99 的整數", actual, pass: shown && actual === "數量需為 1–99 的整數" },
  highlight: "#msg",
}));
console.log(await page.snapshot());
```

- **一個步驟一次斷言**：操作 → 等預期狀態 → 從頁面取出 `actual` → `rec.step()`。操作和它的 `step()` 寫在同一支 script，console 監聽才收得到這段期間的訊息。
- **`pass` 由程式比較算出**。等待逾時就是斷言失敗：取當下狀態當 `actual`，照實記錄。
- **`actual` 從被操作的元素順著找**：tooltip、popover 這類共用浮層，透過觸發元素的 `aria-describedby`／`aria-controls` 讀內容。用全域 selector 可能讀到上一個還沒消失的浮層。
- **`highlight` 只吃 CSS selector**：`frame()` 用紅框標出操作目標，`step()` 用綠框標出被斷言的元素。
- **受阻**：步驟做不下去時，用 `rec.step({ criterion, action, blocked: "原因" })` 記下來。需要登入、驗證碼或 2FA 時，照 ego-browser 的 `handOff()` 交給使用者。
- **修前沒重現**（對照模式）：`failsBefore` 判準在 `before` 通過時，先檢查步驟有沒有真的打到 bug 的觸發條件，修正後重跑；還是重現不了就照實留在報告裡。
- **異常**：`step()` 回傳的 `anomalies` 大於 0 時，看 `.e2e/<slug>/runs/<run>.jsonl` 的內容，判斷跟判準有沒有關係。有關就補一條判準，無關但值得注意就寫進 `gaps`。
- **真實資料**：可以在已登入的帳號上建立或修改資料。留下的東西寫進 `meta.json` 的 `sideEffects`，方便事後清理。

**完成判準**：`after` 的每條判準至少有一步；對照模式的 `before` 涵蓋每條 `failsBefore` 判準；每一步的狀態都由程式比較得出，或明確標成受阻。

### 5. 產報告並自驗

```bash
node <skill 目錄>/scripts/render.mjs <專案絕對路徑>/.e2e/<slug>
```

產出 `report.html`，截圖以 base64 內嵌，單檔就能完整閱讀。步驟的判準連結可用滑鼠懸停或鍵盤聚焦預覽 Given／When／Then，按 Esc 收起，點擊可跳到判準表。Console／Network 異常明細可在各步驟內獨立展開與收合。

接著在同一個 task space 打開報告檢查：

```js
const { verifyReport } = await import("<skill 目錄>/scripts/verify-report.mjs");
console.log(await verifyReport({ page, file: "<專案絕對路徑>/.e2e/<slug>/report.html" }));
```

收尾：照 ego-browser 的方式 `finish()` task space，停掉自己啟動的 server，用 `git worktree remove` 移除自己建立的 worktree。

**完成判準**：render 輸出的 `missingShots`、`orphanSteps` 都是空的，`verifyReport` 回傳 `ok: true`。

### 6. 回報

在對話中交代：整體結論、每條判準的狀態（對照模式含修前／修後）、報告路徑、`sideEffects`、`gaps`。

## 資料格式

`.e2e/<slug>/` 裡 `runs/` 和 `shots/` 由 recorder 寫入，`meta.json` 由 agent 撰寫：

```json
{
  "title": "購物車數量驗證",
  "kind": "bug",
  "mode": "compare",
  "summary": "數量 0 或負數時應擋下，不加入購物車",
  "sources": [{ "label": "SHOP-123", "href": "https://..." }, { "label": "git diff e2b88d3..f6789a0" }],
  "env": {
    "before": { "commit": "e2b88d3", "url": "http://localhost:5701" },
    "after": { "commit": "f6789a0", "url": "http://localhost:5702" },
    "account": "peanu@example.com"
  },
  "criteria": [
    { "id": "AC-1", "kind": "bug", "failsBefore": true, "given": "購物車為空", "when": "數量填 0 並送出", "then": "顯示「數量需為 1–99 的整數」，清單仍為空" }
  ],
  "sideEffects": ["建立訂單 #1024"],
  "gaps": ["未測行動版 viewport"]
}
```

- `kind` 取 `bug｜happy｜negative｜boundary｜regression`。
- 判準狀態依各 run 的步驟算出：有失敗就是失敗，否則有受阻就是受阻，沒有步驟就是未測。
- 驗收模式省略 `env.before` 與 `failsBefore`。對照模式的 `failsBefore` 判準要修前失敗、修後通過才算證明了修正。
