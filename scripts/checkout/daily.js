/* Checkout day helpers — calendar game N + shared CostcodleDaily SKUs. */

const COSTCODLE_EPOCH_UTC = Date.UTC(2023, 8, 21);

export const CHECKOUT_LAUNCH_GAME =
  (typeof window !== "undefined" && window.CostcodleDaily?.CHECKOUT_LAUNCH_GAME) ||
  1148;

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function daily() {
  const api = typeof window !== "undefined" ? window.CostcodleDaily : null;
  if (!api) {
    throw new Error("CostcodleDaily helpers missing — load scripts/daily-ids.js first");
  }
  return api;
}

export function getGameNumber(date = new Date()) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today - COSTCODLE_EPOCH_UTC) / 86400000) + 2;
}

export function dateForGameNumber(gameNumber) {
  const utc = COSTCODLE_EPOCH_UTC + (gameNumber - 2) * 86400000;
  const d = new Date(utc);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function formatShortDate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

export function formatLongDate(date) {
  const day = DAY_NAMES[date.getDay()];
  const mon = MONTH_NAMES[date.getMonth()];
  const dd = String(date.getDate()).padStart(2, "0");
  return `${day} ${mon} ${dd} ${date.getFullYear()}`;
}

export function formatArchiveDay(date) {
  const day = DAY_NAMES[date.getDay()];
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${day} ${mm}/${dd}`;
}

export function classicProductId(gameNumber) {
  return daily().classicProductId(gameNumber);
}

export function checkoutProductIds(gameNumber) {
  return daily().checkoutProductIds(gameNumber);
}

export function checkoutGameNumber(gameNumber) {
  return daily().checkoutGameNumber(gameNumber);
}

export function msUntilMidnight(date = new Date()) {
  const midnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1
  );
  return Math.max(0, midnight - date);
}

export function formatCountdown(ms) {
  const secs = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(
    secs % 60
  )}`;
}

export { DAY_NAMES, MONTH_NAMES };
