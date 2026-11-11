import { bucketForTotal, ratingForTotal } from "./ratings.js";
import { sumDiffs } from "./money.js";

const STATE_KEY = "checkoutState";
const STATS_KEY = "checkoutStats";
const MUTE_KEY = "checkoutMuted";
const V2_ANNOUNCE_KEY = "costcodleV2Announce";

export const PHASE = {
  GUESSING: "guessing",
  AWAITING_NEXT: "awaitingNext",
  COMPLETE: "complete",
};

const STATS_VERSION = 3;

function defaultStats() {
  return {
    version: STATS_VERSION,
    numGames: 0,
    currentStreak: 0,
    maxStreak: 0,
    bestCents: null,
    sumTotalCents: 0,
    buckets: { lt5: 0, b5_10: 0, b10_25: 0, b25_50: 0, gte50: 0 },
    history: {},
    inProgress: {},
    lastCompletedGame: null,
  };
}

function defaultState(gameNumber, productIds) {
  return {
    version: 1,
    gameNumber,
    productIds,
    rounds: [],
    phase: PHASE.GUESSING,
    completedAt: null,
  };
}

export function compactRounds(rounds) {
  return (rounds || []).map((r) => ({
    productId: r.productId,
    name: r.name,
    short: r.short,
    image: r.image,
    guessCents: r.guessCents,
    actualCents: r.actualCents,
    diffCents: r.diffCents,
  }));
}

function safeGetJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw);
  } catch (err) {
    console.warn(`[checkout] corrupt ${key}`, err);
  }
  try {
    const bak = localStorage.getItem(`${key}:bak`);
    if (bak != null) {
      console.warn(`[checkout] restored ${key} from backup`);
      try {
        localStorage.setItem(key, bak);
      } catch {
        /* ignore */
      }
      return JSON.parse(bak);
    }
  } catch (err) {
    console.warn(`[checkout] corrupt backup ${key}`, err);
  }
  return typeof fallback === "function" ? fallback() : fallback;
}

function safeSetJson(key, value) {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (err) {
    console.error(`[checkout] stringify failed ${key}`, err);
    return false;
  }
  try {
    const prev = localStorage.getItem(key);
    if (prev != null) {
      try {
        localStorage.setItem(`${key}:bak`, prev);
      } catch {
        /* backup optional */
      }
    }
    localStorage.setItem(key, raw);
    try {
      localStorage.setItem(`${key}:bak`, raw);
    } catch {
      /* bak sync optional */
    }
    return true;
  } catch (err) {
    console.error(`[checkout] write failed ${key}`, err);
    try {
      localStorage.setItem(key, raw);
      return true;
    } catch (err2) {
      console.error(`[checkout] write failed hard ${key}`, err2);
      return false;
    }
  }
}

function migrateStats(stats) {
  if (!stats || typeof stats !== "object") return defaultStats();
  if (!stats.buckets) stats.buckets = defaultStats().buckets;
  if (!stats.history) stats.history = {};
  if (!stats.inProgress) stats.inProgress = {};

  for (const [key, entry] of Object.entries(stats.history)) {
    if (!entry || typeof entry !== "object") {
      delete stats.history[key];
      continue;
    }
    if (!Array.isArray(entry.rounds)) entry.rounds = entry.rounds || [];
    if (entry.gameNumber == null) entry.gameNumber = Number(key);
  }

  for (const [key, entry] of Object.entries(stats.inProgress)) {
    if (!entry || typeof entry !== "object") {
      delete stats.inProgress[key];
      continue;
    }
    if (!Array.isArray(entry.rounds)) entry.rounds = [];
  }

  stats.version = STATS_VERSION;
  return stats;
}

function upsertHistoryEntry(stats, state) {
  if (!state || state.phase !== PHASE.COMPLETE) return;
  const key = String(state.gameNumber);
  const existing = stats.history[key];
  const incomingRounds = compactRounds(state.rounds || []);
  const existingRounds = Array.isArray(existing?.rounds) ? existing.rounds : [];

  const rounds =
    incomingRounds.length >= existingRounds.length ? incomingRounds : existingRounds;

  const totalCents =
    state.totalCents != null
      ? state.totalCents
      : rounds.length
        ? sumDiffs(rounds)
        : existing?.totalCents ?? 0;
  const rating = state.rating || existing?.rating || ratingForTotal(totalCents);

  stats.history[key] = {
    gameNumber: state.gameNumber,
    totalCents,
    rating,
    completedAt:
      state.completedAt || existing?.completedAt || new Date().toISOString(),
    productIds:
      state.productIds?.length === 5
        ? state.productIds
        : existing?.productIds || null,
    rounds,
  };
}

export function loadStats() {
  return migrateStats(safeGetJson(STATS_KEY, defaultStats) || defaultStats());
}

export function saveStats(stats) {
  if (!stats) return false;
  stats.version = STATS_VERSION;
  return safeSetJson(STATS_KEY, stats);
}

export function loadState() {
  return safeGetJson(STATE_KEY, () => null);
}

export function saveState(state) {
  if (!state) return false;
  return safeSetJson(STATE_KEY, state);
}

export function loadMuted() {
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function saveMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch (err) {
    console.error("[checkout] mute save failed", err);
  }
}

export function hasSeenV2Announce() {
  try {
    return localStorage.getItem(V2_ANNOUNCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markV2AnnounceSeen() {
  try {
    localStorage.setItem(V2_ANNOUNCE_KEY, "1");
  } catch (err) {
    console.error("[checkout] v2 announce save failed", err);
  }
}

export function historyEntry(stats, gameNumber) {
  return stats.history[String(gameNumber)] || null;
}

export function parkActiveState(state, stats) {
  if (!state) return stats;
  const key = String(state.gameNumber);

  if (state.phase === PHASE.COMPLETE) {
    upsertHistoryEntry(stats, state);
    delete stats.inProgress[key];
    saveStats(stats);
    return stats;
  }

  if (!state.rounds?.length && state.phase === PHASE.GUESSING) {
    delete stats.inProgress[key];
    saveStats(stats);
    return stats;
  }

  stats.inProgress[key] = {
    productIds: state.productIds,
    rounds: compactRounds(state.rounds),
    phase: state.phase,
    completedAt: state.completedAt,
  };
  saveStats(stats);
  return stats;
}

export function loadGameState(gameNumber, productIds, stats) {
  const key = String(gameNumber);

  const live = loadState();
  if (live && live.gameNumber === gameNumber) {
    if (live.rounds?.length || live.phase !== PHASE.COMPLETE) {
      return live;
    }
    const hist = stats.history[key];
    if (hist?.rounds?.length) {
      return {
        version: 1,
        gameNumber,
        productIds:
          hist.productIds?.length === 5 ? hist.productIds : productIds,
        rounds: compactRounds(hist.rounds),
        phase: PHASE.COMPLETE,
        completedAt: hist.completedAt,
        totalCents: hist.totalCents,
        rating: hist.rating,
      };
    }
    return live;
  }

  const parked = stats.inProgress[key];
  if (parked) {
    return {
      version: 1,
      gameNumber,
      productIds: parked.productIds?.length === 5 ? parked.productIds : productIds,
      rounds: compactRounds(parked.rounds || []),
      phase: parked.phase || PHASE.GUESSING,
      completedAt: parked.completedAt || null,
    };
  }

  if (stats.history[key]) {
    const hist = stats.history[key];
    const rounds = compactRounds(hist.rounds || []);
    const fromRounds =
      rounds.length === 5 && rounds.every((r) => r.productId != null)
        ? rounds.map((r) => r.productId)
        : null;
    return {
      version: 1,
      gameNumber,
      productIds:
        hist.productIds?.length === 5
          ? hist.productIds
          : fromRounds || productIds,
      rounds,
      phase: PHASE.COMPLETE,
      completedAt: hist.completedAt,
      totalCents: hist.totalCents,
      rating: hist.rating,
      fromArchiveComplete: rounds.length === 0,
    };
  }

  return defaultState(gameNumber, productIds);
}

export function ensureTodayState(todayGameNumber, productIds) {
  let state = loadState();
  const stats = loadStats();

  if (!state || state.gameNumber !== todayGameNumber) {
    if (
      state &&
      state.phase !== PHASE.COMPLETE &&
      state.gameNumber < todayGameNumber
    ) {
      stats.currentStreak = 0;
      if (state.rounds?.length) {
        stats.inProgress[String(state.gameNumber)] = {
          productIds: state.productIds,
          rounds: compactRounds(state.rounds),
          phase: state.phase,
          completedAt: null,
        };
      }
      saveStats(stats);
    } else if (state && state.phase === PHASE.COMPLETE) {
      upsertHistoryEntry(stats, state);
      saveStats(stats);
    }

    state = loadGameState(todayGameNumber, productIds, stats);
    saveState(state);
  } else if (
    !Array.isArray(state.productIds) ||
    state.productIds.length !== 5 ||
    state.productIds.some((id, i) => id !== productIds[i])
  ) {
    if (!state.rounds.length) {
      state.productIds = productIds;
      saveState(state);
    }
  }

  if (state.phase === PHASE.COMPLETE && state.rounds?.length) {
    upsertHistoryEntry(stats, state);
    saveStats(stats);
  }

  return { state, stats: loadStats() };
}

export function recordCompletedGame(state, stats, { todayGameNumber } = {}) {
  if (state.phase !== PHASE.COMPLETE) return stats;
  const key = String(state.gameNumber);
  const already = Boolean(stats.history[key]);

  upsertHistoryEntry(stats, {
    ...state,
    rating: state.rating || ratingForTotal(
      state.totalCents != null ? state.totalCents : sumDiffs(state.rounds || [])
    ),
  });
  delete stats.inProgress[key];

  if (!already) {
    const totalCents = stats.history[key].totalCents;
    stats.numGames += 1;
    stats.sumTotalCents += totalCents;
    stats.buckets[bucketForTotal(totalCents)] += 1;

    if (stats.bestCents == null || totalCents < stats.bestCents) {
      stats.bestCents = totalCents;
    }

    const countsForStreak =
      todayGameNumber == null || state.gameNumber === todayGameNumber;
    if (countsForStreak) {
      const prev = stats.lastCompletedGame;
      if (prev != null && state.gameNumber === prev + 1) {
        stats.currentStreak += 1;
      } else {
        stats.currentStreak = 1;
      }
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.lastCompletedGame = state.gameNumber;
    }
  }

  const saved = stats.history[key];
  if (saved) {
    state.totalCents = saved.totalCents;
    state.rating = saved.rating;
    if (saved.rounds?.length && (!state.rounds || state.rounds.length < saved.rounds.length)) {
      state.rounds = compactRounds(saved.rounds);
    }
  }

  saveStats(stats);
  return stats;
}

export function averageCents(stats) {
  if (!stats.numGames) return null;
  return Math.round(stats.sumTotalCents / stats.numGames);
}
