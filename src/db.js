import Dexie from 'dexie';

export const db = new Dexie('better-ledger-db');

db.version(1).stores({
  transactions: '++id, date, type, category, amount, createdAt',
  settings: '&key',
});

export const defaultCategories = {
  expense: ['餐飲', '交通', '購物', '娛樂', '帳單', '醫療', '其他'],
  income: ['薪資', '獎金', '投資', '退款', '其他'],
};
