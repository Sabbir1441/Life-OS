export function sortUrgentFirst<T extends { urgent?: boolean; dueDate?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (Boolean(b.urgent) !== Boolean(a.urgent)) return Number(b.urgent) - Number(a.urgent);
    const da = a.dueDate || "9999-12-31";
    const db = b.dueDate || "9999-12-31";
    return da.localeCompare(db);
  });
}

export function splitUrgentNormal<T extends { urgent?: boolean }>(items: T[]) {
  const urgent = items.filter((i) => i.urgent);
  const normal = items.filter((i) => !i.urgent);
  return { urgent, normal };
}
