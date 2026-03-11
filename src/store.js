import { create } from 'zustand';
import { db, defaultCategories } from './db';

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const defaultBudgets = Object.fromEntries(defaultCategories.expense.map((c) => [c, 0]));
const defaultAppCategories = {
  expense: [...defaultCategories.expense],
  income: [...defaultCategories.income],
};

export const useLedgerStore = create((set, get) => ({
  transactions: [],
  settings: { currency: 'TWD', budgets: defaultBudgets, categories: defaultAppCategories },
  loading: false,

  async init() {
    set({ loading: true });
    const transactions = await db.transactions.orderBy('date').reverse().toArray();
    const currency = await db.settings.get('currency');
    const budgets = await db.settings.get('budgets');
    const categories = await db.settings.get('categories');

    const mergedCategories = {
      expense: categories?.value?.expense?.length ? categories.value.expense : defaultAppCategories.expense,
      income: categories?.value?.income?.length ? categories.value.income : defaultAppCategories.income,
    };

    const normalizedBudgets = Object.fromEntries(mergedCategories.expense.map((c) => [c, Number(budgets?.value?.[c] || 0)]));

    set({
      transactions,
      settings: {
        currency: currency?.value || 'TWD',
        budgets: normalizedBudgets,
        categories: mergedCategories,
      },
      loading: false,
    });
  },

  async addTransaction(tx) {
    const payload = { ...tx, createdAt: new Date().toISOString() };
    const id = await db.transactions.add(payload);
    set((s) => ({ transactions: [{ ...payload, id }, ...s.transactions] }));
  },

  async updateTransaction(id, patch) {
    await db.transactions.update(id, patch);
    set((s) => ({
      transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },

  async replaceAllTransactions(rows) {
    await db.transaction('rw', db.transactions, async () => {
      await db.transactions.clear();
      if (rows.length) await db.transactions.bulkAdd(rows);
    });
    const transactions = await db.transactions.orderBy('date').reverse().toArray();
    set({ transactions });
  },

  async deleteTransaction(id) {
    await db.transactions.delete(id);
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
  },

  async setCurrency(currency) {
    await db.settings.put({ key: 'currency', value: currency });
    set((s) => ({ settings: { ...s.settings, currency } }));
  },

  async setBudgets(budgets) {
    await db.settings.put({ key: 'budgets', value: budgets });
    set((s) => ({ settings: { ...s.settings, budgets } }));
  },

  async setCategories(categories) {
    await db.settings.put({ key: 'categories', value: categories });
    set((s) => ({ settings: { ...s.settings, categories } }));
  },

  summary(month = monthKey()) {
    const rows = get().transactions.filter((t) => {
      const dateValue = t?.date;
      if (!dateValue) return false;
      const normalized = typeof dateValue === 'string'
        ? dateValue.slice(0, 7)
        : new Date(dateValue).toISOString().slice(0, 7);
      return normalized === month;
    });
    const income = rows.filter((t) => t.type === 'income').reduce((a, b) => a + Number(b.amount), 0);
    const expense = rows.filter((t) => t.type === 'expense').reduce((a, b) => a + Number(b.amount), 0);
    return { income, expense, balance: income - expense, rows };
  },
}));
