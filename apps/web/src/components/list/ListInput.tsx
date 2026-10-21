"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { t } from "@/i18n/es";
import { Button, inputClass } from "../ui";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function ListInput({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // Solo en el cliente: el dictado depende del navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanDictate(getRecognition() !== null);
  }, []);

  function dictate() {
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = "es-ES";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(", ");
      setText((prev) => (prev ? `${prev}, ${said}` : said));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="list-text" className="font-medium">
        {t.list.inputLabel}
      </label>
      <textarea
        id="list-text"
        rows={3}
        className={`${inputClass} py-2`}
        placeholder={t.list.inputPlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !text.trim()} className="flex-1">
          {busy ? t.list.adding : t.list.add}
        </Button>
        {canDictate ? (
          <Button
            type="button"
            variant="secondary"
            aria-pressed={listening}
            onClick={() => (listening ? recRef.current?.stop() : dictate())}
          >
            {listening ? t.list.dictating : t.list.dictate}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
