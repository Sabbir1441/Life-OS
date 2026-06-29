"use client";

import { enableIndexedDbPersistence } from "firebase/firestore";
import { db } from "./firebase";

let persistenceStarted = false;

/** Firestore offline cache — data read/write without internet (syncs when back online). */
export async function initFirestorePersistence() {
  if (persistenceStarted || typeof window === "undefined") return;
  persistenceStarted = true;
  try {
    await enableIndexedDbPersistence(db);
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
    if (code !== "failed-precondition" && code !== "unimplemented") {
      console.warn("Firestore persistence:", e);
    }
  }
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
