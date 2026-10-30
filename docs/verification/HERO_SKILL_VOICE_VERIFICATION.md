# 修仙角色技能名稱與語音驗證

日期：2026-10-29。十角色 2,130 段正式音檔已完成並接入本機遊戲；檔案、字幕、播放路由及桌機／手機尺寸已驗證。逐句人工字音、情緒與自然度審聽尚未完成。

## 範圍與資料契約

- 核准文稿 `docs/CULTIVATION_HERO_VOICE_SCRIPT.json` 規劃十角色、每角 205 招技能與 8 句基本喊聲，共 2,130 項。正式音檔與索引亦已達到同一數量，每角 213 段。
- `hero-skill-voices.js` 以 `heroId + skillId` 提供角色專屬名及已存在的正式檔案；沒有音檔的項目保留名稱，`file` 為 `null`。技能規則、數值、事件 ID、存檔與原始技能記錄維持原契約。
- 對手未公開秘術先使用通用名稱、視覺與喊聲；顯示及語音解析不先讀精確技能 ID、名稱或元素。測試以會拋錯的私有欄位 getter 檢查此邊界。
- 普通模式維持原動作名稱、試聽選項與語音路由。修仙模式的舊動作喊聲由成功提交的技能事件取代，避免雙播；報牌及凝神仍保留既有入口。

## 呈現用詞

`cultivation-terms.js` 在既有 render、log、dialog 與 canvas 入口映射顯示文字與無障礙標籤，不改資料與控制 ID，也未新增全頁 MutationObserver。

| 原動作 | 修仙呈現 |
| --- | --- |
| 吃 | 引氣 |
| 碰 | 聚靈 |
| 明槓 | 開陣 |
| 暗槓 | 藏陣 |
| 加槓／補槓 | 續陣 |
| 胡牌 | 決勝 |
| 自摸 | 天成 |
| 搶槓 | 截陣 |

覆蓋牌桌／結算、圖鑑與招式原名對照、技能描述、日誌、即時公告、預覽及 aria/title 等文字；長詞優先處理複合牌型，聽牌呈現為凝神，副露呈現為已施法印。修仙呈現測試檢查 `吃、碰、槓、杠、胡、自摸` 不殘留在規則與動作文字。玩家身份節點、使用者輸入、原始資料及普通模式不屬於全域文字替換對象。

切換回普通模式會恢復原文；動態文字更新後不恢復過時內容。修仙 v2 僅保護實際顯示的角色名，避免未使用的自訂短名「胡」阻止規則詞轉換。

## 程式接線與處理工具

- `index.html` 在戰鬥 apply 成功後呼叫 `MahjongVoice.consumeSkills(next.effects, before)`；render／讀檔不重播。延後攻擊花待自己的回合實際施放，pending 與 turn 日誌均使用施法者專屬名。
- `cultivation-ui.js`、`cultivation-catalog.js`、`cultivation-presentation.js`、`cultivation-effects.js` 依實際施法者顯示名稱；選招、圖鑑與終式結算保留原招式對照，對照內容也採修仙詞彙。
- `feedback-controls.js` 修仙試聽為八種新喊聲加凝神；缺檔或不可播放不顯示「正在試聽」。圖鑑有選定角色時可試聽該招錄音，重播／關閉會取消先前語音，沿用靜音、音量與背景播放限制。未製作錄音保持靜默。
- `tools/prepare-hero-skill-voices.py` 僅處理已下載音源；`inspect` 不輸出正式素材，`process` 要求句數完全相符，或提供數量、順序、範圍及不重疊皆合法的 `--regions`。保留原檔、SHA-256、切點、生成備註與可續作 checkpoint；不同來源／契約拒絕覆寫，完成批次會核對 hash 後跳過。備份名稱含來源路徑 hash 與 UUID，避免不同角色同名檔案碰撞。
- 新音檔路徑為 `assets/audio/voice-hero-skills-v1/<heroId>/<safeId>.mp3`，ID 的 `:` 轉為 `--`、`.` 保留。舊用詞 pilot 兩個版本保留在 `art-source/audio/voice-hero-skills-v1/rejected/shen-gufeng-pilot-old-terms/`，未由該 pilot 發布素材。

## 自動驗證

環境：Windows、Node.js v24.18.0。完整 Node 測試共 **1,137 項：1,135 通過、0 失敗、2 略過**，執行時間約 53.94 秒，exit code 0。

```powershell
node --test tests/*.test.cjs
python tests/hero-skill-voice-processing.test.py
git diff --check
```

完整 Node 輸出：[node-tests.log](../../artifacts/hero-skill-verification/node-tests.log)。本次已完成的 focused 驗證包括：

- 呈現／語音相關 256 項通過；開場流程 18 項通過。開場 fixture 僅補 `document.querySelector`，保留發牌期間操作與存檔按鈕必須禁用的斷言。
- 音源處理 12 項通過，包含實際舊音源小批處理至暫存目錄、舊檔 hash 不變、錯誤切點、缺檔、斷點續作與不同來源拒絕覆寫。
- 新測試涵蓋十角色名稱、真實施法者、成功提交才播放、真 H3 花延後釋放、秘術不讀私有欄位、普通模式恢復、短名字／使用者內容、缺檔試聽及關閉預覽後不延遲播放。
- `git diff --check` 與本次 JavaScript 語法檢查通過。

兩項略過均由既有 `tests/optional-playwright.cjs` 回報未安裝 Playwright，未替換或弱化測試：

- `tests/expedition-store.test.cjs`：expedition IndexedDB settlements, events, aborts, stale tabs and old saves。
- `tests/progression-store.test.cjs`：progression IndexedDB store。

Node 假環境的既有開場測試會記錄 `indexedDB is not defined` 自動暫存警告；該訊息不代表瀏覽器存檔驗證，亦未造成此次測試失敗。上述兩項瀏覽器 IndexedDB 測試仍未執行。

## 最終音檔與來源驗證

- 10 個不同聲線 ID、每人 213 段，合計 **2,130 / 2,130**；沒有遺漏、重複 ID 或額外正式 MP3。2,050 招式與 80 喊聲全部有實體檔案與索引。
- 全部檔案 SHA-256、canonical 文字、念法、聲線 ID 與來源 manifest 核對通過；朗讀文字不含禁用動作用詞。正式素材共 47,454,872 bytes，總長 2,820.84 秒（約 47 分鐘）。
- 全部 clipping samples 為 0；最終整體響度介於 −21.90 至 −20.16 LUFS，最高 true peak −2.35 dBTP。少數偏小聲片段已局部補正，原始來源與前版成品均保留。
- 每批使用無預期文字提示的本機 ASR 核對句數與順序；零長度時間戳的疑似重複另以單句及相鄰原音重查。ASR 同音轉寫只作發音輔助證據，不等同人工聽感通過。
- 水修一批混入前批內容，已隔離後以 25＋25 句重製。術修四批改以短批校讀，僅 TTS 使用「籙 → 錄」同音字；48 處校讀與原 canonical 分別留存。岳鎮山「霧行藏嶽」僅 TTS 使用「物行藏岳」校讀。遊戲名稱、字幕與台詞 canonical 不變。
- 產製時新增讀回檢查：填入後失焦，再於送出前重新比對全部文字；下載 receipt 保存實際輸入、UI 上下文、聲線證據與校讀對照。拒用來源不進正式索引。

最終逐檔彙整：[final-audio-audit.json](../../artifacts/hero-skill-verification/final-audio-audit.json)。各批品質證據保存在 `art-source/audio/voice-hero-skills-v1/validation/`，包括 `shen-chi-quality-review.json`、`water-medic-iron-shadow-flower-quality-review.json`、`yun-zhiwei-quality-review.json`；岳／洛獨立複核見 [body-shield-audit.json](../../artifacts/hero-skill-verification/body-shield-audit.json)。最後替換後以 final audit 的 hash 為準。

## 最終索引、快取與瀏覽器

- `node tools/build-hero-skill-voices.cjs --check`：2,050 名稱、80 喊聲、2,130 可播放音檔。
- `node tools/build-hero-skill-audio-review.cjs --check`：2,130 完成、0 待製作；人工字音／聽感確認旗標維持 0，不以技術檢查冒充審聽。
- `node tools/build-pwa.cjs --check`：97 個 shell 檔案；瀏覽器已顯示新版本 `2026.10.29-77b34e`。既有 8880 頁面曾使用舊快取，最終改以 8890 origin 驗證，並觀察更新後版本。
- 索引全部音檔完成後，另跑角色語音／專屬名稱／修仙用詞相關 20 項測試，20 / 20 通過。短批來源校讀工具另有 6 項測試通過。
- 桌機實際 UI：牌桌、角色圖鑑與原名對照、選招、對手秘術、終式結算、設定九種仙術試聽選項，以及切回普通模式保留原名稱。可見規則文字與無障礙標籤禁詞掃描通過；未公開秘術沒有牌型、精確名稱與數值。
- 手機橫向 844 × 390：專屬選招、秘術、終式結算可用。遊戲既有直向旋轉提醒保留；未宣稱實體手機驗收。
- 獨立試聽頁 390 × 844：頁寬 375、viewport 390，無橫向溢出；角色與名稱篩選正常。桌機與手機皆以實際播放控制測試 MP3，取得完整 duration、readyState 4、error null；這是播放與解碼驗證，不是人耳評分。
- 瀏覽器記錄有一筆較早舊頁面（14:59 UTC）的 MutationObserver 錯誤；最終新 origin 與更新版本觀察期間未新增同類錯誤，未將舊頁錯誤當成此次通過的新頁證據。

畫面證據：[最新設定](../../artifacts/hero-skill-verification/fresh-voice-settings.png)、[手機選招](../../artifacts/hero-skill-verification/fresh-mobile-choice.png)、[手機結算](../../artifacts/hero-skill-verification/fresh-mobile-result.png)、[完整試聽頁](../../artifacts/hero-skill-verification/audio-review-complete.png)、[手機試聽頁](../../artifacts/hero-skill-verification/audio-review-mobile-final.png)。

## 仍未宣稱完成的驗收

- 全部 2,130 段的人工逐字、口音、情緒與自然度審聽；試聽頁刻意保留待審標記。
- 實體手機、完整長局與兩項缺 Playwright 的 IndexedDB 瀏覽器測試。
- 本次為本機實作與驗證，未 commit、push 或部署線上版本。
