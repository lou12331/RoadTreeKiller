# 92,776 — 路樹殺手

一款 3D 網頁增量（Cookie Clicker 式）伐木遊戲，以手機直式操作為優先。

> 因為各種原因，你現在需要砍掉總共 92,776 棵樹，不要問我為什麼，反正砍就對了。

遊戲以 TypeScript、Three.js 和 Vite 製作，成品是純靜態網站，不需要後端。

本專案為開源專案，以 [MIT License](LICENSE) 授權，歡迎 fork、修改與學習。

## 玩法

1. 點「砍！」或直接點 3D 畫面砍樹，賺取金幣。
2. 用金幣買斧頭升級、設備和特殊升級，讓設備自動砍樹。
3. 一路從人工伐木推進到軌道衛星，砍完 92,776 棵樹即通關。
4. 通關後可以開始 New Game+（開始種樹），保留成就，每一輪 DPS 與金幣 +50%。

### 進度階段

| 起始棵數 | 階段 | 內容 |
| --- | --- | --- |
| 0 | 人工伐木 | 斧頭與第一台電鋸 |
| 100 | 機械化 | 揮斧機與加速 |
| 1,000 | 工業化 | 粉碎機、伐木車 |
| 5,000 | 全面自動化 | 無人機、快速結算 |
| 20,000 | 高科技伐木 | 雷射砲、批次砍伐 |
| 50,000 | 終極伐木 | 衛星、極速結算 |

七種設備依序為電鋸、自動揮斧機、樹木粉碎機、自動伐木車、伐木無人機、雷射伐木砲、軌道伐木衛星。另有 8 項特殊升級與數十個成就；新聞跑馬燈和彈幕會隨進度出現。

### 操作

- **手機**：點「砍！」或 3D 畫面；商店抽屜可上滑展開。
- **桌面**：按空白鍵或 A–Z 任一字母鍵砍伐，商店固定在右側欄。
- **設定**：畫質（DPR 上限 1／1.5／2，高畫質開陰影）、音效、存檔匯出匯入、重置進度。

## 開發

需要 Node.js 22 以上（CI 使用 22）。

```bash
npm install
npm run dev      # 開發伺服器（--host，手機可連同網段測試）
npm run build    # 型別檢查並輸出 dist/，可直接部署為靜態網站
npm run preview  # 預覽建置結果
npm run sim      # 經濟模擬：三種策略的通關時間與各階段耗時
```

推送到 `main` 會由 [GitHub Actions](.github/workflows/deploy.yml) 自動建置並部署到 GitHub Pages。Vite 的 `base` 設為 `./`，放在任何子路徑都能運作。

## 專案結構

```
src/
  core/    純 TypeScript 遊戲核心，不依賴 DOM 或 Three.js
  scene/   Three.js 街景、樹木、斧頭、設備模型
  ui/      HUD、商店、音效、彈幕、速度線
  assets/  標誌、頭像、簡報圖
scripts/   經濟模擬、圖示處理
docs/      圖示生成提示詞與說明
public/    圖示、favicon、PWA 圖片
```

| 模組 | 檔案 |
| --- | --- |
| 靜態資料（樹種、設備、升級、成就、新聞） | `src/core/data.ts` |
| GameState、存檔遷移 | `src/core/state.ts` |
| TreeGenerator（種子＋索引，不預先生成） | `src/core/trees.ts` |
| Combat / Economy / Upgrade | `src/core/economy.ts` |
| SimulationSystem（固定步進、溢出、離線） | `src/core/sim.ts` |
| SaveService（IndexedDB＋localStorage 備援、匯出匯入） | `src/core/save.ts` |
| EventSystem（成就、新聞） | `src/core/events.ts` |
| SceneController | `src/scene/scene.ts`、`src/scene/models.ts` |
| UIController | `src/ui/ui.ts` |
| 音效與背景音樂 | `src/ui/audio.ts` |
| 圖示路徑與動態圖示渲染 | `src/core/icons.ts`、`src/ui/icons.ts` |

因為 `src/core/` 不碰 DOM，`scripts/simulate.ts` 能直接拿來跑經濟模擬。

## 設計說明

- **樹木 HP 隨進度平滑成長**：後期設備 DPS 高達數十萬，若樹木 HP 固定，衛星還沒出現遊戲就會結束。因此使用 `HP_CURVE` 錨點對數內插的血量曲線：第一棵成樹約 15 HP，第 1,000 棵約 100、第 10,000 棵約 5,000、最後約 200 萬（再乘樹種、成長、健康倍率）。模擬後首次通關約 2.9 h（積極）／3.5 h（定期）／4.4 h（放置）。
- **特殊升級價格**：數值見 `UPGRADES.cost`。
- **「批次結算效率 ×2」** 的意思是「設備砍倒的樹金幣 ×2」，這樣不論結算切得多細，結果都一樣。
- **離線與背景結算**：分頁隱藏 10 分鐘以內全速結算，超過的部分照離線規則算（效率 50%，上限 8 小時）。

### 美術與音效

- **3D 模型**：七種樹（榕樹、樟樹、小葉欖仁、阿勃勒、楓香、茄苳、臺灣欒樹）、斧頭、設備都用程式產生的低面數幾何（共用 Geometry/Material、InstancedMesh），沒有 GLB 檔，首屏不用額外下載。
- **音效與音樂**：全部由 WebAudio 即時合成，不載入音檔；8-bit 風格背景音樂在高速砍伐時會淡入第二層編制。
- **圖示**：43 種透明 PNG 由 ImageGen 生成，載入時預載並暫存。提示詞與處理方式見 [docs/icons.md](docs/icons.md)，縮放腳本為 `scripts/prepare-icons.py`。

## 授權

以 [MIT License](LICENSE) 釋出。程式碼、AI 產製的圖示與程式生成的模型音效皆可自由使用，保留授權聲明即可。
