# 新圖需求清單 · 2026-10-28

給產圖者（Codex 內建生圖）使用。共 **42 張**，分六組，依重要程度排序；可分批交付，每組完成即可接進遊戲。

## 共通規格

- **風格**：沿用 `assets/cultivation-items/manifest.json` 的「上古神兵：古銅、玄鐵、青玉」，水墨仙俠、金色描邊、偏暗的青綠底色；與現有怪物、裝備、道具圖並排時不突兀。不放文字、浮水印或 UI 框。
- **流程**：產出原始 PNG 放進下表資料夾（檔名用表內 id）→ 原圖另存 `D:\Download\github\mahjong-original-assets\` → 執行 `python tools/optimize-assets.py`（已加入各資料夾的縮圖規則，會產生同名 `.webp`）→ 每組資料夾放一份 `manifest.json`（格式同 `assets/cultivation-items/manifest.json`：generator、style、assets[id/name/source/file/sha256]）→ `node tools/build-pwa.cjs`。
- **大小**：轉 WebP 後單張圖示 ≤ 20 KB、插圖 ≤ 100 KB、橫幅 ≤ 180 KB；總增量控制在 2.5 MB 內，避免手機首次下載變慢。
- **接入原則**：圖片缺失時不顯示破圖（`onerror` 隱藏或保留純文字版）；`alt` 留空（旁邊已有文字名稱）；畫面外的圖加 `loading="lazy"`。手機 844×390、942×435 與桌機都要截圖確認不擋按鈕、不需額外捲動。

## A. 五行地區橫幅（5 張）· 最優先

- 資料夾：`assets/cultivation-expedition/regions/`，`{id}.png`，**1536×512**，RGB 不透明。
- 用途：整備「巡歷」分頁頂端（取代純文字地名）、換區後第一次整備的大圖；牌桌不放。
- 構圖：遠景地貌為主、左側留暗部供疊字，畫面中央偏右放地標。

| id | 地區 | 畫面重點 |
|---|---|---|
| metal | 鎏金礦域 | 斷崖間的古銅礦脈與廢棄兵器架，金屑在月光下閃爍 |
| wood | 青木幽林 | 參天古木與發光藤蔓，林間薄霧與青色靈光 |
| water | 滄瀾寒潭 | 冰藍深潭、懸冰崖壁，水面倒映月輪 |
| fire | 赤焰荒原 | 龜裂紅土與熔岩溝，遠處燃燒的火山口 |
| earth | 厚土古陵 | 巨石陵墓與石像列陣，沙塵與暗金色晚霞 |

## B. 奇遇插圖（20 張，可先做 5 張）

- 資料夾：`assets/cultivation-expedition/events/`，`{eventId}.png`，**768×384**，RGB。
- 用途：奇遇標題上方的情境圖。若先只做每區 1 張，暫時以該區四個事件共用（程式依 regionId 退回）。
- 稀有事件（第 4 號）畫面更華麗：加光暈或寶物特寫。

| eventId | 名稱 | eventId | 名稱 |
|---|---|---|---|
| metal-1 | 廢礦金脈 | water-1 | 古井尋珠 |
| metal-2 | 斷兵遺庫 | water-2 | 渡口行商 |
| metal-3 | 鑄坊殘爐 | water-3 | 寒潭洗髓 |
| metal-4 | 封印兵匣（稀有） | water-4 | 玄冰寶庫（稀有） |
| wood-1 | 百草坡 | fire-1 | 熔火採集 |
| wood-2 | 迷霧花圃 | fire-2 | 丹爐餘火 |
| wood-3 | 古樹療泉 | fire-3 | 試煉碑 |
| wood-4 | 青帝遺圃（稀有） | fire-4 | 赤陽密藏（稀有） |
| earth-1 | 斷崖石窟 | earth-3 | 地脈祭壇 |
| earth-2 | 守路石靈 | earth-4 | 后土遺藏（稀有） |

## C. 境界徽記（5 個）

- 資料夾：`assets/cultivation-progression/realms/`，`{0..4}.png`，**256×256**，透明背景。
- 用途：整備「修行」分頁的境界標題旁、首頁修為卡、角色資訊、渡劫成功畫面。
- 一系列逐級升級的圓形或玉璧形徽記，越高階越華麗、光芒越強：0 煉氣（青銅、單圈氣旋）、1 築基（玄鐵基座）、2 金丹（金色丹丸）、3 元嬰（玉色小人影）、4 化神（多重光環、雲紋）。

## D. 功法圖示（6 個）

- 資料夾：`assets/cultivation-progression/skills/`，`{id}.png`，**256×256**，透明背景，與 `assets/cultivation-items/` 同尺寸同風格。
- 用途：功法配置視窗每列左側、修行分頁已裝備功法。

| id | 名稱 | 圖案 |
|---|---|---|
| sword | 御劍訣 | 懸空飛劍與劍氣 |
| spell | 御法訣 | 符籙與法印光圈 |
| riposte | 回鋒訣 | 反折的刀光、迴旋箭頭 |
| recovery | 回春訣 | 青葉與水滴靈光 |
| guard | 凝盾訣 | 玉璧護盾 |
| quiet | 斂息訣 | 半隱於霧中的燈籠或閉目面具 |

## E. 渡劫畫面（2 張）

- 資料夾：`assets/cultivation-progression/trial/`，**1280×640**，RGB。
- `tribulation.png`：雷雲漩渦下的孤峰，用於「挑戰渡劫」確認與渡劫局開始。
- `breakthrough.png`：雲開見月、金光灌頂，用於渡劫成功。

## F. 王印圖示（4 個）

- 資料夾：`assets/cultivation-equipment/seals/`，`{setId}.png`，**256×256**，透明背景。
- 用途：整備頂端金幣列的王印數量、本局收穫的王印、套裝兌換。

| id | 王印 | 對應套裝圖（配色參考） |
|---|---|---|
| zhenyue | 鎮岳玄甲王印 | `assets/cultivation-equipment/sets/zhenyue.webp` |
| jiuyou | 九幽靈藤王印 | `assets/cultivation-equipment/sets/jiuyou.webp` |
| chixiao | 赤霄王印 | `assets/cultivation-equipment/sets/chixiao.webp` |
| wuxiang | 五相王印 | `assets/cultivation-equipment/sets/wuxiang.webp` |

## 已完成（不需新圖）

- 奇遇選項：成本與獎勵改用現有道具圖示，金幣／靈砂以金、青小圓章表示（`cultivation-expedition-ui.js` 的 `resourceChips`）。
- 選擇下場小王：改為帶怪物頭像的卡片；原三位小王沒有縮圖，暫用原圖 WebP。若要統一，可補 `blackarmor-general`、`nether-vine-queen`、`crimson-sword-demon` 三張 256×171 的 `.thumb.webp`（以 `tools/optimize-assets.py` 由原圖縮出即可，不需新畫）。

## 備註

- `assets/cultivation-preview/`（39 MB）是開發用特效風格預覽工具的素材，玩家不會下載，也不在離線快取內；本次不動。
