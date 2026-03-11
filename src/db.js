import Dexie from 'dexie';

export const db = new Dexie('better-ledger-db');

db.version(1).stores({
  transactions: '++id, date, type, category, amount, createdAt',
  settings: '&key',
});

// v2: add todo list table
// completed: 0/1 for easier filtering
// dueDate indexed for upcoming sorting
// updatedAt for last edit

db.version(2).stores({
  transactions: '++id, date, type, category, amount, createdAt',
  settings: '&key',
  todos: '++id, completed, dueDate, createdAt, updatedAt',
});

export const defaultCategories = {
  expense: ['餐飲', '交通', '購物', '娛樂', '帳單', '醫療', '其他'],
  income: ['薪資', '獎金', '投資', '退款', '其他'],
};
