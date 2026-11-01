"use client";
import { useState } from "react";

// A table row that opens a full-width details row under it: a click anywhere on the row except its links, buttons
// and ⓘ, or Enter / space from the keyboard. The details are rendered on the server and shown only when open.
export default function ExpandRow({ cells, colSpan, className = "", children }) {
  const [open, setOpen] = useState(false);
  const toggle = (e) => {
    if (e.target.closest("a, button, input, summary, .info")) return;
    setOpen((o) => !o);
  };
  return (
    <>
      <tr
        className={`expand-row${open ? " open" : ""} ${className}`}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(e))}
        tabIndex={0}
        aria-expanded={open}
      >
        {cells}
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={colSpan}>{children}</td>
        </tr>
      )}
    </>
  );
}
