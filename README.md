# Better Ledger

專業級本地離線記帳 App（React + IndexedDB），已可直接 demo 與持續擴充。

## 特色

- 月度總覽：收入 / 支出 / 結餘
- 交易明細：搜尋、篩選、分頁、編輯、刪除
- 新增交易：收入/支出 + 自訂分類
- 統計分析：支出圓餅圖 + 每日收支趨勢折線圖
- 預算管理：支出分類預算與超標提示
- 資料管理：
  - 匯出 JSON / CSV（本月）
  - 完整備份（設定 + 全部交易）
  - 匯入 JSON（支援月資料與完整備份）
- 完全本地儲存（IndexedDB）

## 技術

- React + Vite
- Zustand
- Dexie (IndexedDB)
- Chart.js + react-chartjs-2

## 開發

```bash
npm install
npm run dev
```

## 打包

```bash
npm run build
```

## 路線圖

1. 使用者登入 + 雲端同步（多裝置）
2. 重複交易（週/月）
3. 進階報表（同比/環比）
4. PWA 安裝與離線快取最佳化
