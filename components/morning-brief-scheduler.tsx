"use client";

import { useEffect } from "react";
import type { DailyBrief } from "@/lib/daily-brief";
import { showSystemNotification } from "@/lib/notifications";

const MORNING_HOUR = 8;

type Props = {
  brief: DailyBrief | null;
  ready: boolean;
};

/** Protiday 8 AM (ba tar por prothom visit) — ajker list notification. */
export function MorningBriefScheduler({ brief, ready }: Props) {
  useEffect(() => {
    if (!ready || !brief || !brief.lines.length) return;

    const storageKey = `lifeos-morning-${brief.date}`;

    const fireMorningBrief = async () => {
      if (localStorage.getItem(storageKey)) return;
      const now = new Date();
      if (now.getHours() < MORNING_HOUR) return;
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted") return;

      localStorage.setItem(storageKey, brief.generatedAt);
      const body =
        brief.lines.slice(0, 4).join("\n") ||
        `${brief.sections.pendingTodos.length} todo · ${brief.sections.pendingLending.length} dhar pending`;
      await showSystemNotification("LifeOS — Ajker Din (8 AM)", body, "/dashboard");
    };

    void fireMorningBrief();
    const id = setInterval(() => void fireMorningBrief(), 30_000);
    return () => clearInterval(id);
  }, [brief, ready]);

  return null;
}
