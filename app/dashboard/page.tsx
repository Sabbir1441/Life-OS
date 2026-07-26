"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import * as DB from "@/lib/db";
import * as Months from "@/lib/months";
import type { PlannerMonth, MonthSummary } from "@/lib/months";
import { fmt, setCurrencySymbol } from "@/lib/format";
import { downloadCsv } from "@/lib/export-csv";
import { downloadMonthPdf } from "@/lib/export-pdf";
import { monthGrid, buildCalendarEvents, dateKey } from "@/lib/calendar-utils";
import { useSyncStatus } from "@/lib/use-sync-status";
import { buildDueReminders, requestNotificationPermission, showSystemNotification } from "@/lib/notifications";
import { openWhatsAppReminder, buildReminderMessage } from "@/lib/whatsapp";
import { VoiceMic } from "@/components/voice-mic";
import { buildDailyBrief, deadlineLabel } from "@/lib/daily-brief";
import { sortUrgentFirst, splitUrgentNormal } from "@/lib/sort-priority";
import { MorningBriefScheduler } from "@/components/morning-brief-scheduler";

// ─── TYPES ───────────────────────────────────────────
type Expense = { id: string; amount: number; cat: string; desc: string; date: string; method: string };
type Income = { id: string; name: string; amount: number; type: string; receiveDate?: string };
type Goal = { id: string; name: string; emoji: string; target: number; current: number; deadline?: string };
type Task = { id: string; name: string; time: string; dur: number; cat: string; done: boolean };
type Habit = { id: string; name: string; freq: number; color: string };
type MoodLog = { id: string; mood: number; label: string; note: string; energy: number; date: string };
type Subscription = { id: string; name: string; amount: number; cycle: "monthly" | "yearly"; note?: string; nextBill?: string; cat?: string };
type Debt = { id: string; name: string; total: number; paid: number; emi: number; dueDay?: number; interest?: number };
type Todo = { id: string; title: string; note?: string; priority: "low" | "medium" | "high"; dueDate?: string; done: boolean; urgent?: boolean; subtasks?: { text: string; done: boolean }[] };
type Lending = {
  id: string;
  person: string;
  amount: number;
  direction: "borrowed" | "lent";
  status: "processing" | "pending" | "completed";
  dueDate?: string;
  note?: string;
  urgent?: boolean;
};

const CURRENCIES: Record<string, string> = { BDT: "৳", USD: "$", EUR: "€", GBP: "£" };

// ─── HELPERS ─────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const catColor = (cat: string) => ({ Food:"#7c6fff",Transport:"#2dd4bf",Bills:"#fbbf24",Shopping:"#f472b6",Health:"#34d399",Education:"#60a5fa",Entertainment:"#f87171" }[cat] || "#888");
const catIcon = (cat: string) => ({ Food:"🍽️",Transport:"🚌",Bills:"🧾",Shopping:"🛍️",Health:"❤️‍🩹",Education:"📚",Entertainment:"🎬" }[cat] || "💸");
const subIcon = (c?: string) => ({ streaming:"📺",tools:"🛠️",gym:"🏋️",music:"🎵",cloud:"☁️",education:"📚",other:"🔁" }[c || "other"] || "🔁");
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
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [months, setMonths] = useState<PlannerMonth[]>([]);
  const [activeMonth, setActiveMonth] = useState<PlannerMonth | null>(null);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [newMonthForm, setNewMonthForm] = useState(() => ({
    label: "",
    startDate: todayStr(),
  }));
  const [nextMonthForm, setNextMonthForm] = useState(() => ({
    label: "",
    startDate: todayStr(),
  }));
  const [todos, setTodos] = useState<Todo[]>([]);
  const [lending, setLending] = useState<Lending[]>([]);
  const [todoFilter, setTodoFilter] = useState<"all" | "active" | "done">("active");
  const [lendingFilter, setLendingFilter] = useState<"all" | "borrowed" | "lent" | "open">("open");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const syncStatus = useSyncStatus();

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
  const [expSearch, setExpSearch] = useState("");
  const [incForm, setIncForm] = useState({ name:"", amount:"", type:"fixed", receiveDate:"" });
  const [incomeEditId, setIncomeEditId] = useState<string | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtForm, setDebtForm] = useState({ name:"", total:"", paid:"", emi:"", dueDay:"", interest:"" });
  const [debtEditId, setDebtEditId] = useState<string | null>(null);
  const [todoForm, setTodoForm] = useState({ title: "", note: "", priority: "medium" as Todo["priority"], dueDate: "", urgent: false, subtasks: "" });
  const [todoEditId, setTodoEditId] = useState<string | null>(null);
  const [lendingForm, setLendingForm] = useState({ person: "", amount: "", direction: "borrowed" as Lending["direction"], dueDate: "", note: "", urgent: false });
  const [lendingEditId, setLendingEditId] = useState<string | null>(null);
  const [closeSummary, setCloseSummary] = useState<MonthSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<{ label: string; summary: MonthSummary } | null>(null);
  const [copyRoutine, setCopyRoutine] = useState(true);
  const [copyHabitsOpt, setCopyHabitsOpt] = useState(true);
  const [currencyChoice, setCurrencyChoice] = useState("BDT");
  const [subForm, setSubForm] = useState({ name:"", amount:"", cycle:"monthly" as "monthly"|"yearly", note:"", nextBill:"", cat:"other" });
  const [goalForm, setGoalForm] = useState({ name:"", emoji:"🎯", target:"", current:"", deadline:"" });
  const [taskForm, setTaskForm] = useState({ name:"", time:"09:00", dur:"60", cat:"purple" });
  const [habitForm, setHabitForm] = useState({ name:"", freq:"7", color:"var(--accent)" });
  const [selectedMood, setSelectedMood] = useState<{score:number;label:string}|null>(null);
  const [moodNote, setMoodNote] = useState("");
  const [moodEnergy, setMoodEnergy] = useState("");
  const [newBudgetCat, setNewBudgetCat] = useState("");

  // Load all data for active planner month
  const loadData = useCallback(async (monthIdOverride?: string) => {
    if (!user) return;
    setDataLoading(true);
    setLoadError(null);
    try {
      let active: PlannerMonth;
      if (monthIdOverride) {
        const found = await Months.getMonth(user.uid, monthIdOverride);
        active = found ?? await Months.ensureMonthSetup(user.uid);
      } else {
        active = await Months.ensureMonthSetup(user.uid);
      }
      const mid = active.id;
      const allMonths = await Months.getMonths(user.uid);
      setActiveMonth(active);
      setMonths(allMonths);

      const [exps, incs, subs, bud, gls, tsk, hab, hlogs, mds, prof, dbt, tds, lnd] = await Promise.all([
        DB.getExpenses(user.uid, mid),
        DB.getIncome(user.uid, mid),
        DB.getSubscriptions(user.uid),
        DB.getBudget(user.uid, mid),
        DB.getGoals(user.uid, mid),
        DB.getTasks(user.uid, mid),
        DB.getHabits(user.uid, mid),
        DB.getHabitLogs(user.uid, mid),
        DB.getMoods(user.uid, mid),
        DB.getProfile(user.uid),
        DB.getDebts(user.uid),
        DB.getTodos(user.uid),
        DB.getLending(user.uid),
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
      setWhatsappPhone(typeof p.whatsappPhone === "string" ? p.whatsappPhone : "");
      setSettingsDisplayName(user.displayName || (typeof p.displayName === "string" ? p.displayName : "") || "");
      const cur = typeof p.currency === "string" ? p.currency : "BDT";
      setCurrencyChoice(cur);
      setCurrencySymbol(CURRENCIES[cur] ?? "৳");
      const rawDebts = dbt as Record<string, unknown>[];
      setDebts(rawDebts.map((r) => ({
        id: r.id as string,
        name: String(r.name ?? ""),
        total: typeof r.total === "number" ? r.total : parseFloat(String(r.total)) || 0,
        paid: typeof r.paid === "number" ? r.paid : parseFloat(String(r.paid)) || 0,
        emi: typeof r.emi === "number" ? r.emi : parseFloat(String(r.emi)) || 0,
        dueDay: typeof r.dueDay === "number" ? r.dueDay : undefined,
      })));
      const rawTodos = tds as Record<string, unknown>[];
      setTodos(rawTodos.map((r) => ({
        id: r.id as string,
        title: String(r.title ?? ""),
        note: typeof r.note === "string" ? r.note : undefined,
        priority: (r.priority === "low" || r.priority === "high" ? r.priority : "medium") as Todo["priority"],
        dueDate: typeof r.dueDate === "string" ? r.dueDate : undefined,
        done: Boolean(r.done),
        urgent: Boolean(r.urgent),
      })).sort((a, b) => Number(a.done) - Number(b.done)));
      const rawLending = lnd as Record<string, unknown>[];
      setLending(rawLending.map((r) => ({
        id: r.id as string,
        person: String(r.person ?? ""),
        amount: typeof r.amount === "number" ? r.amount : parseFloat(String(r.amount)) || 0,
        direction: r.direction === "lent" ? "lent" : "borrowed",
        status: r.status === "completed" ? "completed" : r.status === "pending" ? "pending" : "processing",
        dueDate: typeof r.dueDate === "string" ? r.dueDate : undefined,
        note: typeof r.note === "string" ? r.note : undefined,
        urgent: Boolean(r.urgent),
      })));
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
    if (!modal) {
      setExpenseEditId(null);
      setIncomeEditId(null);
      setDebtEditId(null);
      setTodoEditId(null);
      setLendingEditId(null);
    }
  }, [modal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 900) setNavOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const dueReminders = useMemo(
    () =>
      buildDueReminders({
        debts,
        subscriptions,
        todos,
        lending,
        today: todayStr(),
        dayOfMonth: new Date().getDate(),
        fmt,
      }),
    [debts, subscriptions, todos, lending]
  );

  useEffect(() => {
    if (!user || dataLoading || dueReminders.length === 0) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const key = `lifeos-notif-${todayStr()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    showSystemNotification(
      "LifeOS — Ajke due",
      dueReminders.slice(0, 3).map((r) => r.title).join(", ")
    );
  }, [user, dataLoading, dueReminders]);

  // ─── COMPUTED ───────────────────────────────────────
  const canEdit = activeMonth?.status === "active";
  const monthLabel = activeMonth?.label ?? "This month";
  const totalIncome = income.reduce((s,i) => s+i.amount, 0);
  const monthExp = expenses;
  const totalSpent = monthExp.reduce((s,e) => s+e.amount, 0);
  const remaining = totalIncome - totalSpent;
  const todayDoneHabits = habits.filter(h => habitLogs[h.id]?.includes(todayStr())).length;
  const totalSubMonthly = subscriptions.reduce((s, sub) => s + subMonthly(sub), 0);
  const totalDebtRemaining = debts.reduce((s, d) => s + Math.max(0, d.total - d.paid), 0);
  const totalEmiMonthly = debts.reduce((s, d) => s + d.emi, 0);
  const activeTodos = todos.filter((t) => !t.done);
  const openLending = lending.filter((l) => l.status !== "completed");
  const monthStartLabel = activeMonth?.startDate
    ? new Date(activeMonth.startDate + "T12:00:00").toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const calendarEvents = buildCalendarEvents({
    expenses,
    todos,
    tasks,
    moods,
    lending,
    debts,
    year: calendarMonth.year,
    month: calendarMonth.month,
  });
  const calGrid = monthGrid(calendarMonth.year, calendarMonth.month);
  const calLabel = new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString("en-BD", { month: "long", year: "numeric" });
  const today = todayStr();
  const dailyBrief = useMemo(
    () =>
      buildDailyBrief({
        today,
        todos,
        lending,
        tasks,
        debts,
        fmt,
      }),
    [today, todos, lending, tasks, debts]
  );
  const sortedActiveTodos = useMemo(() => sortUrgentFirst(activeTodos), [activeTodos]);
  const sortedOpenLending = useMemo(() => sortUrgentFirst(openLending), [openLending]);

  async function handleSwitchMonth(monthId: string) {
    if (!user) return;
    await Months.switchActiveMonth(user.uid, monthId);
    setMonthMenuOpen(false);
    await loadData(monthId);
  }

  async function openCloseMonthModal() {
    if (!user || !activeMonth || !canEdit) return;
    const summary = await Months.buildMonthSummary(user.uid, activeMonth.id);
    setCloseSummary(summary);
    setNextMonthForm({ label: "", startDate: todayStr() });
    setModal("closeMonth");
    setMonthMenuOpen(false);
  }

  async function confirmCloseMonth() {
    if (!user || !activeMonth) return;
    const copyOpts = { tasks: copyRoutine, habits: copyHabitsOpt };
    const { next } = await Months.closeMonthAndStartNext(
      user.uid,
      activeMonth.id,
      copyOpts,
      { label: nextMonthForm.label, startDate: nextMonthForm.startDate || todayStr() }
    );
    setCloseSummary(null);
    setModal(null);
    await loadData(next.id);
  }

  async function handleCreateMonth() {
    if (!user || !activeMonth) return;
    if (!newMonthForm.startDate) return;
    const copyOpts = { tasks: copyRoutine, habits: copyHabitsOpt };
    const created = await Months.startCustomMonth(
      user.uid,
      { label: newMonthForm.label, startDate: newMonthForm.startDate },
      activeMonth.id,
      copyOpts
    );
    setModal(null);
    setMonthMenuOpen(false);
    await loadData(created.id);
  }

  async function aiHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    return headers;
  }

  function exportMonthCsv() {
    if (!activeMonth) return;
    const rows: string[][] = [
      ["LifeOS Export", activeMonth.label],
      [],
      ["EXPENSES", "Amount", "Category", "Description", "Date", "Method"],
      ...expenses.map((e) => [e.desc, String(e.amount), e.cat, e.desc, e.date, e.method]),
      [],
      ["INCOME", "Amount", "Name", "Type"],
      ...income.map((i) => [i.name, String(i.amount), i.name, i.type]),
      [],
      ["SUMMARY", "Value"],
      ["Total Income", String(totalIncome)],
      ["Total Spent", String(totalSpent)],
      ["Remaining", String(remaining)],
    ];
    downloadCsv(`lifeos-${activeMonth.id}.csv`, rows);
  }

  // ─── ACTIONS ────────────────────────────────────────
  async function handleSaveExpense() {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit || !expForm.amount) return;
    const newExp = { amount: parseFloat(expForm.amount), cat: expForm.cat, desc: expForm.desc || expForm.cat, date: expForm.date, method: expForm.method };
    const wasEdit = !!expenseEditId;
    if (expenseEditId) {
      await DB.updateExpense(user.uid, mid, expenseEditId, newExp);
    } else {
      await DB.addExpense(user.uid, mid, newExp);
    }
    showToast(wasEdit ? "✓ Kharch update hoyeche" : "✓ Kharch add hoyeche");
    setExpForm({ amount:"", cat:"Food", desc:"", date:todayStr(), method:"Cash" });
    setExpenseEditId(null);
    setModal(null);
    loadData();
  }

  function openNewExpenseModal() {
    if (!canEdit) return;
    setExpenseEditId(null);
    setExpForm({ amount:"", cat:"Food", desc:"", date:todayStr(), method:"Cash" });
    setModal("expense");
  }

  async function quickAddExpense(desc: string, cat: string, amount: number) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    await DB.addExpense(user.uid, mid, { amount, cat, desc, date: todayStr(), method: "Cash" });
    loadData();
    showToast(`✓ ${desc} — ${fmt(amount)} add hoyeche`);
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lifeos-theme");
      if (saved === "light" || saved === "dark") { setTheme(saved); document.documentElement.setAttribute("data-theme", saved); }
    } catch {}
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("lifeos-theme", next); } catch {}
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }

  useEffect(() => {
    if (activePage !== "report" || !user || !activeMonth) return;
    const av = activeMonth.year * 12 + activeMonth.month;
    const prev = months
      .filter((m) => m.id !== activeMonth.id && (m.year * 12 + m.month) < av)
      .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))[0];
    if (!prev) { setPrevSummary(null); return; }
    let cancelled = false;
    Months.getMonthSummary(user.uid, prev.id).then((s) => {
      if (cancelled) return;
      setPrevSummary(s ? { label: prev.label, summary: s } : null);
    });
    return () => { cancelled = true; };
  }, [activePage, user, activeMonth, months]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (modal) return;
      if (e.key === "n" && canEdit) { e.preventDefault(); openNewExpenseModal(); }
      else if (e.key === "t") { e.preventDefault(); openNewTodoModal(); }
      else if (e.key === "/") { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === "Escape") { setSearchOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, modal]);

  function openEditExpenseModal(e: Expense) {
    if (!canEdit) return;
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
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    await DB.deleteExpense(user.uid, mid, id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  async function handleSaveIncome() {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit || !incForm.name || !incForm.amount) return;
    const payload = { name: incForm.name, amount: parseFloat(incForm.amount), type: incForm.type, receiveDate: incForm.receiveDate || null };
    if (incomeEditId) {
      await DB.updateIncome(user.uid, mid, incomeEditId, payload);
    } else {
      await DB.addIncome(user.uid, mid, payload);
    }
    setIncForm({ name:"", amount:"", type:"fixed", receiveDate:"" });
    setIncomeEditId(null);
    setModal(null);
    loadData();
  }

  function openNewIncomeModal() {
    if (!canEdit) return;
    setIncomeEditId(null);
    setIncForm({ name:"", amount:"", type:"fixed", receiveDate:"" });
    setModal("income");
  }

  function openEditIncomeModal(inc: Income) {
    if (!canEdit) return;
    setIncomeEditId(inc.id);
    setIncForm({ name: inc.name, amount: String(inc.amount), type: inc.type, receiveDate: inc.receiveDate || "" });
    setModal("income");
  }

  async function handleSaveDebt() {
    if (!user || !debtForm.name || !debtForm.total) return;
    const payload = {
      name: debtForm.name.trim(),
      total: parseFloat(debtForm.total),
      paid: parseFloat(debtForm.paid) || 0,
      emi: parseFloat(debtForm.emi) || 0,
      dueDay: debtForm.dueDay ? parseInt(debtForm.dueDay, 10) : undefined,
      interest: parseFloat(debtForm.interest) || 0,
    };
    if (debtEditId) {
      await DB.updateDebt(user.uid, debtEditId, payload);
    } else {
      await DB.addDebt(user.uid, payload);
    }
    setDebtForm({ name:"", total:"", paid:"", emi:"", dueDay:"", interest:"" });
    setDebtEditId(null);
    setModal(null);
    loadData();
  }

  async function handleDeleteIncome(id: string) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    await DB.deleteIncome(user.uid, mid, id);
    setIncome(prev => prev.filter(i => i.id !== id));
  }

  async function handleAddSubscription() {
    if (!user || !subForm.name.trim() || !subForm.amount) return;
    await DB.addSubscription(user.uid, {
      name: subForm.name.trim(),
      amount: parseFloat(subForm.amount),
      cycle: subForm.cycle,
      note: subForm.note.trim() || undefined,
      nextBill: subForm.nextBill || null,
      cat: subForm.cat || "other",
    });
    setSubForm({ name:"", amount:"", cycle:"monthly", note:"", nextBill:"", cat:"other" });
    setModal(null);
    loadData();
    showToast("✓ Subscription add hoyeche");
  }

  async function handleDeleteSubscription(id: string) {
    if (!user) return;
    await DB.deleteSubscription(user.uid, id);
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleDeleteDebt(id: string) {
    if (!user) return;
    await DB.deleteDebt(user.uid, id);
    setDebts((prev) => prev.filter((d) => d.id !== id));
  }

  function openNewTodoModal() {
    setTodoEditId(null);
    setTodoForm({ title: "", note: "", priority: "medium", dueDate: "", urgent: false, subtasks: "" });
    setModal("todo");
  }

  function openEditTodoModal(t: Todo) {
    setTodoEditId(t.id);
    setTodoForm({ title: t.title, note: t.note || "", priority: t.priority, dueDate: t.dueDate || "", urgent: Boolean(t.urgent), subtasks: (t.subtasks || []).map((s) => s.text).join("\n") });
    setModal("todo");
  }

  async function handleSaveTodo() {
    if (!user || !todoForm.title.trim()) return;
    const existingSubs = todoEditId ? (todos.find((x) => x.id === todoEditId)?.subtasks || []) : [];
    const subtasks = todoForm.subtasks.split("\n").map((s) => s.trim()).filter(Boolean).map((text) => {
      const prev = existingSubs.find((e) => e.text === text);
      return { text, done: prev ? prev.done : false };
    });
    const payload = {
      title: todoForm.title.trim(),
      note: todoForm.note.trim() || undefined,
      priority: todoForm.priority,
      dueDate: todoForm.dueDate || undefined,
      urgent: todoForm.urgent,
      subtasks,
    };
    if (todoEditId) {
      await DB.updateTodo(user.uid, todoEditId, payload);
    } else {
      await DB.addTodo(user.uid, payload);
    }
    setTodoForm({ title: "", note: "", priority: "medium", dueDate: "", urgent: false, subtasks: "" });
    setTodoEditId(null);
    setModal(null);
    loadData();
  }

  async function handleToggleTodo(id: string) {
    if (!user) return;
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    await DB.updateTodo(user.uid, id, { done: !t.done });
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }

  async function handleToggleSubtask(todoId: string, index: number) {
    if (!user) return;
    const t = todos.find((x) => x.id === todoId);
    if (!t || !t.subtasks) return;
    const subtasks = t.subtasks.map((s, i) => (i === index ? { ...s, done: !s.done } : s));
    setTodos((prev) => prev.map((x) => (x.id === todoId ? { ...x, subtasks } : x)));
    await DB.updateTodo(user.uid, todoId, { subtasks });
  }

  async function handleDeleteTodo(id: string) {
    if (!user) return;
    await DB.deleteTodo(user.uid, id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  function openNewLendingModal(direction?: Lending["direction"]) {
    setLendingEditId(null);
    setLendingForm({ person: "", amount: "", direction: direction || "borrowed", dueDate: "", note: "", urgent: false });
    setModal("lending");
  }

  function openEditLendingModal(l: Lending) {
    setLendingEditId(l.id);
    setLendingForm({
      person: l.person,
      amount: String(l.amount),
      direction: l.direction,
      dueDate: l.dueDate || "",
      note: l.note || "",
      urgent: Boolean(l.urgent),
    });
    setModal("lending");
  }

  async function handleSaveLending() {
    if (!user || !lendingForm.person.trim() || !lendingForm.amount) return;
    const direction = lendingForm.direction;
    const payload = {
      person: lendingForm.person.trim(),
      amount: parseFloat(lendingForm.amount),
      direction,
      dueDate: lendingForm.dueDate || undefined,
      note: lendingForm.note.trim() || undefined,
      urgent: lendingForm.urgent,
    };
    if (lendingEditId) {
      const existing = lending.find((l) => l.id === lendingEditId);
      await DB.updateLending(user.uid, lendingEditId, {
        ...payload,
        status: existing?.status ?? (direction === "lent" ? "pending" : "processing"),
      });
    } else {
      await DB.addLending(user.uid, {
        ...payload,
        status: direction === "lent" ? "pending" : "processing",
      });
    }
    setLendingForm({ person: "", amount: "", direction: "borrowed", dueDate: "", note: "", urgent: false });
    setLendingEditId(null);
    setModal(null);
    loadData();
  }

  async function handleCompleteLending(id: string) {
    if (!user) return;
    await DB.updateLending(user.uid, id, { status: "completed" });
    setLending((prev) => prev.map((l) => (l.id === id ? { ...l, status: "completed" } : l)));
  }

  async function handleDeleteLending(id: string) {
    if (!user) return;
    await DB.deleteLending(user.uid, id);
    setLending((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleSaveSettings() {
    if (!user) return;
    const dn = settingsDisplayName.trim();
    setSettingsSaving(true);
    try {
      await updateDisplayName(dn);
      setCurrencySymbol(CURRENCIES[currencyChoice] ?? "৳");
      await DB.saveProfile(user.uid, {
        displayName: dn,
        bio: profileBio.trim(),
        currency: currencyChoice,
        whatsappPhone: whatsappPhone.trim(),
      });
      alert("Profile save hoyeche ✓");
    } catch {
      alert("Save hoyni — abar try koro");
    }
    setSettingsSaving(false);
  }

  async function enablePushReminders() {
    const perm = await requestNotificationPermission();
    if (perm === "granted") {
      await showSystemNotification(
        "LifeOS notifications on ✓",
        "Phone er notification bar e dekhte PWA install koro (Add to Home Screen) + permission allow koro."
      );
      if (dueReminders.length) {
        await showSystemNotification("LifeOS", `${dueReminders.length} ta reminder — urgent gulo age`);
      }
    } else if (perm === "denied") {
      alert("Notification block — browser settings theke LifeOS allow koro");
    }
  }

  function exportMonthPdf() {
    if (!activeMonth) return;
    downloadMonthPdf(`lifeos-${activeMonth.id}.pdf`, {
      monthLabel: activeMonth.label,
      income: totalIncome,
      spent: totalSpent,
      remaining: Math.max(0, remaining),
      expenseCount: expenses.length,
      incomeSources: income.map((i) => ({ name: i.name, amount: i.amount })),
      topExpenses: expenses.slice(0, 15).map((e) => ({ desc: e.desc, amount: e.amount, cat: e.cat, date: e.date })),
      goals: goals.map((g) => ({ name: g.name, current: g.current, target: g.target })),
      fmt,
    });
  }

  function waRemind(item: { title: string; amount?: string; subtitle?: string }) {
    openWhatsAppReminder(buildReminderMessage(item), whatsappPhone || undefined);
  }

  async function handleSaveBudget() {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    await DB.saveBudget(user.uid, mid, budget);
    showToast("✓ Budget saved");
  }

  async function handleAddGoal() {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit || !goalForm.name || !goalForm.target) return;
    await DB.addGoal(user.uid, mid, { name: goalForm.name, emoji: goalForm.emoji || "🎯", target: parseFloat(goalForm.target), current: parseFloat(goalForm.current)||0, deadline: goalForm.deadline || null });
    setGoalForm({ name:"", emoji:"🎯", target:"", current:"", deadline:"" });
    setModal(null);
    loadData();
    showToast("✓ Goal add hoyeche");
  }

  async function handleAddToGoal(g: Goal) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    const amt = parseFloat(prompt("Koto taka add korbe?") || "0");
    if (!amt || amt <= 0) return;
    const newCurrent = Math.min(g.target, g.current + amt);
    await DB.updateGoal(user.uid, mid, g.id, { current: newCurrent });
    loadData();
  }

  async function handleDeleteGoal(id: string) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    await DB.deleteGoal(user.uid, mid, id);
    setGoals(prev => prev.filter(g => g.id !== id));
  }

  async function handleAddTask() {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit || !taskForm.name) return;
    const newTasks = [...tasks, { id: uid(), name: taskForm.name, time: taskForm.time, dur: parseInt(taskForm.dur), cat: taskForm.cat, done: false }]
      .sort((a,b) => a.time.localeCompare(b.time));
    await DB.saveTasks(user.uid, mid, newTasks);
    setTasks(newTasks);
    setTaskForm({ name:"", time:"09:00", dur:"60", cat:"purple" });
    setModal(null);
  }

  async function handleToggleTask(id: string) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    const newTasks = tasks.map(t => t.id === id ? {...t, done: !t.done} : t);
    setTasks(newTasks);
    await DB.saveTasks(user.uid, mid, newTasks);
  }

  async function handleDeleteTask(id: string) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    const newTasks = tasks.filter(t => t.id !== id);
    setTasks(newTasks);
    await DB.saveTasks(user.uid, mid, newTasks);
  }

  async function handleAddHabit() {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit || !habitForm.name) return;
    const newHabits = [...habits, { id: uid(), name: habitForm.name, freq: parseInt(habitForm.freq), color: habitForm.color }];
    await DB.saveHabits(user.uid, mid, newHabits);
    setHabits(newHabits);
    setHabitForm({ name:"", freq:"7", color:"var(--accent)" });
    setModal(null);
  }

  async function handleDeleteHabit(id: string) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    const newHabits = habits.filter(h => h.id !== id);
    const newLogs = { ...habitLogs }; delete newLogs[id];
    await DB.saveHabits(user.uid, mid, newHabits);
    await DB.saveHabitLogs(user.uid, mid, newLogs);
    setHabits(newHabits);
    setHabitLogs(newLogs);
  }

  async function handleToggleHabit(habitId: string, day: string) {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit) return;
    const logs = habitLogs[habitId] || [];
    const newLogs = { ...habitLogs, [habitId]: logs.includes(day) ? logs.filter(d=>d!==day) : [...logs, day] };
    setHabitLogs(newLogs);
    await DB.saveHabitLogs(user.uid, mid, newLogs);
  }

  async function handleSaveMood() {
    const mid = activeMonth?.id;
    if (!user || !mid || !canEdit || !selectedMood) return;
    await DB.addMood(user.uid, mid, { mood: selectedMood.score, label: selectedMood.label, note: moodNote, energy: parseInt(moodEnergy)||5, date: todayStr() });
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

    const openTodos = todos.filter(t => !t.done).length;
    const lentOut = lending.filter(l => l.direction === "lent" && l.status !== "completed").reduce((s,l)=>s+l.amount,0);
    const borrowed = lending.filter(l => l.direction === "borrowed" && l.status !== "completed").reduce((s,l)=>s+l.amount,0);
    const savingsRate = totalIncome ? Math.round(Math.max(0,remaining)/totalIncome*100) : 0;

    const system = `You are a friendly, sharp personal finance and life advisor for a Bangladeshi user. Speak in Banglish (Bangla + English mixed). Be like a smart, caring friend who gives honest, specific advice.
Planner month: ${monthLabel}${canEdit ? " (active)" : " (closed/archive)"}. Income ${fmt(totalIncome)} from ${income.length} sources. Spent: ${fmt(totalSpent)} (${totalIncome ? Math.round(totalSpent/totalIncome*100) : 0}% of income). Remaining: ${fmt(Math.max(0,remaining))} (savings rate ${savingsRate}%). Top spending: ${JSON.stringify(cats)}. Subscriptions (~per month): ${fmt(totalSubMonthly)} (${subscriptions.length} plans). Debts remaining: ${fmt(totalDebtRemaining)} (${debts.length} loans). Dhar — diyechi ${fmt(lentOut)}, niyechi ${fmt(borrowed)}. Savings goals: ${goals.map(g=>g.name+"("+Math.round(g.current/g.target*100)+"%done)").join(", ")||"none"}. Active habits: ${habits.map(h=>h.name).join(", ")||"none"}. Routine tasks: ${tasks.length}. Pending todos: ${openTodos}.
Give practical, specific, actionable advice grounded in the numbers above. When relevant, point out risks (overspending, high debt, low savings) and concrete next steps. Be encouraging but honest. Keep responses concise and skimmable. Use emojis occasionally.`;

    const newHistory = [...aiHistory, userMsg];

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: await aiHeaders(),
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
    const prompt = `Planner month: ${monthLabel}. Income: ${fmt(totalIncome)}, Spent: ${fmt(totalSpent)}, Remaining: ${fmt(totalIncome-totalSpent)}, Subscriptions (~monthly): ${fmt(totalSubMonthly)} (${subscriptions.length} items), Categories: ${JSON.stringify(cats)}, Goals: ${goals.length}, Habits: ${habits.length}. Friendly financial advisor hisebe 3-4 paragraph analysis dao. Banglish-e likho. Specific advice dao — kothay boro khoroch, ki improve korte hobe, savings tips. Bullet points use koro.`;
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({ system: "You are a friendly Bangladeshi financial advisor. Speak in Banglish.", messages: [{ role:"user", content: prompt }] }),
      });
      const data = await res.json();
      setReportContent(data.content?.[0]?.text || "");
    } catch { setReportContent("Error hoyeche."); }
    setReportLoading(false);
  }

  if (loading || dataLoading) {
    return (
      <div style={{padding:28,height:"100vh",background:"var(--bg)",overflow:"hidden"}}>
        <div className="lifeos-skel" style={{width:180,height:26,borderRadius:8,marginBottom:22}}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14,marginBottom:20}}>
          {[0,1,2,3,4].map(i=><div key={i} className="lifeos-skel" style={{height:80,borderRadius:14}}/>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {[0,1].map(i=><div key={i} className="lifeos-skel" style={{height:220,borderRadius:14}}/>)}
        </div>
        <div style={{textAlign:"center",marginTop:26,fontSize:12,color:"var(--text3)"}}>Loading tomar data...</div>
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
    { id:"brief", label:"Ajker Din", icon:"☀" },
    { id:"expenses", label:"Expense Tracker", icon:"≡", section:"Money" },
    { id:"budget", label:"Budget Planner", icon:"◎" },
    { id:"income", label:"Income Sources", icon:"↗" },
    { id:"subscriptions", label:"Subscriptions", icon:"◇" },
    { id:"debts", label:"Debts / EMI", icon:"⬡" },
    { id:"lending", label:"Dhar / Udhár", icon:"⇄" },
    { id:"savings", label:"Savings Goals", icon:"♥" },
    { id:"todos", label:"Todo List", icon:"☑", section:"Life" },
    { id:"calendar", label:"Calendar", icon:"▣" },
    { id:"routine", label:"Daily Routine", icon:"▦" },
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
  const activeNavLabel = navItems.find((i) => i.id === activePage)?.label ?? "LifeOS";

  // ─── RENDER ─────────────────────────────────────────
  return (
    <div className={`lifeos-app${navOpen ? " nav-open" : ""}`} style={S.app}>
      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--text)",padding:"11px 18px",borderRadius:12,fontSize:13,boxShadow:"0 8px 30px rgba(0,0,0,0.35)",display:"flex",alignItems:"center",gap:8,maxWidth:"90vw",animation:"lifeosToastIn 0.2s ease"}}>
          {toast}
        </div>
      )}
      {searchOpen && (()=>{
        const q=globalQuery.trim().toLowerCase();
        const exp=q?expenses.filter(e=>[e.desc,e.cat].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,6):[];
        const tds=q?todos.filter(t=>t.title.toLowerCase().includes(q)).slice(0,6):[];
        const lnd=q?lending.filter(l=>l.person.toLowerCase().includes(q)).slice(0,6):[];
        const go=(page:string)=>{ setActivePage(page); setSearchOpen(false); setGlobalQuery(""); };
        const rowCls="lifeos-nav-item-touch";
        return (
          <div onClick={()=>setSearchOpen(false)} style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.5)",display:"flex",justifyContent:"center",alignItems:"flex-start",paddingTop:"12vh"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"90%",maxWidth:520,background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:16,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"}}>
              <input autoFocus value={globalQuery} onChange={e=>setGlobalQuery(e.target.value)} placeholder="🔍 Expense, todo, dhar khojo..." style={{width:"100%",padding:"16px 18px",fontSize:15,background:"transparent",border:"none",borderBottom:"1px solid var(--border)",color:"var(--text)",outline:"none"}}/>
              <div style={{maxHeight:"50vh",overflowY:"auto",padding:8}}>
                {!q && <div style={{padding:20,textAlign:"center",color:"var(--text3)",fontSize:12}}>Type kore khojo</div>}
                {q && !exp.length && !tds.length && !lnd.length && <div style={{padding:20,textAlign:"center",color:"var(--text3)",fontSize:12}}>Kichu meleni</div>}
                {exp.length>0 && <div style={{fontSize:9,color:"var(--text3)",fontFamily:"monospace",padding:"6px 10px",textTransform:"uppercase"}}>Expenses</div>}
                {exp.map(e=><div key={e.id} onClick={()=>go("expenses")} className={rowCls} style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",borderRadius:8,cursor:"pointer",fontSize:13}}><span>{catIcon(e.cat)} {e.desc}</span><span style={{fontFamily:"monospace",color:"var(--text3)"}}>{fmt(e.amount)}</span></div>)}
                {tds.length>0 && <div style={{fontSize:9,color:"var(--text3)",fontFamily:"monospace",padding:"6px 10px",textTransform:"uppercase"}}>Todos</div>}
                {tds.map(t=><div key={t.id} onClick={()=>go("todos")} className={rowCls} style={{padding:"9px 12px",borderRadius:8,cursor:"pointer",fontSize:13}}>☑ {t.title}</div>)}
                {lnd.length>0 && <div style={{fontSize:9,color:"var(--text3)",fontFamily:"monospace",padding:"6px 10px",textTransform:"uppercase"}}>Dhar</div>}
                {lnd.map(l=><div key={l.id} onClick={()=>go("lending")} className={rowCls} style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",borderRadius:8,cursor:"pointer",fontSize:13}}><span>⇄ {l.person}</span><span style={{fontFamily:"monospace",color:"var(--text3)"}}>{fmt(l.amount)}</span></div>)}
              </div>
            </div>
          </div>
        );
      })()}
      <MorningBriefScheduler brief={dailyBrief} ready={!!user && !dataLoading} />
      <div className="lifeos-sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden />

      {/* SIDEBAR */}
      <aside className={`lifeos-sidebar${navOpen ? " open" : ""}`} style={S.sidebar}>
        <div style={S.sidebarLogo}>
          <div style={S.logoText}>Life<span style={{color:"var(--accent)"}}>OS</span></div>
          <div style={S.logoSub}>v1.0 · monthly planner</div>
        </div>

        <div className="lifeos-month-bar">
          <button type="button" className="lifeos-month-trigger" onClick={() => setMonthMenuOpen((v) => !v)}>
            <span>📅</span>
            <span className="lifeos-month-trigger-label">{monthLabel}</span>
            <span className={`lifeos-month-status ${canEdit ? "active" : "closed"}`}>
              {canEdit ? "active" : "closed"}
            </span>
          </button>
          {monthMenuOpen && (
            <div className="lifeos-month-menu">
              <div className="lifeos-month-menu-title">Tomar months</div>
              {months.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`lifeos-month-option${m.id === activeMonth?.id ? " selected" : ""}`}
                  onClick={() => handleSwitchMonth(m.id)}
                >
                  <span style={{ textAlign: "left" }}>
                    <div>{m.label}</div>
                    {m.startDate && (
                      <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "monospace", marginTop: 2 }}>
                        {new Date(m.startDate + "T12:00:00").toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </span>
                  <span className="lifeos-month-option-tag">{m.status === "closed" ? "closed" : "active"}</span>
                </button>
              ))}
              {canEdit && (
                <>
                  <button type="button" className="lifeos-month-action" onClick={openCloseMonthModal}>
                    Close month → notun suru
                  </button>
                  <button type="button" className="lifeos-month-action accent" onClick={() => { setNewMonthForm({ label: "", startDate: todayStr() }); setModal("newMonth"); setMonthMenuOpen(false); }}>
                    + Notun mas suru
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div style={S.sidebarUser}>
          <div style={S.avatar}>{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={S.userName}>{name}</div>
            <div className="lifeos-user-email" style={S.userEmail}>{user?.email}</div>
          </div>
        </div>
        <div onClick={()=>setSearchOpen(true)} className="lifeos-nav-item-touch" style={{margin:"4px 14px 6px",padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text3)",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
          🔍 Search<span style={{marginLeft:"auto",fontFamily:"monospace",fontSize:10,opacity:0.6,border:"1px solid var(--border)",borderRadius:4,padding:"0 5px"}}>/</span>
        </div>
        <nav style={{padding:"4px 0 10px",flex:1}}>
          {navItems.map((item) => (
            <div key={item.id}>
              {item.section && <div style={S.navSection}>{item.section}</div>}
              <div className="lifeos-nav-item-touch" style={{...S.navItem, ...(activePage===item.id ? S.navItemActive : {})}}
                onClick={() => { setActivePage(item.id); setNavOpen(false); }}>
                <span style={{fontSize:14,opacity:0.8}}>{item.icon}</span>
                {item.label}
                {item.badge && <span style={S.badge}>{item.badge}</span>}
              </div>
            </div>
          ))}
        </nav>
        <div style={S.logout} onClick={toggleTheme}>
          {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
        </div>
        <div style={S.logout} onClick={async()=>{await logout();router.replace("/login");}}>
          ⎋ Logout
        </div>
        <div className={`lifeos-sync-bar lifeos-sync-${syncStatus.state}`}>
          <span className="lifeos-sync-dot" />
          {syncStatus.label}
        </div>
      </aside>

      <div className="lifeos-main-wrap">
        <header className="lifeos-mobile-topbar">
          <button type="button" className="lifeos-menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="lifeos-mobile-title">{activeNavLabel}</div>
          <button type="button" className="lifeos-notif-btn" onClick={() => setNotifOpen((v) => !v)} aria-label="Reminders">
            🔔{dueReminders.length > 0 && <span className="lifeos-notif-badge">{dueReminders.length}</span>}
          </button>
        </header>
        {notifOpen && (
          <div className="lifeos-notif-panel">
            <div className="lifeos-notif-panel-head">
              <span>Ajker reminders ({dueReminders.length})</span>
              <button type="button" onClick={enablePushReminders} className="lifeos-notif-enable">Phone notify</button>
            </div>
            {dueReminders.length === 0 && <div style={{ fontSize: 12, color: "var(--text3)", padding: 8 }}>Kono due nei ajke ✓</div>}
            {dueReminders.map((r) => (
              <div key={r.id} className="lifeos-notif-item">
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{r.urgent && <span className="lifeos-urgent-pill">URGENT</span>}{r.title}</div>
                  {r.subtitle && <div style={{ fontSize: 10, color: "var(--text3)" }}>{r.subtitle}</div>}
                </div>
                <button type="button" className="lifeos-wa-mini" onClick={() => waRemind(r)} title="WhatsApp">WA</button>
              </div>
            ))}
          </div>
        )}

      {/* MAIN */}
      <main className="lifeos-main" style={S.main}>

        {!canEdit && activeMonth && (
          <div className="lifeos-page" style={{ ...S.page, paddingBottom: 0 }}>
            <div style={{ ...S.notif, marginBottom: 0, background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.25)", color: "var(--amber)" }}>
              <div style={S.notifDot} />
              <strong>{activeMonth.label}</strong> closed — archive mode. Edit korar jonno active month select koro ba notun month kholo.
            </div>
          </div>
        )}

        {/* ── AJKER DIN (Morning Brief) ── */}
        {activePage==="brief" && (
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Ajker Din" sub="Protiday 8 AM e auto list — aj ki ki, pending ki">
              <Btn onClick={() => setActivePage("todos")}>Todos</Btn>
              <Btn onClick={enablePushReminders} accent>Phone notify on</Btn>
            </PageHeader>
            <div style={{ ...S.notif, marginBottom: 16, background: "rgba(124,111,255,0.06)", borderColor: "rgba(124,111,255,0.2)" }}>
              <div style={S.notifDot} />
              Sokol 8:00 AM e list auto update. Notification er jonno &quot;Phone notify on&quot; + home screen e add koro.
            </div>
            {[
              { key: "urgent", title: "Urgent — age koro", items: dailyBrief.sections.urgent, empty: "Kono urgent nei" },
              { key: "dueToday", title: "Aj deadline / due", items: dailyBrief.sections.dueToday, empty: "Aj kichu due nei" },
              { key: "pendingTodos", title: "Pending todos", items: dailyBrief.sections.pendingTodos, empty: "Todo clear ✓" },
              { key: "pendingLending", title: "Pending dhar/udhár", items: dailyBrief.sections.pendingLending, empty: "Dhar clear ✓" },
              { key: "routine", title: "Ajker routine", items: dailyBrief.sections.routine, empty: "Routine nei" },
            ].map((sec) => (
              <div key={sec.key} style={{ ...S.card, marginBottom: 12 }}>
                <div style={S.sectionTitle}>{sec.title}</div>
                {sec.items.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>{sec.empty}</div>
                ) : (
                  sec.items.map((item) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 13 }}>{item.label}</span>
                      {item.meta && <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "monospace", flexShrink: 0 }}>{item.meta}</span>}
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {activePage==="dashboard" && (
          <div className="lifeos-page" style={S.page}>
            <div style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace",marginBottom:4}}>{greet}{monthStartLabel ? ` · ${monthLabel} (${monthStartLabel} theke)` : ""}</div>
            <div className="lifeos-welcome-title" style={{fontSize:24,fontWeight:600,letterSpacing:-0.4,marginBottom:16}}>Welcome back, <span style={{color:"var(--accent)"}}>{name}</span></div>

            <div className="lifeos-quick-actions">
              <button type="button" className="lifeos-quick-btn is-primary" onClick={openNewExpenseModal} disabled={!canEdit}>
                Kharch
              </button>
              <button type="button" className="lifeos-quick-btn" onClick={openNewTodoModal}>
                Todo
                {activeTodos.length > 0 && <span className="lifeos-quick-count">{activeTodos.length}</span>}
              </button>
              <button type="button" className="lifeos-quick-btn" onClick={() => setActivePage("todos")}>
                Tasks
              </button>
              <button type="button" className="lifeos-quick-btn" onClick={() => setActivePage("lending")}>
                Dhar
                {openLending.length > 0 && <span className="lifeos-quick-count">{openLending.length}</span>}
              </button>
            </div>

            {debts.filter((d) => d.dueDay === new Date().getDate()).length > 0 && (
              <div style={{ ...S.notif, background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.25)", color: "var(--amber)" }}>
                <div style={{ ...S.notifDot, background: "var(--amber)" }} />
                Aj EMI due: {debts.filter((d) => d.dueDay === new Date().getDate()).map((d) => d.name).join(", ")}
              </div>
            )}

            {totalIncome > 0 && totalSpent/totalIncome > 0.7 && (
              <div style={S.notif}>
                <div style={S.notifDot}/> Ei mashe income-er {Math.round(totalSpent/totalIncome*100)}% khoroch hoyeche — sombre thako!
              </div>
            )}

            {(()=>{ const over=Object.entries(budget).filter(([cat,bud])=>{const sp=monthExp.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0); return bud>0 && sp>bud;}).map(([cat])=>cat); return over.length>0 ? (
              <div style={{ ...S.notif, background:"rgba(248,113,113,0.1)", borderColor:"rgba(248,113,113,0.3)", color:"var(--red)" }}>
                <div style={{ ...S.notifDot, background:"var(--red)" }} /> Budget over: {over.join(", ")} — dhire kharoch koro!
              </div>
            ) : null; })()}

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
                  <div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div>
                  <div style={S.metricSub}>{m.sub}</div>
                </div>
              ))}
            </div>

            <div className="lifeos-grid2" style={S.grid2}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Recent Expenses</div>
                {expenses.slice(0,5).map(e => <ExpItem key={e.id} e={e} canEdit={canEdit} onEdit={openEditExpenseModal} onDelete={handleDeleteExpense}/>)}
                {!expenses.length && <Empty icon="💸" text="Kono expense nei"/>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={S.sectionTitle}>Pending Todos</div>
                    <button type="button" onClick={() => setActivePage("todos")} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>Shob dekho →</button>
                  </div>
                  {sortedActiveTodos.slice(0, 4).map((t) => (
                    <div key={t.id} onClick={() => handleToggleTodo(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, background: "var(--bg3)", cursor: "pointer", marginBottom: 5 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--border2)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.urgent && <span className="lifeos-urgent-dot" />}{t.title}</span>
                      {t.dueDate && <span style={{ fontSize: 9, color: deadlineLabel(t.dueDate, today) === "Overdue" ? "var(--red)" : "var(--amber)", fontFamily: "monospace" }}>{deadlineLabel(t.dueDate, today)}</span>}
                    </div>
                  ))}
                  {!activeTodos.length && <Empty icon="☑" text="Todo nei — upore ✅ click koro"/>}
                </div>
                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={S.sectionTitle}>Dhar / Udhár</div>
                    <button type="button" onClick={() => setActivePage("lending")} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>Shob dekho →</button>
                  </div>
                  {openLending.slice(0, 3).map((l) => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12 }}>{l.person}</div>
                        <div style={{ fontSize: 10, color: "var(--text3)" }}>{l.direction === "borrowed" ? "Niyechi" : "Diyechi"}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>{fmt(l.amount)}</div>
                    </div>
                  ))}
                  {!openLending.length && <Empty icon="🤝" text="Choloman dhar nei"/>}
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Expense Tracker" sub="koto taka kothay jacche">
              <Btn onClick={openNewExpenseModal} accent>+ Add Expense</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"This Month",value:fmt(totalSpent)},
                {label:"Avg per Day",value:fmt(totalSpent/Math.max(1,new Date().getDate()))},
                {label:"Biggest",value:fmt(monthExp.length?Math.max(...monthExp.map(e=>e.amount)):0)},
                {label:"Transactions",value:String(monthExp.length)},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div></div>)}
            </div>
            {canEdit && (
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
                <span style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace",alignSelf:"center",marginRight:2}}>Quick add:</span>
                {[
                  {label:"চা",cat:"Food",amount:20,icon:"☕"},
                  {label:"রিকশা",cat:"Transport",amount:50,icon:"🛺"},
                  {label:"লাঞ্চ",cat:"Food",amount:120,icon:"🍽️"},
                  {label:"বাস",cat:"Transport",amount:30,icon:"🚌"},
                  {label:"রিচার্জ",cat:"Bills",amount:100,icon:"📱"},
                  {label:"নাস্তা",cat:"Food",amount:50,icon:"🍩"},
                ].map(qa=>(
                  <button key={qa.label} type="button" onClick={()=>quickAddExpense(qa.label,qa.cat,qa.amount)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:20,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text2)",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>
                    <span>{qa.icon}</span>{qa.label}<span style={{color:"var(--text3)",fontFamily:"monospace"}}>৳{qa.amount}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="lifeos-grid2" style={S.grid2}>
              <div style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{...S.sectionTitle,marginBottom:0}}>All Transactions</div>
                  <input style={{...S.input,maxWidth:180,padding:"6px 10px",fontSize:12}} placeholder="🔍 Khojo..." value={expSearch} onChange={e=>setExpSearch(e.target.value)}/>
                </div>
                {(()=>{
                  const q=expSearch.trim().toLowerCase();
                  const list=q?expenses.filter(e=>[e.desc,e.cat,e.method,String(e.amount)].some(v=>String(v||"").toLowerCase().includes(q))):expenses;
                  if(!list.length) return <Empty icon="🧾" text={q?"Kichu meleni — onno keyword try koro":"Kono expense nei. Add koro!"}/>;
                  const yd=new Date(); yd.setDate(yd.getDate()-1); const ystr=yd.toISOString().slice(0,10); const tstr=todayStr();
                  const labelFor=(d:string)=> d===tstr?"Aj":d===ystr?"Kal":d;
                  const groups:{label:string;items:Expense[]}[]=[];
                  list.forEach(e=>{ const lab=labelFor(e.date); const g=groups.find(x=>x.label===lab); if(g) g.items.push(e); else groups.push({label:lab,items:[e]}); });
                  return groups.map(g=>(
                    <div key={g.label}>
                      <div style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.08em",margin:"12px 0 2px"}}>{g.label} · {fmt(g.items.reduce((s,e)=>s+e.amount,0))}</div>
                      {g.items.map(e=><ExpItem key={e.id} e={e} canEdit={canEdit} onEdit={openEditExpenseModal} onDelete={handleDeleteExpense}/>)}
                    </div>
                  ));
                })()}
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Budget Planner" sub="income onujaie koto kothay dewa uchit">
              <Btn onClick={()=>{setActivePage("ai");setTimeout(()=>sendAI("Amar income ar এই mash er khoroch dekhe ekta realistic budget suggest koro — kon category te koto taka rakha uchit (taka soho), ar kothay komano jay."),100);}}>AI Suggest ↗</Btn>
              <Btn onClick={handleSaveBudget} accent>Save Budget</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"Monthly Income",value:fmt(totalIncome)},
                {label:"Total Budgeted",value:fmt(Object.values(budget).reduce((s,v)=>s+v,0))},
                {label:"Unallocated",value:fmt(Math.max(0,totalIncome-Object.values(budget).reduce((s,v)=>s+v,0)))},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div></div>)}
            </div>
            {(()=>{
              const totalBud=Object.values(budget).reduce((s,v)=>s+v,0)||0;
              const spent=totalSpent;
              const pct=totalBud?Math.min(100,Math.round(spent/totalBud*100)):0;
              const over=spent>totalBud && totalBud>0;
              const r=42, circ=2*Math.PI*r;
              return (
                <div style={{...S.card,display:"flex",alignItems:"center",gap:20,marginBottom:16,flexWrap:"wrap"}}>
                  <svg width="110" height="110" viewBox="0 0 110 110" style={{flexShrink:0}}>
                    <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg4)" strokeWidth="12"/>
                    <circle cx="55" cy="55" r={r} fill="none" stroke={over?"var(--red)":"var(--teal)"} strokeWidth="12" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)} transform="rotate(-90 55 55)"/>
                    <text x="55" y="52" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text)" fontFamily="monospace">{pct}%</text>
                    <text x="55" y="70" textAnchor="middle" fontSize="9" fill="var(--text3)" fontFamily="monospace">used</text>
                  </svg>
                  <div style={{minWidth:140}}>
                    <div style={{fontSize:13,color:"var(--text2)",marginBottom:5}}>Total budget: <b style={{fontFamily:"monospace"}}>{fmt(totalBud)}</b></div>
                    <div style={{fontSize:13,color:"var(--text2)",marginBottom:5}}>Spent: <b style={{fontFamily:"monospace",color:over?"var(--red)":"var(--text)"}}>{fmt(spent)}</b></div>
                    <div style={{fontSize:12,color:over?"var(--red)":"var(--green)",fontFamily:"monospace"}}>{over?`Over by ${fmt(spent-totalBud)}!`:`Baki ${fmt(Math.max(0,totalBud-spent))}`}</div>
                  </div>
                </div>
              );
            })()}
            <div className="lifeos-grid2" style={S.grid2}>
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Income Sources" sub="multiple sources — ekta jaegay">
              <Btn onClick={openNewIncomeModal} accent>+ Add Source</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"This Month",value:fmt(totalIncome)},
                {label:"Fixed",value:fmt(income.filter(i=>i.type==="fixed").reduce((s,i)=>s+i.amount,0))},
                {label:"Variable",value:fmt(income.filter(i=>i.type!=="fixed").reduce((s,i)=>s+i.amount,0))},
                {label:"Sources",value:String(income.length)},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14}}>
              {income.map(inc=>(
                <div key={inc.id} style={S.card}>
                  <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"monospace",marginBottom:8}}>{inc.type}</div>
                  <div style={{fontSize:14,fontWeight:500}}>{inc.name}</div>
                  <div style={{fontSize:26,fontWeight:600,fontFamily:"monospace",letterSpacing:-0.5,margin:"8px 0"}}>{fmt(inc.amount)}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                    <div style={{fontSize:11,color:"var(--text3)"}}>{inc.receiveDate ? `📅 ${inc.receiveDate}` : "Per month"}</div>
                    <div style={{display:"flex",gap:6}}>
                      {canEdit && <button type="button" onClick={()=>openEditIncomeModal(inc)} style={{fontSize:12,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>✎</button>}
                      {canEdit && <span onClick={()=>handleDeleteIncome(inc.id)} style={{fontSize:18,color:"var(--red)",cursor:"pointer",opacity:0.4}}>×</span>}
                    </div>
                  </div>
                </div>
              ))}
              {!income.length && <Empty icon="💰" text="Income source add koro"/>}
            </div>
          </div>
        )}

        {/* ── SUBSCRIPTIONS ── */}
        {activePage==="subscriptions" && (
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Subscriptions" sub="Netflix, mobile, apps — fixed monthly bleed">
              <Btn onClick={()=>setModal("subscription")} accent>+ Add</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                { label: "~Monthly total", value: fmt(totalSubMonthly) },
                { label: "Per year total", value: fmt(totalSubMonthly * 12) },
                { label: "Active plans", value: String(subscriptions.length) },
                { label: "Monthly / Yearly", value: `${subscriptions.filter((s) => s.cycle === "monthly").length} / ${subscriptions.filter((s) => s.cycle === "yearly").length}` },
              ].map((m) => (
                <div key={m.label} style={S.metricCard}>
                  <div style={S.metricLabel}>{m.label}</div>
                  <div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
              {subscriptions.map((sub) => (
                <div key={sub.id} style={S.card}>
                  <div style={{ fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"monospace", marginBottom:8 }}>
                    {sub.cycle === "yearly" ? "Yearly plan" : "Monthly"}
                  </div>
                  <div style={{ fontSize:14, fontWeight:500, display:"flex", alignItems:"center", gap:6 }}><span>{subIcon(sub.cat)}</span>{sub.name}</div>
                  <div style={{ fontSize:22, fontWeight:600, fontFamily:"monospace", letterSpacing:-0.5, margin:"8px 0" }}>
                    {fmt(sub.amount)}
                    <span style={{ fontSize:12, color:"var(--text3)", fontWeight:400 }}>{sub.cycle === "yearly" ? "/yr" : "/mo"}</span>
                  </div>
                  <div style={{ fontSize:11, color:"var(--teal)", fontFamily:"monospace", marginBottom:8 }}>
                    ≈ {fmt(subMonthly(sub))} / mo equivalent
                  </div>
                  {sub.nextBill && <div style={{ fontSize:11, color: sub.nextBill <= todayStr() ? "var(--red)" : "var(--amber)", fontFamily:"monospace", marginBottom:8 }}>Next bill: {sub.nextBill}</div>}
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

        {/* ── DEBTS ── */}
        {activePage==="debts" && (
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Debts / EMI" sub="loan, credit card, dhar — global track">
              <Btn onClick={()=>{ setDebtEditId(null); setDebtForm({ name:"", total:"", paid:"", emi:"", dueDay:"", interest:"" }); setModal("debt"); }} accent>+ Add Debt</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                { label: "Remaining", value: fmt(totalDebtRemaining) },
                { label: "Monthly EMI", value: fmt(totalEmiMonthly) },
                { label: "Accounts", value: String(debts.length) },
              ].map((m) => (
                <div key={m.label} style={S.metricCard}>
                  <div style={S.metricLabel}>{m.label}</div>
                  <div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
              {debts.map((d) => {
                const pct = d.total ? Math.min(100, Math.round((d.paid / d.total) * 100)) : 0;
                const remain = Math.max(0, d.total - d.paid);
                const monthsLeft = d.emi > 0 && remain > 0 ? Math.ceil(remain / d.emi) : null;
                const yearlyInterest = d.interest && remain > 0 ? Math.round(remain * d.interest / 100) : 0;
                return (
                  <div key={d.id} style={S.card}>
                    <div style={{ fontSize:14, fontWeight:500, marginBottom:8 }}>{d.name}</div>
                    <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", marginBottom:6 }}>
                      Paid {fmt(d.paid)} / {fmt(d.total)} · EMI {fmt(d.emi)}
                    </div>
                    <div style={{ height:6, background:"var(--bg4)", borderRadius:3, overflow:"hidden", marginBottom:8 }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:"var(--teal)", borderRadius:3 }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:6 }}>
                      <span style={{ fontSize:10, color:"var(--text3)", fontFamily:"monospace" }}>Baki {fmt(remain)}</span>
                      {remain <= 0
                        ? <span style={{ fontSize:10, color:"var(--green)", fontFamily:"monospace" }}>SHESH ✓</span>
                        : monthsLeft && <span style={{ fontSize:10, color:"var(--teal)", fontFamily:"monospace" }}>≈ {monthsLeft} mash baki</span>}
                    </div>
                    {d.dueDay && <div style={{ fontSize:10, color:"var(--amber)", fontFamily:"monospace", marginTop:4 }}>Due day: {d.dueDay}</div>}
                    {d.interest ? <div style={{ fontSize:10, color:"var(--amber)", fontFamily:"monospace", marginTop:4 }}>{d.interest}%/yr · sud ~{fmt(yearlyInterest)}/yr</div> : null}
                    <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:10 }}>
                      <button type="button" onClick={()=>{ setDebtEditId(d.id); setDebtForm({ name:d.name, total:String(d.total), paid:String(d.paid), emi:String(d.emi), dueDay:d.dueDay?String(d.dueDay):"", interest:d.interest?String(d.interest):"" }); setModal("debt"); }} style={{ fontSize:12, color:"var(--accent)", background:"none", border:"none", cursor:"pointer" }}>✎</button>
                      <span onClick={()=>handleDeleteDebt(d.id)} style={{ fontSize:18, color:"var(--red)", cursor:"pointer", opacity:0.4 }}>×</span>
                    </div>
                  </div>
                );
              })}
              {!debts.length && <Empty icon="⬡" text="Kono debt add koro — loan, card, dhar" />}
            </div>
          </div>
        )}

        {/* ── LENDING / DHAR ── */}
        {activePage==="lending" && (
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Dhar / Udhár" sub="ke kache theke niyechi, ke kache diyechi — sob track">
              <Btn onClick={() => openNewLendingModal("borrowed")}>+ Niyechi</Btn>
              <Btn onClick={() => openNewLendingModal("lent")} accent>+ Diyechi</Btn>
            </PageHeader>
            <div className="lifeos-filter-tabs">
              {[
                { id: "open" as const, label: "Choloman" },
                { id: "all" as const, label: "Shob" },
                { id: "borrowed" as const, label: "Ami niyechi" },
                { id: "lent" as const, label: "Ami diyechi" },
              ].map((f) => (
                <button key={f.id} type="button" className={`lifeos-filter-tab${lendingFilter === f.id ? " active" : ""}`} onClick={() => setLendingFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={S.metricsGrid}>
              {[
                { label: "Choloman", value: String(openLending.length) },
                { label: "Ami debe", value: fmt(lending.filter((l) => l.direction === "borrowed" && l.status !== "completed").reduce((s, l) => s + l.amount, 0)) },
                { label: "Amar debe", value: fmt(lending.filter((l) => l.direction === "lent" && l.status !== "completed").reduce((s, l) => s + l.amount, 0)) },
              ].map((m) => (
                <div key={m.label} style={S.metricCard}>
                  <div style={S.metricLabel}>{m.label}</div>
                  <div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div>
                </div>
              ))}
            </div>
            {openLending.length > 0 && (() => {
              const byPerson: Record<string, number> = {};
              lending.filter(l => l.status !== "completed").forEach(l => { byPerson[l.person] = (byPerson[l.person] || 0) + (l.direction === "lent" ? l.amount : -l.amount); });
              const rows = Object.entries(byPerson).filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
              if (!rows.length) return null;
              return (
                <div style={{ ...S.card, marginBottom: 14 }}>
                  <div style={S.sectionTitle}>Person onujaie — net</div>
                  {rows.map(([person, net]) => (
                    <div key={person} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 13 }}>{person}</span>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: net >= 0 ? "var(--green)" : "var(--red)" }}>{net >= 0 ? `Amar debe ${fmt(net)}` : `Ami debo ${fmt(-net)}`}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
              {sortUrgentFirst(
                lending.filter((l) => {
                  if (lendingFilter === "open") return l.status !== "completed";
                  if (lendingFilter === "borrowed") return l.direction === "borrowed";
                  if (lendingFilter === "lent") return l.direction === "lent";
                  return true;
                })
              ).map((l) => (
                  <div key={l.id} className="lifeos-lending-card" style={{ ...S.card, opacity: l.status === "completed" ? 0.55 : 1, borderColor: l.urgent ? "rgba(248,113,113,0.35)" : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{l.person}</div>
                        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>
                          {l.direction === "borrowed" ? "Ami niyechi" : "Ami diyechi"}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        {l.urgent && <span className="lifeos-urgent-pill">URGENT</span>}
                        <span className={`lifeos-status-pill ${l.status}`}>
                          {l.status === "completed" ? "Shesh" : l.status === "pending" ? "Pending" : "Processing"}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "monospace", marginBottom: 8 }}>{fmt(l.amount)}</div>
                    {l.dueDate && <div style={{ fontSize: 10, color: deadlineLabel(l.dueDate, today) === "Overdue" ? "var(--red)" : "var(--amber)", fontFamily: "monospace", marginBottom: 6 }}>{deadlineLabel(l.dueDate, today)}</div>}
                    {l.note && <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>{l.note}</div>}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                      {l.status !== "completed" && (
                        <>
                          <button type="button" onClick={() => waRemind({ title: `${l.person} — ${fmt(l.amount)} dhar`, subtitle: l.dueDate ? `Due ${l.dueDate}` : undefined })} style={{ ...S.btnStyle, padding: "5px 10px", fontSize: 11 }}>
                            WA
                          </button>
                          <button type="button" onClick={() => handleCompleteLending(l.id)} style={{ ...S.btnStyle, ...S.btnAccent, padding: "5px 12px", fontSize: 11 }}>
                            Diye dilam ✓
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => openEditLendingModal(l)} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>✎</button>
                      <span onClick={() => handleDeleteLending(l.id)} style={{ fontSize: 18, color: "var(--red)", cursor: "pointer", opacity: 0.4 }}>×</span>
                    </div>
                  </div>
                ))}
              {!lending.filter((l) => lendingFilter === "open" ? l.status !== "completed" : lendingFilter === "all" ? true : l.direction === lendingFilter).length && (
                <Empty icon="🤝" text="Kono dhar/udhár nei — + button diye add koro" />
              )}
            </div>
          </div>
        )}

        {/* ── TODOS ── */}
        {activePage==="todos" && (
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Todo List" sub="deadline, urgent — urgent gulo age show hobe">
              <Btn onClick={openNewTodoModal} accent>+ New Todo</Btn>
            </PageHeader>
            <div className="lifeos-filter-tabs">
              {[
                { id: "active" as const, label: `Choloman (${activeTodos.length})` },
                { id: "done" as const, label: "Done" },
                { id: "all" as const, label: "Shob" },
              ].map((f) => (
                <button key={f.id} type="button" className={`lifeos-filter-tab${todoFilter === f.id ? " active" : ""}`} onClick={() => setTodoFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={S.card}>
              {(() => {
                const filtered = todos.filter((t) => {
                  if (todoFilter === "active") return !t.done;
                  if (todoFilter === "done") return t.done;
                  return true;
                });
                if (!filtered.length) return <Empty icon="☑" text="Kono todo nei — + New Todo click koro" />;
                const showGroups = todoFilter === "active";
                const sorted = sortUrgentFirst(filtered);
                const { urgent, normal } = splitUrgentNormal(sorted.filter((t) => !t.done));
                const renderRow = (t: Todo) => (
                  <div key={t.id} className="lifeos-todo-item" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", opacity: t.done ? 0.45 : 1 }}>
                    <div onClick={() => handleToggleTodo(t.id)} style={{ width: 20, height: 20, borderRadius: 6, border: "1.5px solid", borderColor: t.done ? "var(--green)" : "var(--border2)", background: t.done ? "var(--green)" : "transparent", flexShrink: 0, marginTop: 2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {t.done && <span style={{ fontSize: 11, color: "#fff" }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
                      {t.note && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{t.note}</div>}
                      {t.subtasks && t.subtasks.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          {t.subtasks.map((s, i) => (
                            <div key={i} onClick={(e) => { e.stopPropagation(); handleToggleSubtask(t.id, i); }} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                              <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid", borderColor: s.done ? "var(--green)" : "var(--border2)", background: s.done ? "var(--green)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.done && <span style={{ fontSize: 9, color: "#fff" }}>✓</span>}</div>
                              <span style={{ fontSize: 12, color: "var(--text2)", textDecoration: s.done ? "line-through" : "none" }}>{s.text}</span>
                            </div>
                          ))}
                          <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "monospace" }}>{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} done</div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        {t.urgent && <span className="lifeos-urgent-pill">URGENT</span>}
                        {t.dueDate && <span style={{ fontSize: 10, color: deadlineLabel(t.dueDate, today) === "Overdue" ? "var(--red)" : "var(--text3)", fontFamily: "monospace" }}>{deadlineLabel(t.dueDate, today)}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {!t.done && <button type="button" onClick={() => waRemind({ title: t.title, subtitle: t.dueDate ? deadlineLabel(t.dueDate, today) || undefined : undefined })} style={{ fontSize: 10, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--green)", cursor: "pointer" }}>WA</button>}
                      <button type="button" onClick={() => openEditTodoModal(t)} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>✎</button>
                      <span onClick={() => handleDeleteTodo(t.id)} style={{ fontSize: 18, color: "var(--red)", cursor: "pointer", opacity: 0.4 }}>×</span>
                    </div>
                  </div>
                );
                if (!showGroups) return sorted.map(renderRow);
                return (
                  <>
                    {urgent.length > 0 && <div className="lifeos-group-label">Urgent</div>}
                    {urgent.map(renderRow)}
                    {normal.length > 0 && urgent.length > 0 && <div className="lifeos-group-label">Onno kaj</div>}
                    {normal.map(renderRow)}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── CALENDAR ── */}
        {activePage==="calendar" && (
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Calendar" sub="expense, todo, dhar, routine — ek calendar e">
              <Btn onClick={() => setCalendarMonth((p) => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>← Prev</Btn>
              <Btn onClick={() => setCalendarMonth((p) => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}>Next →</Btn>
            </PageHeader>
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>{calLabel}</div>
              <div className="lifeos-cal-legend">
                {[
                  { c: "var(--accent)", l: "Expense" },
                  { c: "var(--teal)", l: "Todo" },
                  { c: "var(--blue)", l: "Routine" },
                  { c: "var(--amber)", l: "Dhar" },
                  { c: "var(--red)", l: "EMI" },
                ].map((x) => (
                  <span key={x.l}><i style={{ background: x.c }} />{x.l}</span>
                ))}
              </div>
              <div className="lifeos-cal-grid">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="lifeos-cal-head">{d}</div>
                ))}
                {calGrid.flat().map((day, i) => {
                  if (!day) return <div key={`e-${i}`} className="lifeos-cal-cell empty" />;
                  const key = dateKey(day);
                  const evs = calendarEvents[key] || [];
                  const isToday = key === todayStr();
                  return (
                    <div key={key} className={`lifeos-cal-cell${isToday ? " today" : ""}`}>
                      <div className="lifeos-cal-day">{day.getDate()}</div>
                      <div className="lifeos-cal-events">
                        {evs.slice(0, 3).map((ev) => (
                          <div key={ev.id} className="lifeos-cal-ev" style={{ borderLeftColor: ev.color }} title={ev.label}>
                            {ev.label}
                          </div>
                        ))}
                        {evs.length > 3 && <div className="lifeos-cal-more">+{evs.length - 3}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── SAVINGS ── */}
        {activePage==="savings" && (
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Savings Goals" sub="shopno dekho, track koro, achieve koro">
              <Btn onClick={()=>setModal("goal")} accent>+ New Goal</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"Total Saved",value:fmt(goals.reduce((s,g)=>s+g.current,0))},
                {label:"Total Target",value:fmt(goals.reduce((s,g)=>s+g.target,0))},
                {label:"Active Goals",value:String(goals.length)},
                {label:"Completed",value:String(goals.filter(g=>g.current>=g.target).length)},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div></div>)}
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
                  {!done && g.deadline && (()=>{
                    const dd=new Date(g.deadline+"T12:00:00"); const now=new Date();
                    const mLeft=Math.max(0,(dd.getFullYear()-now.getFullYear())*12+(dd.getMonth()-now.getMonth()));
                    const perMonth=mLeft>0?Math.ceil((g.target-g.current)/mLeft):(g.target-g.current);
                    return <div style={{fontSize:10,color:"var(--teal)",fontFamily:"monospace",marginBottom:8}}>🎯 {g.deadline} · {mLeft>0?`mashe ~${fmt(perMonth)} rakhle pouchabe`:"ei mash er target!"}</div>;
                  })()}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace"}}>{pct}% complete</span>
                    {done ? <span style={{fontSize:11,color:"var(--green)",fontFamily:"monospace"}}>🎉 ACHIEVED!</span>
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
          <div className="lifeos-page" style={S.page}>
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
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div></div>)}
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Habit Tracker" sub="choto choto habit — boro poriborton">
              <Btn onClick={()=>setModal("habit")} accent>+ New Habit</Btn>
            </PageHeader>
            <div style={S.metricsGrid}>
              {[
                {label:"Total Habits",value:String(habits.length)},
                {label:"Done Today",value:String(todayDoneHabits)},
                {label:"This Week",value:habits.length?Math.round(habits.reduce((s,h)=>{const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().slice(0,10));}return s+days.filter(d=>habitLogs[h.id]?.includes(d)).length;},0)/(habits.length*7)*100)+"%":"0%"},
              ].map(m=><div key={m.label} style={S.metricCard}><div style={S.metricLabel}>{m.label}</div><div className="lifeos-metric-value" style={S.metricValue}>{m.value}</div></div>)}
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
                const logSet=new Set(habitLogs[h.id]||[]);
                let streak=0; const sd=new Date();
                if(!logSet.has(sd.toISOString().slice(0,10))) sd.setDate(sd.getDate()-1);
                while(logSet.has(sd.toISOString().slice(0,10))){streak++; sd.setDate(sd.getDate()-1);}
                return <div key={h.id} className="lifeos-habit-row" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13}}>{h.name}</div>
                    <div style={{fontSize:10,color:"var(--amber)",fontFamily:"monospace",display:"flex",gap:8,alignItems:"center"}}>
                      <span>{h.freq}x/week</span>
                      {streak>0 && <span style={{color:"var(--teal)"}}>🔥 {streak} din streak</span>}
                    </div>
                  </div>
                  <div className="lifeos-habit-days">
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Mood Log" sub="tumi kemon acho — protidin record koro"/>
            <div className="lifeos-grid2" style={S.grid2}>
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
                {moods.length>1 && (
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"flex-end",gap:3,height:44}}>
                      {moods.slice(0,20).slice().reverse().map(m=>{
                        const colors=["","#f87171","#fbbf24","#9ca3af","#60a5fa","#34d399"];
                        return <div key={m.id} title={`${m.label} · ${m.date}`} style={{flex:1,height:`${m.mood*18+10}%`,background:colors[m.mood]||"#9ca3af",borderRadius:2,minWidth:4}}/>;
                      })}
                    </div>
                    <div style={{fontSize:9,color:"var(--text3)",fontFamily:"monospace",marginTop:4,textAlign:"right"}}>recent {Math.min(20,moods.length)} moods →</div>
                  </div>
                )}
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Monthly Report" sub={monthLabel}>
              <Btn onClick={exportMonthCsv}>Export CSV</Btn>
              <Btn onClick={exportMonthPdf}>Export PDF</Btn>
              <Btn onClick={generateReport} accent>{reportLoading?"Generating...":"AI Analysis ↗"}</Btn>
            </PageHeader>
            <div className="lifeos-report-stats">
              {[{label:"Income",value:fmt(totalIncome)},{label:"Spent",value:fmt(totalSpent)},{label:"Saved",value:fmt(Math.max(0,totalIncome-totalSpent)),green:true}].map(m=>(
                <div key={m.label} style={{...S.card,textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:600,fontFamily:"monospace",color:m.green?"var(--green)":"var(--text)"}}>{m.value}</div>
                  <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>{m.label}</div>
                </div>
              ))}
            </div>
            {prevSummary && (
              <div style={{...S.card, marginBottom:16}}>
                <div style={S.sectionTitle}>vs {prevSummary.label}</div>
                {[
                  {label:"Income", now:totalIncome, prev:prevSummary.summary.income, spendMetric:false},
                  {label:"Spent", now:totalSpent, prev:prevSummary.summary.spent, spendMetric:true},
                  {label:"Saved", now:Math.max(0,totalIncome-totalSpent), prev:prevSummary.summary.remaining, spendMetric:false},
                ].map(r=>{
                  const diff=r.now-r.prev; const up=diff>=0;
                  const good = r.spendMetric ? !up : up;
                  return <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                    <span style={{fontSize:13}}>{r.label}</span>
                    <span style={{fontFamily:"monospace",fontSize:12}}>{fmt(r.now)} <span style={{color:"var(--text3)"}}>vs {fmt(r.prev)}</span> <span style={{color:good?"var(--green)":"var(--red)"}}>{up?"▲":"▼"} {fmt(Math.abs(diff))}</span></span>
                  </div>;
                })}
              </div>
            )}
            {monthExp.length > 0 && (
              <div style={{...S.card, marginBottom:16}}>
                <div style={S.sectionTitle}>Spending Breakdown</div>
                <CatPie expenses={monthExp}/>
              </div>
            )}
            <div className="lifeos-grid2" style={S.grid2}>
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="Settings" sub="profile ar account" />
            <div style={S.card}>
              <div style={S.sectionTitle}>Profile</div>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <FormField label="Display name">
                  <input style={S.input} value={settingsDisplayName} onChange={(e) => setSettingsDisplayName(e.target.value)} placeholder="Tomar naam" />
                </FormField>
                <FormField label="Currency">
                  <select style={S.input} value={currencyChoice} onChange={(e) => setCurrencyChoice(e.target.value)}>
                    {Object.keys(CURRENCIES).map((c) => (
                      <option key={c} value={c}>{c} ({CURRENCIES[c]})</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Bio (optional)">
                  <textarea style={{ ...S.input, resize:"none", minHeight:88 }} value={profileBio} onChange={(e) => setProfileBio(e.target.value)} placeholder="Choto intro — nijeke remind korar jonno" />
                </FormField>
                <FormField label="WhatsApp number (reminder)">
                  <input style={S.input} value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="8801XXXXXXXXX — optional" />
                </FormField>
                <Btn onClick={handleSaveSettings} accent>{settingsSaving ? "Saving..." : "Save profile"}</Btn>
              </div>
            </div>
            <div style={{ ...S.card, marginTop:16 }}>
              <div style={S.sectionTitle}>Phone notifications</div>
              <div style={{ fontSize:12, color:"var(--text2)", lineHeight:1.6, marginBottom:12 }}>
                Notification phone er top bar e dekhte: browser permission allow koro, tarpor home screen e LifeOS add koro (PWA). Sokol reminder + protiday 8 AM &quot;Ajker Din&quot; list ekhane ashbe.
              </div>
              <Btn onClick={enablePushReminders} accent>Phone notification on koro</Btn>
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
          <div className="lifeos-page" style={S.page}>
            <PageHeader title="AI Advisor" sub="tomar data analyze kore real advice debo"/>
            <div className="lifeos-ai-chat">
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
      </div>

      {/* ── MODALS ── */}
      {modal && (
        <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
          <div className="lifeos-modal-panel" onClick={e=>e.stopPropagation()} style={{background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:20,padding:28}}>

            {modal==="expense" && <>
              <div style={S.modalTitle}>{expenseEditId ? "Edit Expense" : "New Expense"}</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div className="lifeos-form-grid-2">
                  <FormField label="Amount (৳)"><input style={S.input} type="number" value={expForm.amount} onChange={e=>setExpForm(p=>({...p,amount:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Category"><select style={S.input} value={expForm.cat} onChange={e=>setExpForm(p=>({...p,cat:e.target.value}))}>
                    {expenseCatSelectOptions.map(c=><option key={c}>{c}</option>)}
                  </select></FormField>
                </div>
                <FormField label="Description">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ ...S.input, flex: 1 }} value={expForm.desc} onChange={e=>setExpForm(p=>({...p,desc:e.target.value}))} placeholder="Ki khoroch korle?"/>
                    <VoiceMic onResult={(text) => {
                      const num = text.match(/\d+/);
                      if (num && !expForm.amount) setExpForm((p) => ({ ...p, amount: num[0], desc: text.replace(num[0], "").trim() || text }));
                      else setExpForm((p) => ({ ...p, desc: text }));
                    }} />
                  </div>
                </FormField>
                <div className="lifeos-form-grid-2">
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
                <div className="lifeos-form-grid-2">
                  <FormField label="Amount (৳)"><input style={S.input} type="number" value={subForm.amount} onChange={e=>setSubForm(p=>({...p,amount:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Billing"><select style={S.input} value={subForm.cycle} onChange={e=>setSubForm(p=>({...p,cycle:e.target.value as "monthly"|"yearly"}))}>
                    <option value="monthly">Per month</option>
                    <option value="yearly">Per year</option>
                  </select></FormField>
                </div>
                <div className="lifeos-form-grid-2">
                  <FormField label="Category"><select style={S.input} value={subForm.cat} onChange={e=>setSubForm(p=>({...p,cat:e.target.value}))}>
                    {[["streaming","📺 Streaming"],["tools","🛠️ Tools"],["gym","🏋️ Gym"],["music","🎵 Music"],["cloud","☁️ Cloud"],["education","📚 Education"],["other","🔁 Other"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select></FormField>
                  <FormField label="Next bill date"><input style={S.input} type="date" value={subForm.nextBill} onChange={e=>setSubForm(p=>({...p,nextBill:e.target.value}))}/></FormField>
                </div>
                <FormField label="Note (optional)"><input style={S.input} value={subForm.note} onChange={e=>setSubForm(p=>({...p,note:e.target.value}))} placeholder="Plan name..."/></FormField>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleAddSubscription}/>
            </>}

            {modal==="income" && <>
              <div style={S.modalTitle}>{incomeEditId ? "Edit Income" : "New Income Source"}</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FormField label="Source Name"><input style={S.input} value={incForm.name} onChange={e=>setIncForm(p=>({...p,name:e.target.value}))} placeholder="Freelance, Job, Tuition..."/></FormField>
                <div className="lifeos-form-grid-2">
                  <FormField label="Amount"><input style={S.input} type="number" value={incForm.amount} onChange={e=>setIncForm(p=>({...p,amount:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Type"><select style={S.input} value={incForm.type} onChange={e=>setIncForm(p=>({...p,type:e.target.value}))}>
                    <option value="fixed">Fixed</option><option value="variable">Variable</option><option value="irregular">Irregular</option>
                  </select></FormField>
                </div>
                <FormField label="Receive date (optional)"><input style={S.input} type="date" value={incForm.receiveDate} onChange={e=>setIncForm(p=>({...p,receiveDate:e.target.value}))}/></FormField>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleSaveIncome}/>
            </>}

            {modal==="closeMonth" && closeSummary && (
              <>
                <div style={S.modalTitle}>Close {activeMonth?.label}?</div>
                <p style={{ fontSize:12, color:"var(--text3)", marginBottom:14, lineHeight:1.5 }}>Month summary save hobe, tarpor notun month khulbe.</p>
                <div className="lifeos-report-stats" style={{ marginBottom:14 }}>
                  {[
                    { label:"Income", value: fmt(closeSummary.income) },
                    { label:"Spent", value: fmt(closeSummary.spent) },
                    { label:"Saved", value: fmt(closeSummary.remaining) },
                  ].map((m) => (
                    <div key={m.label} style={{ ...S.card, textAlign:"center", padding:12 }}>
                      <div style={{ fontSize:18, fontWeight:600, fontFamily:"monospace" }}>{m.value}</div>
                      <div style={{ fontSize:9, color:"var(--text3)", textTransform:"uppercase", marginTop:4 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", marginBottom:12 }}>
                  {closeSummary.expenseCount} expenses · {closeSummary.goalCount} goals · tasks {closeSummary.tasksDone}/{closeSummary.tasksTotal}
                </div>
                <label style={{ fontSize:12, color:"var(--text2)", display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                  <input type="checkbox" checked={copyRoutine} onChange={(e) => setCopyRoutine(e.target.checked)} /> Routine copy (done reset)
                </label>
                <label style={{ fontSize:12, color:"var(--text2)", display:"flex", gap:8, alignItems:"center", marginBottom:16 }}>
                  <input type="checkbox" checked={copyHabitsOpt} onChange={(e) => setCopyHabitsOpt(e.target.checked)} /> Habits copy (fresh log)
                </label>
                <div style={{ fontSize: 11, color: "var(--accent2)", marginBottom: 12, fontWeight: 500 }}>Notun mas er details</div>
                <FormField label="Notun mas er naam (optional)">
                  <input style={S.input} value={nextMonthForm.label} onChange={(e) => setNextMonthForm((p) => ({ ...p, label: e.target.value }))} placeholder="Ramadan Budget, June 2026..." />
                </FormField>
                <FormField label="Suru tarikh">
                  <input style={S.input} type="date" value={nextMonthForm.startDate} onChange={(e) => setNextMonthForm((p) => ({ ...p, startDate: e.target.value }))} />
                </FormField>
                <ModalActions onCancel={() => { setModal(null); setCloseSummary(null); }} onSave={confirmCloseMonth} saveLabel="Close & notun mas" />
              </>
            )}

            {modal==="debt" && <>
              <div style={S.modalTitle}>{debtEditId ? "Edit Debt" : "New Debt / EMI"}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <FormField label="Name"><input style={S.input} value={debtForm.name} onChange={(e) => setDebtForm((p) => ({ ...p, name: e.target.value }))} placeholder="Credit card, Bike loan..." /></FormField>
                <div className="lifeos-form-grid-2">
                  <FormField label="Total amount"><input style={S.input} type="number" value={debtForm.total} onChange={(e) => setDebtForm((p) => ({ ...p, total: e.target.value }))} /></FormField>
                  <FormField label="Paid so far"><input style={S.input} type="number" value={debtForm.paid} onChange={(e) => setDebtForm((p) => ({ ...p, paid: e.target.value }))} /></FormField>
                </div>
                <div className="lifeos-form-grid-2">
                  <FormField label="Monthly EMI"><input style={S.input} type="number" value={debtForm.emi} onChange={(e) => setDebtForm((p) => ({ ...p, emi: e.target.value }))} /></FormField>
                  <FormField label="Due day (1-31)"><input style={S.input} type="number" min={1} max={31} value={debtForm.dueDay} onChange={(e) => setDebtForm((p) => ({ ...p, dueDay: e.target.value }))} /></FormField>
                </div>
                <FormField label="Interest rate (%/year, optional)"><input style={S.input} type="number" value={debtForm.interest} onChange={(e) => setDebtForm((p) => ({ ...p, interest: e.target.value }))} placeholder="0" /></FormField>
              </div>
              <ModalActions onCancel={() => setModal(null)} onSave={handleSaveDebt} />
            </>}

            {modal==="goal" && <>
              <div style={S.modalTitle}>New Savings Goal</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div className="lifeos-form-grid-goal">
                  <FormField label="Goal Name"><input style={S.input} value={goalForm.name} onChange={e=>setGoalForm(p=>({...p,name:e.target.value}))} placeholder="Bike, Emergency Fund..."/></FormField>
                  <FormField label="Emoji"><input style={{...S.input,width:60}} value={goalForm.emoji} onChange={e=>setGoalForm(p=>({...p,emoji:e.target.value}))} maxLength={2}/></FormField>
                </div>
                <div className="lifeos-form-grid-2">
                  <FormField label="Target (৳)"><input style={S.input} type="number" value={goalForm.target} onChange={e=>setGoalForm(p=>({...p,target:e.target.value}))} placeholder="0"/></FormField>
                  <FormField label="Saved So Far (৳)"><input style={S.input} type="number" value={goalForm.current} onChange={e=>setGoalForm(p=>({...p,current:e.target.value}))} placeholder="0"/></FormField>
                </div>
                <FormField label="Target date (optional)"><input style={S.input} type="date" value={goalForm.deadline} onChange={e=>setGoalForm(p=>({...p,deadline:e.target.value}))}/></FormField>
              </div>
              <ModalActions onCancel={()=>setModal(null)} onSave={handleAddGoal}/>
            </>}

            {modal==="task" && <>
              <div style={S.modalTitle}>New Task</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FormField label="Task Name"><input style={S.input} value={taskForm.name} onChange={e=>setTaskForm(p=>({...p,name:e.target.value}))} placeholder="Ki korte hobe?"/></FormField>
                <div className="lifeos-form-grid-3">
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

            {modal==="newMonth" && <>
              <div style={S.modalTitle}>Notun mas suru koro</div>
              <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16, lineHeight: 1.5 }}>
                Je din theke suru korbe, oi din thekei count hobe. Naam dao — jemon &quot;Ramadan Budget&quot; ba &quot;June Planning&quot;.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormField label="Mas er naam">
                  <input style={S.input} value={newMonthForm.label} onChange={(e) => setNewMonthForm((p) => ({ ...p, label: e.target.value }))} placeholder="June 2026, Eid Budget..." />
                </FormField>
                <FormField label="Suru tarikh">
                  <input style={S.input} type="date" value={newMonthForm.startDate} onChange={(e) => setNewMonthForm((p) => ({ ...p, startDate: e.target.value }))} />
                </FormField>
                <label style={{ fontSize:12, color:"var(--text2)", display:"flex", gap:8, alignItems:"center" }}>
                  <input type="checkbox" checked={copyRoutine} onChange={(e) => setCopyRoutine(e.target.checked)} /> Routine copy
                </label>
                <label style={{ fontSize:12, color:"var(--text2)", display:"flex", gap:8, alignItems:"center" }}>
                  <input type="checkbox" checked={copyHabitsOpt} onChange={(e) => setCopyHabitsOpt(e.target.checked)} /> Habits copy
                </label>
              </div>
              <ModalActions onCancel={() => setModal(null)} onSave={handleCreateMonth} saveLabel="Mas kholo" />
            </>}

            {modal==="todo" && <>
              <div style={S.modalTitle}>{todoEditId ? "Edit Todo" : "New Todo"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormField label="Title">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ ...S.input, flex: 1 }} value={todoForm.title} onChange={(e) => setTodoForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ki korte hobe?" />
                    <VoiceMic onResult={(text) => setTodoForm((p) => ({ ...p, title: text }))} />
                  </div>
                </FormField>
                <FormField label="Note (optional)">
                  <textarea style={{ ...S.input, resize: "none", minHeight: 72 }} value={todoForm.note} onChange={(e) => setTodoForm((p) => ({ ...p, note: e.target.value }))} placeholder="Details..." />
                </FormField>
                <FormField label="Sub-tasks (each line = 1 item)">
                  <textarea style={{ ...S.input, resize: "none", minHeight: 72 }} value={todoForm.subtasks} onChange={(e) => setTodoForm((p) => ({ ...p, subtasks: e.target.value }))} placeholder={"Step 1\nStep 2\nStep 3"} />
                </FormField>
                <div className="lifeos-form-grid-2">
                  <FormField label="Priority">
                    <select style={S.input} value={todoForm.priority} onChange={(e) => setTodoForm((p) => ({ ...p, priority: e.target.value as Todo["priority"] }))}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </FormField>
                  <FormField label="Deadline">
                    <input style={S.input} type="date" value={todoForm.dueDate} onChange={(e) => setTodoForm((p) => ({ ...p, dueDate: e.target.value }))} />
                  </FormField>
                </div>
                <label style={{ fontSize: 12, color: "var(--text2)", display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={todoForm.urgent} onChange={(e) => setTodoForm((p) => ({ ...p, urgent: e.target.checked }))} />
                  Urgent — list er shathe shathe upore show hobe
                </label>
              </div>
              <ModalActions onCancel={() => setModal(null)} onSave={handleSaveTodo} />
            </>}

            {modal==="lending" && <>
              <div style={S.modalTitle}>{lendingEditId ? "Edit Dhar/Udhár" : "New Dhar/Udhár"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FormField label="Type">
                  <select style={S.input} value={lendingForm.direction} onChange={(e) => setLendingForm((p) => ({ ...p, direction: e.target.value as Lending["direction"] }))}>
                    <option value="borrowed">Ami niyechi (processing)</option>
                    <option value="lent">Ami diyechi (pending)</option>
                  </select>
                </FormField>
                <FormField label="Naam">
                  <input style={S.input} value={lendingForm.person} onChange={(e) => setLendingForm((p) => ({ ...p, person: e.target.value }))} placeholder="Kar kache / ke?" />
                </FormField>
                <div className="lifeos-form-grid-2">
                  <FormField label="Amount">
                    <input style={S.input} type="number" value={lendingForm.amount} onChange={(e) => setLendingForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" />
                  </FormField>
                  <FormField label="Deadline">
                    <input style={S.input} type="date" value={lendingForm.dueDate} onChange={(e) => setLendingForm((p) => ({ ...p, dueDate: e.target.value }))} />
                  </FormField>
                </div>
                <label style={{ fontSize: 12, color: "var(--text2)", display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={lendingForm.urgent} onChange={(e) => setLendingForm((p) => ({ ...p, urgent: e.target.checked }))} />
                  Urgent — dhar list e age show + notification
                </label>
                <FormField label="Note">
                  <input style={S.input} value={lendingForm.note} onChange={(e) => setLendingForm((p) => ({ ...p, note: e.target.value }))} placeholder="Keno, kokhon..." />
                </FormField>
              </div>
              <ModalActions onCancel={() => setModal(null)} onSave={handleSaveLending} />
            </>}


            {modal==="habit" && <>
              <div style={S.modalTitle}>New Habit</div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FormField label="Habit Name"><input style={S.input} value={habitForm.name} onChange={e=>setHabitForm(p=>({...p,name:e.target.value}))} placeholder="Pani khawa, Exercise, Reading..."/></FormField>
                <div className="lifeos-form-grid-2">
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

function ExpItem({ e, onEdit, onDelete, canEdit = true }: { e: Expense; onEdit: (e: Expense)=>void; onDelete: (id:string)=>void; canEdit?: boolean }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
      <div style={{width:28,height:28,borderRadius:"50%",background:"var(--bg4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,borderLeft:`2px solid ${catColor(e.cat)}`}}>{catIcon(e.cat)}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.desc}</div>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}><Tag cat={e.cat}/> · {e.method||"Cash"}</div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{fontSize:13,fontWeight:600,fontFamily:"monospace"}}>{fmt(e.amount)}</div>
        <div style={{fontSize:10,color:"var(--text3)"}}>{e.date}</div>
      </div>
      {canEdit && <button type="button" title="Edit" onClick={()=>onEdit(e)} style={{fontSize:12,color:"var(--accent)",cursor:"pointer",opacity:0.65,background:"none",border:"none",padding:"4px 2px",fontFamily:"inherit"}}>✎</button>}
      {canEdit && <span onClick={()=>onDelete(e.id)} style={{fontSize:16,color:"var(--red)",cursor:"pointer",opacity:0.3}}>×</span>}
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

function CatPie({ expenses }: { expenses: Expense[] }) {
  const cats: Record<string, number> = {};
  expenses.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + e.amount; });
  const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return <Empty icon="🥧" text="Data nei" />;
  const r = 52, cx = 60, cy = 60; let acc = 0;
  const seg = entries.map(([cat, amt]) => {
    const frac = amt / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2; acc += frac; const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = frac > 0.5 ? 1 : 0;
    const d = entries.length === 1
      ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`
      : `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
    return { cat, amt, frac, d };
  });
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
        {seg.map(s => <path key={s.cat} d={s.d} fill={catColor(s.cat)} stroke="var(--bg2)" strokeWidth="1.5" />)}
      </svg>
      <div style={{ flex: 1, minWidth: 130 }}>
        {seg.map(s => (
          <div key={s.cat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: catColor(s.cat), flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s.cat}</span>
            <span style={{ fontFamily: "monospace", color: "var(--text3)" }}>{fmt(s.amt)} · {Math.round(s.frac * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return <div style={{textAlign:"center",padding:"30px 20px",color:"var(--text3)"}}>
    <div style={{fontSize:28,marginBottom:10,opacity:0.5}}>{icon}</div>
    <div style={{fontSize:12}}>{text}</div>
  </div>;
}

function PageHeader({ title, sub, children }: { title:string; sub?:string; children?: React.ReactNode }) {
  return <div className="lifeos-page-header">
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{fontSize:22,fontWeight:600,letterSpacing:-0.3}}>{title}</div>
      {sub && <div style={{fontSize:11,color:"var(--text3)",marginTop:4,fontFamily:"monospace"}}>{sub}</div>}
    </div>
    {children && <div className="lifeos-page-header-actions">{children}</div>}
  </div>;
}

function FormField({ label, children }: { label:string; children: React.ReactNode }) {
  return <div style={{display:"flex",flexDirection:"column",gap:5}}>
    <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"monospace"}}>{label}</div>
    {children}
  </div>;
}

function ModalActions({ onCancel, onSave, saveLabel = "Save" }: { onCancel:()=>void; onSave:()=>void; saveLabel?: string }) {
  return <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
    <button style={S.btnStyle} onClick={onCancel}>Cancel</button>
    <button style={{...S.btnStyle,...S.btnAccent}} onClick={onSave}>{saveLabel}</button>
  </div>;
}

function Btn({ children, onClick, accent }: { children:React.ReactNode; onClick:()=>void; accent?:boolean }) {
  return <button style={{...S.btnStyle,...(accent?S.btnAccent:{})}} onClick={onClick}>{children}</button>;
}

// ─── STYLES ──────────────────────────────────────────
const S: Record<string,React.CSSProperties> = {
  app: {display:"flex",height:"100vh",overflow:"hidden",background:"var(--bg)",width:"100%"},
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
  main: {flex:1,overflowY:"auto"},
  page: {minHeight:"100%",animation:"pageIn 0.3s ease both"},
  notif: {background:"rgba(124,111,255,0.1)",border:"1px solid rgba(124,111,255,0.2)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"var(--accent2)",display:"flex",alignItems:"center",gap:8,marginBottom:16},
  notifDot: {width:6,height:6,borderRadius:"50%",background:"var(--accent)",flexShrink:0},
  metricsGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20},
  metricCard: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:14,padding:"16px 20px"},
  metricLabel: {fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontFamily:"monospace"},
  metricValue: {fontSize:24,fontWeight:600,letterSpacing:-0.5},
  metricSub: {fontSize:11,color:"var(--text3)",marginTop:5},
  card: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:14,padding:"18px 20px"},
  grid2: {},
  sectionTitle: {fontSize:12,fontWeight:500,color:"var(--text2)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14,fontFamily:"monospace"},
  input: {background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,outline:"none",width:"100%"},
  modalTitle: {fontSize:16,fontWeight:600,marginBottom:20},
  btnStyle: {background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:500,cursor:"pointer",color:"var(--text2)",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6},
  btnAccent: {background:"var(--accent)",borderColor:"var(--accent)",color:"#fff"},
};
