// A small ⓘ whose explanation shows in a bubble on hover or tap (the CSS reads data-tip), so the extra text stays
// out of the way.
export default function Info({ text }) {
  if (!text) return null;
  return <span className="info" data-tip={text} aria-label={text} tabIndex={0}>i</span>;
}
