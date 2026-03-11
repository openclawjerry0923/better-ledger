# Better Ledger

更好的本地離線記帳 MVP（React + Dexie/IndexedDB）。

## 已完成

- 月度總覽（收入 / 支出 / 結餘）
- 交易明細（刪除）
- 新增交易（收入 / 支出）
- 支出分類圓餅圖
- 幣別設定（TWD/JPY/USD）
- 所有資料保存在瀏覽器本機（IndexedDB）

## 啟動

```bash
npm install
npm run dev
```

## 打包

```bash
npm run build
```

## 下一步可做

1. 編輯交易、批次刪除
2. 搜尋/篩選（分類、金額區間、關鍵字）
3. 匯入/匯出 JSON/CSV
4. 預算功能（每分類上限）
5. 雲端同步（Supabase/Firebase）
