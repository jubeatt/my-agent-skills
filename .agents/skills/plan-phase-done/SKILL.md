---
name: plan-phase-done
description: plan-to-html 的某個 phase 做完時，依使用者給的 commit 寫一份給後續 phase agent 讀的 dev note，並在 plan.html 把該 phase 標成已完成、附上 dev note 與 commit subject。
disable-model-invocation: true
---

# Plan Phase Done

[`plan-to-html`](../plan-to-html/SKILL.md) 產出的計畫裡，一個 phase 做完時做兩件事：

- 依使用者給的 commit 寫一份 **dev note**，讀者是之後做其他 phase 的 agent。
- 在 `plan.html` 把這個 phase 標成已完成，並連到 dev note。

dev note 是一張**地圖**：指出這個 phase 做出了哪些東西、各在哪裡、負責什麼，讓讀者知道去讀哪段 code。細節以當下的 code 為準，dev note 只寫 code 不會改動的方向，後續程式碼異動時 dev note 不必跟著改。

## 輸入

- **commit hash**：必要，一個或多個，都屬於同一個 phase。沒給就請使用者提供並停止。
- **plan.html**：agent 自己找，見步驟 1。

## 流程

### 1. 找計畫

在 repo 根目錄的 `.plan/` 底下找 `plan.html`，通常是 `.plan/<slug>/plan.html`。只看 `.plan/`。

剛好一份、而且看得出 phase 段落時就用它。找不到、找到多份，或看不出 phase 段落時，列出找到的檔案與狀況，請使用者指定並停止。

### 2. 對應 phase

讀 `plan.html` 每個 phase 的目標與驗收標準，再讀每個 commit 的 message 與完整 diff（`git --no-pager show <hash>`），判斷這些 commit 完成的是哪一個 phase。

有 commit 不存在、對不上任何 phase，或跨到多個 phase 時，說明狀況並停止。

**完成判準**：說得出是哪一個 phase，每個 commit 都歸到這個 phase；這個 phase 的驗收標準，逐條判斷過 commit 有沒有涵蓋。

### 3. 寫 dev note

寫到 `.plan/<slug>/phase-<N>-dev-note.md`，和 `plan.html` 放在一起；`<N>` 是這個 phase 在計畫裡的編號。語言跟 `plan.html` 一致。

檔案已經存在（例如補修的 commit 後來才給），就把檔案裡列的 commit 和這次的 commit 一起看，整份重寫成涵蓋全部 commit 的定稿，依 [`tombstone-free-docs`](../tombstone-free-docs/SKILL.md) 讀起來像一次寫成的。

```markdown
# Phase <N>：<phase 標題>

計畫：[plan.html](plan.html)

## Commits

以 subject 對應 commit；同一個 subject 有多筆時，取最新的一筆。

- <commit subject>

## 實作方向

## 與計畫的差異
```

- **Commits**：每個 commit 一行，只寫 subject，依 commit 先後排列。
- **實作方向**：這個 phase 新增或改動了哪些元件、路由、模組、資料流，各自負責什麼、彼此怎麼串。點名檔案路徑、元件名稱、路由路徑，讓讀者找得到 code。寫到職責為止；props、函式內的邏輯、樣式、內部命名這類細節，讀者會直接去讀 code。
- **與計畫的差異**：計畫對這個 phase 描述了一個方向、實作卻走了另一條路的地方，每項寫三件事：
  - 計畫寫的做法 → 實際的做法，一兩句講清楚差在哪。
  - 為什麼改：實作時發現了什麼，讓計畫的做法行不通或不划算。
  - 影響：會改變其他 phase 做法的話，點名是哪個 phase、哪裡受影響；沒有就省略這一行。

  計畫沒有規定、實作時才決定的事寫在實作方向。沒有差異時，這一段只寫「與計畫一致。」

差異的原因要有出處：commit message、程式碼註解，或本次對話。找不到出處時，列出差異請使用者說明原因，拿到答案再寫。

**完成判準**：commit 帶進來的每個元件、路由、模組都出現在實作方向；commit 和計畫描述不一樣的每個地方都列在差異裡，而且原因有出處；全篇沒有程式碼片段，也沒有 props、函式邏輯這層的描述。

### 4. 更新 plan.html

只改這個 phase 段落裡的兩處，其他內容一字不動：

- **狀態 badge**：改成「已完成」。頁面 CSS 已經有完成狀態的樣式就套上；沒有就只改文字。
- **參考區塊**：放在 phase 標題與 badge 之後，列出：
  - dev note：`<a href="phase-<N>-dev-note.md">` 連結，連結文字是 repo 相對路徑。
  - commit：每個 commit 的 subject。

  沿用頁面既有的元素與 class（例如頁面有複製路徑元素，dev note 路徑就用它）。這個 phase 已經有參考區塊時，就地更新它。

動手前把 `plan.html` 複製一份到暫存位置，改完用 `diff -u` 比對兩份。

**完成判準**：diff 裡只有這個 phase 的 badge 與參考區塊兩處變動；dev note 連結的相對路徑從 `plan.html` 所在資料夾指得到檔案。

### 5. 回報

回報以下幾件事，不 commit：

- dev note 與 `plan.html` 的路徑。
- 標成已完成的是哪個 phase。
- 與計畫的差異摘要。
- 步驟 2 判斷為 commit 沒涵蓋到的驗收標準；全部都涵蓋就省略。
