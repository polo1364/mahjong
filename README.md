# 🀄 台灣16張麻將模擬器
> 雀仙門 · 橫式 PWA｜更新：2026-10-25

## 五行巡歷

修仙改以「地區名稱・修行第 N 局」顯示旅程，每區完成 16 局，依鎏金礦域、青木幽林、滄瀾寒潭、赤焰荒原、厚土古陵循環。麻將圈風仍隨莊家輪轉，北圈結束回到東圈；一般模式保留四圈終局。換區保留旅程資源及待重戰怪物。

新增 15 隻地區怪物與 20 個奇遇。每區第 4、8、12、16 局後，在整備「巡歷」頁處理兩個選項或離開。事件只使用玩家自己的資源；下一局效果與裝備、境界、功法相加，渡劫不套用也不消耗，新的待生效效果會明示取代舊效果。地區首領預設可選，王印沿用原型小王；近期評分 75 分解鎖進階首領，生命 ×1.15，額外保底劫晶碎片 ×1。

歷練評分依有效傷害、有效治療、護盾實際吸收與牌局操作計算，保留原傷害排名。戰鬥分採 `min(70, round(50 × 個人貢獻 ÷ 全隊平均貢獻))`，治療與護盾權重各 1.5；係數 50 為本次追加確認的版本。最近三局評分 60 分解鎖當地稀有奇遇、75 分解鎖進階首領，資格永久保存。怪物強度另看全隊有效傷害除以當局首怪的圖鑑生命，最高生命 +30%、傷害 +15%；每局固定快照，重戰沿用第一次登場倍率。獨立渡劫倍率與原有養成規則不變。

巡歷最高分另存於 `cultivationExpeditionProfileV1`；原修為格式不變。結算收據將修為、評分及解鎖同交易提交；奇遇將扣款、獎勵、效果、收據及旅程自存同交易提交。舊檔在安全整備建立穩定啟用起點，不補發歷史評分或奇遇。所有進度仍為目前瀏覽器的本機 IndexedDB。

本版以全新種子完成 4,160 局正常對局、十角色各十段旅程，近期 60 分達成率皆為 100%，75 分為 60～100%，達到原定驗收門檻。盾修校準組為 1/5、保留組為 5/5，合計 6/10；分組差異與有限樣本限制完整保留於[驗證紀錄](docs/CULTIVATION_EXPEDITION_VERIFICATION.md)。另有 1,098 項自動測試、108 項巡歷瀏覽器及 44 項養成／渡劫瀏覽器檢查通過。規格見[修訂計畫](docs/CULTIVATION_EXPEDITION_PLAN.md)與[怪物／奇遇內容表](docs/CULTIVATION_EXPEDITION_CONTENT.md)。

## 修仙永久養成

玩家修為與境界由十位角色共用，重新開始旅程仍保留；三位 AI 各自養成，隨新旅程重置。正常完成一局取得 12 修為，吃、碰、槓、補花、胡牌各類操作最多再加 3 點。試煉、中途離開與舊存檔歷史牌局不補發修為。

| 境界 | 累積修為 | 功法點 | 可配功法 | 單項最高等級 |
| --- | ---: | ---: | ---: | ---: |
| 煉氣 | 0 | 1 | 1 | 1 |
| 築基 | 100 | 2 | 1 | 2 |
| 金丹 | 400 | 4 | 2 | 3 |
| 元嬰 | 1000 | 5 | 2 | 3 |
| 化神 | 2200 | 6 | 2 | 3 |

20 修為開放六種功法。整備的「修行」頁可免費退點、重新配置及挑戰渡劫；手機先按「角色・修行」。境界與功法加成和裝備相加，再套用角色原有倍率；新增仇恨的綜合倍率最低 0.75。每局開局固定養成快照，戰鬥途中不變更能力。

渡劫使用獨立存檔與原旅程的角色、裝備、道具副本，全員回滿生命、不帶劫印。擊敗目標立即成功；失敗或放棄不扣修為、不消耗原旅程道具。突破取得稱號，以及當下旅程一次性金幣／靈砂：築基 100／5、金丹 200／10、元嬰 300／15、化神 400／20。AI 依目前境界期間的隊伍擊殺提早突破，化神戰績條件為 2 隻 BOSS；修為達標後若戰績不足，最多再完成 10 局即可保底突破。每次整備至多一階。

四階試煉生命倍率為原型的 **1／0.85／0.85／0.95**。最終驗證完成 30 段連續旅程、4,921 局正常牌局及 197 次試煉；其中預先指定的 20 段獨立旅程，四階首次通過率為 90%／45%／75%／50%，各階 AI 平均絕對突破局差最高 9.57 局。這是固定種子的有限樣本結果，並非所有玩家的保證通過率。一般征途怪物沒有因此削弱。整備的同行摘要可查看 AI 的功法、突破、裝備強化、備妥道具與剩餘資源。

首頁可繼續或放棄未完成渡劫。試煉期間停用手動封存，普通旅程自存保持不變；突破、領獎紀錄與原旅程錢包在同一筆 IndexedDB 交易提交。修為收據避免重複結算，存檔版本檢查避免舊分頁覆寫新進度。舊檔在安全整備階段初始化養成，不回補歷史修為；手動讀取舊牌局不會回退永久境界或再次領取同局修為。

養成資料使用 `cultivationProgressionV1`、渡劫使用 `cultivationTrialSaveV1`，一般修仙旅程仍使用 `cultivationAutoSaveV1`／`cultivationManualSaveV1`。這些資料只在目前瀏覽器的本機 IndexedDB，沒有跨裝置同步。規格與驗證見 [養成規格](docs/CULTIVATION_PROGRESSION_PLAN.md)及[養成驗證紀錄](docs/verification/CULTIVATION_PROGRESSION_VERIFICATION.md)。

## 安裝與橫式遊玩

- **僅支援橫式**：手機、平板或桌機視窗為直式時，會顯示「本遊戲僅支援橫式」並阻擋操作。轉回橫式即可繼續，不重建牌局。直式期間暫停 AI 等延遲遊戲動作；既有動畫可能完成，牌局與存檔不會因旋轉而重設。
- 若裝置沒有旋轉，先關閉系統的直向鎖定。PWA 宣告 `orientation: landscape`，瀏覽器或系統未套用時仍會顯示直式提醒。
- **Android／桌機 Chrome、Edge**：透過 HTTPS 開啟網站，在瀏覽器選單選擇「安裝應用程式」或「新增至主畫面」。實際選項名稱依瀏覽器而異。
- **iPhone／iPad Safari**：透過 HTTPS 開啟網站，使用「分享 → 加入主畫面」，再從主畫面開啟並橫放裝置。
- 第一次需要連線。Service Worker 安裝完成後會快取程式主體、10 張角色縮圖及 5 張常用麻將圖集；其他圖片與音效採使用時快取。可離線重新開啟並進入一般模式，但尚未載入的圖片／語音／新修仙場景仍需要連線；不保證完整素材全部離線可用。
- 更新版本會等待此網站的舊遊戲分頁全部關閉後啟用，不會強制重載正在玩的牌局。更新前可在設定儲存進度；快取更新不會清除 IndexedDB 或 localStorage。
- 安裝與離線功能需要 **HTTPS 或本機 localhost／127.0.0.1**；請依下列方式透過本機 HTTP 啟動；直接雙擊 `index.html` 的修仙養成流程未驗證，亦無法安裝 PWA。

### 本機啟動與部署

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

開啟 <http://127.0.0.1:8765/>。正式部署請完整保留根目錄的 HTML、JS、CSS、`manifest.webmanifest`、`sw.js`、`pwa-assets.js` 與 `assets/`。所有 PWA 路徑均為相對路徑，可部署於網域根目錄或 `/mahjong/` 子路徑。

本專案的 GitHub Pages 已設定從 `main` 分支的 `/ (root)` 發布：[開啟遊戲](https://polo1364.github.io/mahjong/)。push 後仍須等 Pages 建置完成；網站部署狀態與本機測試結果分開確認。

修改正式 HTML／CSS／JS／manifest 後，提交前重新產生快取清單：

```powershell
node tools/build-pwa.cjs
node tools/build-pwa.cjs --check
```

圖示來源為 `assets/pwa/icon.svg`；需要重製 PNG 時先執行 `node tools/build-pwa-icons.cjs`（需要 Playwright／Chromium），再產生快取清單。

### PWA 驗證與文件

```powershell
node --test tests/engine.test.cjs tests/crystal-tiles.test.cjs tests/opening-runtime.test.cjs
node tests/pwa-browser.cjs
node tests/start-screen.cjs
```

`pwa-browser.cjs` 會自行啟動隔離 HTTP 服務，驗證根目錄與 `/mahjong/` 子路徑的可安裝條件、八種桌機／手機／平板尺寸、直式阻擋與旋轉恢復、離線啟動、修仙入口及等待更新。`start-screen.cjs` 使用上述 8765 服務。報告與截圖寫入本機 `artifacts/`。

本輪結果見 [PWA 驗證紀錄](docs/verification/PWA_VERIFICATION.md)。其他驗證文件保留歷史結果，不代表本次全部重跑；舊測試中的直式遊玩案例須改成直式提醒驗證，或旋轉後再操作。

歷史備份集中於 `.local-backups/`，含搬移清單；素材製作原檔保留於 `art-source/`。這兩個目錄與 `artifacts/` 為本機資料，不隨 Git push。README 中指向 `artifacts/` 的舊預覽／報告連結僅適用於保有這些產物的本機工作區。

## 本次更新

- 2026-10-23 治療防禦補強：五招依實際回血或護盾擋傷追加有限回擊，保留原恢復能力；最終版完成 48 局合法連續對局、487 項單元回歸與 208 項瀏覽器檢查。[數值、對照與驗證](docs/verification/CULTIVATION_RESTORATION_VERIFICATION.md)。
- 2026-10-23 流派追測：四種打法輪換座位，完成 120 局合法瀏覽器對局與 640 場固定戰鬥對照；修正 AI 忽略下一招增益收益，三招攻擊兼治療技能各加 15 基礎傷害。[流派結果、修正與驗證](docs/verification/CULTIVATION_STYLES_VERIFICATION.md)。
- 2026-10-23 平衡追測：完成 90 局瀏覽器執行（36 局調整前、36 局同種子重跑、18 局新種子），普通終式起手 300→240，每台 60、上限 1500 與劫印數值保留。[平衡驗證與連戰截圖](docs/verification/CULTIVATION_BALANCE_VERIFICATION.md)。
- 2026-10-23：修仙胡牌改為台型終式連招，點胡／搶槓產生下一局劫印，自摸不加劫印；再戰、續局與重開保留期限，首頁另有「重新開始修仙旅程」。查看 [38 式終式與劫印](docs/CULTIVATION_FINISHERS.md)、[連戰預覽](artifacts/cultivation-finisher-preview.html) 與 [驗證報告](docs/verification/CULTIVATION_FINISHERS_VERIFICATION.md)。原 169 種牌組技能繼續使用，舊共通終式只保留相容入口。

- 「首頁 → 模式選擇 → 牌桌」提供一般與修仙模式。首頁與模式頁不建立牌局；有暫存時分別顯示「繼續一般模式」「繼續修仙模式」，續局不重播洗牌或戰鬥事件，無效暫存留在首頁並顯示錯誤。設定內可儲存並返回首頁。
- 修仙模式保留台灣十六張與 144 張牌：一名玩家和三名 AI 共打五行怪物，依累積傷害排名；合法出牌普攻、吃碰槓與花牌施放獨立技能，怪物每四次出牌在玩家反應完成後攻擊。胡牌施放終式後結算，胡牌者不一定傷害第一。完整 [170 招技能](docs/CULTIVATION_SKILLS.md)、[戰鬥／結算預覽](artifacts/cultivation-preview.html) 與 [驗證報告](docs/verification/CULTIVATION_VERIFICATION.md)。數值仍屬測試起點。
- 修仙使用 `cultivationAutoSaveV1`／`cultivationManualSaveV1`，保存戰鬥、亂數、預告與待處理反應；一般模式保留 `autoSave`／`manualSave` 及既有點數收付。裝備、道具與 AI 養成跟隨旅程，玩家永久養成另行保存。
- 42 種牌名改為赤晶、靈珠、飛劍與指定的字牌／花牌短名。`tile-names.js` 統一提示、戰況、無障礙名稱與試聽；舊名稱仍可解析，牌 key、牌圖、一般模式規則及存檔格式不變。元素與技能另由修仙模組定義。
- 新版 42 段 Kevin Tu 語音獨立放在 `assets/audio/voice-crystal-v1/`；一般補花報公開花牌名稱，開局補花不逐張排入語音，連補保留合併。首頁、模式與完整牌名／語音預覽見 [本次預覽](artifacts/crystal-start-preview.html)，驗證見 [本次交付紀錄](docs/verification/CRYSTAL_START_VERIFICATION.md)。
- 依已確認的結構預覽改為填滿可用視窗的四家牌桌，桌機採寬桌；四家資訊卡顯示頭像、名稱、風位、分數與手牌張數。自家手牌與副露共同按可用空間縮放，留在桌內、全部同排且不左右滑動。桌面持續顯示其他三家的暗手牌背、公開副露、花牌與棄牌。
- 右上「設定」提供儲存／讀取／重開、門規、聲音、桌心與牌名對照／語音試聽。吃、碰、槓、胡、聽、過維持目前在自家手牌上方的操作位置，只有可用動作才顯示；出牌直接點選手牌。設定選單本身不暫停 AI，進入「門規設定」才沿用既有暫停行為。
- 套用 D「五行晶石」的 42 種牌面與共用牌背：赤晶符印萬子、水靈珠筒子、碧晶飛劍條子、四風三元與八花。左上角以紅色 1–9 標記赤晶、藍色 1–9 標記靈珠、綠色 1–9 標記飛劍；字牌顯示東南西北中發白，花牌顯示春夏秋冬梅蘭竹菊。標記不加白色背景格；六張原有字牌保留圖內單字，避免文字重疊，白板與花牌補上透明底向量文字。新增 CSS 牌身厚度、側邊與落影；左右兩家的暗手以鏡像站立側視呈現，朝向各自座位，公開副露仍保留可讀牌面。這是 CSS 立體效果，並非 WebGL 模型；未重製或銳化原 PNG。圖鑑見 [crystal-tile-catalog.html](artifacts/crystal-tile-catalog.html)，驗證見 [CRYSTAL_TILES_VERIFICATION.md](docs/verification/CRYSTAL_TILES_VERIFICATION.md)。
- 每局播放洗牌、擲骰、堆牌、拿牌四段原創動畫，包含首次、下一局與重新開局；可跳過，讀檔直接回到原本進度。三種風格的動畫沿用正式仙俠桌面與桌框，完成後還原牌桌資訊。動畫期間不出牌、不存未完成的起手狀態。支援玉光、墨韻、霓虹與減少動態。
- 洗牌動畫與遊戲共用正式桌圖與桌框，寬桌發牌落點讀取四家實際手牌區位置；牌牆依可用寬高縮放。舊版 1:1 方桌、桌外操作列、右側常駐欄與手機底部工具列已由本版取代。

開局與版面變更、實際測試範圍見 [PRESENTATION_VERIFICATION.md](docs/verification/PRESENTATION_VERIFICATION.md)。

- 玉光、墨韻、霓虹三套原創 SVG／CSS 特效可在設定切換或關閉；支援手動與系統減少動態，不攔截出牌操作。已移除的舊聲光工坊不再顯示。
- 特殊胡牌新增 2.7 秒分段動態，依實際結算顯示清一色、三元、四喜、暗刻、花牌胡等牌型；包含圖案聚合、金箔／墨點／光軌與收尾。三風格動畫及驗證見 [VOICE_VERIFICATION.md](docs/verification/VOICE_VERIFICATION.md)。
- 18 種本地事件／環境音效保留音量、疊音上限與胡牌優先。語音現有 72 個 cue：42 種新牌名、9 種動作、16 個圈風與 5 個莊家播報；播放時降低音效音量，關聲或切背景立即停止。舊牌名素材保留但不再由正式報牌載入。素材與驗證見 [AUDIO_EFFECTS.md](docs/AUDIO_EFFECTS.md) 與 [VOICE_VERIFICATION.md](docs/verification/VOICE_VERIFICATION.md)。
- 補花語音以公開花牌名稱播放；一般補花 cue 的優先級與去重方式保留。舊「補花牌！」動作素材仍保留作通用 cue，不作新花牌名稱替代品。
- 自家手牌固定單行，依實際張數與可用寬度縮放，每張牌正面維持 5:7 比例且可點選；沒有左右滑動或隱藏的手牌。
- AI 改用完整的五組面子＋一對將眼拆解，計入既有副露，再比較向聽數與有效進張；吃碰會模擬合法出牌，避免拆壞組合，暗槓也先檢查牌型。普通聽牌不再隨機報聽鎖死手牌，保留可改善等待的空間。
- 移除 AI 防守對其他玩家等待牌及胡牌判定的讀取。策略只使用自己的牌、公開棄牌／明副露與公開報聽；不讀取他家暗牌、暗槓牌面或牌牆順序。驗證與同發牌比較見 [AI_VERIFICATION.md](docs/verification/AI_VERIFICATION.md)。
- 升級為 144 張含花牌：起手／摸牌／槓後連續補花、對位正花、花槓、七搶一與八仙過海；移除八對子判定與 AI 特殊對子策略。
- 統一門清自摸 3 台、三／四／五暗刻 2／5／8 台、獨聽與平胡限制，允許零台胡牌；規則差異與完整台數見 [RULES.md](docs/RULES.md)。
- 加入過水、同巡吃碰與吃碰後出牌限制；修復 AI 選到禁止打出的牌卻鎖聽而卡局。海底固定保留 16 張。

- 月夜牌館場景、木框牌桌、響應式手牌與統一結算視窗。
- 所有遊戲牌區共用晶石牌圖；正面維持 5:7 比例，左右暗手以站立側視呈現。原始 SVG 牌面保留為新渲染模組未載入時的備援。
- 修復點胡計分例外、自摸重複計牌、莊家額外分重複計入、吃碰誤刪舊棄牌、過牌吞掉其他家反應、舊延遲任務污染新局及讀檔不續玩。
- 修復設定重複開局、無效分數、槓牌海底限制、補牌記錄、聽牌後暗槓判定與不可能的第五張等待牌。
- 「遊戲設定」視窗開啟時暫停延遲動作，確認重開才重設進度；聲音可開關；支援鍵盤焦點與減少動畫偏好。
- 保留原本 IndexedDB 名稱及存檔鍵。新開局不刪除手動存檔，原存檔中的玩家名稱保留。
- 實玩稽核修正：吃碰後不能轉成自摸；暗刻依合法拆牌與胡牌落點計算，暗槓納入暗刻、互斥拆法不疊加、平胡排除單吊／嵌張／邊張、暗槓不算全求人。
- 換莊同步更新門風；修正起手天聽與已出牌後誤計地胡／人胡。搶槓依座次等待胡／過，讀檔維持優先順序；報聽後槓牌會續玩，槓上開花不被報聽視窗遮住。
- 底台收付改為一般台灣麻將方式：點胡／搶槓由放槍者付一份，自摸由其他三家各付一份；莊家與連莊加台只影響涉及莊家的收付。

透過上述本機 HTTP 服務開啟 `index.html`；請一併保留 `cultivation-skills.js`、`cultivation-finishers.js`、`cultivation-combat.js`、`cultivation-progression*.js`／`cultivation-progression-ui.css`、`cultivation-ui.js`、`cultivation.css`、`start-screen.*`、`tile-names.js`、`styles.css`、`lounge.css`、`table-layout.*`、`table-scene.css`、`table-menu.js`、`table-menu.css`、`opening-animation.*`、`table-art.css`、`theme-xianxia.css`、`crystal-tiles.js`、`crystal-tiles.css`、`feedback-*.js`、`feedback-effects.css` 與 `assets/`（含 `player-portraits.png`）。場景與牌面為原創素材，無外部 CDN 或字型下載。

右上「設定」可直接調整特效、音量與語音開關。「晶石牌名與語音」展開後可查看對照與試聽 63 個選項（42 牌名、16 圈風、5 莊家）。聲音預設開啟，語音預設關閉；偏好獨立保存，不改牌局或分數。瀏覽器要在第一次點擊或按鍵後才會出聲，口音與聽感仍以使用者試聽為準。

### 驗證方式

需要 Node.js；引擎測試僅使用 Node 內建模組：

```powershell
node --test tests/engine.test.cjs tests/ai.test.cjs tests/audio-runtime.test.cjs tests/voice-runtime.test.cjs tests/effects-runtime.test.cjs
node --test tests/opening-runtime.test.cjs
node --test tests/crystal-tiles.test.cjs
node tests/ai-benchmark.cjs 60 artifacts/ai-benchmark-rerun.json
node --test tests/cultivation-*.test.cjs
node tests/cultivation-simulation.cjs
```

瀏覽器測試需要已安裝 Playwright 與 Chromium 的 Node.js 環境。先啟動唯一本機 HTTP 服務：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

保持服務運行，在另一個終端執行：

```powershell
node tests/table-menu.cjs
node tests/start-screen.cjs
node tests/feedback-browser.cjs --voice --prefix=crystal-voice-
node tests/flower-sync.cjs
node tests/wide-table.cjs
node tests/wide-opening.cjs
node tests/standing-rivers.cjs
node tests/cultivation-flow.cjs
node tests/cultivation-seal-flow.cjs
node tests/cultivation-journey.cjs --label=journey-final
node tests/cultivation-ui.cjs
```

以下為歷史回歸工具；部分仍使用舊方桌尺寸、常駐按鈕或側欄選擇器，尚未全部改寫成新版選單流程，不應直接視為本版驗收結果：

```powershell
node tests/browser.cjs
node tests/opening-browser.cjs
node tests/opening-surface.cjs
node tests/opening-browser.cjs --square-only
node tests/viewport-layout.cjs
node tests/gameplay-audit.cjs
node tests/gameplay-audit.cjs --controlled --mobile
node tests/tile-preview.cjs
node tests/crystal-browser.cjs
node tests/result-layout.cjs
node tests/feedback-browser.cjs
node tests/gameplay-audit.cjs --sound --style=neon --seeds=211,223,239
node tests/gameplay-audit.cjs --sound --voice --style=jade --seeds=251,263,277
node tests/hand-layout.cjs
node tests/inside-rack.cjs
node tests/special-win-browser.cjs
node tests/effects-motion.cjs
node tests/gameplay-audit.cjs --sound --voice --style=jade --seeds=307,331,353 --prefix=flower-sync-
node tests/gameplay-audit.cjs --controlled --mobile --sound --voice --style=ink --prefix=flower-sync-
```

`tests/browser.cjs` 涵蓋實際出牌、設定驗證、存讀檔、AI 恢復、桌機／平板／手機共 6 種視窗、完整牌局及下一局、直接開啟本地 HTML。測試使用隔離瀏覽器，不讀取使用者平常瀏覽器的牌局。

2026-10-22 同日前一輪寬桌更新的 `wide-table` 15 尺寸／33 組密集牌局全部通過，涵蓋 999 個命中檢查點、285 次可信點擊命中與獨立的實際出牌驗證；各組均保有 144 張唯一實體牌，瀏覽器錯誤 0，見 [最終寬桌報告](artifacts/wide-table-final.json)。285 次點擊由測試攔截以驗證命中，並非 285 次實際出牌；獨立出牌案例確認手牌 17→16、棄牌 24→25、輪次 0→3。`table-menu` 58 項、`wide-opening` 5 種視窗四階段與跳過／縮放、`opening-runtime` 18 項也通過。`engine` 與 `crystal-tiles` 單元測試合計 78 項通過，包含 25 局引擎模擬與 2,220 個狀態檢查，完整範圍見 [牌桌驗證](docs/verification/PRESENTATION_VERIFICATION.md)。

2026-10-21 的 `hand-layout`（10 尺寸、80 情境、170 次出牌）、`crystal-browser`（5 組視窗／DPR）、`opening-browser`（24 項）與 `inside-rack`（6 尺寸／12 牌局、702 個命中點）是舊方桌版的歷史證據，不是本次寬桌重跑結果。結算 4 尺寸／624 張與完整對局同樣保留為歷史結果。

`tests/gameplay-audit.cjs` 透過瀏覽器按鈕操作吃、碰、三種槓、胡牌、搶槓與過牌，固定合法牌局核對實際扣分、補牌及存讀檔；另跑 5 局有固定亂數種子的完整對局。完整對局縮短排程等待時間，不替換規則或計分函式；每次測試互動／輪詢後檢查 144 張實體牌唯一性與四家總分守恆，定點案例則在操作完成後檢查。結果寫入 `artifacts/gameplay-audit.json`，手機尺寸定點案例另存 `artifacts/gameplay-audit-mobile.json`。

可用 `node tests/gameplay-audit.cjs --seeds=53,67,89,101,127,149` 重跑 AI 策略驗收的 6 局瀏覽器對局。`tests/ai-benchmark.cjs` 則以四家 AI 模擬固定發牌，記錄起始牌局雜湊、胡牌／流局及牌張與總分守恆；使用測試入口讓第 0 席交給同一套 AI，不修改正式遊戲的人類席位。`tests/ai.test.cjs` 另以會拋錯的暗牌存取器及隱藏狀態重排，檢查策略資訊邊界。

驗證截圖及 42 種牌面圖鑑存於 `artifacts/`。`*.bak.*` 為修改前備份，未刪除。

### 同日追加：對家站立牌與四向棄牌

- 畫面上方的對家暗手（`handBack1`）增加朝向對家的站立牌背與白色頂面厚度，不顯示暗牌。四家棄牌固定每列 6 張，由各自視角左到右、下一列向桌心排列；畫面下／上／左／右的牌面角度依序為 0°／180°／+90°／−90°。正式程式僅修改 `table-layout.js` 與 `table-scene.css`。
- 手機對家棄牌從三個安全區選擇可用空間，避開資訊卡與花牌；≤360px 直向側資訊卡改為 100px，保留文字。直向對家花牌維持單排、右家花牌靠資訊卡右緣，自家棄牌可利用資訊卡與花牌右側空間。矮橫向的對家與右家棄牌分用桌心右側的上下空間，避免縮成 1px。
- 新增 `node tests/standing-rivers.cjs`：[報告](artifacts/standing-rivers.json) 9 尺寸／34 場、1,368 張棄牌檢查通過：原 6 尺寸／24 場／888 張涵蓋每家 6／7／12 張及對家 24 張分布，另有 5 尺寸的對家 5／7 張花牌壓力案例，共 10 場／480 張。碰撞、裁切與瀏覽器錯誤均為 0，顯示前後 `S` 不變、每場維持 144 張唯一實體牌。78 項引擎／牌圖、58 項選單及 18 項開局單元測試本次未重跑，保留上方前一輪證據。
- 同版 `node tests/wide-table.cjs` 重跑 15 尺寸／33 場通過，999 個命中點、285 次可信點擊命中、獨立實際出牌案例及設定入口通過，失敗與瀏覽器錯誤均為 0；報告另存 [standing-rivers-wide-regression.json](artifacts/standing-rivers-wide-regression.json)。285 次攔截點擊不當成實際出牌；獨立案例確認手牌 17→16、棄牌 24→25、輪次 0→3。同版 `wide-opening` 5 尺寸的四階段、跳過與縮放也重跑通過。
- 新專測的 34 場另檢查棄牌短邊 ≥6px，這只是避免退化成極小牌張的最低門檻，不代表手機具備桌機清晰度；33 場寬桌回歸未加此項斷言。手機仍僅為 Chromium 視窗模擬。

### 規則與驗收邊界

底台收付採一般台灣麻將方式：每份為「底分＋台數×每台分數」。點胡與搶槓只由放槍者付一份；自摸由另外三家各付一份。莊家起莊加 1 台，連 n 拉 n 合計加 2n＋1 台：莊家胡牌時納入該次收款，閒家胡莊家時由莊家加付，閒家自摸時也只有莊家加付，閒家彼此點胡不加莊家台。參考 [Hé Fēn 底台收付規則](https://www.hefenmahjong.com/zh-hant/rules/taiwanese) 與 [徐乃麟麻將計分教學](https://new.shifu.tw/course/ArticleDetail/18)。

本版採 [明列的台灣 16 張含花規則](docs/RULES.md)。各地對花槓、全求獨聽、高階牌型有差異，以本桌規則為準。八對子已移除；舊版無花存檔保留但不能載入，須重新開局，主動儲存會更新同一手動存檔。新版存讀檔核對 144 張牌，含花牌與過水狀態。

手機驗證使用 Chromium／WebKit 的瀏覽器視窗，尚未在實體 iOS／Android 裝置驗收；公開網站為上方 GitHub Pages 連結。存檔依目前瀏覽器與來源隔離；切換瀏覽器、HTTP 位址或 file 開啟模式不會自動共用存檔。離頁非同步存檔無法保證完成，離開前可使用「儲存牌局」。

歷史版面結果（2026-10-22，加入橫式限制之前）：當時 320×568 的 17 張手牌寬 14px，五槓情境暗手 11px、副露最小約 9.45px；未以影像放大或銳化宣稱增加解析度。當時 568×320 與 943px 的密集案例通過桌內邊界與資訊避讓，結論限於該輪報告的情境。**目前直式僅顯示轉向提醒，無法操作牌桌**；以上尺寸數據不屬本次 PWA 驗收。

## 📘 專案簡介
這是一款模擬台灣 16 張麻將的單機網頁遊戲，支援電腦 AI 對戰。  
提供起牌、摸牌、吃碰槓與胡牌流程，並支援專案自訂的連莊、風圈與台數計算。

---

## ⚙️ 功能特色
- 🎲 **擲骰決定莊家與座風**  
  自動顯示當前風圈（如「東風東」、「南風北」）。
- 🧑‍🤝‍🧑 **隨機中文玩家名稱**  
  四位玩家皆自動生成兩字中文名，介面更自然。
- 🀄 **完整摸牌與打牌規則**  
  起手莊家 17 張、閒家 16 張；摸一打一，副露後暗手張數相應減少。
- ⚔️ **吃、碰、槓邏輯**  
  僅吃上家，不能明槓上家棄牌；明槓補牌不可自摸，搶槓依座次等待選擇。
- 🌊 **海底限制規則**  
  最後三張可摸牌禁止吃碰明槓；暗槓、加槓須有可補牌，保留區固定維持 16 張。
- 🎧 **聽牌提示強化**  
  僅顯示「自己」的聽牌提示，字體放大、醒目顯示可胡牌型。
- 🤖 **強化 AI 對手**  
  電腦玩家會策略性吃碰與選牌，不再隨機出牌。
- 🧮 **胡牌台數自動判定**  
  胡牌時自動計算台數並在戰況紀錄中顯示詳細說明。

---

## 手機操作、音效與特效修正（2026-10-24）

- 畫面重繪沿用相同手牌／副露的聽牌計算結果，牌型變更才重算；快取不寫入存檔，出牌限制仍即時檢查。修仙 HUD 更新後只同步一次特效定位。
- Chromium、844×390、DPR 3、6 倍 CPU 降速、同一固定牌局連續 12 次重繪的中位數由 78.25 ms 降至 35.90 ms；牌局狀態不變。這是重複重繪的本機量測，不代表實體手機幀率或完整出牌耗時。
- 音效超過 300 ms 尚未起播就略過；牌名語音期限為 700 ms，動作語音為 1,200 ms。正常起播後，不會因上述起播期限而被截斷，避免慢網路下載完成後補播舊聲音；因此首次連線很慢時可能略過個別聲音。
- 修仙開打前一併確認 10 張戰鬥特效素材完成下載及解碼；首次進場會等待這些素材，後續沿用快取。修正奇數寬圖集的相鄰格裁切，以及 Canvas 尺寸不變時重設畫布造成的閃爍。切到背景後取消尚未開始的演出。
- 回歸：全套 935 項單元測試通過，最後調整後另跑相關 56 項通過；Chromium／WebKit 手機尺寸各驗證 35 招怪物預覽、圖集邊界、慢音檔取消及正常重播，沒有裁切越界或頁面錯誤。WebKit 自動化不等於實體 iPhone 驗收。

```powershell
node --test tests/render-waits.test.cjs tests/audio-runtime.test.cjs tests/voice-runtime.test.cjs tests/cultivation-vfx-runtime.test.cjs tests/cultivation-monster-presentation.test.cjs
node tests/mobile-media.cjs
node tests/mobile-media.cjs --desktop
node tests/mobile-performance.cjs
node tests/mobile-performance.cjs --after
```

瀏覽器腳本自行啟動本機服務，需要 Playwright 的 Chromium／WebKit，輸出至忽略提交的 `artifacts/`。效能腳本第一次會保存牌局與 `before` 報告，`--after` 用該牌局重測；真正前後比較須分別在修改前、修改後執行，僅在同一版本連跑不代表改善幅度。

## 慢速連線與 Safari／PWA 圖片就緒檢查（2026-10-24）

- 牌桌會先確認 5 張牌面圖集、修仙當局 4 位角色縮圖與當前怪物已完成下載及解碼；等待期間顯示進度，發牌完成後不會提前開放操作或讓 AI 繼續走牌。換怪物和讀檔也套用相同檢查。
- 下載失敗或超過 25 秒時保留牌局暫停，提供「重新載入圖片」與「返回首頁」。已可儲存的牌局沿用既有封存流程，尚未完成開局的牌局不會覆寫為存檔。
- 已解碼的圖片保留在記憶體，避免頻繁重建牌面與頭像時失去載入參照；小頭像直接沿用選角縮圖。修仙必要圖片包含戰鬥特效圖集，就緒後才開始演出。
- PWA 註冊與更新檢查不再等待 `window.load`（不被尚未載完的圖片拖住）；首次安裝完成不會重載已開始的遊戲。既有版本更新仍沿用首頁更新／牌局中提示儲存再更新的流程。
- 驗證：Chromium 與 Playwright WebKit 的 844×390 瀏覽器案例，刻意延遲圖片、回傳 503、讀檔後重試；另驗證圖片未完成時已註冊 PWA，以及首次取得控制權不重載牌局。WebKit 自動化不等於實體 iPhone Safari／主畫面 PWA 驗收，也不能代表手機端實際網速。

```powershell
node tests/image-readiness.cjs
```

測試需要 Playwright 的 Chromium 與 WebKit，結果存於 `artifacts/image-readiness-after.json`。手機更新後應能看到「準備牌面與角色圖片」的進度視窗；新功能改善載入順序及防止空白牌局，不會消除首次下載所需的網路時間。

## 圖片載入優化（2026-10-24）

- 遊戲場景、角色、怪物、裝備、道具、NPC、牌面與特效改讀 WebP；109 張素材由 15,915,014 bytes 降至 9,329,152 bytes（減少 41.4%）。這是素材合計，並非每次開頁面的下載量。原始 PNG/JPG、資料目錄路徑與存檔保留；PWA 安裝圖示、SVG 及非遊戲使用的 `cultivation-preview/` 維持原格式。
- 麻將圖集由 2,512,651 bytes 降至 855,170 bytes（9 張合計，減少 66.0%）。WebP 與現有 PNG 尺寸一致，沿用原有 SVG／Canvas 裁切座標；透明度逐像素驗證一致。
- 選角另用 10 張 256×384 縮圖，合計 351,908 bytes；手機不額外下載隱藏的大圖。首頁模式插圖延後載入，怪物特效只在進入修仙或試放時載入。
- Chromium、844×390、DPR 2、1.6 Mbit/s／150 ms 延遲、全新快取且停用 Service Worker 的量測：從點修仙模式到 10 張角色圖齊全，由 23.3 秒降至 9.6 秒。PWA 安裝完成後，首次離線選角約 65 ms。這是本機模擬，尚未在實體手機驗證。
- 更新來源圖片後，執行以下命令重新產生 WebP，再更新 PWA 版本。`sharp` 與 `playwright` 為開發驗證依賴，網站執行不需要 Node.js。

```powershell
node tools/build-mobile-images.cjs
node tests/image-assets.cjs
node tools/build-pwa.cjs
node tools/build-pwa.cjs --check
node tests/hero-loading.cjs
node tests/pwa-browser.cjs
```

生成工具保留原圖，只新增同目錄 WebP 與角色 `.thumb.webp`；新增圖片請先執行生成工具再部署。瀏覽器驗證涵蓋手機／桌機角色切換、牌桌圖集、特效解碼及離線選角，結果寫入忽略提交的 `artifacts/`。圖片仍受首次連線速度影響；未載入的場景／音效仍需網路。

## 🖥️ 使用方式

1. 打開 `index.html`，在首頁按「開始遊戲」→「一般模式」才會擲骰、分牌、定莊。
2. 有自動暫存時可按「繼續一般模式」或「繼續修仙模式」直接回桌。右上「設定」內的「重開論道」可另開新場。
3. 輪到自己時直接點選手牌；吃、碰、槓、胡、聽、過在自家手牌上方，只顯示當下可用動作。
4. 「設定」可調音量、語音、特效與桌心，也可展開「晶石牌名與語音」看對照及試聽；「門規設定」調整規則，胡牌結果在結算面板顯示。

---

## 📜 基本規則摘要
| 類別 | 說明 |
|------|------|
| 起手 | 莊家 17 張、閒家 16 張 |
| 摸牌 | 每回合摸一張打出一張 |
| 吃 | 僅能吃上家打的牌 |
| 碰 | 可碰任意家打的相同牌 |
| 槓 | 含暗槓、明槓、加槓（近海底牌限制） |
| 胡牌 | 一般胡牌須五面子一將；七搶一／八仙過海依花胡規則 |
| 連莊 | 莊家胡牌或流局連莊，閒家胡牌時逆時針換莊 |

---

## 🎨 介面設計
- 四方位桌面佈局模擬真實麻將桌。  
- 手牌、捨牌、戰況紀錄等皆具辨識度。  
- 自家區塊的聽牌提示放大顯示。

---

## 💡 開發說明
- 使用 **HTML / CSS / JavaScript** 製作，無需伺服器即可離線執行。  
- 可直接在 GitHub Pages、Firebase Hosting 或本地瀏覽器開啟。

---

## 📁 檔案結構
```
mahjong/
│
├── index.html        # 主程式、SVG 牌面與介面
├── cultivation-skills.js # 169 種牌組技能與共通胡牌終式
├── cultivation-combat.js # 可重播驗證的獨立戰鬥狀態轉換
├── cultivation-ui.js # 怪物／玩家狀態、技能圖鑑與選技預覽
├── cultivation.css   # 修仙模式專用響應式樣式
├── image-assets.js  # 保留資料原圖路徑，顯示時解析 WebP
├── styles.css        # 共用介面與響應式排版
├── lounge.css        # 月夜牌館視覺樣式
├── table-layout.js   # 四家牌架、花牌與棄牌的可用空間配置
├── table-scene.css   # 寬桌、玩家資訊卡與立體／側立牌身
├── table-menu.js     # 將既有操作收進單一設定入口
├── table-menu.css    # 設定選單與手機排版
├── opening-animation.* # 每局洗牌、擲骰、堆牌與發牌演出
├── feedback-*.js     # 音效播放、原創特效與聲光偏好
├── feedback-effects.css # 三種特效與減少動態樣式
├── README.md         # 專案說明文件（本檔）
├── manifest.webmanifest / sw.js / pwa-assets.js # PWA 與版本快取
├── pwa.js / pwa.css  # 直式提醒、方向檢查與 PWA 註冊
├── docs/             # 遊戲規則、音效與技能文件
│   └── verification/ # 各輪驗證與歷史報告
├── assets/           # 本地場景圖片與 ElevenLabs 音效
├── art-source/audio/ # 音效原始匯出、提示詞與製作紀錄
├── art-source/player-portraits/ # 四家頭像原始圖與來源紀錄
├── tests/            # 引擎回歸、瀏覽器測試與圖鑑產生器
├── tools/            # PWA 建置與素材處理工具
├── artifacts/        # 本機驗證記錄、截圖與牌面圖鑑（不提交）
└── .local-backups/   # 集中保存的歷史備份與搬移清單（不提交）
```

---

## 上古神兵 · 修仙戰鬥演出

- 修仙模式以生成的透明 PNG 作為來源，遊戲載入 WebP 衍生素材並以 Canvas 演出；不以 SVG 或圖示縮放代替攻擊。
- 169 種牌組技能與 38 種台型終式都有演出對照，按用途分成 56 種施法造型，包括劍雨、穿刺、地裂、藤縛、火壁、靈泉、四象與山岳鎮落。共用材質，但依招式組合動作、段落和聲音。
- 設定內可開關特效、調整主音量與減少動態；每張技能卡都有「試放招式 · 試聽」。試放是獨立演武，不會改動牌局。
- [六招差異對照](artifacts/cultivation-vfx-contrast.html) · [全部招式演武](artifacts/cultivation-vfx-catalog.html) · [製作與驗證報告](artifacts/CULTIVATION_VFX_REPORT.md)。
- `cultivation-choreography.js` 保存逐招施法造型，`cultivation-presentation.js` 將實際戰鬥結果轉為演出，`cultivation-effects.js` 負責圖片載入、動畫與音效。規則、傷害與存檔仍由既有引擎管理。

## 🧠 未來可擴充功能
- 線上對戰（WebSocket）
- 更多牌面動畫與音效
- 詳細戰績記錄與重播系統
- 可選牌桌規則版本
