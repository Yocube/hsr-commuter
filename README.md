# 高鐵通勤票券最佳化 (hsr-commuter)

高鐵新竹 ⇌ 台北通勤:在行事曆標記請假與加班,自動算出每一期該買月票、回數票還是全票,
讓未來的平均每趟成本最低。純前端 PWA,資料存在手機瀏覽器(IndexedDB),可離線使用。

- 規格書:[docs/spec.md](docs/spec.md)
- 第一階段:行事曆(預設規則 + 手動覆寫)、精算引擎、結果表格

## 開發

```bash
npm install
npm run dev     # 本機開發
npm test        # 計算引擎與行事曆的自動測試
npm run build   # 建置到 dist/
```

## 部署

推送到 `main` 後由 GitHub Actions 測試並部署到 GitHub Pages。
首次需在 repo 的 Settings → Pages → Source 選擇「GitHub Actions」。
網址:`https://yocube.github.io/hsr-commuter/`

## 程式結構

- `src/engine/` 計算引擎(與畫面無關,附自動測試)
- `src/calendar/` 預設進/不進台北規則與手動覆寫
- `src/data/holidays.json` 內建 2026–2027 國定假日(來源:ruyut/TaiwanCalendar,依人事行政總處公告整理)
- `src/ui/` 手機畫面
