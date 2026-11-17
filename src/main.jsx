import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, Bell, Check, ChevronDown, CircleHelp,
  Copy, Download, Edit3, FileText, Home, LayoutDashboard, Menu, MoreHorizontal,
  Mail, MessageCircle, Phone, Plane, Plus, Receipt, Search, Settings, Sparkles, Trash2, TrendingUp, Upload,
  Users, X, Wifi, WifiOff, PieChart, Wallet, RefreshCw, KeyRound,
  Trophy
} from 'lucide-react';
import './styles.css';

const money = (value) => `₹${Math.abs(Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const frequencies = ['Daily', 'Weekly', 'Monthly', 'Yearly'];
const categories = ['Food', 'Groceries', 'Utilities', 'Rent', 'Travel', 'Shopping', 'Entertainment', 'Other'];

const seed = {
  groups: [{ id: 'flat-302', name: 'My group', description: 'Add people to start sharing expenses', color: '#2c7a7b', inviteCode: 'FLAT302', members: [{ id: 'me', name: 'You', initials: 'YO', role: 'Admin' }] }],
  expenses: [], deletedExpenses: [], settlements: [], recurring: [], budgets: [], messages: []
};
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem('settleup-data-v2'));
    const groups = saved?.groups?.length ? saved.groups.map((group) => ({ ...group, inviteCode: group.inviteCode || `${group.id.slice(0, 6)}JOIN`.toUpperCase() })) : seed.groups;
    return saved ? { ...seed, ...saved, groups } : seed;
  } catch { return seed; }
}
const saveLocal = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const nameOf = (members, id) => members.find((m) => m.id === id)?.name || 'Unknown';

function App() {
  const [data, setData] = useState(loadData);
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem('settleup-auth')) || null; } catch { return null; } });
  const [page, setPage] = useState('Dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('settleup-dark') === 'true');
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const activeGroup = data.groups[0] || seed.groups[0];
  const members = activeGroup.members || [];
  const expenses = data.expenses.filter((e) => e.groupId === activeGroup.id);

  useEffect(() => {
    document.body.classList.toggle('dark-mode', dark);
    localStorage.setItem('settleup-dark', String(dark));
  }, [dark]);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const receive = (e) => setInstallPrompt(e);
    window.addEventListener('beforeinstallprompt', receive);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').then((registration) => registration.update()).catch(() => {});
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('beforeinstallprompt', receive); };
  }, []);
  // Generate due recurring expenses once per session, keeping the MVP local-first.
  useEffect(() => {
    const last = localStorage.getItem('settleup-recurring-run');
    if (last === today || !data.recurring?.length) return;
    const due = data.recurring.filter((r) => !r.nextDate || r.nextDate <= today);
    if (!due.length) return;
    const generated = due.map((r) => ({ ...r, id: uid(), date: today, recurringId: r.id, generated: true }));
    const nextRecurring = data.recurring.map((r) => ({ ...r, nextDate: advanceDate(today, r.frequency) }));
    const next = { ...data, expenses: [...generated, ...data.expenses], recurring: nextRecurring };
    setData(next); saveLocal('settleup-data-v2', next); localStorage.setItem('settleup-recurring-run', today);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next, message) => { setData(next); saveLocal('settleup-data-v2', next); if (message) { setToast(message); setTimeout(() => setToast(''), 2600); } };
  const sendContactMessage = (message) => {
    const cleanMessage = String(message || '').trim();
    if (!cleanMessage) return false;
    update({ ...data, messages: [{ id: uid(), from: auth.user.email, name: auth.user.name, message: cleanMessage, createdAt: new Date().toISOString(), status: 'unread' }, ...(data.messages || [])] }, 'Message sent to admin inbox');
    return true;
  };
  const balances = useMemo(() => {
    const result = Object.fromEntries(members.map((m) => [m.id, 0]));
    const cents = (id, amount) => { if (result[id] !== undefined) result[id] += Math.round(Number(amount) * 100); };
    expenses.forEach((e) => { cents(e.paidBy, e.amount); Object.entries(e.shares || {}).forEach(([id, share]) => cents(id, -share)); });
    data.settlements.filter((s) => s.groupId === activeGroup.id && s.status === 'paid').forEach((s) => { cents(s.from, s.amount); cents(s.to, -s.amount); });
    return Object.fromEntries(Object.entries(result).map(([id, value]) => [id, value / 100]));
  }, [data, expenses, members, activeGroup.id]);
  const pending = useMemo(() => simplify(members, balances), [members, balances]);
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  if (!auth) return <AuthScreen onAuth={(result) => { setAuth(result); saveLocal('settleup-auth', result); }} />;

  const nav = (name) => { setPage(name); setMenuOpen(false); };
  const addExpense = (form, editingId) => {
    const amount = Number(form.amount);
    if (!form.description.trim() || !Number.isFinite(amount) || amount <= 0) return setToast('Enter a description and valid amount.');
    const split = buildShares(form, members, amount);
    if (split.error) return setToast(split.error);
    const cleanDescription = String(form.description || form.title || '').replace(/[\[\]{}"]/g, '').trim();
    const expense = { ...form, description: cleanDescription, title: cleanDescription, amount, shares: split.shares, splitType: form.splitType || 'equal', id: editingId || uid(), groupId: activeGroup.id, date: form.date || today, createdAt: form.createdAt || today };
    const nextExpenses = editingId ? data.expenses.map((e) => e.id === editingId ? expense : e) : [expense, ...data.expenses];
    update({ ...data, expenses: nextExpenses }, editingId ? 'Expense updated' : 'Expense added successfully'); setModal(null);
  };
  const deleteExpense = (id) => {
    const expense = data.expenses.find((e) => e.id === id);
    if (!expense) return;
    setModal({ type: 'delete', expense });
  };
  const confirmDeleteExpense = (expense) => {
    update({ ...data, expenses: data.expenses.filter((e) => e.id !== expense.id), deletedExpenses: [{ ...expense, deletedBy: auth.user.name, deletedAt: new Date().toISOString() }, ...(data.deletedExpenses || [])] }, 'Expense deleted and recorded');
    setModal(null);
  };
  const recordPayment = (item, amount, dueDate, method = 'Other', note = '') => {
    const payment = Number(amount);
    if (!Number.isFinite(payment) || payment <= 0 || payment > item.amount) return setToast(`Enter an amount from ₹0.01 to ${money(item.amount)}.`);
    update({ ...data, settlements: [...data.settlements, { ...item, id: uid(), groupId: activeGroup.id, status: 'paid', amount: Math.round(payment * 100) / 100, date: dueDate || today, method, note, dueDate: dueDate || null }] }, payment === item.amount ? 'Settlement paid in full' : 'Partial payment recorded');
  };
  const addRecurring = (form) => {
    const amount = Number(form.amount);
    if (!form.description.trim() || amount <= 0) return setToast('Enter a description and amount.');
    update({ ...data, recurring: [{ ...form, id: uid(), groupId: activeGroup.id, amount, nextDate: form.nextDate || today }, ...(data.recurring || [])] }, 'Recurring expense saved'); setModal(null);
  };
  const addBudget = (form) => {
    const limit = Number(form.limit);
    if (!form.category || limit <= 0) return setToast('Enter a valid budget limit.');
    update({ ...data, budgets: [{ ...form, id: uid(), groupId: activeGroup.id, limit }, ...(data.budgets || []).filter((b) => !(b.groupId === activeGroup.id && b.category === form.category))] }, 'Budget saved'); setModal(null);
  };
  const joinGroup = (code) => {
    if (!code.trim()) return setToast('Enter an invite code.');
    if (code.trim().toUpperCase() !== activeGroup.inviteCode) return setToast('That invite code was not found.');
    if (!members.some((m) => m.id === 'me')) return;
    setToast('You are already a member of this group.');
  };
  const downloadReceipt = (s) => { const text = `Settlements payment receipt\n${nameOf(members, s.from)} paid ${nameOf(members, s.to)}\nAmount: ${money(s.amount)}\nDate: ${s.date || today}`; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); link.download = `settlements-receipt-${s.id}.txt`; link.click(); };
  const filtered = expenses.filter((e) => `${e.description} ${e.category}`.toLowerCase().includes(query.toLowerCase()));

  const links = [['Dashboard', LayoutDashboard], ['Expenses', Receipt], ['Analytics', PieChart], ['AI Assistant', Sparkles], ['Budgets', Wallet], ['Recurring', RefreshCw], ['Balances', BarChart3], ['Settlements', ArrowUpRight], ['Groups', Users], ['Premium', Trophy]];
  return <div className={`app-shell ${dark ? 'theme-dark' : ''}`}>
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}><div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>settle<span>ments</span></span></div><div className="workspace-label">WORKSPACE</div><button className="group-picker"><div className="group-dot" />{activeGroup.name}<ChevronDown size={15} /></button><nav>{links.map(([name, Icon]) => <button key={name} onClick={() => nav(name)} className={page === name ? 'active' : ''}><Icon size={18} />{name}{name === 'Settlements' && pending.length > 0 && <b className="nav-badge">{pending.length}</b>}</button>)}</nav><div className="sidebar-bottom"><button onClick={() => setPage('Settings')}><Settings size={18} />Settings</button><button onClick={() => setModal({ type: 'contact' })}><CircleHelp size={18} />Contact us</button><button className="profile" onClick={() => setProfileOpen(true)}><div className="avatar">{(auth.user.name || 'You').slice(0, 2).toUpperCase()}</div><div><strong>{auth.user.name}</strong><small>{auth.user.email}</small></div><MoreHorizontal size={17} /></button></div></aside>
    <main className="main"><header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu /></button><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{page}</strong></div><div className="top-actions"><div className="top-search"><Search size={17} /><input placeholder="Search expenses..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><span className={`online-status ${online ? 'online' : 'offline'}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? 'Online' : 'Offline'}</span>{installPrompt && <button className="install-button" onClick={async () => { installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}>Install app</button>}<div className="notification-wrap"><button className="icon-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Open notifications"><Bell size={19} /><i /></button>{notificationsOpen && <div className="notification-panel"><strong>Notifications</strong><p>{pending.length ? `${pending.length} settlement${pending.length > 1 ? 's' : ''} waiting.` : 'Everything is settled.'}</p><p>{online ? 'Changes are synced locally.' : 'Offline mode: changes will stay on this device.'}</p></div>}</div><button className="avatar small top-profile" onClick={() => setProfileOpen(true)}>{(auth.user.name || 'You').slice(0, 2).toUpperCase()}</button></div></header>
      <div className="content">
        {page === 'Dashboard' && <Dashboard total={total} expenses={expenses} members={members} pending={pending} balances={balances} onAdd={() => setModal({ type: 'expense' })} onSettle={() => nav('Settle up')} onAnalytics={() => nav('Analytics')} />}
        {page === 'Expenses' && <Expenses expenses={filtered} deletedExpenses={(data.deletedExpenses || [])} members={members} currentUser={auth.user} onAdd={() => setModal({ type: 'expense' })} onEdit={(e) => setModal({ type: 'expense', expense: e })} onDelete={deleteExpense} />}
        {page === 'Analytics' && <Analytics expenses={expenses} members={members} total={total} />}
        {page === 'AI Assistant' && <AIAssistant expenses={expenses} budgets={(data.budgets || []).filter((b) => b.groupId === activeGroup.id)} total={total} />}
        {page === 'Budgets' && <Budgets budgets={(data.budgets || []).filter((b) => b.groupId === activeGroup.id)} expenses={expenses} onAdd={() => setModal({ type: 'budget' })} onDelete={(id) => update({ ...data, budgets: data.budgets.filter((b) => b.id !== id) }, 'Budget removed')} />}
        {page === 'Recurring' && <Recurring recurring={(data.recurring || []).filter((r) => r.groupId === activeGroup.id)} onAdd={() => setModal({ type: 'recurring' })} onDelete={(id) => update({ ...data, recurring: data.recurring.filter((r) => r.id !== id) }, 'Recurring expense removed')} />}
        {page === 'Balances' && <Balances members={members} balances={balances} expenses={expenses} />}
        {page === 'Settlements' && <SettleUp pending={pending} members={members} history={data.settlements.filter((s) => s.groupId === activeGroup.id)} onPayment={(item) => setModal({ type: 'payment', item })} onReminder={(item) => setToast(`Reminder ready for ${nameOf(members, item.from)}.`)} onReceipt={downloadReceipt} />}
        {page === 'Groups' && <Groups groups={data.groups} active={activeGroup} onAdd={() => setModal({ type: 'group' })} onJoin={() => setModal({ type: 'join' })} onAddMember={() => setModal({ type: 'member' })} onCopy={() => { navigator.clipboard?.writeText(activeGroup.inviteCode); setToast('Invite code copied'); }} />}
        {page === 'Premium' && <PremiumPackage />}
        {page === 'Settings' && <SettingsPage dark={dark} setDark={setDark} user={auth.user} onVerify={(channel) => setModal({ type: `verify-${channel}` })} onTwoFactor={() => setModal({ type: 'twofa' })} />}
      </div></main>
    {modal?.type === 'expense' && <ExpenseModal members={members} expense={modal.expense} onClose={() => setModal(null)} onSave={(f) => addExpense(f, modal.expense?.id)} />}
    {modal?.type === 'delete' && <Modal title="Delete expense?" subtitle="Deleting this expense can change group balances. This action cannot be undone." onClose={() => setModal(null)}><div className="modal-actions"><button className="outline" onClick={() => setModal(null)}>Keep expense</button><button className="danger-button" onClick={() => confirmDeleteExpense(modal.expense)}><Trash2 size={16} />Delete expense</button></div></Modal>}
    {modal?.type === 'payment' && <PaymentModal item={modal.item} onClose={() => setModal(null)} onSave={(form) => { recordPayment(modal.item, form.amount, form.date, form.method, form.note); setModal(null); }} />}
    {modal?.type === 'recurring' && <RecurringModal members={members} onClose={() => setModal(null)} onSave={addRecurring} />}
    {modal?.type === 'budget' && <BudgetModal onClose={() => setModal(null)} onSave={addBudget} />}
    {modal?.type === 'group' && <GroupModal onClose={() => setModal(null)} onSave={(name) => { update({ ...data, groups: [...data.groups, { id: uid(), name, description: 'New expense group', color: '#805ad5', inviteCode: uid().toUpperCase().slice(0, 8), members: [{ ...members[0] }] }] }, 'Group created'); setModal(null); }} />}
    {modal?.type === 'join' && <JoinModal onClose={() => setModal(null)} onSave={(code) => { joinGroup(code); setModal(null); }} />}
    {modal?.type === 'member' && <MemberModal onClose={() => setModal(null)} onSave={(member) => { update({ ...data, groups: data.groups.map((g) => g.id === activeGroup.id ? { ...g, members: [...g.members, member] } : g) }, 'Member added'); setModal(null); }} />}
    {modal?.type === 'verify-email' && <VerifyModal channel="email" destination={auth.user.email} onClose={() => setModal(null)} onDone={() => { const next = { ...auth, user: { ...auth.user, emailVerified: true } }; setAuth(next); saveLocal('settleup-auth', next); setToast('Email verified'); setModal(null); }} />}
    {modal?.type === 'verify-phone' && <VerifyModal channel="phone" destination={auth.user.phone} onClose={() => setModal(null)} onDone={() => { const next = { ...auth, user: { ...auth.user, phoneVerified: true } }; setAuth(next); saveLocal('settleup-auth', next); setToast('Phone number verified'); setModal(null); }} />}
    {modal?.type === 'twofa' && <TwoFactorModal onClose={() => setModal(null)} onDone={() => { setToast('Two-factor authentication enabled'); setModal(null); }} />}
    {modal?.type === 'contact' && <ContactModal onClose={() => setModal(null)} onSend={sendContactMessage} />}
    {profileOpen && <ProfileModal user={auth.user} onClose={() => setProfileOpen(false)} onSave={(profile) => { const next = { ...auth, user: { ...auth.user, ...profile } }; setAuth(next); saveLocal('settleup-auth', next); setProfileOpen(false); setToast('Profile details updated'); }} onLogout={() => { localStorage.removeItem('settleup-auth'); setAuth(null); }} />}
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>;
}

function buildShares(form, members, amount) {
  const ids = (form.participants || members.map((m) => m.id)).filter((id) => members.some((m) => m.id === id));
  if (!ids.length) return { error: 'Select at least one participant.' };
  if (form.splitType === 'percentage') {
    const total = ids.reduce((s, id) => s + Number(form.values?.[id] || 0), 0);
    if (Math.abs(total - 100) > 0.01) return { error: 'Percentages must add up to 100%.' };
    return { shares: Object.fromEntries(ids.map((id) => [id, Math.round(amount * Number(form.values[id]) / 100 * 100) / 100])) };
  }
  if (form.splitType === 'exact' || form.splitType === 'item-wise') {
    const values = ids.map((id) => Number(form.values?.[id] || 0));
    if (Math.abs(values.reduce((s, v) => s + v, 0) - amount) > 0.01) return { error: `${form.splitType === 'exact' ? 'Exact shares' : 'Item totals'} must add up to ${money(amount)}.` };
    return { shares: Object.fromEntries(ids.map((id, i) => [id, values[i]])) };
  }
  if (form.splitType === 'shares') {
    const values = ids.map((id) => Number(form.values?.[id] || 0));
    if (values.some((value) => !Number.isInteger(value) || value <= 0)) return { error: 'Shares must be positive whole numbers.' };
    const totalShares = values.reduce((sum, value) => sum + value, 0);
    if (!totalShares) return { error: 'Add at least one share.' };
    const cents = Math.round(amount * 100);
    const base = values.map((value) => Math.floor(cents * value / totalShares));
    let remainder = cents - base.reduce((sum, value) => sum + value, 0);
    for (let index = 0; remainder > 0; index = (index + 1) % base.length, remainder -= 1) base[index] += 1;
    return { shares: Object.fromEntries(ids.map((id, i) => [id, base[i] / 100])) };
  }
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / ids.length);
  const shares = ids.map(() => base);
  for (let index = 0; index < cents - base * ids.length; index += 1) shares[index] += 1;
  return { shares: Object.fromEntries(ids.map((id, i) => [id, shares[i] / 100])) };
}
function advanceDate(date, frequency) { const d = new Date(date); if (frequency === 'Weekly') d.setDate(d.getDate() + 7); else if (frequency === 'Yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); }
function simplify(members, balances) {
  const creditors = members.map((m) => ({ id: m.id, cents: Math.max(0, Math.round((balances[m.id] || 0) * 100)) })).filter((x) => x.cents).sort((a, b) => b.cents - a.cents);
  const debtors = members.map((m) => ({ id: m.id, cents: Math.max(0, Math.round(-(balances[m.id] || 0) * 100)) })).filter((x) => x.cents).sort((a, b) => b.cents - a.cents);
  const result = []; let i = 0; let j = 0; while (i < debtors.length && j < creditors.length) { const cents = Math.min(debtors[i].cents, creditors[j].cents); result.push({ from: debtors[i].id, to: creditors[j].id, amount: cents / 100 }); debtors[i].cents -= cents; creditors[j].cents -= cents; if (!debtors[i].cents) i++; if (!creditors[j].cents) j++; } return result;
}
const categorySignals = {
  Food: ['zomato', 'swiggy', 'restaurant', 'dinner', 'lunch', 'breakfast', 'meal', 'cafe', 'food'],
  Travel: ['uber', 'ola', 'flight', 'taxi', 'hotel', 'train', 'travel', 'metro'],
  Shopping: ['amazon', 'flipkart', 'shopping', 'clothes', 'myntra'],
  Utilities: ['electricity', 'water bill', 'internet', 'phone bill', 'recharge', 'utility'],
  Entertainment: ['movie', 'netflix', 'spotify', 'concert', 'entertainment'],
  Groceries: ['grocery', 'groceries', 'vegetables', 'supermarket', 'milk']
};
function suggestCategory(text) {
  const normalized = String(text || '').toLowerCase();
  const match = Object.entries(categorySignals).find(([, signals]) => signals.some((signal) => normalized.includes(signal)));
  return { category: match?.[0] || 'Other', confidence: match ? 97 : 62 };
}
function parseNaturalLanguageExpense(text, members) {
  const value = String(text || '').trim();
  const amountMatch = value.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i) || value.match(/\b([\d,]+(?:\.\d{1,2})?)\b/);
  const amount = amountMatch ? amountMatch[1].replace(/,/g, '') : '';
  const category = suggestCategory(value).category;
  const description = value.replace(/(?:i\s+)?paid\s+(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:for|on)?/i, '').replace(/\s+(?:yesterday|today)$/i, '').trim();
  const participantNames = value.match(/\bwith\s+(.+?)(?:\s+yesterday|\s+today|$)/i)?.[1]?.split(/\s+and\s+|,\s*/i).map((name) => name.trim()).filter(Boolean) || [];
  const participants = members.filter((member) => member.id === 'me' || participantNames.some((name) => member.name.toLowerCase().includes(name.toLowerCase()))).map((member) => member.id);
  return { description: description || 'New expense', amount, category, date: /yesterday/i.test(value) ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : today, participants: participants.length ? participants : members.map((member) => member.id), splitType: 'equal' };
}
function parseReceiptText(text) {
  const value = String(text || '');
  const amountMatches = [...value.matchAll(/(?:total|amount|grand total)[^\d₹]*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/ig)];
  const fallbackAmount = [...value.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/ig)];
  const amount = (amountMatches.at(-1)?.[1] || fallbackAmount.at(-1)?.[1] || '').replace(/,/g, '');
  const date = value.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/)?.[1]?.replace(/\//g, '-') || today;
  const description = value.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !/total|amount|date|receipt/i.test(line)) || 'Receipt expense';
  return { description, amount, date, ...suggestCategory(value) };
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name: '', email: '', password: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => { event.preventDefault(); setError(''); if (mode === 'register' && form.name.trim().length < 2) return setError('Please enter your full name.'); if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Please enter a valid email address.'); if (form.password.length < 8) return setError('Password must be at least 8 characters.'); setBusy(true); try { const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const body = await response.text(); let result = {}; try { result = body ? JSON.parse(body) : {}; } catch { result = {}; } if (!response.ok && response.status >= 500) { onAuth({ user: { id: uid(), name: form.name.trim() || form.email.split('@')[0], email: form.email, emailVerified: false }, token: 'offline-session' }); return; } if (!response.ok) throw new Error(result.message || result.error || 'Unable to sign in.'); onAuth(result); } catch (e) { if (e instanceof TypeError || e.message.includes('fetch')) onAuth({ user: { id: uid(), name: form.name.trim() || form.email.split('@')[0], email: form.email, emailVerified: false }, token: 'offline-session' }); else setError(e.message); } finally { setBusy(false); } };
  return <div className="auth-shell"><div className="auth-card"><div className="auth-brand"><div className="brand-mark"><Sparkles size={17} /></div><span>settle<span>ments</span></span></div><div className="auth-copy"><p className="eyebrow">SHARED EXPENSES, MADE SIMPLE</p><h1>{mode === 'forgot' ? 'Reset your password' : mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p>{mode === 'forgot' ? 'We’ll send a reset link to your email.' : 'Start splitting expenses with your friends in minutes.'}</p></div>{mode !== 'forgot' && <div className="auth-tabs"><button className={mode === 'login' ? 'selected' : ''} onClick={() => setMode('login')}>Sign in</button><button className={mode === 'register' ? 'selected' : ''} onClick={() => setMode('register')}>Create account</button></div>}{mode === 'forgot' ? <ForgotForm onBack={() => setMode('login')} /> : <form onSubmit={submit}>{mode === 'register' && <label>Full name<input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>}<label>Email address<input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Password<input type="password" placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>{mode === 'login' && <button type="button" className="text-button forgot-link" onClick={() => setMode('forgot')}>Forgot password?</button>}{error && <div className="auth-error">{error}</div>}<button className="primary auth-submit" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'} {!busy && <ArrowUpRight size={16} />}</button></form>}<p className="auth-foot">{mode === 'login' ? 'New to Settlements? ' : 'Already have an account? '}<button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p></div></div>;
}
function ForgotForm({ onBack }) { const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); return sent ? <div className="auth-success">Reset link sent to {email}. Check your inbox (MVP demo).<button className="text-button" onClick={onBack}>Back to sign in</button></div> : <form onSubmit={(e) => { e.preventDefault(); if (/^\S+@\S+\.\S+$/.test(email)) setSent(true); }}><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><button className="primary auth-submit">Send reset link</button><button type="button" className="text-button full" onClick={onBack}>Back to sign in</button></form>; }

function Dashboard({ total, expenses, members, pending, balances, onAdd, onSettle, onAnalytics }) { const byCat = expenses.reduce((a, e) => ({ ...a, [e.category]: (a[e.category] || 0) + Number(e.amount) }), {}); const owe = Math.max(0, -(balances.me || 0)); const get = Math.max(0, balances.me || 0); return <><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Good evening, there 👋</h1><p className="muted">Here’s your shared expenses at a glance.</p></div><button className="primary" onClick={onAdd}><Plus size={18} />Add expense</button></div><section className="summary-grid"><Stat label="You owe" value={money(owe)} icon={ArrowDownLeft} tone="red" hint={owe ? 'Needs your attention' : 'All settled'} /><Stat label="You are owed" value={money(get)} icon={ArrowUpRight} tone="green" hint={get ? 'Coming your way' : 'Nothing pending'} /><Stat label="Group spending" value={money(total)} icon={Receipt} tone="blue" hint={`${expenses.length} expenses total`} /><Stat label="Pending settlements" value={pending.length} icon={Sparkles} tone="purple" hint={pending.length ? 'Needs attention' : 'Everything is settled'} /></section><div className="dashboard-grid"><section className="panel recent"><div className="panel-head"><div><h2>Recent expenses</h2><p>Latest activity</p></div><button className="text-button" onClick={onAdd}>Add new <ArrowUpRight size={15} /></button></div>{expenses.slice(0, 5).map((e) => <ExpenseRow key={e.id} expense={e} members={members} />)}{!expenses.length && <Empty text="No expenses yet" />}</section><section className="panel settle-card"><div className="panel-head"><div><h2>Settlements</h2><p>Fewer payments, less hassle.</p></div><Sparkles className="sparkle" size={20} /></div>{pending.slice(0, 3).map((s) => <SettlementRow key={`${s.from}-${s.to}`} item={s} members={members} />)}{!pending.length && <Empty text="Everyone is settled!" />}<button className="outline full" onClick={onSettle}>View settlements</button></section><section className="panel chart-panel"><div className="panel-head"><div><h2>Spending overview</h2><p>By category</p></div><button className="text-button" onClick={onAnalytics}>Full analytics <ArrowUpRight size={14} /></button></div><div className="bars">{Object.entries(byCat).map(([cat, value]) => <div className="bar-line" key={cat}><span>{cat}</span><div className="bar-track"><i style={{ width: `${total ? Math.max(6, value / total * 100) : 0}%` }} /></div><b>{money(value)}</b></div>)}{!Object.keys(byCat).length && <Empty text="Add an expense to see insights" />}</div></section></div></>; }
function Stat({ label, value, icon: Icon, tone, hint }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>; }
function ExpenseRow({ expense, members }) { return <div className="expense-row"><div className={`category-icon ${expense.category?.toLowerCase()}`}><Receipt size={17} /></div><div className="row-main"><strong>{expense.description}</strong><small>{expense.category} · {new Date(expense.date).toLocaleDateString('en-IN')}</small>{expense.receipt && <a className="receipt-link" href={expense.receipt} target="_blank" rel="noreferrer">Receipt attached</a>}</div><div className="payer"><div className="avatar tiny">{nameOf(members, expense.paidBy).slice(0, 2).toUpperCase()}</div><span>{nameOf(members, expense.paidBy)}</span></div><strong className="amount">{money(expense.amount)}</strong></div>; }
function Expenses({ expenses, deletedExpenses, members, currentUser, onAdd, onEdit, onDelete }) { const [category, setCategory] = useState('All'); const [member, setMember] = useState('All'); const [paidBy, setPaidBy] = useState('All'); const [sort, setSort] = useState('newest'); const visible = [...expenses].filter((e) => category === 'All' || e.category === category).filter((e) => paidBy === 'All' || e.paidBy === paidBy).filter((e) => member === 'All' || Object.keys(e.shares || {}).includes(member)).sort((a, b) => { if (sort === 'oldest') return new Date(a.date) - new Date(b.date); if (sort === 'highest') return Number(b.amount) - Number(a.amount); if (sort === 'lowest') return Number(a.amount) - Number(b.amount); return new Date(b.date) - new Date(a.date); }); return <><div className="page-heading"><div><p className="eyebrow">ACTIVITY</p><h1>Expenses</h1><p className="muted">Search, filter, and keep a complete history.</p></div><button className="primary" onClick={onAdd}><Plus size={18} />Add expense</button></div><section className="panel"><div className="table-toolbar"><div><h2>All expenses</h2><p>{visible.length} records found</p></div><button className="outline" onClick={() => downloadCsv(visible)}><Download size={16} />Export CSV</button></div><div className="expense-filters"><select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}><option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by member" value={member} onChange={(e) => setMember(e.target.value)}><option value="All">All members</option>{members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select aria-label="Filter by paid by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}><option value="All">Everyone paid</option>{members.map((item) => <option value={item.id} key={item.id}>{item.name} paid</option>)}</select><select aria-label="Sort expenses" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="highest">Highest amount</option><option value="lowest">Lowest amount</option></select><button className="text-button" onClick={() => { setCategory('All'); setMember('All'); setPaidBy('All'); setSort('newest'); }}>Clear filters</button></div><div className="expense-list">{visible.map((e) => <div key={e.id} className="expense-row"><ExpenseRow expense={e} members={members} /><div className="row-actions"><button className="edit-button" onClick={() => onEdit(e)} title="Edit expense" aria-label="Edit expense"><Edit3 size={16} /></button><button className="delete-button" onClick={() => onDelete(e.id)} title="Delete expense" aria-label="Delete expense"><Trash2 size={16} /></button></div></div>)}{!visible.length && <Empty text="No matching expenses" />}</div></section><section className="panel deleted-panel"><div className="table-toolbar"><div><h2>Expense history</h2><p>Deleted records are retained locally</p></div></div><div className="expense-list">{deletedExpenses.map((e) => <div key={`${e.id}-${e.deletedAt}`} className="expense-row deleted-row"><div className="category-icon deleted-icon"><Trash2 size={17} /></div><div className="row-main"><strong>{e.description}</strong><small>Deleted {new Date(e.deletedAt).toLocaleDateString('en-IN')}</small></div><span>by {e.deletedBy || currentUser.name}</span><strong className="amount deleted-amount">{money(e.amount)}</strong></div>)}{!deletedExpenses.length && <Empty text="No deleted expenses" />}</div></section></>; }
function Analytics({ expenses, members, total }) { const byCat = expenses.reduce((a, e) => ({ ...a, [e.category]: (a[e.category] || 0) + Number(e.amount) }), {}); const byMonth = expenses.reduce((a, e) => { const key = (e.date || today).slice(0, 7); a[key] = (a[key] || 0) + Number(e.amount); return a; }, {}); return <><div className="page-heading"><div><p className="eyebrow">INSIGHTS</p><h1>Analytics dashboard</h1><p className="muted">Understand where your group’s money goes.</p></div></div><section className="summary-grid"><Stat label="Total spent" value={money(total)} icon={Receipt} tone="blue" hint="All time on this device" /><Stat label="Average expense" value={money(expenses.length ? total / expenses.length : 0)} icon={BarChart3} tone="purple" hint={`${expenses.length} records`} /><Stat label="Top category" value={Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'} icon={PieChart} tone="green" hint="Highest spend" /><Stat label="Members" value={members.length} icon={Users} tone="red" hint="In this group" /></section><div className="analytics-grid"><section className="panel"><div className="panel-head"><div><h2>Category breakdown</h2><p>Visual summary of spending</p></div></div><div className="donut-chart" style={{ '--percent': `${total ? 100 : 0}%` }}><strong>{money(total)}</strong><small>Total spent</small></div><div className="legend">{Object.entries(byCat).map(([key, value]) => <div key={key}><i />{key}<b>{money(value)}</b></div>)}</div></section><section className="panel"><div className="panel-head"><div><h2>Monthly trend</h2><p>Expense totals by month</p></div></div><div className="bars">{Object.entries(byMonth).map(([key, value]) => <div className="bar-line" key={key}><span>{key}</span><div className="bar-track"><i style={{ width: `${Math.max(8, value / Math.max(...Object.values(byMonth)) * 100)}%` }} /></div><b>{money(value)}</b></div>)}{!Object.keys(byMonth).length && <Empty text="No data yet" />}</div></section></div></>; }
function AIAssistant({ expenses, budgets, total }) {
  const byCat = expenses.reduce((result, expense) => ({ ...result, [expense.category]: (result[expense.category] || 0) + Number(expense.amount) }), {});
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const monthKey = today.slice(0, 7);
  const monthTotal = expenses.filter((expense) => (expense.date || today).slice(0, 7) === monthKey).reduce((sum, expense) => sum + Number(expense.amount), 0);
  const monthlyAverage = expenses.length ? total / Math.max(1, new Set(expenses.map((expense) => (expense.date || today).slice(0, 7))).size) : 0;
  const predicted = Math.max(monthTotal, monthlyAverage);
  const budgetWarning = budgets.find((budget) => top && budget.category === top[0] && top[1] > budget.limit);
  return <><div className="page-heading"><div><p className="eyebrow">AI FINANCE ASSISTANT</p><h1>Smart money insights</h1><p className="muted">A local AI summary based on your expense history.</p></div><div className="ai-badge"><Sparkles size={16} />AI-powered</div></div>
    <section className="ai-chat-card panel"><div className="ai-chat-title"><div className="hero-icon"><Sparkles size={18} /></div><div><h2>SettleUp AI</h2><p>Here is what I found in your spending.</p></div></div><div className="ai-message"><strong>Monthly insight</strong><p>You spent <b>{money(monthTotal)}</b> this month. Your current trend points to approximately <b>{money(predicted)}</b> in monthly spending.</p>{top ? <p>Your top category is <b>{top[0]}</b> at <b>{money(top[1])}</b>. {budgetWarning ? 'Your current budget may be exceeded.' : 'Consider setting a budget for this category.'}</p> : <p>Add expenses and I will generate personalized insights.</p>}</div></section>
    <div className="ai-insight-grid"><section className="panel"><div className="panel-head"><div><h2>Spending prediction</h2><p>Estimated from your recorded months</p></div><TrendingUp size={18} /></div><div className="ai-number">{money(predicted)}</div><small>{predicted > monthTotal ? `You may spend approximately ${money(predicted - monthTotal)} more.` : 'Your spending is currently on track.'}</small></section><section className="panel"><div className="panel-head"><div><h2>Budget recommendation</h2><p>Suggested safety buffer</p></div><Wallet size={18} /></div><div className="ai-number">{money(top ? top[1] * 1.1 : 0)}</div><small>{top ? `Recommended ${top[0]} budget based on recent spending.` : 'Add data to get a recommendation.'}</small></section></div>
  </>;
}

function Budgets({ budgets, expenses, onAdd, onDelete }) { return <><div className="page-heading"><div><p className="eyebrow">CONTROL SPENDING</p><h1>Budgets</h1><p className="muted">Set limits and get warnings before overspending.</p></div><button className="primary" onClick={onAdd}><Plus size={18} />Set budget</button></div><section className="budget-grid">{budgets.map((b) => { const spent = expenses.filter((e) => e.category === b.category).reduce((s, e) => s + Number(e.amount), 0); const percent = Math.round(spent / b.limit * 100); return <div className={`panel budget-card ${percent >= 100 ? 'over-budget' : percent >= 80 ? 'near-budget' : ''}`} key={b.id}><div className="panel-head"><div><h2>{b.category}</h2><p>{money(spent)} of {money(b.limit)}</p></div><button className="delete-button" onClick={() => onDelete(b.id)}><Trash2 size={15} /></button></div><div className="budget-track"><i style={{ width: `${Math.min(100, percent)}%` }} /></div><small>{percent >= 100 ? 'Budget exceeded' : percent >= 80 ? 'Warning: almost at your limit' : `${Math.max(0, 100 - percent)}% remaining`}</small></div>; })}{!budgets.length && <div className="panel empty"><Wallet size={24} /><span>No budgets yet. Add one to stay on track.</span></div>}</section></>; }
function Recurring({ recurring, onAdd, onDelete }) { return <><div className="page-heading"><div><p className="eyebrow">AUTOMATION</p><h1>Recurring expenses</h1><p className="muted">Automatically generate regular bills on their due date.</p></div><button className="primary" onClick={onAdd}><Plus size={18} />Add recurring</button></div><section className="panel recurring-list">{recurring.map((r) => <div className="recurring-row" key={r.id}><div className="category-icon"><RefreshCw size={17} /></div><div className="row-main"><strong>{r.description}</strong><small>{r.frequency} · next on {r.nextDate} · {nameOf([{ id: r.paidBy, name: r.paidBy }], r.paidBy)}</small></div><b>{money(r.amount)}</b><button className="delete-button" onClick={() => onDelete(r.id)}><Trash2 size={16} /></button></div>)}{!recurring.length && <Empty text="No recurring expenses configured" />}</section></>; }
function Balances({ members, balances, expenses }) { return <><div className="page-heading"><div><p className="eyebrow">YOUR GROUP</p><h1>Balances</h1><p className="muted">See who owes what, at a glance.</p></div></div><section className="panel balance-list"><div className="panel-head"><div><h2>Member balances</h2><p>Based on {expenses.length} shared expenses</p></div></div>{members.map((m) => <div className="balance-row" key={m.id}><div className="avatar">{m.initials}</div><div><strong>{m.name}{m.id === 'me' && ' (you)'}</strong><small>{balances[m.id] > .01 ? 'Should receive' : balances[m.id] < -.01 ? 'Needs to pay' : 'All settled'}</small></div><strong className={balances[m.id] > .01 ? 'positive' : balances[m.id] < -.01 ? 'negative' : ''}>{balances[m.id] ? `${balances[m.id] > 0 ? '+' : '-'}${money(balances[m.id])}` : 'Settled'}</strong></div>)}</section></>; }
function SettleUp({ pending, members, history, onPayment, onReminder, onReceipt }) { return <><div className="page-heading"><div><p className="eyebrow">SMART RECONCILIATION</p><h1>Settle up</h1><p className="muted">Record payments and keep a clear history.</p></div></div><section className="settle-hero"><div><div className="hero-icon"><Sparkles /></div><h2>Smart settlement plan</h2><p>Use the bell to remind someone, or check to record a payment.</p></div><div className="hero-number"><strong>{pending.length}</strong><span>payments needed</span></div></section><section className="panel settlement-panel">{pending.map((item) => <SettlementRow key={`${item.from}-${item.to}`} item={item} members={members} onPayment={onPayment} onReminder={onReminder} />)}{!pending.length && <Empty text="Nothing to settle. Nice work!" />}</section><section className="panel settlement-history"><div className="panel-head"><div><h2>Payment history</h2><p>Completed and partial payments</p></div></div>{history.map((item) => <div className="history-row" key={item.id}><span>{nameOf(members, item.from)} paid {nameOf(members, item.to)}</span><b>{money(item.amount)}</b><small>{item.date}</small><button className="text-button" onClick={() => onReceipt(item)}><Receipt size={14} />Receipt</button></div>)}{!history.length && <Empty text="No payments recorded yet" />}</section></>; }
function SettlementRow({ item, members, onPayment, onReminder }) { return <div className="settlement-row"><div className="avatar tiny">{nameOf(members, item.from).slice(0, 2).toUpperCase()}</div><div><strong>{nameOf(members, item.from)} <span>pays</span> {nameOf(members, item.to)}</strong><small>Remaining balance</small></div><b>{money(item.amount)}</b>{onPayment && <><button className="reminder-button" onClick={() => onReminder(item)}><Bell size={14} /></button><button className="check-button" onClick={() => onPayment(item)}><Check size={15} /></button></>}</div>; }
function Groups({ groups, active, onAdd, onJoin, onAddMember, onCopy }) { return <><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACES</p><h1>Groups</h1><p className="muted">Organize expenses by home, trip, or team.</p></div><div className="heading-actions"><button className="outline" onClick={onJoin}><KeyRound size={16} />Join with code</button><button className="outline" onClick={onAddMember}><Users size={16} />Add friend</button><button className="primary" onClick={onAdd}><Plus size={18} />Create group</button></div></div><div className="group-grid">{groups.map((g) => <div className="group-card" key={g.id}><div className="group-card-top" style={{ background: g.color }}><Users size={25} /><span>{g.members.length} members</span></div><div className="group-card-body"><h2>{g.name}</h2><p>{g.description}</p><div className="invite-code"><span>Invite code</span><strong>{g.inviteCode}</strong><button onClick={onCopy}><Copy size={14} /></button></div><div className="members-list">{g.members.map((m) => <div className="member-item" key={m.id}><div className="avatar tiny">{m.initials}</div><span>{m.name}<small>{m.role || 'Member'}</small></span></div>)}</div><button className="outline full" onClick={onCopy}><Copy size={15} />Copy invite code</button></div></div>)}</div></>; }
function ExpenseModal({ members, expense, onClose, onSave }) {
  const initial = expense || { description: '', amount: '', category: 'Food', paidBy: 'me', date: today, splitType: 'equal', participants: members.map((m) => m.id), values: {}, notes: '' };
  const [form, setForm] = useState(initial);
  const [assistantText, setAssistantText] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const set = (key, value) => setForm({ ...form, [key]: value });
  const toggle = (id) => set('participants', (form.participants || []).includes(id) ? form.participants.filter((x) => x !== id) : [...(form.participants || []), id]);
  const applyAssistant = () => {
    const parsed = parseNaturalLanguageExpense(assistantText, members);
    setForm({ ...form, ...parsed });
    setSuggestion({ category: parsed.category, confidence: suggestCategory(assistantText).confidence });
  };
  const file = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
    if (!allowed.includes(selected.type) || selected.size > 5 * 1024 * 1024) return setForm({ ...form, receiptError: 'Use JPG, PNG, WEBP, PDF or TXT files up to 5 MB.' });
    const reader = new FileReader();
    reader.onload = () => {
      const extracted = selected.type === 'text/plain' ? parseReceiptText(reader.result) : { description: selected.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), date: today, amount: '', category: suggestCategory(selected.name).category };
      setForm({ ...form, ...extracted, receipt: reader.result, receiptName: selected.name, receiptError: '' });
      setSuggestion({ category: extracted.category, confidence: selected.type === 'text/plain' ? extracted.confidence : 72 });
    };
    reader.readAsDataURL(selected);
    if (selected.type === 'text/plain') {
      const textReader = new FileReader();
      textReader.onload = () => setForm((current) => ({ ...current, ...parseReceiptText(textReader.result) }));
      textReader.readAsText(selected);
    }
  };
  return <Modal title={expense ? 'Edit expense' : 'Add an expense'} subtitle="Use the AI assistant, scan a receipt, or enter details manually." onClose={onClose}>
    <div className="ai-entry-box"><strong><Sparkles size={15} /> Natural-language expense entry</strong><div className="ai-entry-row"><input placeholder="I paid ₹900 for dinner with Suman yesterday" value={assistantText} onChange={(e) => setAssistantText(e.target.value)} /><button className="outline" onClick={applyAssistant} disabled={!assistantText.trim()}>Parse with AI</button></div></div>
    {suggestion && <div className="ai-suggestion"><Sparkles size={15} /> Suggested category: <strong>{suggestion.category}</strong><span>Confidence: {suggestion.confidence}%</span><button className="text-button" onClick={() => set('category', suggestion.category)}>Accept</button></div>}
    <label>Expense title<input autoFocus placeholder="e.g. Dinner, rent, groceries" value={form.description} onChange={(e) => { set('description', e.target.value); setSuggestion(suggestCategory(e.target.value)); }} /></label>
    <div className="form-row"><label>Amount<input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></label><label>Date<input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></label></div>
    <div className="form-row"><label>Category<select value={form.category} onChange={(e) => set('category', e.target.value)}>{categories.map((x) => <option key={x}>{x}</option>)}</select></label><label>Paid by<select value={form.paidBy} onChange={(e) => set('paidBy', e.target.value)}>{members.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label></div>
    <label>Split method<select value={form.splitType} onChange={(e) => set('splitType', e.target.value)}><option value="equal">Equal split</option><option value="exact">Exact amount</option><option value="percentage">Percentage</option><option value="shares">Shares</option></select></label>
    <div className="participant-grid">{members.map((m) => <label className="participant" key={m.id}><input type="checkbox" checked={(form.participants || []).includes(m.id)} onChange={() => toggle(m.id)} />{m.name}{form.splitType !== 'equal' && <input type="number" min="0" step="0.01" placeholder={form.splitType === 'percentage' ? '%' : '₹'} value={form.values?.[m.id] || ''} onChange={(e) => set('values', { ...(form.values || {}), [m.id]: e.target.value })} />}</label>)}</div>
    <label>Notes<textarea rows="3" placeholder="Optional note" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></label>
    <label className="upload-label"><Upload size={15} /> Scan receipt with AI<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt" onChange={file} />{form.receipt && <span className="receipt-preview">Receipt scanned: {form.receiptName} ✓</span>}{form.receiptError && <small className="error-text">{form.receiptError}</small>}</label>
    <div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(form)}><Check size={17} />Save expense</button></div>
  </Modal>;
}
function RecurringModal({ members, onClose, onSave }) { const [form, setForm] = useState({ description: '', amount: '', category: 'Utilities', paidBy: 'me', frequency: 'Monthly', nextDate: today }); const set = (k, v) => setForm({ ...form, [k]: v }); return <Modal title="Recurring expense" subtitle="A new expense is generated automatically when due." onClose={onClose}><label>Description<input autoFocus value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Internet bill" /></label><div className="form-row"><label>Amount<input type="number" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></label><label>First due date<input type="date" value={form.nextDate} onChange={(e) => set('nextDate', e.target.value)} /></label></div><div className="form-row"><label>Frequency<select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>{frequencies.map((f) => <option key={f}>{f}</option>)}</select></label><label>Category<select value={form.category} onChange={(e) => set('category', e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label></div><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(form)}>Save recurring</button></div></Modal>; }
function BudgetModal({ onClose, onSave }) { const [form, setForm] = useState({ category: 'Food', limit: '' }); return <Modal title="Set a budget" subtitle="You’ll see a warning at 80% and when the limit is exceeded." onClose={onClose}><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label><label>Monthly limit<input type="number" min="0" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} placeholder="₹ 10,000" /></label><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(form)}>Save budget</button></div></Modal>; }
function GroupModal({ onClose, onSave }) { const [name, setName] = useState(''); return <Modal title="Create a group" subtitle="For your flat, trip, or any shared plan." onClose={onClose}><label>Group name<input autoFocus placeholder="e.g. Goa trip" value={name} onChange={(e) => setName(e.target.value)} /></label><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => name.trim() && onSave(name.trim())}>Create group</button></div></Modal>; }
function JoinModal({ onClose, onSave }) { const [code, setCode] = useState(''); return <Modal title="Join a group" subtitle="Ask a group admin for their invite code." onClose={onClose}><label>Invite code<input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. FLAT302" /></label><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(code)}>Join group</button></div></Modal>; }
function MemberModal({ onClose, onSave }) { const [name, setName] = useState(''); const [email, setEmail] = useState(''); return <Modal title="Add a friend" subtitle="Add a friend or roommate to this group." onClose={onClose}><label>Friend name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => name.trim() && onSave({ id: uid(), name: name.trim(), email, initials: name.trim().slice(0, 2).toUpperCase() })}>Add friend</button></div></Modal>; }
function VerifyModal({ channel, destination, onClose, onDone }) { const [code, setCode] = useState(''); const label = channel === 'phone' ? 'phone number' : 'email'; return <Modal title={`Verify your ${label}`} subtitle={`A 6-digit OTP was sent to ${destination || 'your contact'}. Demo OTP: 123456`} onClose={onClose}><label>One-time password<input inputMode="numeric" maxLength="6" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" disabled={code.length !== 6} onClick={onDone}>Verify {label}</button></div></Modal>; }
function TwoFactorModal({ onClose, onDone }) { const [code, setCode] = useState(''); return <Modal title="Enable two-factor authentication" subtitle="Scan is represented by a demo secret in this local-first MVP. Code: 246810" onClose={onClose}><div className="twofa-secret">SETTLEUP-DEMO-2FA</div><label>Authenticator code<input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></label><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => code === '246810' && onDone()}>Enable 2FA</button></div></Modal>; }
function PaymentModal({ item, onClose, onSave }) { const [form, setForm] = useState({ amount: item.amount, method: 'UPI', date: today, note: '' }); return <Modal title="Record payment" subtitle={`Outstanding amount: ${money(item.amount)}`} onClose={onClose}><label>Amount<input type="number" min="0.01" max={item.amount} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label>Payment method<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Other</option></select></label><label>Payment date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>Note<textarea rows="2" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label><div className="modal-actions"><button className="outline" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(form)}>Record payment</button></div></Modal>; }

function PremiumPackage() {
  const features = [
    { label: 'AI Expense Assistant', icon: Sparkles },
    { label: 'Receipt OCR', icon: Receipt },
    { label: 'UPI Payment', icon: Wallet },
    { label: 'Trip Mode', icon: Plane },
    { label: 'Personal Finance Dashboard', icon: BarChart3 },
    { label: 'Spending Prediction', icon: TrendingUp },
    { label: 'PDF Financial Reports', icon: FileText },
    { label: 'PWA + Offline Sync', icon: Wifi },
  ];

  return <div className="premium-package">
    <div className="premium-header">
      <div className="premium-trophy"><Trophy size={22} /></div>
      <h1>My recommended "Advanced SettleUp" package</h1>
    </div>
    <p className="premium-subtitle">Don't implement everything. I'd choose these 8 features:</p>
    <div className="premium-table">
      <div className="premium-row premium-header-row"><span>Feature</span><span>Value</span></div>
      {features.map(({ label, icon: Icon }) => (
        <div key={label} className="premium-row">
          <div className="premium-name">
            <div className="premium-icon"><Icon size={15} /></div>
            <span>{label}</span>
          </div>
          <div className="premium-stars" aria-label="5 out of 5 stars">
            {Array.from({ length: 5 }, (_, index) => <span key={`${label}-${index}`} className={index < 5 ? 'star active' : 'star'}>★</span>)}
          </div>
        </div>
      ))}
    </div>
  </div>;
}

function SettingsPage({ dark, setDark, user, onVerify, onTwoFactor }) { const phone = user.phone || '7739764194'; return <><div className="page-heading"><div><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p className="muted">Manage your account, appearance, notifications, security, and privacy.</p></div></div><section className="panel settings-list"><div className="setting-row"><div><strong>Dark mode</strong><small>Use a darker appearance for the workspace</small></div><button className={`theme-toggle ${dark ? 'enabled' : ''}`} onClick={() => setDark(!dark)} aria-pressed={dark}><span />{dark ? 'On' : 'Off'}</button></div><div className="setting-row"><div><strong>Email verification</strong><small>{user.email} · {user.emailVerified ? 'Verified' : 'Not verified'}</small></div><button className="outline" onClick={() => onVerify('email')}>{user.emailVerified ? 'Verified' : 'Send email OTP'}</button></div><div className="setting-row"><div><strong>Phone verification</strong><small>{phone} · {user.phoneVerified ? 'Verified' : 'Not verified'}</small></div><button className="outline" onClick={() => onVerify('phone')}>{user.phoneVerified ? 'Verified' : 'Send phone OTP'}</button></div><div className="setting-row"><div><strong>Two-factor authentication</strong><small>Add an authenticator code at sign in</small></div><button className="outline" onClick={onTwoFactor}>Set up 2FA</button></div></section></>; }
function ContactModal({ onClose, onSend }) {
  const [compose, setCompose] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const sendMessage = () => {
    const body = message.trim();
    if (!body || !onSend(body)) return;
    setSent(true);
    setMessage('');
  };
  const openEmail = async () => {
    await navigator.clipboard?.writeText('princekrnwd50@gmail.com');
    setCompose(true);
    setSent(false);
  };
  return <Modal title="Contact SettleUp" subtitle="We are happy to help with your account or shared expenses." onClose={onClose}>
    <div className="contact-options">
      <button type="button" className="contact-option contact-option-button" onClick={() => setCompose(true)} aria-label="Write a message to the admin"><span className="contact-icon"><MessageCircle size={19} /></span><span><strong>Messages</strong><small>Write a message to the admin</small></span><ArrowUpRight size={16} /></button>
      <button type="button" className="contact-option contact-option-button" onClick={openEmail} aria-label="Email princekrnwd50@gmail.com"><span className="contact-icon"><Mail size={19} /></span><span><strong>Email</strong><small>Copy admin email: princekrnwd50@gmail.com</small></span><ArrowUpRight size={16} /></button>
      <a className="contact-option" href="tel:+917739764194" aria-label="Call 7739764194"><span className="contact-icon"><Phone size={19} /></span><span><strong>Phone</strong><small>Tap to call 7739764194</small></span><ArrowUpRight size={16} /></a>
    </div>
    {compose && <div className="contact-compose"><label>Message to admin<textarea rows="4" autoFocus value={message} onChange={(event) => { setMessage(event.target.value); setSent(false); }} placeholder="Type your message..." /></label>{sent && <p className="contact-success">Message delivered to the admin inbox.</p>}<button type="button" className="primary full" onClick={sendMessage}><Mail size={15} />Send message to admin</button></div>}
    <div className="modal-actions"><button className="outline" onClick={onClose}>Close</button></div>
  </Modal>;
}
function ProfileModal({ user, onClose, onSave, onLogout }) { const [address, setAddress] = useState(user.address || ''); const [photo, setPhoto] = useState(user.photo || ''); const selectPhoto = (event) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return; const reader = new FileReader(); reader.onload = () => setPhoto(reader.result); reader.readAsDataURL(file); }; return <Modal title="Your profile" subtitle="Add profile details. Your name stays unchanged." onClose={onClose}><div className="profile-preview"><div className="avatar profile-avatar">{photo ? <img src={photo} alt="Profile" /> : (user.name || 'You').slice(0, 2).toUpperCase()}</div><div><strong>{user.name || 'Your account'}</strong><small>{user.email}</small></div></div><label>Profile name<input value={user.name || ''} readOnly /></label><label>Address<textarea rows="3" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your address" /></label><label className="upload-label"><Upload size={15} />Profile photo<input type="file" accept="image/*" onChange={selectPhoto} />{photo && <span className="receipt-preview">Photo selected ✓</span>}</label>{photo && <button type="button" className="delete-button remove-photo" onClick={() => setPhoto('')}><Trash2 size={15} />Remove photo</button>}<div className="modal-actions"><button className="danger-button" onClick={onLogout}>Sign out</button><button className="primary" onClick={() => onSave({ address, photo })}>Save details</button></div></Modal>; }
function Modal({ title, subtitle, onClose, children }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><h2>{title}</h2><p>{subtitle}</p>{children}</div></div>; }
function Empty({ text }) { return <div className="empty"><Sparkles size={20} /><span>{text}</span></div>; }
function downloadCsv(rows) { const csv = ['Description,Category,Amount,Date', ...rows.map((e) => `"${e.description}",${e.category},${e.amount},${e.date}`)].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'settleup-expenses.csv'; a.click(); }
createRoot(document.getElementById('root')).render(<App />);
