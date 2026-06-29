export type CalendarEvent = {
  id: string;
  type: "expense" | "todo" | "routine" | "mood" | "dhar" | "emi";
  label: string;
  color: string;
};

export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return rows;
}

export function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function buildCalendarEvents(input: {
  expenses: { id: string; desc: string; amount: number; date: string }[];
  todos: { id: string; title: string; dueDate?: string; done: boolean }[];
  tasks: { id: string; name: string; time: string; done: boolean }[];
  moods: { id: string; label: string; date: string }[];
  lending: { id: string; person: string; dueDate?: string; status: string }[];
  debts: { id: string; name: string; dueDay?: number }[];
  year: number;
  month: number;
}): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};
  const push = (key: string, ev: CalendarEvent) => {
    if (!map[key]) map[key] = [];
    map[key].push(ev);
  };

  input.expenses.forEach((e) => {
    if (e.date.startsWith(`${input.year}-${String(input.month + 1).padStart(2, "0")}`)) {
      push(e.date, { id: `e-${e.id}`, type: "expense", label: e.desc.slice(0, 20), color: "var(--accent)" });
    }
  });

  input.todos.filter((t) => !t.done && t.dueDate).forEach((t) => {
    push(t.dueDate!, { id: `t-${t.id}`, type: "todo", label: t.title.slice(0, 20), color: "var(--teal)" });
  });

  input.moods.forEach((m) => {
    if (m.date?.startsWith(`${input.year}-${String(input.month + 1).padStart(2, "0")}`)) {
      push(m.date, { id: `m-${m.id}`, type: "mood", label: m.label, color: "var(--pink)" });
    }
  });

  input.lending.filter((l) => l.status !== "completed" && l.dueDate).forEach((l) => {
    if (l.dueDate!.startsWith(`${input.year}-${String(input.month + 1).padStart(2, "0")}`)) {
      push(l.dueDate!, { id: `l-${l.id}`, type: "dhar", label: l.person, color: "var(--amber)" });
    }
  });

  const daysInMonth = new Date(input.year, input.month + 1, 0).getDate();
  input.debts.filter((d) => d.dueDay).forEach((d) => {
    for (let day = 1; day <= daysInMonth; day++) {
      if (d.dueDay === day) {
        const key = `${input.year}-${String(input.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        push(key, { id: `d-${d.id}-${day}`, type: "emi", label: d.name, color: "var(--red)" });
      }
    }
  });

  const today = new Date();
  if (today.getFullYear() === input.year && today.getMonth() === input.month) {
    input.tasks.filter((t) => !t.done).forEach((t) => {
      push(dateKey(today), { id: `r-${t.id}`, type: "routine", label: `${t.time} ${t.name}`.slice(0, 22), color: "var(--blue)" });
    });
  }

  return map;
}
