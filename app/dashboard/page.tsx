"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import * as DB from "@/lib/db";

// ─── TYPES ───────────────────────────────────────────
type Expense = { id: string; amount: number; cat: string; desc: string; date: string; method: string };
type Income = { id: string; name: string; amount: number; type: string };
type Goal = { id: string; name: string; emoji: string; target: number; current: number };
type Task = { id: string; name: string; time: string; dur: number; cat: string; done: boolean };
type Habit = { id: string; name: string; freq: number; color: string };
type MoodLog = { id: string; mood: number; label: string; note: string; energy: number; date: string };
type Subscription = { id: string; name: string; amount: number; cycle: "monthly" | "yearly"; note?: string };

// ─── HELPERS ─────────────────────────────────────────
const fmt = (n: number) => "৳" + Math.round(n).toLocaleString();
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const catColor = (cat: string) => ({ Food:"#7c6fff",Transport:"#2dd4bf",Bills:"#fbbf24",Shopping:"#f472b6",Health:"#34d399",Education:"#60a5fa",Entertainment:"#f87171" }[cat] || "#888");
const catTag = (cat: string) => ({ Food:"food",Transport:"transport",Bills:"bills",Shopping:"shopping",Health:"health",Education:"education",Entertainment:"entertainment" }[cat] || "custom");
const subMonthly = (s: Subscription) => (s.cycle === "yearly" ? s.amount / 12 : s.amount);

export default function Dashboard() {
  const { user, loading, logout, updateDisplayName } = useAuth();
  const router = useRouter();

  const [activePage, setActivePage] = useState("dashboard");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [budget, setBudget] = useState<Record<string,number>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<Record<string,string[]>>({});
  const [moods, setMoods] = useState<MoodLog[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [settingsDisplayName, setSettingsDisplayName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<"permissions" | "other" | null>(null);

  // AI
  const [aiMessages, setAiMessages] = useState<{role:string;content:string}[]>([{role:"ai",content:"Assalamu alaikum! Ami tomar LifeOS AI advisor 🙌\n\nTomar income, expense, routine — sob analyze kore advice dite pari. Ki jante chao?"}]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<{role:string;content:string}[]>([]);

  // Modals
  const [modal, setModal] = useState<string|null>(null);

  // Form states
  const [expForm, setExpForm] = useState({ amount:"", cat:"Food", desc:"", date:todayStr(), method:"Cash" });
  const [expenseEditId, setExpenseEditId] = useState<string | null>(null);
  const [incForm, setIncForm] = useState({ name:"", amount:"", type:"fixed" });
  const [subForm, setSubForm] = useState({ name:"", amount:"", cycle:"monthly" as "monthly"|"yearly", note:"" });
  const [goalForm, setGoalForm] = useState({ name:"", emoji:"🎯", target:"", current:"" });
  const [taskForm, setTaskForm] = useState({ name:"", time:"09:00", dur:"60", cat:"purple" });
  const [habitForm, setHabitForm] = useState({ name:"", freq:"7", color:"var(--accent)" });
  const [selectedMood, setSelectedMood] = useState<{score:number;label:string}|null>(null);
  const [moodNote, setMoodNote] = useState("");
  const [moodEnergy, setMoodEnergy] = useState("");
  const [newBudgetCat, setNewBudgetCat] = useState("");

  // Load all data
  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setLoadError(null);
    try {
      const [exps, incs, subs, bud, gls, tsk, hab, hlogs, mds, prof] = await Promise.all([
        DB.getExpenses(user.uid),
        DB.getIncome(user.uid),
        DB.getSubscriptions(user.uid),
        DB.getBudget(user.uid),
        DB.getGoals(user.uid),
        DB.getTasks(user.uid),
        DB.getHabits(user.uid),
        DB.getHabitLogs(user.uid),
        DB.getMoods(user.uid),
        DB.getProfile(user.uid),
      ]);
      setExpenses(exps as Expense[]);
      setIncome(incs as Income[]);
      const rawSubs = subs as Record<string, unknown>[];
      setSubscriptions(rawSubs.map((r) => ({
        id: r.id as string,
        name: String(r.name ?? ""),
        amount: typeof r.amount === "number" ? r.amount : parseFloat(String(r.amount)) || 0,
        cycle: r.cycle === "yearly" ? "yearly" : "monthly",
        note: typeof r.note === "string" ? r.note : undefined,
      })));
      setBudget(bud as Record<string,number>);
      setGoals(gls as Goal[]);
      setTasks(tsk as Task[]);
      setHabits(hab as Habit[]);
      setHabitLogs(hlogs as Record<string,string[]>);
      setMoods(mds as MoodLog[]);
      const p = prof as Record<string, unknown>;
      setProfileBio(typeof p.bio === "string" ? p.bio : "");
      setSettingsDisplayName(user.displayName || (typeof p.displayName === "string" ? p.displayName : "") || "");
    } catch (e: unknown) {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
      setLoadError(code === "permission-denied" ? "permissions" : "other");
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (user) loadData();
  }, [user, loading, router, loadData]);

  useEffect(() => {
    if (!modal) setExpenseEditId(null);
  }, [modal]);

  // ─── COMPUTED ───────────────────────────────────────
  const totalIncome = income.reduce((s,i) => s+i.amount, 0);
  const monthExp = expenses.filter(e => e.date?.startsWith(thisMonth()));
  const totalSpent = monthExp.reduce((s,e) => s+e.amount, 0);
  const remaining = totalIncome - totalSpent;
  const todayDoneHabits = habits.filter(h => habitLogs[h.id]?.includes(todayStr())).length;
  const totalSubMonthly = subscriptions.reduce((s, sub) => s + subMonthly(sub), 0);

  // ─── ACTIONS ────────────────────────────────────────
  async function handleSaveExpense() {
    if (!user || !expForm.amount) return;
    const newExp = { amount: parseFloat(expForm.amount), cat: expForm.cat, desc: expForm.desc || expForm.cat, date: expForm.date, method: expForm.method };
    if (expenseEditId) {
      await DB.updateExpense(user.uid, expenseEditId, newExp);
    } else {
      await DB.addExpense(user.uid, newExp);
    }
    setExpForm({ amount:"", cat:"Food", desc:"", date:todayStr(), method:"Cash" });
    setExpenseEditId(null);
    setModal(null);
    loadData();
  }

  function openNewExpenseModal() {
    setExpenseEditId(null);
    setExpForm({ amount:"", cat:"Food", desc:"", date:todayStr(), method:"Cash" });
    setModal("expense");
  }

  function openEditExpenseModal(e: Expense) {
    setExpenseEditId(e.id);
    setExpForm({
      amount: String(e.amount),
      cat: e.cat,
      desc: e.desc,
      date: e.date,
      method: e.method || "Cash",
    });
    setModal("expense");
  }

  async function handleDeleteExpense(id: string) {
    if (!user) return;
    await DB.deleteExpense(user.uid, id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  async function handleAddIncome() {
    if (!user || !incForm.name || !incForm.amount) return;
    await DB.addIncome(user.uid, { name: incForm.name, amount: parseFloat(incForm.amount), type: incForm.type });
    setIncForm({ name:"", amount:"", type:"fixed" });
    setModal(null);
    loadData();
  }

  async function handleDeleteIncome(id: string) {
    if (!user) return;
    await DB.deleteIncome(user.uid, id);
    setIncome(prev => prev.filter(i => i.id !== id));
  }

  async function handleAddSubscription() {
    if (!user || !subForm.name.trim() || !subForm.amount) return;
    await DB.addSubscription(user.uid, {
      name: subForm.name.trim(),
      amount: parseFloat(subForm.amount),
      cycle: subForm.cycle,
      note: subForm.note.trim() || undefined,
    });
    setSubForm({ name:"", amount:"", cycle:"monthly", note:"" });
    setModal(null);
    loadData();
  }

  async function handleDeleteSubscription(id: string) {
    if (!user) return;
    await DB.deleteSubscription(user.uid, id);
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSaveSettings() {
    if (!user) return;
    const dn = settingsDisplayName.trim();
    setSettingsSaving(true);
    try {
      await updateDisplayName(dn);
      await DB.saveProfile(user.uid, { displayName: dn, bio: profileBio.trim() });
      alert("Profile save hoyeche ✓");
    } catch {
      alert("Save hoyni — abar try koro");
    }
    setSettingsSaving(false);
  }

  async function handleSaveBudget() {
    if (!user) return;
    await DB.saveBudget(user.uid, budget);
    alert("Budget saved! ✅");
  }

  async function handleAddGoal() {
    if (!user || !goalForm.name || !goalForm.target) return;
    await DB.addGoal(user.uid, { name: goalForm.name, emoji: goalForm.emoji || "🎯", target: parseFloat(goalForm.target), current: parseFloat(goalForm.current)||0 });
    setGoalForm({ name:"", emoji:"🎯", target:"", current:"" });
    setModal(null);
    loadData();
  }

  async function handleAddToGoal(g: Goal) {
    if (!user) return;
    const amt = parseFloat(prompt("Koto taka add korbe?") || "0");
    if (!amt || amt <= 0) return;
    const newCurrent = Math.min(g.target, g.current + amt);
    await DB.updateGoal(user.uid, g.id, { current: newCurrent });
    loadData();
  }

  async function handleDeleteGoal(id: string) {
    if (!user) return;
    await DB.deleteGoal(user.uid, id);
    setGoals(prev => prev.filter(g => g.id !== id));
  }

  async function handleAddTask() {
    if (!user || !taskForm.name) return;
    const newTasks = [...tasks, { id: uid(), name: taskForm.name, time: taskForm.time, dur: parseInt(taskForm.dur), cat: taskForm.cat, done: false }]
      .sort((a,b) => a.time.localeCompare(b.time));
    await DB.saveTasks(user.uid, newTasks);
    setTasks(newTasks);
    setTaskForm({ name:"", time:"09:00", dur:"60", cat:"purple" });
    setModal(null);
  }

  async function handleToggleTask(id: string) {
    if (!user) return;
    const newTasks = tasks.map(t => t.id === id ? {...t, done: !t.done} : t);
    setTasks(newTasks);
    await DB.saveTasks(user.uid, newTasks);
  }

  async function handleDeleteTask(id: string) {
    if (!user) return;
    const newTasks = tasks.filter(t => t.id !== id);
    setTasks(newTasks);
    await DB.saveTasks(user.uid, newTasks);
  }

  async function handleAddHabit() {
    if (!user || !habitForm.name) return;
    const newHabits = [...habits, { id: uid(), name: habitForm.name, freq: parseInt(habitForm.freq), color: habitForm.color }];
    await DB.saveHabits(user.uid, newHabits);
    setHabits(newHabits);
    setHabitForm({ name:"", freq:"7", color:"var(--accent)" });
    setModal(null);
  }

  async function handleDeleteHabit(id: string) {
    if (!user) return;
    const newHabits = habits.filter(h => h.id !== id);
    const newLogs = { ...habitLogs }; delete newLogs[id];
    await DB.saveHabits(user.uid, newHabits);
    await DB.saveHabitLogs(user.uid, newLogs);
    setHabits(newHabits);
    setHabitLogs(newLogs);
  }

  async function handleToggleHabit(habitId: string, day: string) {
    if (!user) return;
    const logs = habitLogs[habitId] || [];
    const newLogs = { ...habitLogs, [habitId]: logs.includes(day) ? logs.filter(d=>d!==day) : [...logs, day] };
    setHabitLogs(newLogs);
    await DB.saveHabitLogs(user.uid, newLogs);
  }

  async function handleSaveMood() {
    if (!user || !selectedMood) return;
    await DB.addMood(user.uid, { mood: selectedMood.score, label: selectedMood.label, note: moodNote, energy: parseInt(moodEnergy)||5, date: todayStr() });
    setSelectedMood(null); setMoodNote(""); setMoodEnergy("");
    loadData();
  }

  // ─── AI ─────────────────────────────────────────────
  async function sendAI(msg: string) {
    if (!msg.trim() || aiLoading) return;
    setAiInput("");
    setAiLoading(true);
    const userMsg = { role:"user", content: msg };
    setAiMessages(prev => [...prev, userMsg]);

    const cats: Record<string,number> = {};
    monthExp.forEach(e => { cats[e.cat] = (cats[e.cat]||0) + e.amount; });

    const system = `You are a friendly personal finance and life advisor for a Bangladeshi user. Speak in Banglish (Bangla + English mixed). Be like a smart helpful friend.
User data: Income ${fmt(totalIncome)} from ${income.length} sources. Spent this month: ${fmt(totalSpent)} (${totalIncome ? Math.round(totalSpent/totalIncome*100) : 0}% of income). Remaining: ${fmt(Math.max(0,remaining))}. Top spending: ${JSON.stringify(cats)}. Subscriptions (~per month): ${fmt(totalSubMonthly)} (${subscriptions.length} plans). Savings goals: ${goals.map(g=>g.name+"("+Math.round(g.current/g.target*100)+"%done)").join(", ")||"none"}. Active habits: ${habits.map(h=>h.name).join(", ")||"none"}. Tasks: ${tasks.length}.
Give practical, specific, actionable advice. Be encouraging. Keep responses concise. Use emojis occasionally.`;

    const newHistory = [...aiHistory, userMsg];

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, messages: newHistory.map(m => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content })) }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Ektu problem hoyeche. Abar try koro!";
      const aiMsg = { role:"ai", content: reply };
      setAiMessages(prev => [...prev, aiMsg]);
      setAiHistory([...newHistory, aiMsg]);
    } catch {
      setAiMessages(prev => [...prev, { role:"ai", content:"Network error! Internet check koro." }]);
    }
    setAiLoading(false);
  }

  // ─── REPORT AI ──────────────────────────────────────
  const [reportContent, setReportContent] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  async function generateReport() {
    setReportLoading(true);
    const cats: Record<string,number> = {};
    monthExp.forEach(e => { cats[e.cat] = (cats[e.cat]||0) + e.amount; });
    const prompt = `User financial data this month: Income: ${fmt(totalIncome)}, Spent: ${fmt(totalSpent)}, Remaining: ${fmt(totalIncome-totalSpent)}, Subscriptions (~monthly): ${fmt(totalSubMonthly)} (${subscriptions.length} items), Categories: ${JSON.stringify(cats)}, Goals: ${goals.length}, Habits: ${habits.length}. Friendly financial advisor hisebe 3-4 paragraph analysis dao. Banglish-e likho. Specific advice dao — kothay boro khoroch, ki improve korte hobe, savings tips. Bullet points use koro.`;
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: "You are a friendly Bangladeshi financial advisor. Speak in Banglish.", messages: [{ role:"user", content: prompt }] }),
      });
      const data = await res.json();
      setReportContent(data.content?.[0]?.text || "");
    } catch { setReportContent("Error hoyeche."); }
    setReportLoading(false);
  }

  if (loading || dataLoading) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg)"}}>
        <div style={{fontSize:13,color:"var(--text3)"}}>Loading tomar data...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"var(--bg)", padding:24 }}>
        <div style={{ maxWidth:480, background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:28 }}>
          <div style={{ fontSize:18, fontWeight:600, marginBottom:8, color:loadError === "permissions" ? "var(--red)" : "var(--text)" }}>
            {loadError === "permissions" ? "Firestore permission denied" : "Data load hoyni"}
          </div>
          <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.6, marginBottom:16 }}>
            {loadError === "permissions"
              ? "Firebase Firestore Rules e logged-in user ke nijer data pathate allow kora hoyni. Test mode expire holeo ei error ashe."
              : "Network ba server problem hote pare. Abar try koro."}
          </p>
          {loadError === "permissions" && (
            <div style={{ fontSize:11, fontFamily:"monospace", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, padding:14, color:"var(--text2)", lineHeight:1.5, marginBottom:16, whiteSpace:"pre-wrap" }}>
{`Firebase Console → Firestore → Rules → paste koro:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }
  }
}

Tarpor Publish চাপো.`}
            </div>
          )}
          <button type="button" onClick={() => loadData()} style={{ ...S.btnStyle, ...S.btnAccent, width:"100%", justifyContent:"center" }}>
            Abar try koro
          </button>
        </div>
      </div>
    );
  }

  // ─── NAV ITEMS ──────────────────────────────────────
  const navItems = [
    { id:"dashboard", label:"Dashboard", icon:"⊞" },
    { id:"expenses", label:"Expense Tracker", icon:"≡", section:"Money" },
    { id:"budget", label:"Budget Planner", icon:"◎" },
    { id:"income", label:"Income Sources", icon:"↗" },
    { id:"subscriptions", label:"Subscriptions", icon:"◇" },
    { id:"savings", label:"Savings Goals", icon:"♥" },
    { id:"routine", label:"Daily Routine", icon:"▦", section:"Life" },
    { id:"habits", label:"Habit Tracker", icon:"✓" },
    { id:"mood", label:"Mood Log", icon:"☺" },
    { id:"report", label:"Monthly Report", icon:"▲" },
    { id:"settings", label:"Settings", icon:"⚙", section:"App" },
    { id:"ai", label:"AI Advisor", icon:"✦", section:"AI", badge:"AI" },
  ];

  const name = user?.displayName || user?.email?.split("@")[0] || "User";
  const initials = name.slice(0,2).toUpperCase();
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  const expensePresetCats = ["Food","Transport","Bills","Shopping","Health","Education","Entertainment"];
  const expenseCatSelectOptions = expensePresetCats.includes(expForm.cat) ? expensePresetCats : [...expensePresetCats, expForm.cat];

  // ─── RENDER ─────────────────────────────────────────
  return (
    <div style={S.app}>
      {/* SIDEBAR */}
      <aside style={S.sidebar}>
        <div style={S.sidebarLogo}>
          <div style={S.logoText}>Life<span style={{color:"var(--accent)"}}>OS</span></div>
          <div style={S.logoSub}>v1.0 · beta</div>
        </div>
        <div style={S.sidebarUser}>
          <div style={S.avatar}>{initials}</div>
          <div>
            <div style={S.userName}>{name}</div>
            <div style={S.userEmail}>{user?.email}</div>
          </div>
        </div>
        <nav style={{padding:"10px 0",flex:1}}>
          {navItems.map((item,i) => (
            <div key={item.id}>
              {item.section && <div style={S.navSection}>{item.section}</div>}
              <div style={{...S.navItem, ...(activePage===item.id ? S.navItemActive : {})}}
                onClick={()=>setActivePage(item.id)}>
                <span style={{fontSize:14,opacity:0.8}}>{item.icon}</span>
                {item.label}
                {item.badge && <span style={S.badge}>{item.badge}</span>}
              </div>
            </div>
          ))}
        </nav>
        <div style={S.logout} onClick={async()=>{await logout();router.replace("/login");}}>
          ⎋ Logout
        </div>
      </aside>

      {/* MAIN */}
      <main style={S.main}>

        {/* ── DASHBOARD ── */}
        {activePage==="dashboard" && (
          <div style={S.page}>
            <div style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace",marginBottom:4}}>{greet}</div>
            <div style={{fontSize:24,fontWeight:600,letterSpacing:-0.4,marginBottom:24}}>Welcome back, <span style={{color:"var(--accent)"}}>{name}</span></div>

            {totalIncome > 0 && totalSpent/totalIncome > 0.7 && (
              <div style={S.notif}>
                <div style={S.notifDot}/> Ei mashe income-er {Math.round(totalSpent/totalIncome*100)}% khoroch hoyeche — sombre thako!
              </div>
            )}

            <div style={S.metricsGrid}>
              {[
                {label:"Total Income", value:fmt(totalIncome), sub:income.length+" sources"},
                {label:"Spent This Month", value:fmt(totalSpent), sub:totalIncome?Math.round(totalSpent/totalIncome*100)+"% of income":""},
                {label:"Remaining", value:fmt(Math.max(0,remaining)), sub:totalIncome?Math.round(Math.max(0,remaining)/totalIncome*100)+"% remaining":""},
                {label:"Subs / mo", value:fmt(totalSubMonthly), sub:subscriptions.length+" plans"},
                {label:"Habits Today", value:`${todayDoneHabits}/${habits.length}`, sub:"done"},
              ].map(m => (
                <div key={m.label} style={S.metricCard}>
                  <div style={S.metricLabel}>{m.label}</div>
                  <div style={S.metricValue}>{m.value}</div>
                  <div style={S.metricSub}>{m.sub}</div>
                </div>
              ))}
            </div>

            <div style={S.grid2}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Recent Expenses</div>
                {expenses.slice(0,5).map(e => <ExpItem key={e.id} e={e} onEdit={openEditExpenseModal} onDelete={handleDeleteExpense}/>)}
                {!expenses.length && <Empty icon="💸" text="Kono expense nei"/>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={S.card}>
                  <div style={S.sectionTitle}>Ajker Routine</div>
                  {tasks.slice(0,5).map(t => (
                    <div key={t.id} onClick={()=>handleToggleTask(t.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:6,background:"var(--bg3)",cursor:"pointer",marginBottom:5,opacity:t.done?0.4:1}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:catColors[t.cat as keyof typeof catColors]||"var(--accent)",flexShrink:0}}/>
                      <span style={{fontSize:12,color:"var(--text)",flex:1,textDecoration:t.done?"line-through":"none"}}>{t.name}</span>
                      <span style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace"}}>{t.time}</span>
                    </div>
                  ))}
                  {!tasks.length && <Empty icon="🗓" text="Task nei"/>}
                </div>
                <div style={S.card}>
                  <div style={S.sectionTitle}>Budget Alert</div>
                  {Object.entries(budget).filter(([cat,bud]) => {
                    const sp = monthExp.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0);
                    return sp/bud > 0.8;
                  }).map(([cat,bud]) => {
                    const sp = monthExp.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0);
                    const pct = Math.round(sp/bud*100);
                    return <div key={cat} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
                      <Tag cat={cat}/><span style={{fontSize:11,color:pct>=100?"var(--red)":"var(--amber)",fontFamily:"monospace"}}>{pct}% used</span>
                    </div>;
                  })}
                  {Object.entries(budget).filter(([cat,bud])=>{const sp=monthExp.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0);return sp/bud>0.8;}).length===0 && <div style={{fontSize:12,color:"var(--green)"}}>All budgets on track ✓</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── EXPENSES ── */}
        {activePage==="expenses" && (
          <div style={S.page}>
            <PageHeader title="Expense Tracker" sub="koto taka kothay jacche">
              <Btn onClick={openNewExpenseModal} accent>+ Add Expense</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"This Month",value:fmt(totalSpent)},
                {label:"Avg per Day",value:fmt(totalSpent/Math.max(1,new Date().getDate()))},
                {label:"Biggest",value:fmt(monthExp.length?Math.max(...monthExp.map(e=>e.amount)):0)},
                {label:"Transactions",value:String(monthExp.length)},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div style={S.metricValue}>{m.value}</div></div>)}
            </div>
            <div style={S.grid2}>
              <div style={S.card}>
                <div style={S.sectionTitle}>All Transactions</div>
                {expenses.map(e=><ExpItem key={e.id} e={e} onEdit={openEditExpenseModal} onDelete={handleDeleteExpense}/>)}
                {!expenses.length && <Empty icon="🧾" text="Kono expense nei. Add koro!"/>}
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>By Category</div>
                <CatBreakdown expenses={monthExp}/>
              </div>
            </div>
          </div>
        )}

        {/* ── BUDGET ── */}
        {activePage==="budget" && (
          <div style={S.page}>
            <PageHeader title="Budget Planner" sub="income onujaie koto kothay dewa uchit">
              <Btn onClick={handleSaveBudget} accent>Save Budget</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"Monthly Income",value:fmt(totalIncome)},
                {label:"Total Budgeted",value:fmt(Object.values(budget).reduce((s,v)=>s+v,0))},
                {label:"Unallocated",value:fmt(Math.max(0,totalIncome-Object.values(budget).reduce((s,v)=>s+v,0)))},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div style={S.metricValue}>{m.value}</div></div>)}
            </div>
            <div style={S.grid2}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Set Category Budgets</div>
                {Object.entries(budget).map(([cat,amt])=>(
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <Tag cat={cat}/><input style={{...S.input,flex:1}} type="number" value={amt} onChange={e=>setBudget(p=>({...p,[cat]:parseFloat(e.target.value)||0}))}/>
                    <span onClick={()=>setBudget(p=>{const n={...p};delete n[cat];return n;})} style={{color:"var(--red)",cursor:"pointer",opacity:0.5,fontSize:18}}>×</span>
                  </div>
                ))}
                <div style={{display:"flex",gap:10,marginTop:8}}>
                  <input style={{...S.input,flex:1}} placeholder="New category..." value={newBudgetCat} onChange={e=>setNewBudgetCat(e.target.value)}/>
                  <Btn onClick={()=>{if(newBudgetCat){setBudget(p=>({...p,[newBudgetCat]:0}));setNewBudgetCat("");}}} >+ Add</Btn>
                </div>
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Spending vs Budget</div>
                {Object.entries(budget).map(([cat,bud])=>{
                  const sp=monthExp.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0);
                  const pct=Math.min(100,Math.round(sp/bud*100));
                  const over=sp>bud;
                  return <div key={cat} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
                    <div style={{width:80,fontSize:12,color:"var(--text2)",flexShrink:0}}>{cat}</div>
                    <div style={{flex:1}}>
                      <div style={{height:6,background:"var(--bg4)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:over?"var(--red)":catColor(cat),borderRadius:3,transition:"width 0.5s"}}/></div>
                      <div style={{fontSize:10,color:over?"var(--red)":"var(--text3)",fontFamily:"monospace",marginTop:3}}>{pct}%{over?" OVER!":""}</div>
                    </div>
                    <div style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace",width:110,textAlign:"right"}}>{fmt(sp)}/{fmt(bud)}</div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── INCOME ── */}
        {activePage==="income" && (
          <div style={S.page}>
            <PageHeader title="Income Sources" sub="multiple sources — ekta jaegay">
              <Btn onClick={()=>setModal("income")} accent>+ Add Source</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"This Month",value:fmt(totalIncome)},
                {label:"Fixed",value:fmt(income.filter(i=>i.type==="fixed").reduce((s,i)=>s+i.amount,0))},
                {label:"Variable",value:fmt(income.filter(i=>i.type!=="fixed").reduce((s,i)=>s+i.amount,0))},
                {label:"Sources",value:String(income.length)},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div style={S.metricValue}>{m.value}</div></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14}}>
              {income.map(inc=>(
                <div key={inc.id} style={S.card}>
                  <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"monospace",marginBottom:8}}>{inc.type}</div>
                  <div style={{fontSize:14,fontWeight:500}}>{inc.name}</div>
                  <div style={{fontSize:26,fontWeight:600,fontFamily:"monospace",letterSpacing:-0.5,margin:"8px 0"}}>{fmt(inc.amount)}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,color:"var(--text3)"}}>Per month</div>
                    <span onClick={()=>handleDeleteIncome(inc.id)} style={{fontSize:18,color:"var(--red)",cursor:"pointer",opacity:0.4}}>×</span>
                  </div>
                </div>
              ))}
              {!income.length && <Empty icon="💰" text="Income source add koro"/>}
            </div>
          </div>
        )}

        {/* ── SUBSCRIPTIONS ── */}
        {activePage==="subscriptions" && (
          <div style={S.page}>
            <PageHeader title="Subscriptions" sub="Netflix, mobile, apps — fixed monthly bleed">
              <Btn onClick={()=>setModal("subscription")} accent>+ Add</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                { label: "~Monthly total", value: fmt(totalSubMonthly) },
                { label: "Active plans", value: String(subscriptions.length) },
                { label: "Yearly (count)", value: String(subscriptions.filter((s) => s.cycle === "yearly").length) },
                { label: "Monthly (count)", value: String(subscriptions.filter((s) => s.cycle === "monthly").length) },
              ].map((m) => (
                <div key={m.label} style={S.metricCard}>
                  <div style={S.metricLabel}>{m.label}</div>
                  <div style={S.metricValue}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
              {subscriptions.map((sub) => (
                <div key={sub.id} style={S.card}>
                  <div style={{ fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"monospace", marginBottom:8 }}>
                    {sub.cycle === "yearly" ? "Yearly plan" : "Monthly"}
                  </div>
                  <div style={{ fontSize:14, fontWeight:500 }}>{sub.name}</div>
                  <div style={{ fontSize:22, fontWeight:600, fontFamily:"monospace", letterSpacing:-0.5, margin:"8px 0" }}>
                    {fmt(sub.amount)}
                    <span style={{ fontSize:12, color:"var(--text3)", fontWeight:400 }}>{sub.cycle === "yearly" ? "/yr" : "/mo"}</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--teal)", fontFamily:"monospace", marginBottom:8 }}>
                    ≈ {fmt(subMonthly(sub))} / mo equivalent
                  </div>
                  {sub.note && <div style={{ fontSize:12, color:"var(--text3)", marginBottom:8 }}>{sub.note}</div>}
                  <div style={{ display:"flex", justifyContent:"flex-end" }}>
                    <span onClick={() => handleDeleteSubscription(sub.id)} style={{ fontSize:18, color:"var(--red)", cursor:"pointer", opacity:0.4 }}>×</span>
                  </div>
                </div>
              ))}
              {!subscriptions.length && <Empty icon="◇" text="Kono subscription nei — streaming, SIM, gym add koro" />}
            </div>
          </div>
        )}

        {/* ── SAVINGS ── */}
        {activePage==="savings" && (
          <div style={S.page}>
            <PageHeader title="Savings Goals" sub="shopno dekho, track koro, achieve koro">
              <Btn onClick={()=>setModal("goal")} accent>+ New Goal</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"Total Saved",value:fmt(goals.reduce((s,g)=>s+g.current,0))},
                {label:"Total Target",value:fmt(goals.reduce((s,g)=>s+g.target,0))},
                {label:"Active Goals",value:String(goals.length)},
                {label:"Completed",value:String(goals.filter(g=>g.current>=g.target).length)},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div style={S.metricValue}>{m.value}</div></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
              {goals.map(g=>{
                const pct=Math.round(Math.min(100,g.current/g.target*100));
                const done=pct>=100;
                return <div key={g.id} style={{...S.card,borderColor:done?"var(--green)":"var(--border)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{fontSize:14,fontWeight:500}}>{g.name}{done?" ✓":""}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:22}}>{g.emoji}</span>
                      <span onClick={()=>handleDeleteGoal(g.id)} style={{fontSize:18,color:"var(--red)",cursor:"pointer",opacity:0.3}}>×</span>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:10}}>
                    <span style={{fontSize:22,fontWeight:600,fontFamily:"monospace",letterSpacing:-0.5}}>{fmt(g.current)}</span>
                    <span style={{fontSize:13,color:"var(--text3)",fontFamily:"monospace"}}>/ {fmt(g.target)}</span>
                  </div>
                  <div style={{height:6,background:"var(--bg4)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
                    <div style={{height:"100%",width:pct+"%",background:done?"var(--green)":"var(--accent)",borderRadius:3,transition:"width 0.6s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace"}}>{pct}% complete</span>
                    {done ? <span style={{fontSize:11,color:"var(--green)",fontFamily:"monospace"}}>ACHIEVED!</span>
                      : <button style={{...S.btnStyle,...S.btnAccent,padding:"5px 12px",fontSize:11}} onClick={()=>handleAddToGoal(g)}>+ Add</button>}
                  </div>
                </div>;
              })}
              {!goals.length && <Empty icon="🎯" text="Kono goal set kora hoyni"/>}
            </div>
          </div>
        )}

        {/* ── ROUTINE ── */}
        {activePage==="routine" && (
          <div style={S.page}>
            <PageHeader title="Daily Routine" sub="tomar din — tumi design korbe">
              <Btn onClick={()=>setModal("task")}>+ Add Task</Btn>
              <Btn onClick={()=>{setActivePage("ai");setTimeout(()=>sendAI("আমার জন্য একটা productive daily routine suggest koro — morning থেকে night পর্যন্ত"),100);}} accent>AI Suggest ↗</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"Total Tasks",value:String(tasks.length)},
                {label:"Completed",value:String(tasks.filter(t=>t.done).length)},
                {label:"Remaining",value:String(tasks.filter(t=>!t.done).length)},
                {label:"Completion",value:tasks.length?Math.round(tasks.filter(t=>t.done).length/tasks.length*100)+"%":"0%"},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div style={S.metricValue}>{m.value}</div></div>)}
            </div>
            <div style={S.card}>
              {!tasks.length && <Empty icon="🗓" text="Add task koro ba AI-ke bolo routine banate"/>}
              {tasks.map((t,i)=>{
                const color = catColors[t.cat as keyof typeof catColors]||"var(--accent)";
                return <div key={t.id} style={{display:"flex",gap:16,padding:"6px 0"}}>
                  <div style={{width:44,fontSize:10,color:"var(--text3)",fontFamily:"monospace",paddingTop:10,textAlign:"right",flexShrink:0}}>{t.time}</div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:color,marginTop:10,flexShrink:0}}/>
                    {i<tasks.length-1 && <div style={{width:1,flex:1,background:"var(--border)",minHeight:12}}/>}
                  </div>
                  <div style={{flex:1,padding:"4px 0 8px"}}>
                    <div onClick={()=>handleToggleTask(t.id)} style={{background:"var(--bg3)",border:`1px solid var(--border)`,borderRadius:8,padding:"9px 12px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",borderLeftWidth:3,borderLeftColor:color,opacity:t.done?0.4:1}}>
                      <div style={{width:16,height:16,borderRadius:"50%",border:"1.5px solid",borderColor:t.done?"var(--green)":"var(--border2)",background:t.done?"var(--green)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {t.done && <span style={{fontSize:9,color:"#fff"}}>✓</span>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:"var(--text)",textDecoration:t.done?"line-through":"none"}}>{t.name}</div>
                        <div style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace"}}>{t.dur} min · {t.cat}</div>
                      </div>
                      <span onClick={e=>{e.stopPropagation();handleDeleteTask(t.id);}} style={{fontSize:16,color:"var(--red)",opacity:0.3,cursor:"pointer"}}>×</span>
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>
        )}

        {/* ── HABITS ── */}
        {activePage==="habits" && (
          <div style={S.page}>
            <PageHeader title="Habit Tracker" sub="choto choto habit — boro poriborton">
              <Btn onClick={()=>setModal("habit")} accent>+ New Habit</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"Total Habits",value:String(habits.length)},
                {label:"Done Today",value:String(todayDoneHabits)},
                {label:"This Week",value:habits.length?Math.round(habits.reduce((s,h)=>{const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}return s+days.filter(d=>habitLogs[h.id]?.includes(d)).length;},0)/(habits.length*7)*100)+"%":"0%"},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div style={S.metricValue}>{m.value}</div></div>)}
            </div>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12,gap:4}}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d,i)=>{
                  const date=new Date();date.setDate(date.getDate()-(6-i));
                  return <div key={d} style={{width:22,textAlign:"center",fontSize:10,color:"var(--text3)",fontFamily:"monospace"}}>{["Su","Mo","Tu","We","Th","Fr","Sa"][date.getDay()]}</div>;
                })}
              </div>
              {!habits.length && <Empty icon="✅" text="Kono habit add kora hoyni"/>}
              {habits.map(h=>{
                const days: string[]=[];
                for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
                return <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13}}>{h.name}</div>
                    <div style={{fontSize:10,color:"var(--amber)",fontFamily:"monospace"}}>{h.freq}x/week</div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    {days.map(d=>{
                      const done=habitLogs[h.id]?.includes(d);
                      return <div key={d} onClick={()=>handleToggleHabit(h.id,d)} style={{width:22,height:22,borderRadius:6,border:"1px solid",borderColor:done?h.color:"var(--border)",background:done?h.color:"var(--bg3)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff"}}>
                        {done?"✓":""}
                      </div>;
                    })}
                  </div>
                  <span onClick={()=>handleDeleteHabit(h.id)} style={{fontSize:18,color:"var(--red)",cursor:"pointer",opacity:0.3,marginLeft:8}}>×</span>
                </div>;
              })}
            </div>
          </div>
        )}

        {/* ── MOOD ── */}
        {activePage==="mood" && (
          <div style={S.page}>
            <PageHeader title="Mood Log" sub="tumi kemon acho — protidin record koro"/>
            <div style={S.grid2}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Ajke kemon lagche?</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                  {[{score:5,label:"Excellent",emoji:"😄"},{score:4,label:"Good",emoji:"🙂"},{score:3,label:"Okay",emoji:"😐"},{score:2,label:"Meh",emoji:"😕"},{score:1,label:"Bad",emoji:"😞"}].map(m=>(
                    <button key={m.score} onClick={()=>setSelectedMood(m)} style={{padding:"10px 16px",background:"var(--bg3)",border:"1px solid",borderColor:selectedMood?.score===m.score?"var(--accent)":"var(--border)",borderRadius:20,cursor:"pointer",fontSize:22,transition:"all 0.15s",transform:selectedMood?.score===m.score?"scale(1.1)":"scale(1)"}}>
                      {m.emoji}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <textarea style={{...S.input,resize:"none",height:80}} placeholder="Aj ki holo? Keno ei mood?" value={moodNote} onChange={e=>setMoodNote(e.target.value)}/>
                  <div style={{display:"flex",gap:10}}>
                    <input style={{...S.input,flex:1}} type="number" min={1} max={10} placeholder="Energy (1-10)" value={moodEnergy} onChange={e=>setMoodEnergy(e.target.value)}/>
                    <button style={{...S.btnStyle,...S.btnAccent}} onClick={handleSaveMood}>Log koro</button>
                  </div>
                </div>
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Mood History</div>
                <div style={{maxHeight:320,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
                  {moods.slice(0,10).map(m=>{
                    const emojis=["","😞","😕","😐","🙂","😄"];
                    return <div key={m.id} style={{display:"flex",gap:10,padding:10,background:"var(--bg3)",borderRadius:8}}>
                      <span style={{fontSize:20}}>{emojis[m.mood]}</span>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between"}}>
                          <span style={{fontSize:13}}>{m.label}</span>
                          <span style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace"}}>{m.date}</span>
                        </div>
                        {m.note && <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{m.note}</div>}
                        <div style={{fontSize:10,color:"var(--text3)",marginTop:3,fontFamily:"monospace"}}>Energy: {m.energy}/10</div>
                      </div>
                    </div>;
                  })}
                  {!moods.length && <Empty icon="☺" text="Ekhono kono entry nei"/>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── REPORT ── */}
        {activePage==="report" && (
          <div style={S.page}>
            <PageHeader title="Monthly Report" sub={new Date().toLocaleDateString("en-BD",{month:"long",year:"numeric"})}>
              <Btn onClick={generateReport} accent>{reportLoading?"Generating...":"AI Analysis ↗"}</Btn>
            </PageHeader>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
              {[{label:"Income",value:fmt(totalIncome)},{label:"Spent",value:fmt(totalSpent)},{label:"Saved",value:fmt(Math.max(0,totalIncome-totalSpent)),green:true}].map(m=>(
                <div key={m.label} style={{...S.card,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:600,fontFamily:"monospace",color:m.green?"var(--green)":"var(--text)"}}>{m.value}</div>
                  <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={S.grid2}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Top Spending</div>
                {Object.entries(monthExp.reduce((acc,e)=>{acc[e.cat]=(acc[e.cat]||0)+e.amount;return acc;},{}as Record<string,number>)).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([cat,amt])=>(
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
                    <Tag cat={cat}/><div style={{flex:1,height:6,background:"var(--bg4)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:Math.round(amt/totalSpent*100)+"%",background:catColor(cat),borderRadius:3}}/></div>
                    <div style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace",width:70,textAlign:"right"}}>{fmt(amt)}</div>
                  </div>
                ))}
                {!monthExp.length && <Empty icon="📊" text="Kono data nei"/>}
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Habit Performance</div>
                {habits.map(h=>{
                  const days:string[]=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}
                  const done=days.filter(d=>habitLogs[h.id]?.includes(d)).length;
                  return <div key={h.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                    <span style={{fontSize:13}}>{h.name}</span>
                    <span style={{fontSize:11,fontFamily:"monospace",color:done>=h.freq?"var(--green)":"var(--amber)"}}>{done}/{h.freq} this week</span>
                  </div>;
                })}
                {!habits.length && <Empty icon="✅" text="Kono habit nei"/>}
              </div>
            </div>
            {(reportContent || reportLoading) && (
              <div style={{...S.card,marginTop:16}}>
                <div style={S.sectionTitle}>AI Insights</div>
                {reportLoading ? <div style={{color:"var(--text3)",fontSize:13}}>Generating...</div>
                  : <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{reportContent}</div>}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activePage==="settings" && (
          <div style={S.page}>
            <PageHeader title="Settings" sub="profile ar account" />
            <div style={S.card}>
              <div style={S.sectionTitle}>Profile</div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <FormField label="Display name">
                  <input style={S.input} value={settingsDisplayName} onChange={(e) => setSettingsDisplayName(e.target.value)} placeholder="Tomar naam" />
                </FormField>
                <FormField label="Bio (optional)">
                  <textarea style={{ ...S.input, resize:"none", minHeight:88 }} value={profileBio} onChange={(e) => setProfileBio(e.target.value)} placeholder="Choto intro — nijeke remind korar jonno" />
                </FormField>
                <Btn onClick={handleSaveSettings} accent>{settingsSaving ? "Saving..." : "Save profile"}</Btn>
              </div>
            </div>
            <div style={{ ...S.card, marginTop:16 }}>
              <div style={S.sectionTitle}>Account</div>
              <div style={{ fontSize:13, color:"var(--text2)", marginBottom:6 }}>{user?.email}</div>
              <div style={{ fontSize:11, color:"var(--text3)", lineHeight:1.5 }}>
                Password change korar jonno logout kore login page theke &quot;Forgot password&quot; use korte paro (email login hole).
              </div>
            </div>
          </div>
        )}

        {/* ── AI ── */}
        {activePage==="ai" && (
          <div style={S.page}>
            <PageHeader title="AI Advisor" sub="tomar data analyze kore real advice debo"/>
            <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 160px)"}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                {["💸 Spending analysis","📊 Budget suggest","🗓 Routine check","🎯 Savings advice","❤️ Financial health"].map(q=>(
                  <button key={q} onClick={()=>sendAI(q)} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:20,padding:"5px 12px",fontSize:11,color:"var(--text2)",cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
                ))}
              </div>
              <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:14,padding:"4px 0"}} id="ai-scroll">
                {aiMessages.map((m,i)=>(
                  <div key={i} style={{display:"flex",gap:10,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}>
                    <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,background:m.role==="user"?"var(--bg4)":"linear-gradient(135deg,var(--accent),var(--teal))",color:m.role==="user"?"var(--text2)":"#fff"}}>
                      {m.role==="user"?"U":"L"}
                    </div>
                    <div style={{maxWidth:"75%",padding:"12px 16px",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",borderRadius:m.role==="user"?"14px 4px 14px 14px":"4px 14px 14px 14px",background:m.role==="user"?"var(--accent)":"var(--bg3)",color:m.role==="user"?"#fff":"var(--text)",border:m.role==="user"?"none":"1px solid var(--border)"}}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,var(--accent),var(--teal))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>L</div>
                    <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"4px 14px 14px 14px",padding:"12px 16px"}}>
                      <div style={{display:"flex",gap:4}}>
                        {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"var(--text3)",animation:"pulse 1.2s ease infinite",animationDelay:i*0.2+"s"}}/>)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:10,paddingTop:14,borderTop:"1px solid var(--border)"}}>
                <textarea style={{...S.input,flex:1,resize:"none",height:42,paddingTop:10}} value={aiInput} onChange={e=>setAiInput(e.target.value)} placeholder="Jiggesh koro — Bangla/English duitai cholbe..." onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAI(aiInput);}}}/>
                <button onClick={()=>sendAI(aiInput)} style={{background:"var(--accent)",border:"none",borderRadius:10,width:42,height:42,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>↑</button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── MODALS ── */}
      {modal && (
        <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:20,padding:28,width:460,maxWidth:"95vw"}}>

            {modal==="expense" && <>
              <div style={S.modalTitle}>{expenseEditId ? "Edit Expense" : "New Expense"}</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <FormField label="Amount (৳)"><input style={S.input} type="number" value={expForm.amount} onChange={e=>setExpForm(p=>({...p,amount:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Category"><select style={S.input} value={expForm.cat} onChange={e=>setExpForm(p=>({...p,cat:e.target.value}))}>
                    {expenseCatSelectOptions.map(c=><option key={c}>{c}</option>)}
                  </select></FormField>
                </div>
                <FormField label="Description"><input style={S.input} value={expForm.desc} onChange={e=>setExpForm(p=>({...p,desc:e.target.value}))} placeholder="Ki khoroch korle?"/></FormField>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <FormField label="Date"><input style={S.input} type="date" value={expForm.date} onChange={e=>setExpForm(p=>({...p,date:e.target.value}))}/></FormField>
                  <FormField label="Method"><select style={S.input} value={expForm.method} onChange={e=>setExpForm(p=>({...p,method:e.target.value}))}>
                    {["Cash","Bkash","Card","Nagad","Bank"].map(m=><option key={m}>{m}</option>)}
                  </select></FormField>
                </div>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleSaveExpense}/>
            </>}

            {modal==="subscription" && <>
              <div style={S.modalTitle}>New Subscription</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FormField label="Name"><input style={S.input} value={subForm.name} onChange={e=>setSubForm(p=>({...p,name:e.target.value}))} placeholder="Netflix, ChatGPT, Gym..."/></FormField>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <FormField label="Amount (৳)"><input style={S.input} type="number" value={subForm.amount} onChange={e=>setSubForm(p=>({...p,amount:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Billing"><select style={S.input} value={subForm.cycle} onChange={e=>setSubForm(p=>({...p,cycle:e.target.value as "monthly"|"yearly"}))}>
                    <option value="monthly">Per month</option>
                    <option value="yearly">Per year</option>
                  </select></FormField>
                </div>
                <FormField label="Note (optional)"><input style={S.input} value={subForm.note} onChange={e=>setSubForm(p=>({...p,note:e.target.value}))} placeholder="Renewal date, plan name..."/></FormField>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleAddSubscription}/>
            </>}

            {modal==="income" && <>
              <div style={S.modalTitle}>New Income Source</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FormField label="Source Name"><input style={S.input} value={incForm.name} onChange={e=>setIncForm(p=>({...p,name:e.target.value}))} placeholder="Freelance, Job, Tuition..."/></FormField>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <FormField label="Amount (৳)"><input style={S.input} type="number" value={incForm.amount} onChange={e=>setIncForm(p=>({...p,amount:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Type"><select style={S.input} value={incForm.type} onChange={e=>setIncForm(p=>({...p,type:e.target.value}))}>
                    <option value="fixed">Fixed</option><option value="variable">Variable</option><option value="irregular">Irregular</option>
                  </select></FormField>
                </div>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleAddIncome}/>
            </>}

            {modal==="goal" && <>
              <div style={S.modalTitle}>New Savings Goal</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12}}>
                  <FormField label="Goal Name"><input style={S.input} value={goalForm.name} onChange={e=>setGoalForm(p=>({...p,name:e.target.value}))} placeholder="Bike, Emergency Fund..."/></FormField>
                  <FormField label="Emoji"><input style={{...S.input,width:60}} value={goalForm.emoji} onChange={e=>setGoalForm(p=>({...p,emoji:e.target.value}))} maxLength={2}/></FormField>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <FormField label="Target (৳)"><input style={S.input} type="number" value={goalForm.target} onChange={e=>setGoalForm(p=>({...p,target:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Saved So Far (৳)"><input style={S.input} type="number" value={goalForm.current} onChange={e=>setGoalForm(p=>({...p,current:e.target.value}))} placeholder="0"/></FormField>
                </div>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleAddGoal}/>
            </>}

            {modal==="task" && <>
              <div style={S.modalTitle}>New Task</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FormField label="Task Name"><input style={S.input} value={taskForm.name} onChange={e=>setTaskForm(p=>({...p,name:e.target.value}))} placeholder="Ki korte hobe?"/></FormField>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  <FormField label="Time"><input style={S.input} type="time" value={taskForm.time} onChange={e=>setTaskForm(p=>({...p,time:e.target.value}))}/></FormField>
                  <FormField label="Duration"><select style={S.input} value={taskForm.dur} onChange={e=>setTaskForm(p=>({...p,dur:e.target.value}))}>
                    {[["15","15 min"],["30","30 min"],["60","1 hour"],["90","1.5 hr"],["120","2 hours"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select></FormField>
                  <FormField label="Type"><select style={S.input} value={taskForm.cat} onChange={e=>setTaskForm(p=>({...p,cat:e.target.value}))}>
                    <option value="purple">Work</option><option value="teal">Health</option><option value="amber">Learning</option><option value="coral">Personal</option>
                  </select></FormField>
                </div>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleAddTask}/>
            </>}

            {modal==="habit" && <>
              <div style={S.modalTitle}>New Habit</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FormField label="Habit Name"><input style={S.input} value={habitForm.name} onChange={e=>setHabitForm(p=>({...p,name:e.target.value}))} placeholder="Pani khawa, Exercise, Reading..."/></FormField>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <FormField label="Target/week"><select style={S.input} value={habitForm.freq} onChange={e=>setHabitForm(p=>({...p,freq:e.target.value}))}>
                    <option value="7">Every day</option><option value="5">5 days</option><option value="3">3 days</option><option value="1">Once a week</option>
                  </select></FormField>
                  <FormField label="Color"><select style={S.input} value={habitForm.color} onChange={e=>setHabitForm(p=>({...p,color:e.target.value}))}>
                    <option value="var(--accent)">Purple</option><option value="var(--teal)">Teal</option><option value="var(--amber)">Amber</option><option value="var(--green)">Green</option>
                  </select></FormField>
                </div>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleAddHabit}/>
            </>}

          </div>
        </div>
      )}
      <style>{`@keyframes pulse{0%,60%,100%{transform:scale(0.8);opacity:0.3}30%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

// ─── SMALL COMPONENTS ────────────────────────────────
const catColors = { purple:"var(--accent)", teal:"var(--teal)", amber:"var(--amber)", coral:"#f87171" };

function Tag({ cat }: { cat: string }) {
  const tagColors: Record<string,{bg:string;color:string}> = {
    Food:{bg:"rgba(124,111,255,0.15)",color:"var(--accent2)"},
    Transport:{bg:"rgba(45,212,191,0.1)",color:"var(--teal)"},
    Bills:{bg:"rgba(251,191,36,0.1)",color:"var(--amber)"},
    Shopping:{bg:"rgba(244,114,182,0.1)",color:"var(--pink)"},
    Health:{bg:"rgba(52,211,153,0.1)",color:"var(--green)"},
    Education:{bg:"rgba(96,165,250,0.1)",color:"var(--blue)"},
    Entertainment:{bg:"rgba(248,113,113,0.1)",color:"var(--red)"},
  };
  const c = tagColors[cat] || {bg:"var(--bg4)",color:"var(--text2)"};
  return <span style={{display:"inline-block",fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:500,background:c.bg,color:c.color}}>{cat}</span>;
}

function ExpItem({ e, onEdit, onDelete }: { e: Expense; onEdit: (e: Expense)=>void; onDelete: (id:string)=>void }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:catColor(e.cat),flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.desc}</div>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}><Tag cat={e.cat}/> · {e.method||"Cash"}</div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{fontSize:13,fontWeight:600,fontFamily:"monospace"}}>{fmt(e.amount)}</div>
        <div style={{fontSize:10,color:"var(--text3)"}}>{e.date}</div>
      </div>
      <button type="button" title="Edit" onClick={()=>onEdit(e)} style={{fontSize:12,color:"var(--accent)",cursor:"pointer",opacity:0.65,background:"none",border:"none",padding:"4px 2px",fontFamily:"inherit"}}>✎</button>
      <span onClick={()=>onDelete(e.id)} style={{fontSize:16,color:"var(--red)",cursor:"pointer",opacity:0.3}}>×</span>
    </div>
  );
}

function CatBreakdown({ expenses }: { expenses: Expense[] }) {
  const cats: Record<string,number> = {};
  expenses.forEach(e => { cats[e.cat] = (cats[e.cat]||0) + e.amount; });
  const total = Object.values(cats).reduce((s,v)=>s+v,0)||1;
  if (!Object.keys(cats).length) return <Empty icon="📊" text="Data nei"/>;
  return <>{Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
    <div key={cat} style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <Tag cat={cat}/><span style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace"}}>{fmt(amt)} · {Math.round(amt/total*100)}%</span>
      </div>
      <div style={{height:6,background:"var(--bg4)",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:Math.round(amt/total*100)+"%",background:catColor(cat),borderRadius:3}}/>
      </div>
    </div>
  ))}</>;
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return <div style={{textAlign:"center",padding:"30px 20px",color:"var(--text3)"}}>
    <div style={{fontSize:28,marginBottom:10,opacity:0.5}}>{icon}</div>
    <div style={{fontSize:12}}>{text}</div>
  </div>;
}

function PageHeader({ title, sub, children }: { title:string; sub?:string; children?: React.ReactNode }) {
  return <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}>
    <div>
      <div style={{fontSize:22,fontWeight:600,letterSpacing:-0.3}}>{title}</div>
      {sub && <div style={{fontSize:11,color:"var(--text3)",marginTop:4,fontFamily:"monospace"}}>{sub}</div>}
    </div>
    {children && <div style={{display:"flex",gap:8}}>{children}</div>}
  </div>;
}

function FormField({ label, children }: { label:string; children: React.ReactNode }) {
  return <div style={{display:"flex",flexDirection:"column",gap:5}}>
    <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"monospace"}}>{label}</div>
    {children}
  </div>;
}

function ModalActions({ onCancel, onSave }: { onCancel:()=>void; onSave:()=>void }) {
  return <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
    <button style={S.btnStyle} onClick={onCancel}>Cancel</button>
    <button style={{...S.btnStyle,...S.btnAccent}} onClick={onSave}>Save</button>
  </div>;
}

function Btn({ children, onClick, accent }: { children:React.ReactNode; onClick:()=>void; accent?:boolean }) {
  return <button style={{...S.btnStyle,...(accent?S.btnAccent:{})}} onClick={onClick}>{children}</button>;
}

// ─── STYLES ──────────────────────────────────────────
const S: Record<string,React.CSSProperties> = {
  app: {display:"flex",height:"100vh",overflow:"hidden",background:"var(--bg)"},
  sidebar: {width:240,background:"var(--bg2)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",padding:"20px 0",flexShrink:0,height:"100vh",overflowY:"auto"},
  sidebarLogo: {padding:"0 20px 20px",borderBottom:"1px solid var(--border)"},
  logoText: {fontSize:18,fontWeight:600,letterSpacing:-0.3},
  logoSub: {fontSize:10,color:"var(--text3)",marginTop:2,fontFamily:"monospace"},
  sidebarUser: {padding:"14px 20px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10},
  avatar: {width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,var(--accent),var(--teal))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:"#fff",flexShrink:0},
  userName: {fontSize:13,fontWeight:500},
  userEmail: {fontSize:10,color:"var(--text3)"},
  navSection: {fontSize:9,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 20px 6px",fontFamily:"monospace"},
  navItem: {display:"flex",alignItems:"center",gap:10,padding:"9px 20px",cursor:"pointer",fontSize:13,color:"var(--text2)",borderLeft:"2px solid transparent",transition:"all 0.15s"},
  navItemActive: {background:"rgba(124,111,255,0.15)",color:"var(--accent2)",borderLeftColor:"var(--accent)",fontWeight:500},
  badge: {marginLeft:"auto",background:"var(--accent)",color:"#fff",fontSize:9,padding:"2px 6px",borderRadius:10,fontFamily:"monospace"},
  logout: {padding:"14px 20px",borderTop:"1px solid var(--border)",cursor:"pointer",fontSize:12,color:"var(--text3)",display:"flex",alignItems:"center",gap:8},
  main: {flex:1,overflowY:"auto",height:"100vh"},
  page: {padding:28,minHeight:"100%",animation:"pageIn 0.3s ease both"},
  notif: {background:"rgba(124,111,255,0.1)",border:"1px solid rgba(124,111,255,0.2)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"var(--accent2)",display:"flex",alignItems:"center",gap:8,marginBottom:16},
  notifDot: {width:6,height:6,borderRadius:"50%",background:"var(--accent)",flexShrink:0},
  metricsGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20},
  metricCard: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:14,padding:"16px 20px"},
  metricLabel: {fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontFamily:"monospace"},
  metricValue: {fontSize:24,fontWeight:600,letterSpacing:-0.5},
  metricSub: {fontSize:11,color:"var(--text3)",marginTop:5},
  card: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:14,padding:"18px 20px"},
  grid2: {display:"grid",gridTemplateColumns:"1fr 320px",gap:16},
  sectionTitle: {fontSize:12,fontWeight:500,color:"var(--text2)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14,fontFamily:"monospace"},
  input: {background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",width:"100%"},
  modalTitle: {fontSize:16,fontWeight:600,marginBottom:20},
  btnStyle: {background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:500,cursor:"pointer",color:"var(--text2)",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6},
  btnAccent: {background:"var(--accent)",borderColor:"var(--accent)",color:"#fff"},
};
