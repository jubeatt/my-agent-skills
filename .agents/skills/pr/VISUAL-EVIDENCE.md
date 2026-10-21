# 視覺證據

變更會改到使用者看得到的畫面時，用 ego-browser 驗證，並把截圖放進 Evidence。ego-browser 不可用時視同收手。

## Timebox

整趟瀏覽器驗證是一個 timebox，超出就收手：

- **畫面上限 3 個**：挑最能證明變更的狀態，例如空狀態、錯誤狀態、Blast Radius 提到的 mobile 寬度。
- **每個等待都帶 timeout**：導航 15 秒、等元素或狀態 10 秒；每支 script 的指令本身也設 60 秒上限。
- **收手條件**：同一步失敗兩次，或 dev server 60 秒內沒起來。收手時 Evidence 只放執行型證據，並在回報時告訴使用者哪個畫面沒拍成、卡在哪一步。

## 步驟

1. **備妥網址**：優先用已在跑的 dev server 或 preview URL；兩者都沒有才在背景啟動 dev server。
2. **一個畫面一支 script**：導航 → 等到該狀態的可觀察條件（selector、URL、app state）→ 斷言 → 截圖，在同一支 script 裡一次跑完。
3. **用斷言驗證**：以 selector、文字內容或 snapshot 確認畫面處於預期狀態。斷言通過就信任截圖；只有斷言測不到的視覺性質（顏色、對齊、間距）才把截圖讀進來看。
4. **框住變更區塊**：截圖用 `clip` 只取變更所在區域；layout 本身是重點時才截整頁。
5. **Before 只取現成的舊版本**：staging、production 或使用者給的網址還跑著舊版時才拍 Before；舊版不現成時，視覺證據只放 After。

## 輸出

圖檔存成 `pr-<scope>/<畫面>-<before|after>.png`，md 以相對路徑引用：

```markdown
**After:** 結帳頁，購物車為空時

![checkout-empty-after](pr-<scope>/checkout-empty-after.png)
```
