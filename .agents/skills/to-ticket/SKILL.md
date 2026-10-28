---
name: to-ticket
description: 依使用者指定的 Story 與 Figma，替一張空的前端 Jira 單寫 description 並掛上相關 link。先產 markdown 草稿與 link 計畫，確認後寫回 Jira。
disable-model-invocation: true
---

# To Ticket

替一張只有標題的前端 Jira 單寫 description、掛上相關的單。使用者指定這張單要實作的 Story 與 Figma，agent 從 Story 找出相關的單與文件，整理成給實作者的 HLD：講清楚要做的事和要守的規則，檔案路徑、命名與程式寫法留給動手的人決定。

## 輸入

- **ticket key 或 URL**：必要。要寫的那張單。
- **Story key 或 URL**：必要。這張單要實作的 Story。
- **Figma 連結**：這張單有畫面時提供，可以指向 frame 或 section。
- **使用者補充**：選填。要做什麼的粗略說明、文件連結或 repo 內的檔案。

ticket 或 Story 缺任一個，請使用者提供並停止。

## 流程

### 1. 蒐集

Atlassian 的內容一律透過 MCP 讀。依序做：

1. **讀這張單**：summary 與已經寫在上面的內容。
2. **讀 Story**：描述、links、附件。
3. **看 Figma**：使用者給的畫面。連結指向 section 時，逐一看裡面的 frame 與備註 annotation；按鈕狀態、提示文案這類規則常只寫在備註裡。
4. **界定範圍**：從這張單的標題、Figma 與使用者補充，判斷這張單負責 Story 的哪一塊。判斷不出來時，列出 Story 裡的候選區塊請使用者指定並停止。
5. **挑相關的單**：Story 底下的 task 與 Story linked 的單，逐張讀 summary 與描述，依這張單的範圍挑出：
   - BE 單：前端會呼叫它開的 API，或依賴它的行為。
   - FE 單：和這張單有前後依賴。

   QA、DevOps、沒有依賴的 FE 兄弟單不收。Epic 底下的單不展開。
6. **讀文件**：Story 與挑出的單連到的 Confluence 頁面與附件，加上使用者給的文件；repo 內的檔案直接讀，Jira 附件抓下來讀。有這張單要遵守的流程或規則的才收。
7. **讀程式碼**：工作目錄是前端 repo 時，讀和這張單相關的 route、API client、型別與元件，讓實作建議對得上現況。

看完仍不夠寫出摘要和實作建議時，列出缺了什麼，請使用者提供並停止。

**完成判準**：說得出這張單負責 Story 的哪一塊；Story 底下與 linked 的每張單都判斷過收或不收；每份文件都判斷過收或不收；說得出前端要做的事。

### 2. 寫草稿與 link 計畫

依下方模板寫成 `ticket-<KEY>.md`，放在目前 git repo 的根目錄，不在 repo 裡就放工作目錄；同名檔已存在就覆蓋。

來源講法互相衝突時，依「使用者補充 > 文件 > Story 描述」的順序取用，並在待確認記一條。

```markdown
## 相關資源

## 摘要

## 實作建議

## 規則

## 待確認
```

- **相關資源**：每筆一個 bullet，依序收 Story、步驟 1 挑出的單、使用者給的 Figma、收進來的文件。某個類型沒有就整行省略。
  - Jira 單寫 `- 類型：url`，只放裸 URL。寫回 Jira 後會成為 smart link，自動顯示單號、標題與狀態。要補註記時，URL 後空一個半形空格再寫，否則緊接的中文會被併進 URL。
  - 其他資源寫 `- 類型：[標題](url)`。
- **摘要**：兩三句。一句說情境，一句說前端交付什麼。版面與流程細節只寫在實作建議。
- **實作建議**：用編號步驟寫到 HLD 的高度。每步是一個功能區塊，底下用幾個 bullet 講要做到什麼、要守哪些限制；可以點名要沿用的既有元件或機制。實作時值得留意的點（邊界情況、安全、和現有程式碼的落差）用一句話寫在對應的步驟底下；需要 BE 或 PM 回答的缺口寫進待確認。
- **規則**：只在有文件時才寫這一段。
  - 每份文件一個 `###` 小標題，標題本身連到原文對應的章節；本機檔案就寫檔名。
  - 底下只列和前端有關的規則。原文有編號就寫成 `BR-xx 描述`，沒有編號就寫成一般 bullet。
  - 描述用簡短改寫或直接引原文，原文的數值、條件與術語要保留。
- **待確認**：列出衝突、缺漏的資源與疑問，給使用者看完自行刪除。沒有就省略這一段。

接著排 **link 計畫**：相關資源裡的每張 Jira 單，對應到一條掛在這張單上的 issue link。

- Story：這張單 implements Story。
- BE 單：這張單 relates to BE 單。
- FE 單：依前後順序，用 blocks 或 is blocked by。

先用 Atlassian MCP 的 `discover` 查這個站台的 issue link type，計畫裡寫站台上的實際名稱；找不到對應的關係就用 relates to，並在計畫裡標出來。Figma 與文件只放在 description 的相關資源。

寫完回報三件事，然後等使用者確認：

- 檔案完整路徑。
- 待確認項目的摘要。
- link 計畫，每條一行 `link type → KEY 標題`，並說明確認後會依檔案裡相關資源的 Jira 單建立這些 link，使用者改了相關資源，link 也跟著改。

**完成判準**：檔案已寫出；各 section 都依蒐集到的內容填好或依規則省略；實作建議每一步都停在 HLD 高度；link 計畫和相關資源裡的 Jira 單一一對應，每條都是站台上存在的 link type。

### 3. 寫回 Jira

使用者確認後，重新讀一次檔案（使用者可能改過）。

1. **寫 description**：呼叫 Atlassian MCP 的 `getContentFormatGuide`（`toolName: "editJiraIssue"`），依其中的規則調整 markdown，再以整份內容覆寫這張單的 description。其他欄位維持原樣。
2. **掛 link**：依檔案裡相關資源的 Jira 單，套步驟 2 的對應建立 issue link。用 `discover` 找建立 issue link 的 operation；這張單上已經有的 link 略過。

**完成判準**：比對 Jira 回傳的 description 與檔案，沒有樣式跑掉的地方；以 `responseContentFormat: "html"` 讀回時，相關資源裡每個 Jira 連結都帶 `data-card-appearance="inline"`，且 href 只有該單的 URL；這張單上的 links 和相關資源裡的 Jira 單一一對應；回報單子連結。
