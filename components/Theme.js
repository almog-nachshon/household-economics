"use client";
import { useEffect, useState } from "react";

// Light or dark, kept in the browser (a small script in app/layout.js applies it before the first paint). The dark one
// uses TradingView's palette (app/globals.css). Parts that draw their own colors, like the price chart, follow useTheme.
const read = () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function useTheme() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const sync = () => setTheme(read());
    sync();
    const watch = new MutationObserver(sync);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return theme;
}

export default function ThemeSwitch() {
  const theme = useTheme();
  const dark = theme === "dark";
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // A blocked storage only means the choice is not remembered.
    }
  };
  return (
    <button type="button" className="theme-switch" role="switch" aria-checked={dark} aria-label="מצב כהה" title={dark ? "מעבר למצב בהיר" : "מעבר למצב כהה"} onClick={toggle}>
      <span aria-hidden="true">☀️</span>
      <span className="theme-track"><span className="theme-knob" /></span>
      <span aria-hidden="true">🌙</span>
    </button>
  );
}
