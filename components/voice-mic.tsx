"use client";

import { useCallback, useState } from "react";

type Props = {
  onResult: (text: string) => void;
  lang?: string;
};

export function VoiceMic({ onResult, lang = "bn-BD" }: Props) {
  const [listening, setListening] = useState(false);
  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!supported) {
      alert("Voice input ei browser e support kore na. Chrome/Edge try koro.");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListening(true);
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (text) onResult(text);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }, [supported, lang, onResult]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={start}
      title="Voice input — Bangla/English"
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: `1px solid ${listening ? "var(--accent)" : "var(--border)"}`,
        background: listening ? "var(--accent-glow)" : "var(--bg3)",
        color: listening ? "var(--accent2)" : "var(--text2)",
        cursor: "pointer",
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {listening ? "🔴" : "🎤"}
    </button>
  );
}
