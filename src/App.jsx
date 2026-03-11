import { useEffect, useMemo, useState } from 'react';
import { Pie, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { defaultCategories } from './db';
import { useLedgerStore } from './store';
import './App.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);

const PAGE_SIZE = 10;

function money(n, c = 'TWD') {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n || 0);
}

function monthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toCsv(rows) {
  const head = 'date,type,category,amount,note';
  const body = rows.map((r) => [r.date, r.type, r.category, r.amount, `"${(r.note || '').replaceAll('"', '""')}"`].join(','));
  return [head, ...body].join('\n');
}

export default function App() {
  const { init, transactions, addTransaction, updateTransaction, deleteTransaction, replaceAllTransactions, summary, settings, setCurrency, setBudgets } = useLedgerStore();
  const [tab, setTab] = useState('home');
  const [month, setMonth] = useState(monthStr());
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [listMonth, setListMonth] = useState('all');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ type: 'expense', category: '餐飲', amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    setForm((f) => ({ ...f, category: defaultCategories[f.type][0] }));
  }, [form.type]);

  const data = useMemo(() => summary(month), [summary, month, transactions]);

  const baseRows = useMemo(() => {
    if (listMonth === 'all') return transactions;
    return transactions.filter((r) => r.date?.startsWith(listMonth));
  }, [transactions, listMonth]);

  const filteredRows = useMemo(() => baseRows.filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [r.category, r.note, r.date].join(' ').toLowerCase().includes(q);
  }), [baseRows, query, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, typeFilter, listMonth]);

  const byCategory = useMemo(() => {
    const map = {};
    filteredRows.filter((r) => r.type === 'expense').forEach((r) => { map[r.category] = (map[r.category] || 0) + Number(r.amount); });
    return map;
  }, [filteredRows]);

  const trendData = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const incomeArr = Array.from({ length: days }, () => 0);
    const expenseArr = Array.from({ length: days }, () => 0);

    data.rows.forEach((r) => {
      const d = Number(r.date.slice(-2)) - 1;
      if (d < 0 || d >= days) return;
      if (r.type === 'income') incomeArr[d] += Number(r.amount);
      else expenseArr[d] += Number(r.amount);
    });

    return {
      labels: Array.from({ length: days }, (_, i) => `${i + 1}`),
      datasets: [
        { label: '收入', data: incomeArr, borderColor: '#16a34a', backgroundColor: '#16a34a' },
        { label: '支出', data: expenseArr, borderColor: '#dc2626', backgroundColor: '#dc2626' },
      ],
    };
  }, [data.rows, month]);

  const budgetSpent = useMemo(() => {
    const map = {};
    data.rows.filter((r) => r.type === 'expense').forEach((r) => { map[r.category] = (map[r.category] || 0) + Number(r.amount); });
    return map;
  }, [data.rows]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ type: 'expense', category: '餐飲', amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount) return;
    const payload = { ...form, amount: Number(form.amount) };
    if (editingId) await updateTransaction(editingId, payload);
    else await addTransaction(payload);
    resetForm();
    setTab('list');
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setForm({ type: t.type, category: t.category, amount: t.amount, date: t.date, note: t.note || '' });
    setTab('add');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data.rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `better-ledger-${month}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(data.rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `better-ledger-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const backupAll = () => {
    const backup = { settings, transactions, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `better-ledger-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const clean = parsed.map((r) => ({
          type: r.type === 'income' ? 'income' : 'expense',
          category: r.category || '其他',
          amount: Number(r.amount || 0),
          date: r.date || new Date().toISOString().slice(0, 10),
          note: r.note || '',
          createdAt: r.createdAt || new Date().toISOString(),
        }));
        await replaceAllTransactions(clean);
        alert('匯入成功（覆蓋所有交易）');
      } else if (parsed.transactions && parsed.settings) {
        await replaceAllTransactions(parsed.transactions);
        if (parsed.settings.currency) await setCurrency(parsed.settings.currency);
        if (parsed.settings.budgets) await setBudgets(parsed.settings.budgets);
        alert('完整備份還原成功');
      } else {
        throw new Error('format');
      }
    } catch {
      alert('匯入失敗，請確認 JSON 格式');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="app">
      <header><h1>Better Ledger</h1><p>專業級本地記帳 · 乾淨、快速、可離線</p></header>

      <nav className="tabs">
        {[
          ['home', '總覽'], ['list', '明細'], ['add', editingId ? '編輯' : '新增'], ['stats', '統計'], ['settings', '設定'],
        ].map(([k, n]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{n}</button>)}
      </nav>

      {tab === 'home' && (
        <section className="cards">
          <label>月份 <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <div className="card"><span>收入</span><b>{money(data.income, settings.currency)}</b></div>
          <div className="card"><span>支出</span><b>{money(data.expense, settings.currency)}</b></div>
          <div className="card highlight"><span>結餘</span><b>{money(data.balance, settings.currency)}</b></div>
        </section>
      )}

      {tab === 'list' && (
        <section>
          <h2>交易明細</h2>
          <div className="toolbar toolbar3">
            <input placeholder="搜尋分類、備註、日期" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={listMonth} onChange={(e) => setListMonth(e.target.value)}>
              <option value="all">全部月份</option>
              <option value={monthStr()}>{monthStr()}</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">全部類型</option>
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <ul className="list">
            {pagedRows.map((t) => (
              <li key={t.id}>
                <div><b>{t.category}</b><small>{t.date} {t.note ? `· ${t.note}` : ''}</small></div>
                <div>
                  <span className={t.type}>{t.type === 'income' ? '+' : '-'}{money(t.amount, settings.currency)}</span>
                  <button onClick={() => startEdit(t)}>編輯</button>
                  <button onClick={() => deleteTransaction(t.id)}>刪除</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="pager">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</button>
            <span>{page} / {pageCount}</span>
            <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>下一頁</button>
          </div>
          {!filteredRows.length && <p className="empty">沒有符合條件的交易</p>}
        </section>
      )}

      {tab === 'add' && (
        <section>
          <h2>{editingId ? '編輯交易' : '新增交易'}</h2>
          <form onSubmit={submit} className="form">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">支出</option><option value="income">收入</option>
            </select>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {defaultCategories[form.type].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" placeholder="金額" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <input placeholder="備註" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button type="submit">{editingId ? '更新' : '儲存'}</button>
            {editingId && <button type="button" onClick={resetForm}>取消編輯</button>}
          </form>
        </section>
      )}

      {tab === 'stats' && (
        <section>
          <h2>統計與趨勢</h2>
          {Object.keys(byCategory).length ? (
            <>
              <Pie data={{ labels: Object.keys(byCategory), datasets: [{ data: Object.values(byCategory) }] }} options={{ plugins: { legend: { position: 'bottom' } } }} />
              <div style={{ marginTop: 24 }}>
                <Line data={trendData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
              </div>
            </>
          ) : <p className="empty">本月尚無支出資料</p>}
        </section>
      )}

      {tab === 'settings' && (
        <section className="form">
          <h2>設定</h2>
          <label>幣別
            <select value={settings.currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="TWD">TWD</option>
              <option value="JPY">JPY</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <h3>分類預算（每月）</h3>
          <div className="budgetGrid">
            {defaultCategories.expense.map((cat) => {
              const limit = Number(settings.budgets?.[cat] || 0);
              const spent = Number(budgetSpent[cat] || 0);
              const over = limit > 0 && spent > limit;
              return (
                <label key={cat}>
                  {cat} {over ? '⚠️' : ''}
                  <input
                    type="number"
                    value={limit}
                    onChange={(e) => setBudgets({ ...settings.budgets, [cat]: Number(e.target.value || 0) })}
                  />
                  <small>{limit > 0 ? `已用 ${money(spent, settings.currency)} / ${money(limit, settings.currency)}` : `已用 ${money(spent, settings.currency)}`}</small>
                </label>
              );
            })}
          </div>
          <div className="actions">
            <button type="button" onClick={exportJson}>匯出 JSON（本月）</button>
            <button type="button" onClick={exportCsv}>匯出 CSV（本月）</button>
            <button type="button" onClick={backupAll}>完整備份（設定+全部交易）</button>
            <label className="importLabel">匯入 JSON（可月資料或完整備份）
              <input type="file" accept="application/json" onChange={importJson} />
            </label>
          </div>
        </section>
      )}
    </div>
  );
}
