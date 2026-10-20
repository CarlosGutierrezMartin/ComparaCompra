"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { t } from "@/i18n/es";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/**
 * Android y escritorio: botón propio con beforeinstallprompt.
 * iOS: enlace a la ayuda con los pasos de Safari, solo si no está ya instalada.
 */
export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<"unknown" | "installed" | "ios" | "other">("unknown");

  useEffect(() => {
    // Se decide en el cliente: el servidor no sabe si la app está instalada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(isStandalone() ? "installed" : isIos() ? "ios" : "other");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "installed") return <p className="text-sm text-muted">{t.install.installed}</p>;
  if (state === "ios") {
    return (
      <Link
        href="/instalar"
        className="tap inline-flex items-center font-medium text-brand underline"
      >
        {t.install.iosLink}
      </Link>
    );
  }
  if (!deferred) return null;
  return (
    <button
      type="button"
      className="tap rounded-lg bg-brand px-4 font-medium text-white"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
    >
      {t.install.button}
    </button>
  );
}
