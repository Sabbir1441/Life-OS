/** Opens WhatsApp with pre-filled reminder text (free — no API key needed). */
export function openWhatsAppReminder(message: string, phone?: string) {
  const text = encodeURIComponent(message);
  const url = phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`
    : `https://wa.me/?text=${text}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function buildReminderMessage(item: { title: string; amount?: string; subtitle?: string }) {
  let msg = `LifeOS reminder: ${item.title}`;
  if (item.amount) msg += ` (${item.amount})`;
  if (item.subtitle) msg += ` — ${item.subtitle}`;
  return msg;
}
