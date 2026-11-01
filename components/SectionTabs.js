"use client";
import { useEffect, useState } from "react";

// A slim bar of tabs that stays under the nav on a long page and jumps to its blocks, marking the one on screen.
// tabs: [[element id, label]].
export default function SectionTabs({ tabs }) {
  const [on, setOn] = useState(tabs[0]?.[0]);
  useEffect(() => {
    const seen = new Set();
    const watch = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
        const first = tabs.find(([id]) => seen.has(id));
        if (first) setOn(first[0]);
        else if (window.scrollY < 200) setOn(tabs[0][0]);
      },
      // The band just under the nav and this bar decides which block is "on screen".
      { rootMargin: "-100px 0px -70% 0px" },
    );
    for (const [id] of tabs) {
      const el = document.getElementById(id);
      if (el) watch.observe(el);
    }
    return () => watch.disconnect();
  }, [tabs]);
  return (
    <div className="section-tabs" role="navigation" aria-label="מעבר בין חלקי הדף">
      {tabs.map(([id, label]) => (
        <a key={id} href={`#${id}`} className={on === id ? "on" : ""} aria-current={on === id ? "true" : undefined}>{label}</a>
      ))}
    </div>
  );
}
