import { money, sumDiffs } from "./money.js";
import { ratingForTotal } from "./ratings.js";

const PLAY_URL = "https://www.costcodle.com";

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

function labelForRound(r) {
  return r.short || r.name || `Item ${r.productId || ""}`;
}

function shareLead(rating, totalCents, flavor, gameNumber) {
  const off = money(totalCents);
  const day =
    flavor === "today" ? "today's Costcodle" : `Costcodle Checkout #${gameNumber}`;

  switch (rating) {
    case "EXECUTIVE MEMBER":
      return flavor === "today"
        ? `I became a Costcodle Executive Member with a total off of ${off}!`
        : `I became a Costcodle Executive Member on Checkout #${gameNumber} with a total off of ${off}!`;
    case "GOLD STAR MEMBER":
      return `I earned my Costcodle Gold Star on ${day} with a total off of ${off}!`;
    case "BULK BUYER":
      return `Went full Bulk Buyer on ${day} and walked out ${off} off the mark!`;
    case "FREE SAMPLE HUNTER":
      return `${day[0].toUpperCase()}${day.slice(1)} had me hunting free samples with a ${off} total off!`;
    case "LOST IN AISLE 12":
      return `${day[0].toUpperCase()}${day.slice(1)} had me lost in aisle 12 with a ${off} total off!`;
    case "FORGOT YOUR CARD":
      return `Forgot my Costcodle card on ${day} and left ${off} on the table!`;
    default:
      return `I earned ${rating} on ${day} with a total off of ${off}!`;
  }
}

export function buildShareText(gameNumber, rounds) {
  const total = sumDiffs(rounds);
  const rating = ratingForTotal(total);
  const lines = rounds.map(
    (r, i) => `${i + 1}. ${labelForRound(r)} — off ${money(r.diffCents)}`
  );

  return [
    shareLead(rating, total, "today", gameNumber),
    "",
    `Costcodle Checkout #${gameNumber}`,
    ...lines,
    "",
    `Play now at ${PLAY_URL}`,
  ].join("\n");
}

export function buildArchiveShareText(gameNumber, { totalCents, rating }) {
  const resolved = rating || ratingForTotal(totalCents);
  return [
    shareLead(resolved, totalCents, "archive", gameNumber),
    "",
    `Play now at ${PLAY_URL}`,
  ].join("\n");
}

export async function shareResults(text) {
  if (isMobile() && navigator.share) {
    try {
      await navigator.share({ title: "COSTCODLE", text });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "failed";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      return "copied";
    } catch {
      return "failed";
    } finally {
      document.body.removeChild(ta);
    }
  }
}
