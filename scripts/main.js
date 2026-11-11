/*
  Classic Costcodle — embedded in the Checkout shell.
*/

const PLAY_URL = "https://www.costcodle.com";
const COSTCODLE_EPOCH_UTC = Date.UTC(2023, 8, 21);
const CLASSIC_LAUNCH_GAME = 1;

let productName;
let productPrice;
let productImage;

let shakeTimeout;
let toastTimeout;
let warningTimeout;

const todayGameNumber = getGameNumber();
let activeGameNumber = todayGameNumber;

let input = document.getElementById("guess-input");
let buttonInput = document.getElementById("guess-button");

function safeGetJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw);
  } catch (err) {
    console.warn(`[classic] corrupt ${key}`, err);
  }
  try {
    const bak = localStorage.getItem(`${key}:bak`);
    if (bak != null) {
      console.warn(`[classic] restored ${key} from backup`);
      try {
        localStorage.setItem(key, bak);
      } catch {
        /* ignore */
      }
      return JSON.parse(bak);
    }
  } catch (err) {
    console.warn(`[classic] corrupt backup ${key}`, err);
  }
  return typeof fallback === "function" ? fallback() : fallback;
}

function safeSetJson(key, value) {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (err) {
    console.error(`[classic] stringify failed ${key}`, err);
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
    console.error(`[classic] write failed ${key}`, err);
    try {
      localStorage.setItem(key, raw);
      return true;
    } catch (err2) {
      console.error(`[classic] write failed hard ${key}`, err2);
      return false;
    }
  }
}

const userStats = migrateStats(safeGetJson("stats", defaultStats) || defaultStats());

let gameState = safeGetJson("state", () => ({
  gameNumber: -1,
  guesses: [],
  hasWon: false,
}));

ensureTodaySession();
playGame();

window.CostcodleClassic = {
  refreshStats,
  renderArchive,
  loadGame,
  getActiveGameNumber: () => activeGameNumber,
  isIncomplete: () => !isFinished(gameState) && gameState.guesses.length > 0,
};

function defaultStats() {
  return {
    numGames: 0,
    numWins: 0,
    winsInNum: [0, 0, 0, 0, 0, 0],
    currentStreak: 0,
    maxStreak: 0,
    history: {},
    inProgress: {},
    opened: {},
  };
}

function migrateStats(stats) {
  if (!stats || typeof stats !== "object") return defaultStats();
  if (!stats.history) stats.history = {};
  if (!stats.inProgress) stats.inProgress = {};
  if (!stats.opened) stats.opened = {};
  if (!Array.isArray(stats.winsInNum)) stats.winsInNum = [0, 0, 0, 0, 0, 0];
  // Backfill opened from known history so archive revisits don't re-count.
  for (const [key, entry] of Object.entries(stats.history)) {
    stats.opened[key] = 1;
    if (entry && typeof entry === "object" && !Array.isArray(entry.guesses)) {
      entry.guesses = entry.guesses || [];
    }
  }
  // Pre-archive Costcodle only stored aggregate counters (played/wins/streaks),
  // not per-day history. Mark that so archive backfills write history without
  // double-counting those aggregates.
  if (!stats.statsScheme) {
    const histCount = Object.keys(stats.history).length;
    stats.statsScheme =
      histCount === 0 && (stats.numGames > 0 || stats.numWins > 0)
        ? "legacy-aggregates"
        : "per-day";
  }
  return stats;
}

/** Today always counts. Archive backfills count only for per-day stats schemes. */
function countsTowardAggregates(gameNumber) {
  if (gameNumber === todayGameNumber) return true;
  return userStats.statsScheme !== "legacy-aggregates";
}

function markOpened(gameNumber) {
  const key = String(gameNumber);
  if (userStats.opened[key] || userStats.history[key]) {
    userStats.opened[key] = 1;
    return;
  }
  userStats.opened[key] = 1;
  if (countsTowardAggregates(gameNumber)) {
    userStats.numGames++;
  }
}

function isFinished(state) {
  return Boolean(state?.hasWon) || (state?.guesses?.length || 0) >= 6;
}

function saveAll() {
  safeSetJson("stats", userStats);
  safeSetJson("state", gameState);
}

function historyScore(state) {
  return state.hasWon ? `${state.guesses.length}/6` : "X/6";
}

/**
 * Persist a finished Classic day with full guess detail.
 * Never overwrite a richer history entry with a slim/empty one.
 */
function recordHistory(state) {
  if (!isFinished(state)) return;
  const key = String(state.gameNumber);
  const existing = userStats.history[key];
  const incoming = Array.isArray(state.guesses) ? state.guesses : [];
  const prior = Array.isArray(existing?.guesses) ? existing.guesses : [];
  const guesses = incoming.length >= prior.length ? incoming : prior;
  const hasWon = Boolean(state.hasWon ?? existing?.hasWon);

  userStats.opened[key] = 1;
  userStats.history[key] = {
    gameNumber: state.gameNumber,
    hasWon,
    score: historyScore({ hasWon, guesses }),
    guessCount: guesses.length,
    guesses,
    completedAt: existing?.completedAt || new Date().toISOString(),
    productName: productName || existing?.productName || null,
    productPrice:
      productPrice != null ? productPrice : existing?.productPrice ?? null,
    productImage: productImage || existing?.productImage || null,
  };
  delete userStats.inProgress[key];
}

function parkActiveState() {
  if (!gameState || gameState.gameNumber < 1) return;
  const key = String(gameState.gameNumber);
  if (isFinished(gameState)) {
    recordHistory(gameState);
  } else if (gameState.guesses.length > 0) {
    userStats.inProgress[key] = {
      guesses: gameState.guesses,
      hasWon: false,
    };
  } else {
    delete userStats.inProgress[key];
  }
  saveAll();
}

/** Calendar rollover: park yesterday, start today if needed. */
function ensureTodaySession() {
  if (gameState.gameNumber === todayGameNumber) {
    if (isFinished(gameState)) recordHistory(gameState);
    // Legacy sessions: remember today was opened without bumping numGames again.
    userStats.opened[String(todayGameNumber)] = 1;
    activeGameNumber = todayGameNumber;
    saveAll();
    return;
  }

  if (gameState.gameNumber > 0) {
    if (isFinished(gameState)) {
      recordHistory(gameState);
    } else {
      if (gameState.guesses.length > 0) {
        userStats.inProgress[String(gameState.gameNumber)] = {
          guesses: gameState.guesses,
          hasWon: false,
        };
      }
      userStats.currentStreak = 0;
    }
  }

  const todayKey = String(todayGameNumber);
  if (userStats.history[todayKey]) {
    const entry = userStats.history[todayKey];
    gameState = {
      gameNumber: todayGameNumber,
      guesses: entry.guesses || [],
      hasWon: entry.hasWon,
      fromArchiveComplete: !(entry.guesses && entry.guesses.length),
      archiveScore: entry.score,
    };
  } else if (userStats.inProgress[todayKey]) {
    const parked = userStats.inProgress[todayKey];
    gameState = {
      gameNumber: todayGameNumber,
      guesses: parked.guesses || [],
      hasWon: false,
    };
    markOpened(todayGameNumber);
  } else {
    gameState = {
      gameNumber: todayGameNumber,
      guesses: [],
      hasWon: false,
    };
    markOpened(todayGameNumber);
  }

  activeGameNumber = todayGameNumber;
  saveAll();
}

function playGame() {
  fetchGameData(activeGameNumber);
}

function applyProductSnapshot(entry) {
  if (!entry) return false;
  if (entry.productName) productName = entry.productName;
  if (entry.productPrice != null) productPrice = Number(entry.productPrice);
  if (entry.productImage) productImage = entry.productImage;
  return Boolean(entry.productName && entry.productPrice != null);
}

function classicProductId(gameNumber) {
  return (
    window.CostcodleDaily?.classicProductId?.(gameNumber) ?? gameNumber
  );
}

function fetchGameData(gameNumber) {
  const hist = userStats.history[String(gameNumber)];
  // Catalog key may differ from display/archive game number after Checkout launch.
  const skuId = classicProductId(gameNumber);
  fetch("./games.json")
    .then((response) => response.json())
    .then((json) => {
      const entry = json[`game-${skuId}`];
      if (!entry) {
        if (applyProductSnapshot(hist)) {
          initializeGame();
          return;
        }
        console.error(
          `Missing classic catalog game-${skuId} (display #${gameNumber})`
        );
        return;
      }
      productName = entry.name;
      productPrice = Number(String(entry.price).replace(/^\$/, ""));
      productImage = entry.image;
      initializeGame();
    })
    .catch((err) => {
      console.error("[classic] games.json fetch failed", err);
      if (applyProductSnapshot(hist)) initializeGame();
    });
}

function stateFromStorage(gameNumber) {
  const key = String(gameNumber);

  if (userStats.history[key]) {
    const entry = userStats.history[key];
    const guesses = Array.isArray(entry.guesses) ? entry.guesses : [];
    return {
      gameNumber,
      guesses,
      hasWon: entry.hasWon,
      fromArchiveComplete: guesses.length === 0,
      archiveScore: entry.score,
    };
  }

  if (userStats.inProgress[key]) {
    return {
      gameNumber,
      guesses: userStats.inProgress[key].guesses || [],
      hasWon: false,
    };
  }

  return {
    gameNumber,
    guesses: [],
    hasWon: false,
  };
}

function loadGame(gameNumber) {
  if (!Number.isFinite(gameNumber) || gameNumber < CLASSIC_LAUNCH_GAME) return;
  if (gameNumber > todayGameNumber) return;
  if (gameNumber === activeGameNumber) return;

  parkActiveState();

  const key = String(gameNumber);
  if (userStats.history[key] || userStats.inProgress[key]) {
    gameState = stateFromStorage(gameNumber);
  } else {
    gameState = { gameNumber, guesses: [], hasWon: false };
    markOpened(gameNumber);
  }

  activeGameNumber = gameNumber;
  saveAll();
  clearBoardDom();
  fetchGameData(gameNumber);
}

function initializeGame() {
  if (isFinished(gameState)) recordHistory(gameState);

  displayProductCard();
  updateGameBoard();

  if (!isFinished(gameState)) {
    restoreInputRow();
    addEventListeners();
  } else {
    convertToShareButton();
  }

  saveAll();
}

function clearBoardDom() {
  const imageContainer = document.getElementById("image-container");
  if (imageContainer) imageContainer.innerHTML = "";

  for (let i = 1; i <= 6; i++) {
    const guessContainer = document.getElementById(String(i));
    if (!guessContainer) continue;
    guessContainer.innerHTML = "";
    guessContainer.className = "guess-container";
  }

  const infoCard = document.getElementById("info-card");
  infoCard?.classList.remove("animate__headShake");
}

function restoreInputRow() {
  const containerElem = document.getElementById("input-container");
  if (!containerElem) return;
  containerElem.className = "guess-container transparent-background";
  containerElem.innerHTML = `
    <div id="text-input-container">
      <div id="input-label">$</div>
      <input
        id="guess-input"
        type="text"
        pattern="^\\$\\d{1,3}(,\\d{3})*(\\.\\d+)?$"
        data-type="currency"
        placeholder="Enter a guess..."
      />
    </div>
    <div id="button-container">
      <button id="guess-button" class="active">SUBMIT</button>
    </div>
  `;
  input = document.getElementById("guess-input");
  buttonInput = document.getElementById("guess-button");
}

function convertToShareButton() {
  const containerElem = document.getElementById("input-container");
  if (!containerElem) return;
  const shareButtonElem = document.createElement("button");
  shareButtonElem.setAttribute("id", "share-button");
  containerElem.innerHTML = "";
  shareButtonElem.innerHTML = `Share
  <img src="./assets/share-icon.svg" class="share-icon" />`;
  shareButtonElem.addEventListener("click", copyStats);
  containerElem.appendChild(shareButtonElem);
}

function displayProductCard() {
  const imageContainer = document.getElementById("image-container");
  if (!imageContainer) return;
  imageContainer.innerHTML = "";

  const productImageElement = document.createElement("img");
  productImageElement.src = productImage;
  productImageElement.setAttribute("id", "product-image");
  imageContainer.appendChild(productImageElement);

  const productInfo = document.getElementById("product-info");
  if (productInfo) productInfo.innerHTML = `<center>${productName}</center>`;
}

function updateGameBoard() {
  updateGuessStat();
  gameState.guesses.forEach((guess, index) => displayGuess(guess, index + 1, false));
}

function updateGuessStat() {
  const guessStats = document.getElementById("game-stats");
  if (!guessStats) return;

  if (gameState.hasWon) {
    guessStats.innerHTML = `<center>You win! Congratulations!🎉</center>`;
    guessStats.innerHTML += `<center>The price was $${productPrice}</center>`;
    return;
  }

  if (gameState.guesses.length >= 6 || gameState.fromArchiveComplete) {
    guessStats.innerHTML = `<center>Better luck next time!</center>`;
    guessStats.innerHTML += `<center>The price was $${productPrice}</center>`;
    return;
  }

  guessStats.innerHTML = `Guess: ${gameState.guesses.length + 1}/6`;
}

function inputEventListener(event) {
  if (event.key === "Enter") handleInput();
}

function buttonEventListener() {
  handleInput();
}

function handleInput() {
  if (!input) return;
  const strippedString = input.value.replaceAll(",", "");
  const guess = Number(strippedString).toFixed(2);

  if (isNaN(guess) || !strippedString) {
    displayWarning();
    return;
  }

  checkGuess(guess);
  input.value = "";
}

function displayWarning() {
  clearTimeout(warningTimeout);
  const wrap = document.getElementById("warning-toast-anchor");
  const el = document.getElementById("warning-toast");
  const anchor = document.getElementById("product-info");
  if (!wrap || !el) return;

  if (anchor) {
    const r = anchor.getBoundingClientRect();
    wrap.style.left = `${r.left + r.width / 2}px`;
    wrap.style.top = `${r.top + r.height / 2}px`;
    wrap.style.transform = "translate(-50%, -50%)";
  } else {
    wrap.style.left = "50%";
    wrap.style.top = "42%";
    wrap.style.transform = "translate(-50%, -50%)";
  }

  wrap.classList.remove("hide");
  el.classList.remove("hide", "animate__flipOutX");
  el.classList.add("animate__flipInX");

  warningTimeout = setTimeout(() => {
    el.classList.remove("animate__flipInX");
    el.classList.add("animate__flipOutX");
    setTimeout(() => {
      el.classList.remove("animate__flipOutX");
      wrap.classList.add("hide");
      wrap.style.left = "";
      wrap.style.top = "";
      wrap.style.transform = "";
    }, 1000);
  }, 2000);
}

function buildShareOutput() {
  const score = gameState.hasWon
    ? `${gameState.guesses.length}/6`
    : gameState.archiveScore || "X/6";

  let output = `Costcodle Classic #${activeGameNumber} ${score}\n`;

  if (gameState.guesses.length) {
    gameState.guesses.forEach((guess) => {
      switch (guess.direction) {
        case "&uarr;":
          output += `⬆️`;
          break;
        case "&darr;":
          output += `⬇️`;
          break;
        case "&check;":
          output += `✅`;
          break;
      }

      switch (guess.closeness) {
        case "guess-far":
          output += `🟥`;
          break;
        case "guess-near":
          output += `🟨`;
          break;
      }
      output += `\n`;
    });
  }

  output += `\nPlay now at ${PLAY_URL}`;
  return output;
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

async function copyStats() {
  const output = buildShareOutput();

  if (isMobile() && navigator.share) {
    try {
      await navigator.share({ title: "COSTCODLE", text: output });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(output);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = output;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }

  displayShareToast();
}

function displayShareToast() {
  clearTimeout(toastTimeout);
  const wrap = document.getElementById("checkout-share-toast-anchor");
  const el = document.getElementById("checkout-share-toast");
  const anchor = document.getElementById("share-button");
  if (!wrap || !el) return;

  if (anchor) {
    const r = anchor.getBoundingClientRect();
    wrap.style.left = `${r.left + r.width / 2}px`;
    wrap.style.top = `${r.top - 8}px`;
  } else {
    wrap.style.left = "50%";
    wrap.style.top = "50%";
  }

  wrap.classList.remove("hide");
  el.classList.remove("animate__flipOutX");
  el.classList.add("animate__flipInX");

  toastTimeout = setTimeout(() => {
    el.classList.remove("animate__flipInX");
    el.classList.add("animate__flipOutX");
    setTimeout(() => {
      el.classList.remove("animate__flipOutX");
      wrap.classList.add("hide");
    }, 1000);
  }, 3000);
}

function addEventListeners() {
  if (!input || !buttonInput) return;
  input.addEventListener("keydown", inputEventListener);
  buttonInput.addEventListener("click", buttonEventListener);
  buttonInput.removeAttribute("disabled");
  buttonInput.classList.add("active");
  input.removeAttribute("disabled");
  input.setAttribute("placeholder", "Enter a guess...");

  input.addEventListener("focus", () => {
    input.setAttribute("placeholder", "0.00");
  });
  input.addEventListener("blur", () => {
    input.setAttribute("placeholder", "Enter a guess...");
  });
}

function removeEventListeners() {
  if (buttonInput) {
    buttonInput.setAttribute("disabled", "");
    buttonInput.classList.remove("active");
    buttonInput.removeEventListener("click", buttonEventListener);
  }
  if (input) {
    input.setAttribute("disabled", "");
    input.setAttribute("placeholder", "Game Over!");
    input.removeEventListener("keydown", inputEventListener);
  }
}

function checkGuess(guess) {
  const guessObj = { guess, closeness: "", direction: "" };
  const percentAway = calculatePercent(guess);

  if (Math.abs(percentAway) <= 5) {
    guessObj.closeness = "guess-win";
    gameState.hasWon = true;
  } else {
    shakeBox();
    if (Math.abs(percentAway) <= 25) {
      guessObj.closeness = "guess-near";
    } else {
      guessObj.closeness = "guess-far";
    }
  }

  if (gameState.hasWon) {
    guessObj.direction = "&check;";
  } else if (percentAway < 0) {
    guessObj.direction = "&uarr;";
  } else {
    guessObj.direction = "&darr;";
  }

  gameState.guesses.push(guessObj);
  safeSetJson("state", gameState);
  displayGuess(guessObj);

  if (gameState.hasWon) {
    gameWon();
  } else if (gameState.guesses.length === 6) {
    gameLost();
  }
}

function displayGuess(guess, index = gameState.guesses.length, animate = true) {
  const guessContainer = document.getElementById(index);
  if (!guessContainer) return;

  const guessValueContainer = document.createElement("div");
  const infoContainer = document.createElement("div");

  guessValueContainer.classList.add("guess-value-container");
  infoContainer.classList.add("guess-direction-container");
  if (animate) {
    guessValueContainer.classList.add("animate__flipInX");
    infoContainer.classList.add("animate__flipInX");
  }

  guessValueContainer.innerHTML = `$${guess.guess}`;
  infoContainer.classList.add(guess.closeness);
  infoContainer.innerHTML = guess.direction;

  if (animate) {
    guessContainer.classList.add("animate__flipOutX");
    setTimeout(() => {
      guessContainer.classList.add("transparent-background");
      guessContainer.appendChild(guessValueContainer);
      guessContainer.appendChild(infoContainer);
    }, 500);
  } else {
    guessContainer.classList.add("transparent-background");
    guessContainer.appendChild(guessValueContainer);
    guessContainer.appendChild(infoContainer);
  }

  updateGuessStat();
}

function calculatePercent(guess) {
  return ((guess * 100) / (productPrice * 100)) * 100 - 100;
}

function gameWon() {
  // Always persist the day in history (archive UI). Only bump headline stats
  // when this completion should count — protects legacy aggregate-only users.
  if (countsTowardAggregates(gameState.gameNumber)) {
    userStats.numWins++;
    userStats.currentStreak++;
    userStats.winsInNum[gameState.guesses.length - 1]++;
    if (userStats.currentStreak > userStats.maxStreak) {
      userStats.maxStreak = userStats.currentStreak;
    }
  }
  gameState.hasWon = true;
  gameState.fromArchiveComplete = false;
  recordHistory(gameState);
  saveAll();
  removeEventListeners();
  convertToShareButton();
}

function gameLost() {
  if (countsTowardAggregates(gameState.gameNumber)) {
    userStats.currentStreak = 0;
  }
  gameState.fromArchiveComplete = false;
  recordHistory(gameState);
  saveAll();
  removeEventListeners();
  convertToShareButton();
}

function refreshStats() {
  const numWinsElem = document.getElementById("number-wins");
  if (numWinsElem) numWinsElem.innerHTML = `${userStats.numGames}`;

  const winPercentElem = document.getElementById("win-percent");
  if (winPercentElem) {
    winPercentElem.innerHTML =
      userStats.numGames === 0
        ? `0`
        : `${Math.round((userStats.numWins / userStats.numGames) * 100)}`;
  }

  const currentStreakElem = document.getElementById("current-streak");
  if (currentStreakElem) currentStreakElem.innerHTML = `${userStats.currentStreak}`;

  const maxStreakElem = document.getElementById("max-streak");
  if (maxStreakElem) maxStreakElem.innerHTML = `${userStats.maxStreak}`;

  userStats.winsInNum.forEach((value, index) => {
    const graphElem = document.getElementById(`graph-${index + 1}`);
    if (!graphElem) return;
    if (userStats.numWins === 0) {
      graphElem.style = `width: 5%`;
    } else {
      graphElem.style = `width: ${
        Math.floor((value / userStats.numWins) * 0.95 * 100) + 5
      }%`;
    }
    graphElem.innerHTML = `${value}`;
  });
}

function dateForGameNumber(gameNumber) {
  const utc = COSTCODLE_EPOCH_UTC + (gameNumber - 2) * 86400000;
  const d = new Date(utc);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function formatArchiveDay(date) {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${days[date.getDay()]} ${mm}/${dd}`;
}

function renderArchive(archYear = "all") {
  const MONTH_NAMES = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const history = userStats.history || {};
  const inProgress = userStats.inProgress || {};
  const rows = [];

  for (let n = todayGameNumber; n >= CLASSIC_LAUNCH_GAME; n--) {
    const d = dateForGameNumber(n);
    const entry = history[String(n)];
    const parked = inProgress[String(n)];
    const liveIncomplete =
      n === activeGameNumber && !isFinished(gameState) && gameState.guesses.length > 0 && !entry;
    rows.push({
      n,
      date: d,
      year: d.getFullYear(),
      monthKey: `${d.getFullYear()}-${d.getMonth()}`,
      monthLabel: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      dayLabel: formatArchiveDay(d),
      played: Boolean(entry),
      inProgress: liveIncomplete || (Boolean(parked) && !entry),
      score: entry ? entry.score : null,
      active: n === activeGameNumber,
    });
  }

  const years = [...new Set(rows.map((r) => String(r.year)))];
  let year = archYear;
  if (year !== "all" && !years.includes(year)) year = "all";

  const filtered = year === "all" ? rows : rows.filter((r) => String(r.year) === year);
  const played = filtered.filter((r) => r.played);
  const missed = filtered.length - played.length;

  const summary = document.getElementById("classic-arch-summary");
  if (summary) {
    summary.textContent = `${played.length} PLAYED · ${missed} MISSED · ${filtered.length} DAYS`;
  }

  const chips = document.getElementById("classic-arch-chips");
  if (chips) {
    chips.innerHTML = ["all", ...years]
      .map((y) => {
        const label = y === "all" ? "ALL" : y;
        const pressed = year === y ? "true" : "false";
        return `<button class="arch-chip" type="button" data-classic-arch-year="${y}" aria-pressed="${pressed}">${label}</button>`;
      })
      .join("");
  }

  const scroll = document.getElementById("classic-arch-scroll");
  if (scroll) {
    if (!filtered.length) {
      scroll.innerHTML = `<div class="arch-empty">NO GAMES IN THIS YEAR</div>`;
    } else {
      const activeMonthKey =
        filtered.find((r) => r.active)?.monthKey || filtered[0].monthKey;
      let html = "";
      let lastMonth = "";
      for (const row of filtered) {
        if (row.monthKey !== lastMonth) {
          if (lastMonth) html += `</div></details>`;
          const open =
            row.monthKey === filtered[0].monthKey ||
            row.monthKey === activeMonthKey;
          html += `<details class="arch-month-group"${open ? " open" : ""}><summary class="arch-month">${row.monthLabel}</summary><div class="arch-month-body">`;
          lastMonth = row.monthKey;
        }
        let score;
        let rowClass = "arch-row";
        if (row.played) {
          score = `<span class="score">${row.score}</span>`;
          rowClass += " arch-open";
        } else if (row.inProgress) {
          score = `<span class="score open">RESUME &gt;</span>`;
          rowClass += " arch-playable";
        } else {
          score = `<span class="score open">PLAY &gt;</span>`;
          rowClass += " arch-playable";
        }
        html += `<div class="${rowClass}" data-classic-arch-game="${row.n}" role="button" tabindex="0"><span class="num">#${row.n}</span><span class="date">${row.dayLabel}</span><span class="dots"></span>${score}</div>`;
      }
      if (lastMonth) html += `</div></details>`;
      scroll.innerHTML = html;
    }
  }

  const foot = document.getElementById("classic-arch-foot");
  if (foot) {
    foot.textContent = filtered.length
      ? `SHOWING ${filtered.length} DAYS · SCROLL FOR OLDER GAMES`
      : "TRY ANOTHER YEAR";
  }

  return year;
}

function shakeBox() {
  clearTimeout(shakeTimeout);
  const infoCard = document.getElementById("info-card");
  if (!infoCard) return;
  infoCard.classList.remove("animate__headShake");
  shakeTimeout = setTimeout(() => infoCard.classList.add("animate__headShake"), 100);
}

function getGameNumber(date = new Date()) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today - COSTCODLE_EPOCH_UTC) / 86400000) + 2;
}
