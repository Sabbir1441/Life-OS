import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  deleteDoc, updateDoc, query, orderBy, serverTimestamp, onSnapshot
} from "firebase/firestore";
import { db } from "./firebase";

// ─── REAL-TIME ──────────────────────────────────────
// Subscribe to a global collection under users/{uid}/{name}.
// Calls onChange whenever the collection changes (remote or local).
// Returns an unsubscribe function. Errors are swallowed so a denied
// listener never crashes the app.
export function subscribeGlobal(uid: string, name: string, onChange: () => void) {
  return onSnapshot(
    collection(db, "users", uid, name),
    () => onChange(),
    () => {}
  );
}

const defaultBudget = {
  Food: 8000, Transport: 4000, Bills: 6000,
  Shopping: 4000, Health: 2000, Education: 2000, Entertainment: 2000
};

function monthExpensesCol(uid: string, monthId: string) {
  return collection(db, "users", uid, "months", monthId, "expenses");
}

function monthIncomeCol(uid: string, monthId: string) {
  return collection(db, "users", uid, "months", monthId, "income");
}

function monthGoalsCol(uid: string, monthId: string) {
  return collection(db, "users", uid, "months", monthId, "goals");
}

function monthMoodCol(uid: string, monthId: string) {
  return collection(db, "users", uid, "months", monthId, "mood");
}

function monthSettingsDoc(uid: string, monthId: string, key: string) {
  return doc(db, "users", uid, "months", monthId, "settings", key);
}

// ─── EXPENSES ───────────────────────────────────────
export async function addExpense(uid: string, monthId: string, data: Record<string, unknown>) {
  return addDoc(monthExpensesCol(uid, monthId), {
    ...data, createdAt: serverTimestamp()
  });
}

export async function getExpenses(uid: string, monthId: string) {
  const q = query(monthExpensesCol(uid, monthId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateExpense(uid: string, monthId: string, id: string, data: Record<string, unknown>) {
  return updateDoc(doc(db, "users", uid, "months", monthId, "expenses", id), data);
}

export async function deleteExpense(uid: string, monthId: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "months", monthId, "expenses", id));
}

// ─── INCOME ─────────────────────────────────────────
export async function addIncome(uid: string, monthId: string, data: Record<string, unknown>) {
  return addDoc(monthIncomeCol(uid, monthId), {
    ...data, createdAt: serverTimestamp()
  });
}

export async function getIncome(uid: string, monthId: string) {
  const snap = await getDocs(monthIncomeCol(uid, monthId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateIncome(uid: string, monthId: string, id: string, data: Record<string, unknown>) {
  return updateDoc(doc(db, "users", uid, "months", monthId, "income", id), data);
}

export async function deleteIncome(uid: string, monthId: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "months", monthId, "income", id));
}

// ─── DEBTS (global) ──────────────────────────────────
export async function addDebt(uid: string, data: Record<string, unknown>) {
  return addDoc(collection(db, "users", uid, "debts"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function getDebts(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "debts"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateDebt(uid: string, id: string, data: Record<string, unknown>) {
  return updateDoc(doc(db, "users", uid, "debts", id), data);
}

export async function deleteDebt(uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "debts", id));
}

// ─── TODOS (global task list) ────────────────────────
export async function addTodo(uid: string, data: Record<string, unknown>) {
  return addDoc(collection(db, "users", uid, "todos"), {
    ...data,
    done: false,
    createdAt: serverTimestamp(),
  });
}

export async function getTodos(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "todos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateTodo(uid: string, id: string, data: Record<string, unknown>) {
  return updateDoc(doc(db, "users", uid, "todos", id), data);
}

export async function deleteTodo(uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "todos", id));
}

// ─── LENDING / DHAR (global P2P money) ───────────────
export async function addLending(uid: string, data: Record<string, unknown>) {
  return addDoc(collection(db, "users", uid, "lending"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function getLending(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "lending"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateLending(uid: string, id: string, data: Record<string, unknown>) {
  return updateDoc(doc(db, "users", uid, "lending", id), data);
}

export async function deleteLending(uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "lending", id));
}

// ─── SUBSCRIPTIONS (global — recurring across months) ─
export async function addSubscription(uid: string, data: Record<string, unknown>) {
  return addDoc(collection(db, "users", uid, "subscriptions"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function getSubscriptions(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "subscriptions"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteSubscription(uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "subscriptions", id));
}

// ─── BUDGET ─────────────────────────────────────────
export async function saveBudget(uid: string, monthId: string, data: Record<string, unknown>) {
  return setDoc(monthSettingsDoc(uid, monthId, "budget"), data);
}

export async function getBudget(uid: string, monthId: string) {
  const snap = await getDoc(monthSettingsDoc(uid, monthId, "budget"));
  return snap.exists() ? snap.data() : defaultBudget;
}

// ─── GOALS ──────────────────────────────────────────
export async function addGoal(uid: string, monthId: string, data: Record<string, unknown>) {
  return addDoc(monthGoalsCol(uid, monthId), {
    ...data, createdAt: serverTimestamp()
  });
}

export async function getGoals(uid: string, monthId: string) {
  const snap = await getDocs(monthGoalsCol(uid, monthId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateGoal(uid: string, monthId: string, id: string, data: Record<string, unknown>) {
  return updateDoc(doc(db, "users", uid, "months", monthId, "goals", id), data);
}

export async function deleteGoal(uid: string, monthId: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "months", monthId, "goals", id));
}

// ─── TASKS / ROUTINE ────────────────────────────────
export async function saveTasks(uid: string, monthId: string, tasks: unknown[]) {
  return setDoc(monthSettingsDoc(uid, monthId, "tasks"), { tasks });
}

export async function getTasks(uid: string, monthId: string) {
  const snap = await getDoc(monthSettingsDoc(uid, monthId, "tasks"));
  return snap.exists() ? snap.data().tasks : [];
}

// ─── HABITS ─────────────────────────────────────────
export async function saveHabits(uid: string, monthId: string, habits: unknown[]) {
  return setDoc(monthSettingsDoc(uid, monthId, "habits"), { habits });
}

export async function getHabits(uid: string, monthId: string) {
  const snap = await getDoc(monthSettingsDoc(uid, monthId, "habits"));
  return snap.exists() ? snap.data().habits : [];
}

export async function saveHabitLogs(uid: string, monthId: string, logs: Record<string, unknown>) {
  return setDoc(monthSettingsDoc(uid, monthId, "habitLogs"), logs);
}

export async function getHabitLogs(uid: string, monthId: string) {
  const snap = await getDoc(monthSettingsDoc(uid, monthId, "habitLogs"));
  return snap.exists() ? snap.data() : {};
}

// ─── MOOD ────────────────────────────────────────────
export async function addMood(uid: string, monthId: string, data: Record<string, unknown>) {
  return addDoc(monthMoodCol(uid, monthId), {
    ...data, createdAt: serverTimestamp()
  });
}

export async function getMoods(uid: string, monthId: string) {
  const q = query(monthMoodCol(uid, monthId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── USER PROFILE (global) ───────────────────────────
export async function saveProfile(uid: string, data: Record<string, unknown>) {
  return setDoc(doc(db, "users", uid, "settings", "profile"), data, { merge: true });
}

export async function getProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid, "settings", "profile"));
  return snap.exists() ? snap.data() : {};
}
