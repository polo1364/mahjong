# 介面規範

所有畫面共用 [ui-system.css](../ui-system.css)，它最後載入。新增或修改介面時，請沿用這裡的元件，不要另外定義顏色和圓角。

## 風格

墨青漆底、鎏金雲紋框，按鈕是金玉牌匾，主要導覽做成玉質麻將牌，圖示統一用剪影。

| 用途 | 變數 |
|---|---|
| 底色、面板 | `--ui-ink`、`--ui-panel`、`--ui-fill`（含漆面紋理） |
| 金色文字與線條 | `--ui-gold`、`--ui-gold-hi`、`--ui-line`、`--ui-line-2`、`--ui-metal` |
| 內文、次要文字 | `--ui-text`、`--ui-mute` |
| 狀態色 | `--ui-jade`（我方、正面）、`--ui-red`（危險） |
| 標題字、內文字 | `--ui-title`、`--ui-body` |
| 大面板框 | `border-image: var(--ui-frame)` |
| 卡片框 | `--ui-frame-small`、`--ui-frame-card`、選中用 `--ui-frame-card-on` |
| 按鈕底圖 | `--ui-plate`，主要按鈕用 `--ui-plate-gold` |
| 畫面標題牌 | `--ui-title-plate` |

框與按鈕都要先設 `border: 1px solid transparent`，圖片比邊框寬，不影響版面。若 `border` 帶 `!important`，`border-image` 也要帶，否則會被清掉。

## 美術素材

`assets/ui/` 全部由 [tools/build-ui-art.cjs](../tools/build-ui-art.cjs) 用 SVG 繪製，要改色或改形狀就改這支程式再重跑，不要直接改圖：

```bash
node tools/build-ui-art.cjs
```

圖示的原始檔在 `assets/ui/icons/`，由程式內嵌進 `ui-art-data.css`（`--icon-名稱`），再透過 CSS `mask` 上色。瀏覽器在 `file://` 下會擋外部遮罩圖，所以不要在 `mask` 裡直接引用圖片路徑。標誌字型是 Noto Serif TC（SIL OFL 授權），已烘成圖片，手機上不需要這個字型。

## 操作原則

1. 每個畫面只有一個金色主要按鈕，而且永遠留在畫面內，內容捲動時不會跟著移走。
2. 手機上，主要操作至少 44px 高，一般按鈕至少 38px 高。可用 `--ui-btn-h` 調整單一區塊。
3. 面板內容要捲動時，只捲面板，不捲整頁。
4. 焦點框只在使用鍵盤時顯示（由 [ui-system.js](../ui-system.js) 切換）。
5. 動畫只用淡入、位移和金光掃過，都在半秒內結束且不擋操作；系統設定減少動態時全部關閉。

## 整備庭院的導覽

角色那組與補給那組分頁都放在左側同一條牌形導覽上，兩組仍是原本的分頁按鈕。
螢幕寬度未滿 1100px 時，只顯示最後點選的那一組內容（`data-prep-pane`）；1100px 以上兩組並排。
新增分頁時，要在 `ui-system.css` 替它的 `data-left` 或 `data-tab` 指定一個 `--icon`。
