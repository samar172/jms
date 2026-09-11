"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "jms-pwa-dismissed";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function PwaInstaller() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);

  // Register the service worker (enables installability + offline shell).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const ua = window.navigator.userAgent || "";
    const ios = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const onInstalled = () => { setShow(false); setDeferred(null); };
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — offer the manual A2HS instructions.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (ios && isSafari) {
      iosTimer = setTimeout(() => { setIsIos(true); setShow(true); }, 1500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="JMS" className="w-11 h-11 rounded-lg shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-slate-900">Install the JMS app</div>
            {isIos ? (
              <p className="text-[12px] text-slate-600 mt-0.5">
                Tap the <span className="font-medium">Share</span> icon <span aria-hidden>⬆️</span> in Safari, then choose{" "}
                <span className="font-medium">“Add to Home Screen”</span>.
              </p>
            ) : (
              <p className="text-[12px] text-slate-600 mt-0.5">
                Add JMS to your home screen for a full-screen, app-like experience — faster access, no browser bar.
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={dismiss} className="h-8 px-3 rounded border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50">
            Not now
          </button>
          {!isIos && (
            <button onClick={install} className="h-8 px-4 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">
              Install
            </button>
          )}
          {isIos && (
            <button onClick={dismiss} className="h-8 px-4 rounded bg-blue-800 text-white text-[12px] font-medium hover:bg-blue-900">
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
