import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  deleteDoc, updateDoc, query, where, orderBy, serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";

// ─── EXPENSES ───────────────────────────────────────
export async function addExpense(uid: string, data: any) {
  return addDoc(collection(db, "users", uid, "expenses"), {
    ...data, createdAt: serverTimestamp()
  });
}
export async function getExpenses(uid: string) {
  const q = query(collection(db, "users", uid, "expenses"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function deleteExpense(uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "expenses", id));
}

// ─── INCOME ─────────────────────────────────────────
export async function addIncome(uid: string, data: any) {
  return addDoc(collection(db, "users", uid, "income"), {
    ...data, createdAt: serverTimestamp()
  });
}
export async function getIncome(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "income"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function deleteIncome(uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "income", id));
}

// ─── BUDGET ─────────────────────────────────────────
export async function saveBudget(uid: string, data: any) {
  return setDoc(doc(db, "users", uid, "settings", "budget"), data);
}
export async function getBudget(uid: string) {
  const snap = await getDoc(doc(db, "users", uid, "settings", "budget"));
  return snap.exists() ? snap.data() : {
    Food: 8000, Transport: 4000, Bills: 6000,
    Shopping: 4000, Health: 2000, Education: 2000, Entertainment: 2000
  };
}

// ─── GOALS ──────────────────────────────────────────
export async function addGoal(uid: string, data: any) {
  return addDoc(collection(db, "users", uid, "goals"), {
    ...data, createdAt: serverTimestamp()
  });
}
export async function getGoals(uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "goals"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function updateGoal(uid: string, id: string, data: any) {
  return updateDoc(doc(db, "users", uid, "goals", id), data);
}
export async function deleteGoal(uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "goals", id));
}

// ─── TASKS / ROUTINE ────────────────────────────────
export async function saveTasks(uid: string, tasks: any[]) {
  return setDoc(doc(db, "users", uid, "settings", "tasks"), { tasks });
}
export async function getTasks(uid: string) {
  const snap = await getDoc(doc(db, "users", uid, "settings", "tasks"));
  return snap.exists() ? snap.data().tasks : [];
}

// ─── HABITS ─────────────────────────────────────────
export async function saveHabits(uid: string, habits: any[]) {
  return setDoc(doc(db, "users", uid, "settings", "habits"), { habits });
}
export async function getHabits(uid: string) {
  const snap = await getDoc(doc(db, "users", uid, "settings", "habits"));
  return snap.exists() ? snap.data().habits : [];
}
export async function saveHabitLogs(uid: string, logs: any) {
  return setDoc(doc(db, "users", uid, "settings", "habitLogs"), logs);
}
export async function getHabitLogs(uid: string) {
  const snap = await getDoc(doc(db, "users", uid, "settings", "habitLogs"));
  return snap.exists() ? snap.data() : {};
}

// ─── MOOD ────────────────────────────────────────────
export async function addMood(uid: string, data: any) {
  return addDoc(collection(db, "users", uid, "mood"), {
    ...data, createdAt: serverTimestamp()
  });
}
export async function getMoods(uid: string) {
  const q = query(collection(db, "users", uid, "mood"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── USER PROFILE ────────────────────────────────────
export async function saveProfile(uid: string, data: any) {
  return setDoc(doc(db, "users", uid, "settings", "profile"), data, { merge: true });
}
export async function getProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid, "settings", "profile"));
  return snap.exists() ? snap.data() : {};
}
