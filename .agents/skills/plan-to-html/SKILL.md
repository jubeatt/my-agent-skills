---
name: plan-to-html
description: 把一次開發規劃產成一份高層次的 HTML 計畫檔，輸出到 .plan/<slug>/plan.html。先用 grilling 盤問收斂需求，再以 phase + Vertical Slice 分法寫成單一自含 HTML，每個 phase 帶目標與驗收標準，並附自動化／人工測試建議；內容只寫到高層次設計決策，不碰實作細節。適用於「產計畫 HTML」「規劃某功能／重構並輸出 HTML」，或討論定案後要把規劃落成一份可開瀏覽器看的計畫。
---

# Plan to HTML

把討論定案的開發規劃，產成一份**高層次**的 HTML 計畫檔。產物是乾淨定稿——知道結論後從頭寫的版本，而不是討論過程的流水帳。

## 流程

### 1. 盤問收斂

需求還沒收斂時，依 [`grilling`](../grilling/SKILL.md) 盤問，把會影響規劃的模糊點、缺口、矛盾逼出明確答案。**完成判準**：grilling 的 frontier 清空，每個會左右規劃的決策都有答案。使用者已在先前討論把需求講定時，直接進下一步。

### 2. 定資料夾

計畫放 `.plan/<slug>/`。`<slug>` 用 `<purpose>-<component>`（kebab-case），`purpose` 取 `feature｜refactor｜upgrade｜data｜infrastructure｜architecture｜design` 之一，例如 `feature-auth-module`。同一任務已有資料夾就沿用。

### 3. 產出 plan.html

把規劃寫成 `.plan/<slug>/plan.html`，依下方「內容」與「HTML 形態」撰寫。**完成判準**：每個 phase 都有目標與一條可檢查的驗收標準，值得測的地方都附了測試建議，全篇停在高層次設計（HLD），沒有下到逐檔的實作細節；若這次跑過 grilling，HTML 內含一個 Q&A 紀錄 section。

### 4. 迭代

後續回饋就地改 `plan.html`，依 [`tombstone-free-docs`](../tombstone-free-docs/SKILL.md) 保持乾淨定稿——改完讀起來像重寫的新版，不留「原本是 X／改成 Y」的痕跡。

## 內容

- **停在高層次設計（HLD）**：寫架構、元件、資料流、關鍵規則，以及這個 phase 要達成什麼、狀態與行為怎麼呈現——寫到設計決策的層級為止。不下到逐檔的實作細節（LLD）：變數命名、const 檔怎麼拆、CSS 怎麼切版這類交給執行階段。要新增哪些檔案、或點出某個檔名與路徑，只要對閱讀與理解有幫助就可以提。
- **phase + Vertical Slice**：拆成數個 phase，每個 phase 是一條貫穿各層（資料 → 邏輯 → 介面）、能獨立交付的薄片，而不是照技術層水平切（先做完所有 DB、再做完所有 API）。
- **每個 phase**：一句話目標 + 一條可檢查的驗收標準（怎樣算這個 phase 做對）。
- **測試建議**：核心邏輯、易回歸、高風險處建議自動化測試；難或不值得自動化的建議人工測試；沒有值得測的就省略。
- **Q&A 紀錄**：這次有跑 grilling 就在 HTML 裡放一個 Q&A section，記錄盤問的問題與定案答案；沒跑 grilling 就省略這個 section。
- **可跳轉的錨點引用**：會被重複指涉的東西——業務邏輯或規則、專有名詞、撰寫時自訂的定義——就定義一次，並用 HTML 錨點做成可跳轉的頁內引用，點擊即可跳到定義處。來源帶編號時（如 BR-09、E-05）沿用其編號當錨點。

## HTML 形態

- 單一自含 `plan.html`：inline CSS、無外部相依、無 live server，用瀏覽器打開就能看全部內容。
- 樣式只求好讀：標題層級、phase 分段、狀態用 badge、分隔線。視覺細節自由發揮。

## 限制

只寫 `.plan/<slug>/` 底下的檔；對程式碼與 git 唯讀。
