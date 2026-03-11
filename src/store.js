import { create } from 'zustand';
import { db, defaultCategories } from './db';

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

const defaultBudgets = Object.fromEntries(defaultCategories.expense.map((c) => [c, 0]));
const defaultAppCategories = {
  expense: [...defaultCategories.expense],
  income: [...defaultCategories.income],
};

const defaultGamification = {
  coins: 0,
  dailyEarned: 0,
  lastEarnDate: dayKey(),
  loginClaimedAt: '',
};

function normalizeGamification(raw) {
  const today = dayKey();
  const base = { ...defaultGamification, ...(raw || {}) };
  if (base.lastEarnDate !== today) {
    return { ...base, dailyEarned: 0, lastEarnDate: today, loginClaimedAt: '' };
  }
  return base;
}

export const useLedgerStore = create((set, get) => ({
  transactions: [],
  todos: [],
  settings: {
    currency: 'TWD',
    budgets: defaultBudgets,
    categories: defaultAppCategories,
    gamification: defaultGamification,
  },
  loading: false,

  async init() {
    set({ loading: true });
    const transactions = await db.transactions.orderBy('date').reverse().toArray();
    const todos = await db.todos.orderBy('createdAt').reverse().toArray();
    const currency = await db.settings.get('currency');
    const budgets = await db.settings.get('budgets');
    const categories = await db.settings.get('categories');
    const gamification = await db.settings.get('gamification');

    const mergedCategories = {
      expense: categories?.value?.expense?.length ? categories.value.expense : defaultAppCategories.expense,
      income: categories?.value?.income?.length ? categories.value.income : defaultAppCategories.income,
    };

    const normalizedBudgets = Object.fromEntries(mergedCategories.expense.map((c) => [c, Number(budgets?.value?.[c] || 0)]));
    let normalizedGame = normalizeGamification(gamification?.value);

    // daily login bonus: once per day, still respects max 10/day
    const today = dayKey();
    if (normalizedGame.loginClaimedAt !== today && normalizedGame.dailyEarned < 10) {
      normalizedGame = {
        ...normalizedGame,
        coins: Number(normalizedGame.coins || 0) + 1,
        dailyEarned: Number(normalizedGame.dailyEarned || 0) + 1,
        loginClaimedAt: today,
        lastEarnDate: today,
      };
      await db.settings.put({ key: 'gamification', value: normalizedGame });
    }

    set({
      transactions,
      todos,
      settings: {
        currency: currency?.value || 'TWD',
        budgets: normalizedBudgets,
        categories: mergedCategories,
        gamification: normalizedGame,
      },
      loading: false,
    });
  },

  async awardCoin() {
    const game = normalizeGamification(get().settings.gamification);
    if (game.dailyEarned >= 10) {
      if (game.lastEarnDate !== get().settings.gamification.lastEarnDate || game.dailyEarned !== get().settings.gamification.dailyEarned) {
        await db.settings.put({ key: 'gamification', value: game });
        set((s) => ({ settings: { ...s.settings, gamification: game } }));
      }
      return false;
    }

    const next = {
      ...game,
      coins: Number(game.coins || 0) + 1,
      dailyEarned: Number(game.dailyEarned || 0) + 1,
      lastEarnDate: dayKey(),
    };
    await db.settings.put({ key: 'gamification', value: next });
    set((s) => ({ settings: { ...s.settings, gamification: next } }));
    return true;
  },

  async addTransaction(tx) {
    const payload = { ...tx, createdAt: new Date().toISOString() };
    const id = await db.transactions.add(payload);
    set((s) => ({ transactions: [{ ...payload, id }, ...s.transactions] }));
    await get().awardCoin();
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

  async addTodo(todo) {
    const now = new Date().toISOString();
    const payload = {
      title: todo.title?.trim() || '',
      note: todo.note?.trim() || '',
      dueDate: todo.dueDate || '',
      completed: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (!payload.title) return;
    const id = await db.todos.add(payload);
    set((s) => ({ todos: [{ ...payload, id }, ...s.todos] }));
  },

  async updateTodo(id, patch) {
    const next = { ...patch, updatedAt: new Date().toISOString() };
    await db.todos.update(id, next);
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...next } : t)) }));
  },

  async toggleTodo(id) {
    const target = get().todos.find((t) => t.id === id);
    if (!target) return;
    const becameDone = !target.completed;
    await get().updateTodo(id, { completed: becameDone ? 1 : 0 });
    if (becameDone) await get().awardCoin();
  },

  async moveTodo(id, direction = 'up') {
    const list = [...get().todos];
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const a = list[idx];
    const b = list[targetIdx];
    await db.todos.update(a.id, { createdAt: b.createdAt, updatedAt: new Date().toISOString() });
    await db.todos.update(b.id, { createdAt: a.createdAt, updatedAt: new Date().toISOString() });

    const todos = await db.todos.orderBy('createdAt').reverse().toArray();
    set({ todos });
  },

  async deleteTodo(id) {
    await db.todos.delete(id);
    set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
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
