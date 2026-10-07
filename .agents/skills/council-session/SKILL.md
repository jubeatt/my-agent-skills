---
name: council-session
description: 多模型評議會——透過 Herdr 開三個 pane 跑不同 model 的 kiro-cli agent，由主控 agent 綜整三方答案。
disable-model-invocation: true
---

# Council Session（多模型評議會）

召開一場 **council（評議會）**：三個 `kiro-cli` agent，各跑不同 model，在平行的 Herdr pane 裡回答同一個問題。執行這個 skill 的 agent 就是 **master（主控）**——由它把問題交給三方、收集答案、親自綜整出最終回應。

## 前置條件

評議會跑在 Herdr 上，先驗證：

```bash
test "${HERDR_ENV:-}" = 1
```

失敗就告訴使用者這個 skill 需要 Herdr session 並停止。下面的步驟都用 `herdr` CLI——指令全貌、pane 幾何規則與 read source 參見 `herdr` skill。

## 適用時機

- 需要多元觀點的關鍵架構決策
- 高風險程式碼變更，靠跨模型共識降低風險
- 模糊的取捨——模型間的分歧本身就是訊號
- 安全性相關的設計審查

## 不適用時機

- 你已經有把握的任務
- 速度比信心更重要
- 例行的實作工作

## 評議員（councillor）模型

三個席次，各是一個 `kiro-cli` model。使用者有指定就用他指定的；否則用預設三席。model 會更新，所以用 `kiro-cli chat --list-models` 解析各家族的最新 slug，不要只信下表：

| 席次 | 家族 | 撰寫當下的最新 |
| --- | --- | --- |
| opus | `claude-opus-*` | `claude-opus-5.5` |
| gpt-sol | `gpt-*-sol` | `gpt-5.6-sol` |
| deepseek | `deepseek-*` | `deepseek-3.2` |

## 步驟

1. **決定三個 model。** 使用者有給就用他的；否則跑 `kiro-cli chat --list-models`，在上表每個家族挑最新的 slug。完成判準：選定三個具體 model slug。

2. **開三個 pane。** 從呼叫端 pane 切出，保留 cwd，不搶走使用者的 focus：

   ```bash
   herdr pane split --current --direction right --cwd "$PWD" --no-focus
   ```

   開三個 pane，變換方向讓每欄寬度仍可用。每個新 pane 的 id 從 `.result.pane.pane_id` 讀出。完成判準：拿到三個 pane id。

3. **每個 pane 坐一位評議員。** `--kind kiro` 跑的是 `kiro-cli`；model 接在 `--` 之後：

   ```bash
   herdr agent start council_opus     --kind kiro --pane <id1> -- chat --model claude-opus-5.5
   herdr agent start council_gpt      --kind kiro --pane <id2> -- chat --model gpt-5.6-sol
   herdr agent start council_deepseek --kind kiro --pane <id3> -- chat --model deepseek-3.2
   ```

   完成判準：三個都回到就緒（`idle`）。

4. **把問題平行丟給三方。** 每位評議員彼此之間、與 master 之間都不共享 context，所以要把完整問題各給一份。平行發出 prompt 並等全部收斂：

   ```bash
   Q="<完整問題，含所有脈絡>"
   herdr agent prompt council_opus     "$Q" --wait --timeout 300000 &
   herdr agent prompt council_gpt      "$Q" --wait --timeout 300000 &
   herdr agent prompt council_deepseek "$Q" --wait --timeout 300000 &
   wait
   ```

   完成判準：三位都已收斂。若有人回 `blocked`，用 `herdr agent get` / `herdr agent read` 檢視並處理後再繼續。

5. **收集三份答案。**

   ```bash
   herdr agent read <name> --source recent-unwrapped --lines 200
   ```

   若某份答案長到被截斷，請那位評議員把答案寫到暫存 `.md`、只回傳路徑，再去讀那個檔。完成判準：三份答案都拿到。

6. **以 master 身分綜整。** 你親自權衡三份答案，產出一份最終回應：哪裡共識、哪裡分歧、以及你的判斷與結論。把真正的分歧攤出來，不要和稀泥平均掉。把這份綜整當作評議會的結果呈現給使用者。

7. **保留評議會。** 預設保留你開的三個 pane，讓使用者能檢視各評議員的原始輸出。使用者要求收掉時再關：

   ```bash
   herdr pane close <id>
   ```
