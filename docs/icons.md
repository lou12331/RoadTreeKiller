# 遊戲圖示

43 種透明 PNG 圖示由內建 ImageGen 逐張生成；完整提示詞保存在 `icon-prompts.json`。

- `public/icons/*.png`：128×128，主體置中並占畫面約 96%（只留極小透明邊）。
- `public/icons/small/*.png`：32×32，供分頁、價格及文字旁使用。金幣使用另外生成的簡化版本。
- 統一採用飽和色、深棕描邊、淺色外緣及左上方光源，適用於 `#1a1f25` 深色底。
- 設定齒輪、設備分頁的扳手與齒輪、粉碎機的旋轉鋸片分別使用獨立素材。
- 未解鎖項目使用灰階鎖頭；未知設備共用問號圖示，再套用灰階濾鏡。
- `✕`、乘號、播放三角形保留文字。

圖示路徑統一由 `src/core/icons.ts` 定義，設備、升級、成就的 `icon` 欄位使用有型別限制的圖片路徑。動態圖示經 `src/ui/icons.ts` 渲染；HTML 和動態路徑均支援 Vite 的 base 設定。裝飾圖片使用空白替代文字，鄰近文字與按鈕標籤提供可讀名稱。

若需重新縮放原圖，準備 JSON 對照表（圖示名稱到原圖絕對路徑，另包含 `coin-small`），安裝 Pillow 後執行：

```powershell
python scripts/prepare-icons.py path/to/manifest.json
```

腳本保留原圖與透明度，輸出兩組 PNG，並產生 `output/playwright/icons-preview.png` 深色底總覽供目視檢查。

原圖不在手邊時，可用 `python scripts/prepare-icons.py --repad` 直接把已輸出的 PNG 重新裁到可見內容並以 `FILL` 比例填滿。
