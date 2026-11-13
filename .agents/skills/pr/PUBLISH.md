# 發佈到 GitHub PR

使用者看過 `pr-<scope>.md`、要求寫進 GitHub PR 時照做。這是對外動作，使用者這次的要求就是授權；範圍只到他指定的那個 PR。

## 步驟

1. **盤點 md**：以 repo 根目錄 `pr-<scope>.md` 的當下內容為準（使用者可能手改過），列出所有 `![alt](pr-<scope>/<file>)` 圖片引用，確認每個檔案都存在。
2. **找目標 PR**：使用者給了 PR 號碼就用它；沒給就 `gh pr view --json number,url,state` 查目前分支的 open PR。有就更新，md 直接覆寫整份 body；沒有就建立。
3. **上傳並寫入**：在 repo 根目錄執行，md 引用到的每張圖各帶一個 `--attach`：

   ```bash
   # 更新既有 PR
   gh pr edit <number> --body-file pr-<scope>.md \
     --attach pr-<scope>/<a>.png --attach pr-<scope>/<b>.png

   # 建立新 PR
   gh pr create --base <base> --title "<title>" --body-file pr-<scope>.md \
     --attach pr-<scope>/<a>.png --attach pr-<scope>/<b>.png
   ```

   gh 會上傳每個附件，並把 body 裡指向同一檔案的相對路徑改寫成上傳後的網址，alt 沿用 md 寫的。建立時 title 用範圍最新 commit 的 subject、base 用 repo 預設分支，使用者有指定就照指定。
4. **驗證**：`gh pr view <number> --json body -q .body`。**完成判準**：body 裡已無任何 `pr-<scope>/` 相對路徑，每個圖片引用都指向上傳後的網址；回報 PR URL 給使用者。

## Gotcha

- `--attach` 需要 gh v2.99.0 以上，且對 repo 有寫入權限。
- 建立 PR 時分支要已 push；還沒有 upstream 就先問使用者。
- 部分附件上傳失敗時，gh 仍會寫入 body 並以非零狀態結束：排除原因後整條指令重跑，讓 md 重新覆寫整份 body。
