import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type MonthStatus = "active" | "closed";

export type PlannerMonth = {
  id: string;
  label: string;
  year: number;
  month: number;
  status: MonthStatus;
  createdAt?: unknown;
  closedAt?: unknown;
};

const defaultBudget = {
  Food: 8000,
  Transport: 4000,
  Bills: 6000,
  Shopping: 4000,
  Health: 2000,
  Education: 2000,
  Entertainment: 2000,
};

export function monthIdFromDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromParts(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-BD", {
    month: "long",
    year: "numeric",
  });
}

export function nextMonthParts(year: number, month: number) {
  const d = new Date(year, month, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

async function getActiveMonthId(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", uid, "settings", "activeMonth"));
  if (!snap.exists()) return null;
  const id = snap.data().monthId;
  return typeof id === "string" ? id : null;
}

async function setActiveMonthId(uid: string, monthId: string) {
  await setDoc(doc(db, "users", uid, "settings", "activeMonth"), { monthId });
}

export async function getMonths(uid: string): Promise<PlannerMonth[]> {
  const snap = await getDocs(collection(db, "users", uid, "months"));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        label: String(data.label ?? d.id),
        year: Number(data.year) || 0,
        month: Number(data.month) || 0,
        status: (data.status === "closed" ? "closed" : "active") as MonthStatus,
        createdAt: data.createdAt,
        closedAt: data.closedAt,
      };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

export async function getMonth(uid: string, monthId: string): Promise<PlannerMonth | null> {
  const snap = await getDoc(doc(db, "users", uid, "months", monthId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    label: String(data.label ?? snap.id),
    year: Number(data.year) || 0,
    month: Number(data.month) || 0,
    status: data.status === "closed" ? "closed" : "active",
    createdAt: data.createdAt,
    closedAt: data.closedAt,
  };
}

export async function createMonth(
  uid: string,
  year: number,
  month: number,
  status: MonthStatus = "active"
): Promise<PlannerMonth> {
  const id = `${year}-${String(month).padStart(2, "0")}`;
  const existing = await getMonth(uid, id);
  if (existing) return existing;

  const label = monthLabelFromParts(year, month);
  await setDoc(doc(db, "users", uid, "months", id), {
    label,
    year,
    month,
    status,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "users", uid, "months", id, "settings", "budget"), defaultBudget);
  await setDoc(doc(db, "users", uid, "months", id, "settings", "tasks"), { tasks: [] });
  await setDoc(doc(db, "users", uid, "months", id, "settings", "habits"), { habits: [] });
  await setDoc(doc(db, "users", uid, "months", id, "settings", "habitLogs"), {});

  return { id, label, year, month, status };
}

/** Copy legacy flat collections into the first month (one-time). */
async function migrateLegacyData(uid: string, monthId: string) {
  const legacyExp = await getDocs(collection(db, "users", uid, "expenses"));
  if (legacyExp.empty) return;

  const batch = writeBatch(db);
  let count = 0;

  const copyCol = async (legacyName: string, monthSub: string) => {
    const legacy = await getDocs(collection(db, "users", uid, legacyName));
    const target = collection(db, "users", uid, "months", monthId, monthSub);
    for (const d of legacy.docs) {
      if (count >= 450) return;
      batch.set(doc(target, d.id), d.data());
      count++;
    }
  };

  await copyCol("expenses", "expenses");
  await copyCol("income", "income");
  await copyCol("goals", "goals");
  await copyCol("mood", "mood");

  const legacyBudget = await getDoc(doc(db, "users", uid, "settings", "budget"));
  if (legacyBudget.exists()) {
    batch.set(doc(db, "users", uid, "months", monthId, "settings", "budget"), legacyBudget.data());
  }

  for (const key of ["tasks", "habits", "habitLogs"] as const) {
    const snap = await getDoc(doc(db, "users", uid, "settings", key));
    if (snap.exists()) {
      batch.set(doc(db, "users", uid, "months", monthId, "settings", key), snap.data());
    }
  }

  if (count > 0 || legacyBudget.exists()) {
    await batch.commit();
  }
}

/** Ensure user has at least one month and an active month id. */
export async function ensureMonthSetup(uid: string): Promise<PlannerMonth> {
  let activeId = await getActiveMonthId(uid);
  let months = await getMonths(uid);

  if (!months.length) {
    const now = new Date();
    const created = await createMonth(uid, now.getFullYear(), now.getMonth() + 1, "active");
    await migrateLegacyData(uid, created.id);
    await setActiveMonthId(uid, created.id);
    return created;
  }

  if (!activeId || !months.find((m) => m.id === activeId)) {
    const open = months.find((m) => m.status === "active");
    activeId = open?.id ?? months[0].id;
    await setActiveMonthId(uid, activeId);
  }

  const active = await getMonth(uid, activeId);
  return active ?? months[0];
}

export async function switchActiveMonth(uid: string, monthId: string) {
  await setActiveMonthId(uid, monthId);
}

export async function closeMonthAndStartNext(uid: string, currentMonthId: string): Promise<PlannerMonth> {
  const current = await getMonth(uid, currentMonthId);
  if (!current) throw new Error("Month not found");

  await updateDoc(doc(db, "users", uid, "months", currentMonthId), {
    status: "closed",
    closedAt: serverTimestamp(),
  });

  const next = nextMonthParts(current.year, current.month);
  const newMonth = await createMonth(uid, next.year, next.month, "active");
  await setActiveMonthId(uid, newMonth.id);
  return newMonth;
}

export async function startCustomMonth(uid: string, year: number, month: number): Promise<PlannerMonth> {
  const openMonths = (await getMonths(uid)).filter((m) => m.status === "active");
  for (const m of openMonths) {
    await updateDoc(doc(db, "users", uid, "months", m.id), {
      status: "closed",
      closedAt: serverTimestamp(),
    });
  }
  const created = await createMonth(uid, year, month, "active");
  await setActiveMonthId(uid, created.id);
  return created;
}
