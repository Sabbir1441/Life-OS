import { sortUrgentFirst } from "./sort-priority";

export type BriefItem = {
  id: string;
  label: string;
  meta?: string;
  urgent?: boolean;
};

export type DailyBrief = {
  date: string;
  generatedAt: string;
  lines: string[];
  sections: {
    urgent: BriefItem[];
    dueToday: BriefItem[];
    pendingTodos: BriefItem[];
    pendingLending: BriefItem[];
    routine: BriefItem[];
  };
};

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildDailyBrief(input: {
  today: string;
  todos: { id: string; title: string; dueDate?: string; done: boolean; urgent?: boolean }[];
  lending: { id: string; person: string; amount: number; dueDate?: string; status: string; urgent?: boolean; direction: string }[];
  tasks: { id: string; name: string; time: string; done: boolean }[];
  debts: { id: string; name: string; dueDay?: number }[];
  fmt: (n: number) => string;
}): DailyBrief {
  const { today, fmt } = input;
  const dayOfMonth = new Date(today + "T12:00:00").getDate();

  const activeTodos = sortUrgentFirst(input.todos.filter((t) => !t.done));
  const openLending = sortUrgentFirst(
    input.lending.filter((l) => l.status !== "completed").map((l) => ({ ...l, urgent: l.urgent }))
  );

  const urgent: BriefItem[] = [];
  activeTodos.filter((t) => t.urgent).forEach((t) => {
    urgent.push({ id: `tu-${t.id}`, label: t.title, meta: t.dueDate ? `Deadline ${t.dueDate}` : "Urgent", urgent: true });
  });
  openLending.filter((l) => l.urgent).forEach((l) => {
    urgent.push({
      id: `lu-${l.id}`,
      label: `${l.person} — ${fmt(l.amount)}`,
      meta: l.dueDate ? `Deadline ${l.dueDate}` : "Urgent dhar",
      urgent: true,
    });
  });

  const dueToday: BriefItem[] = [];
  activeTodos.filter((t) => t.dueDate === today).forEach((t) => {
    if (!t.urgent) dueToday.push({ id: `td-${t.id}`, label: t.title, meta: "Todo deadline aj" });
  });
  openLending.filter((l) => l.dueDate === today).forEach((l) => {
    if (!l.urgent) dueToday.push({ id: `ld-${l.id}`, label: `${l.person} ${fmt(l.amount)}`, meta: "Dhar deadline aj" });
  });
  input.debts.filter((d) => d.dueDay === dayOfMonth).forEach((d) => {
    dueToday.push({ id: `emi-${d.id}`, label: d.name, meta: "EMI aj" });
  });

  const pendingTodos: BriefItem[] = activeTodos
    .filter((t) => !t.urgent && t.dueDate !== today)
    .map((t) => ({
      id: `tp-${t.id}`,
      label: t.title,
      meta: t.dueDate ? `Deadline ${t.dueDate}` : undefined,
    }));

  const pendingLending: BriefItem[] = openLending
    .filter((l) => !l.urgent && l.dueDate !== today)
    .map((l) => ({
      id: `lp-${l.id}`,
      label: `${l.person} — ${fmt(l.amount)}`,
      meta: l.dueDate ? `Deadline ${l.dueDate}` : l.direction === "borrowed" ? "Processing" : "Pending",
    }));

  const routine: BriefItem[] = input.tasks
    .filter((t) => !t.done)
    .map((t) => ({ id: `r-${t.id}`, label: t.name, meta: t.time }));

  const lines: string[] = [];
  if (urgent.length) lines.push(`Urgent: ${urgent.map((i) => i.label).join(", ")}`);
  if (dueToday.length) lines.push(`Aj due: ${dueToday.map((i) => i.label).join(", ")}`);
  if (pendingTodos.length) lines.push(`Todo pending: ${pendingTodos.length}`);
  if (pendingLending.length) lines.push(`Dhar pending: ${pendingLending.length}`);
  if (routine.length) lines.push(`Routine: ${routine.length} task`);

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    lines,
    sections: { urgent, dueToday, pendingTodos, pendingLending, routine },
  };
}

export function deadlineLabel(dueDate: string | undefined, today: string) {
  if (!dueDate) return null;
  if (dueDate < today) return "Overdue";
  if (dueDate === today) return "Aj deadline";
  const tomorrow = addDays(today, 1);
  if (dueDate === tomorrow) return "Kal deadline";
  return `Deadline ${dueDate}`;
}
