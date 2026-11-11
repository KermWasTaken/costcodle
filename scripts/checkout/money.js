const usd = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactUsd = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function money(cents, { sign = "$", short = false, shortFrom = 10000 } = {}) {
  const dollars = cents / 100;
  return (
    sign +
    (short && Math.abs(dollars) >= shortFrom
      ? compactUsd.format(dollars)
      : usd.format(dollars))
  );
}

export function lcdMoney(cents) {
  const p =
    typeof document !== "undefined"
      ? parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--p")
        ) || 4
      : 4;
  const compactFrom = p <= 2 ? 10000 : 100000;
  return cents < compactFrom
    ? money(cents)
    : "$" + compactUsd.format(cents / 100);
}

export function parseGuessToCents(raw) {
  if (raw == null) return null;
  const stripped = String(raw).trim().replace(/[$,\s]/g, "");
  if (!stripped || !/^\d+(\.\d{0,2})?$/.test(stripped)) return null;
  const dollars = Number(stripped);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

export function parseCatalogPrice(price) {
  if (typeof price === "number") return Math.round(price * 100);
  const stripped = String(price).replace(/[$,\s]/g, "");
  return Math.round(Number(stripped) * 100);
}

export function sumDiffs(rounds) {
  return rounds.reduce((sum, r) => sum + r.diffCents, 0);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
