export type ReminderItem = {
  id: string;
  type: "emi" | "subscription" | "dhar" | "todo" | "lending";
  title: string;
  subtitle?: string;
  amount?: string;
  urgent?: boolean;
};

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

/** Phone/system notification bar — works best when PWA installed + permission granted. */
export async function showSystemNotification(title: string, body: string, url = "/dashboard") {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const opts: NotificationOptions = {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: `lifeos-${Date.now()}`,
    data: { url },
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, opts);
      return;
    }
    new Notification(title, opts);
  } catch {
    /* ignore */
  }
}

export function showBrowserNotification(title: string, body: string) {
  void showSystemNotification(title, body);
}

export function buildDueReminders(input: {
  debts: { id: string; name: string; emi: number; dueDay?: number }[];
  subscriptions: { id: string; name: string; amount: number }[];
  todos: { id: string; title: string; dueDate?: string; done: boolean; urgent?: boolean }[];
  lending: { id: string; person: string; amount: number; dueDate?: string; status: string; urgent?: boolean }[];
  today: string;
  dayOfMonth: number;
  fmt: (n: number) => string;
}): ReminderItem[] {
  const items: ReminderItem[] = [];
  const { today, dayOfMonth, fmt } = input;
  const tomorrow = addDays(today, 1);

  input.todos.filter((t) => !t.done && t.urgent).forEach((t) => {
    items.push({
      id: `urgent-todo-${t.id}`,
      type: "todo",
      title: t.title,
      subtitle: t.dueDate ? (t.dueDate <= today ? "Urgent · overdue" : "Urgent") : "Urgent",
      urgent: true,
    });
  });

  input.lending.filter((l) => l.status !== "completed" && l.urgent).forEach((l) => {
    items.push({
      id: `urgent-lend-${l.id}`,
      type: "lending",
      title: `${l.person} — dhar`,
      amount: fmt(l.amount),
      subtitle: l.dueDate ? (l.dueDate <= today ? "Urgent · overdue" : "Urgent") : "Urgent",
      urgent: true,
    });
  });

  input.debts.filter((d) => d.dueDay === dayOfMonth).forEach((d) => {
    items.push({ id: `emi-${d.id}`, type: "emi", title: `EMI due: ${d.name}`, amount: fmt(d.emi) });
  });

  input.todos.filter((t) => !t.done && t.dueDate && t.dueDate <= today && !t.urgent).forEach((t) => {
    items.push({
      id: `todo-${t.id}`,
      type: "todo",
      title: t.title,
      subtitle: t.dueDate === today ? "Deadline aj" : "Overdue",
    });
  });

  input.todos.filter((t) => !t.done && t.dueDate === tomorrow).forEach((t) => {
    items.push({ id: `todo-tmr-${t.id}`, type: "todo", title: t.title, subtitle: "Deadline kal" });
  });

  input.lending.filter((l) => l.status !== "completed" && l.dueDate && l.dueDate <= today && !l.urgent).forEach((l) => {
    items.push({
      id: `lend-${l.id}`,
      type: "lending",
      title: `${l.person} — dhar due`,
      amount: fmt(l.amount),
      subtitle: l.dueDate === today ? "Deadline aj" : "Overdue",
    });
  });

  input.lending.filter((l) => l.status !== "completed" && l.dueDate === tomorrow && !l.urgent).forEach((l) => {
    items.push({
      id: `lend-tmr-${l.id}`,
      type: "lending",
      title: `${l.person} — dhar`,
      amount: fmt(l.amount),
      subtitle: "Deadline kal",
    });
  });

  if (dayOfMonth === 1) {
    input.subscriptions.forEach((s) => {
      items.push({ id: `sub-${s.id}`, type: "subscription", title: s.name, amount: fmt(s.amount), subtitle: "Monthly bill" });
    });
  }

  return items.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
}
