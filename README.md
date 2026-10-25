# 92,776 — 3D 網頁增量伐木遊戲

依《92,776 遊戲企劃書（Three.js｜手機端優先）》實作的 Cookie Clicker 式增量遊戲。

## 執行

```bash
npm install
npm run dev      # 開發伺服器（--host，可用手機連同網段測試）
npm run build    # 產出 dist/，可直接部署為靜態網站
npm run sim      # 經濟模擬：三種策略的通關時間與各階段耗時
```

## 架構（對應企劃書第十一章）

| 模組 | 檔案 |
| --- | --- |
| 靜態資料（樹種、設備、升級、成就、新聞） | `src/core/data.ts` |
| GameState、存檔遷移 | `src/core/state.ts` |
| TreeGenerator（種子＋索引，不預先生成） | `src/core/trees.ts` |
| Combat / Economy / Upgrade | `src/core/economy.ts` |
| SimulationSystem（固定步進、溢出、離線） | `src/core/sim.ts` |
| SaveService（IndexedDB＋localStorage 備援、匯出匯入） | `src/core/save.ts` |
| EventSystem（成就、新聞） | `src/core/events.ts` |
| SceneController（Three.js 街景、樹、斧頭、設備） | `src/scene/` |
| UIController（HUD、底部抽屜商店、設定、結局） | `src/ui/ui.ts` |

遊戲核心 `src/core/` 是純 TypeScript，不依賴 DOM 或 Three.js，`scripts/simulate.ts` 直接拿來跑模擬。

## 與企劃書不同之處

- **樹木 HP 隨進度平滑成長**：企劃書的樹木 HP 固定，但後期設備 DPS 高達數十萬，衛星還沒出現遊戲就會結束。因此改用 `HP_CURVE` 錨點對數內插的血量曲線：第一棵成樹約 15 HP，第 1,000 棵約 100、第 10,000 棵約 5,000、最後約 200 萬（再乘樹種、成長、健康倍率）。模擬後首次通關約 2.9 h（積極）／3.5 h（定期）／4.4 h（放置）。
- **特殊升級價格**：企劃書未定，數值見 `UPGRADES.cost`。
- **「批次結算效率 ×2」** 解讀為「設備砍倒的樹金幣 ×2」，這樣不論結算切得多細，結果都一樣。
- **3D 模型**：七種樹、斧頭、設備都用程式產生的低面數幾何（共用 Geometry/Material、InstancedMesh），沒有 GLB 檔，首屏不用額外下載。
- **New Game+（開始種樹）**：保留成就，每一輪 DPS 與金幣 +50%。
- **背景結算**：分頁隱藏 10 分鐘以內全速結算，超過的部分照離線規則算（50%，上限 8 小時）。

## 操作

- 手機：點「砍！」或直接點 3D 畫面；商店抽屜可以上滑展開。
- 桌面：按空白鍵或 A–Z 任一字母鍵砍伐，商店固定在右側欄。
- 設定：畫質（DPR 上限 1／1.5／2，高畫質開陰影）、音效、存檔匯出匯入、重置進度。
