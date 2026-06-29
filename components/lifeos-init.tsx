"use client";

import { useEffect } from "react";
import { initFirestorePersistence, registerServiceWorker } from "@/lib/firebase-persistence";

export function LifeOSInit() {
  useEffect(() => {
    initFirestorePersistence();
    registerServiceWorker();
  }, []);
  return null;
}
