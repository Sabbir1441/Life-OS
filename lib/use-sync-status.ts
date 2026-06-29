"use client";

import { useEffect, useState } from "react";
import { onSnapshotsInSync } from "firebase/firestore";
import { db } from "./firebase";

export type SyncState = "online" | "offline" | "syncing";

export function useSyncStatus() {
  const [online, setOnline] = useState(true);
  const [inSync, setInSync] = useState(true);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unsub = onSnapshotsInSync(db, () => setInSync(true));
    const markPending = () => setInSync(false);
    window.addEventListener("beforeunload", markPending);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeunload", markPending);
      unsub();
    };
  }, []);

  const state: SyncState = !online ? "offline" : inSync ? "online" : "syncing";
  const label =
    state === "offline" ? "Offline — cache mode" : state === "syncing" ? "Syncing..." : "Synced";

  return { state, label, online, inSync };
}
