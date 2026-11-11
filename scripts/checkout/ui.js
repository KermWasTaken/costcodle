import {
  money,
  lcdMoney,
  escapeHtml,
  sumDiffs,
} from "./money.js";
import {
  formatLongDate,
  formatArchiveDay,
  formatCountdown,
  msUntilMidnight,
  dateForGameNumber,
  checkoutGameNumber,
  CHECKOUT_LAUNCH_GAME,
  MONTH_NAMES,
} from "./daily.js";
import {
  ratingForTotal,
  hotDogComboText,
  BUCKET_LABELS,
} from "./ratings.js";
import { averageCents } from "./storage.js";
import { muteIconSvg, PRINTER_BACK, PRINTER_FRONT, rectsSvg } from "./printer-art.js";
import { renderReceipt, waitForPrintAnimation } from "./receipt.js";
import {
  buildShareText,
  buildArchiveShareText,
  shareResults,
} from "./share.js";
import { playPrintSound, playTearSound } from "./sound.js";

const TITLES = {
  game: ["COSTCO", "DLE"],
  about: ["HOW TO ", "PLAY"],
  stats: ["GAME ", "STATS"],
  archive: ["PAST ", "GAMES"],
};

const lastHeightRef = { current: null };
let toastTimeout = null;
let warningTimeout = null;
let countdownTimer = null;

export function $(sel) {
  return document.querySelector(sel);
}

export function initPrinterArt() {
  const back = $("#printer-back");
  const front = $("#printer-front");
  if (back) back.innerHTML = rectsSvg(PRINTER_BACK, "0 0 48 24");
  if (front) front.innerHTML = rectsSvg(PRINTER_FRONT, "0 0 48 24");
}

export function bindImageFallback(img) {
  if (!img) return;
  const box = img.parentElement;
  const markMissing = () => box.classList.add("img-missing");
  const clearMissing = () => box.classList.remove("img-missing");
  img.addEventListener("error", markMissing);
  img.addEventListener("load", clearMissing);
  if (img.complete && img.getAttribute("src") && img.naturalWidth === 0) markMissing();
}

export function setChrome({ mode = "checkout", view, muted }) {
  const [first, second] = TITLES[view] || TITLES.game;
  const title = $("#title");
  if (title) {
    title.innerHTML = `${first}<span class="costco-blue">${second}</span>`;
    title.classList.toggle("small", view !== "game");
    title.classList.remove("info-title");
  }

  document
    .querySelectorAll("[data-mode-btn]")
    .forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.modeBtn === mode))
    );

  document.querySelectorAll("[data-view-btn]").forEach((b) => {
    b.hidden = false;
    b.setAttribute("aria-pressed", String(b.dataset.viewBtn === view));
  });

  document.querySelectorAll(".view").forEach((v) => {
    const match = v.dataset.mode === mode && v.dataset.view === view;
    v.hidden = !match;
  });

  const mute = $("#mute-btn");
  if (mute) {
    mute.hidden = mode === "classic";
    mute.innerHTML = muteIconSvg(muted);
    mute.setAttribute("aria-pressed", String(muted));
    mute.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }
}


export function showWarningToast(
  anchor = document.getElementById("r-name") || document.getElementById("product-info")
) {
  clearTimeout(warningTimeout);
  const wrap = $("#warning-toast-anchor");
  const el = $("#warning-toast");
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

export function showShareToast(anchor = document.querySelector("[data-share]")) {
  clearTimeout(toastTimeout);
  const wrap = $("#checkout-share-toast-anchor");
  const el = $("#checkout-share-toast");
  if (!wrap || !el) return;

  // Anchor on the title; Animate.css may overwrite the toast transform.
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    wrap.style.left = `${r.left + r.width / 2}px`;
    wrap.style.top = `${r.top - 10}px`;
  } else {
    wrap.style.left = "50%";
    wrap.style.top = "42%";
  }

  wrap.classList.remove("hide");
  el.classList.remove("hide", "animate__flipOutX");
  el.classList.add("animate__flipInX");
  toastTimeout = setTimeout(() => {
    el.classList.remove("animate__flipInX");
    el.classList.add("animate__flipOutX");
    setTimeout(() => {
      el.classList.remove("animate__flipOutX");
      wrap.classList.add("hide");
      wrap.style.left = "";
      wrap.style.top = "";
    }, 1000);
  }, 2200);
}

let lastPrintDurationMs = 1800;
let lastPrintLaunch = 0;
let lastPrintDone = null;
let activePrintCtrl = null;
let activeTearCtrl = null;

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function animatePrint({ muted = false } = {}) {
  const printer = $("#printer");
  printer?.classList.add("is-printing");
  const durationMs = lastPrintDurationMs || 1800;
  const launch = lastPrintLaunch || 0;
  const ctrl = playPrintSound({ durationMs, muted, launch });
  activePrintCtrl = ctrl;
  try {
    await waitForPrintAnimation(
      document.getElementById("paper"),
      durationMs,
      lastPrintDone
    );
  } finally {
    ctrl.stop();
    activePrintCtrl = null;
    printer?.classList.remove("is-printing");
    lastPrintDone = null;
  }
}

export function setPrintMuted(muted) {
  activePrintCtrl?.setMuted?.(muted);
  activeTearCtrl?.setMuted?.(muted);
}

export async function animateReceiptTearIn({
  muted = false,
  state,
  stats,
  date,
} = {}) {
  const paper = $("#paper");
  const modal = $("#end-modal");
  const card = modal?.querySelector(".paper-card.final");
  const printer = $("#printer");

  if (!paper || !modal || !card || !state) {
    renderEndModal({ state, stats, date, open: true });
    return;
  }

  fillFinalSheet(state, stats, date);
  modal.hidden = false;
  modal.classList.add("is-tearing");
  const target = card.getBoundingClientRect();
  const src = paper.getBoundingClientRect();
  if (src.width < 4 || src.height < 4 || target.width < 4) {
    modal.classList.remove("is-tearing");
    renderEndModal({ state, stats, date, open: true });
    return;
  }

  const roll = paper.querySelector(".r-roll");
  const flyer = document.createElement("div");
  flyer.className = "receipt-flyer";
  flyer.setAttribute("aria-hidden", "true");
  flyer.style.left = `${src.left}px`;
  flyer.style.top = `${src.top}px`;
  flyer.style.width = `${src.width}px`;
  flyer.style.height = `${src.height}px`;

  const tapeLayer = document.createElement("div");
  tapeLayer.className = "flyer-tape";
  if (roll) {
    const clone = roll.cloneNode(true);
    clone.style.transform = roll.style.transform || "";
    tapeLayer.appendChild(clone);
  } else {
    tapeLayer.style.background = "var(--paper)";
  }
  flyer.appendChild(tapeLayer);

  const modalLayer = card.cloneNode(true);
  modalLayer.classList.add("flyer-modal");
  modalLayer.querySelectorAll("button").forEach((b) => {
    b.disabled = true;
    b.tabIndex = -1;
  });
  flyer.appendChild(modalLayer);

  document.body.appendChild(flyer);
  paper.classList.add("is-torn");
  printer?.classList.add("is-tearing");

  const tearCtrl = playTearSound({ muted, durationMs: 520 });
  activeTearCtrl = tearCtrl;

  flyer.classList.add("is-ripping");
  await waitMs(300);

  const afterRip = flyer.getBoundingClientRect();
  flyer.classList.remove("is-ripping");
  flyer.style.transition = "none";
  flyer.style.transform = "none";
  flyer.style.left = `${afterRip.left}px`;
  flyer.style.top = `${afterRip.top}px`;
  flyer.style.width = `${afterRip.width}px`;
  flyer.style.height = `${afterRip.height}px`;
  flyer.offsetHeight;
  flyer.style.transition = "";
  flyer.classList.add("is-flying");
  modal.classList.add("is-flying");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  flyer.style.left = `${target.left}px`;
  flyer.style.top = `${target.top}px`;
  flyer.style.width = `${target.width}px`;
  flyer.style.height = `${target.height}px`;

  await waitMs(640);

  modal.classList.remove("is-tearing", "is-flying");
  renderEndModal({ state, stats, date, open: true });
  flyer.remove();
  printer?.classList.remove("is-tearing");
  tearCtrl.stop();
  activeTearCtrl = null;
}

export function renderGameBoard({
  products,
  state,
  date,
  uiPhase,
  animate = false,
  displayedTotalCents = null,
  viewRoundIndex = null,
}) {
  const done = state.rounds.length;
  const finished = state.phase === "complete" || done === 5;
  const browsing =
    viewRoundIndex != null &&
    viewRoundIndex >= 0 &&
    viewRoundIndex < done &&
    uiPhase !== "printing";

  let cardIndex;
  if (browsing) {
    cardIndex = viewRoundIndex;
  } else if (uiPhase === "guessing" && done < 5) {
    cardIndex = done;
  } else {
    cardIndex = Math.max(0, Math.min(done, 5) - 1);
  }

  const catalogProduct = products[cardIndex];
  const shownRound = browsing
    ? state.rounds[viewRoundIndex]
    : uiPhase !== "guessing" && done > 0
      ? state.rounds[done - 1]
      : null;

  const product = shownRound
    ? {
        name: shownRound.name || catalogProduct?.name,
        image: shownRound.image || catalogProduct?.image,
      }
    : catalogProduct;

  const showTag = browsing || uiPhase === "awaitingNext" || uiPhase === "complete";

  const liveRoundNo =
    uiPhase === "guessing" && !finished ? done + 1 : Math.min(Math.max(done, 1), 5);
  const roundNo = browsing ? viewRoundIndex + 1 : liveRoundNo;

  const img = $("#r-image");
  if (img && product) {
    if (img.src !== product.image) img.src = product.image;
    img.alt = product.name;
  }
  const nameEl = $("#r-name");
  if (nameEl && product) nameEl.textContent = product.name;

  const tag = $("#r-tag");
  if (tag) {
    tag.hidden = !showTag || !shownRound;
    if (showTag && shownRound) {
      tag.innerHTML = `<div class="small">YOU ${money(shownRound.guessCents, {
        short: true,
      })}</div><div class="big">${money(
        shownRound.actualCents
      )}</div><div class="small off">OFF ${money(shownRound.diffCents, {
        short: true,
      })}</div>`;
    }
  }

  const roundLabel = $("#round-label");
  if (roundLabel) {
    if (browsing) {
      roundLabel.textContent = `ROUND ${roundNo}/5`;
    } else {
      roundLabel.textContent = finished ? "ALL 5 DONE" : `ROUND ${roundNo}/5`;
    }
  }

  const pips = $("#pips");
  if (pips) {
    pips.innerHTML = [0, 1, 2, 3, 4]
      .map((i) => {
        let cls = "pip";
        if (i < done) cls += " done";
        else if (i === done && uiPhase === "guessing" && !browsing) cls += " current";
        if (browsing && i === viewRoundIndex) cls += " viewing";
        if (i < done && uiPhase !== "printing") {
          return `<button type="button" class="${cls}" data-view-round="${i}" aria-label="View round ${
            i + 1
          }" aria-pressed="${browsing && i === viewRoundIndex ? "true" : "false"}"></button>`;
        }
        return `<i class="${cls}" aria-hidden="true"></i>`;
      })
      .join("");
  }

  const inputRow = $("#input-row");
  if (inputRow) {
    if (finished && uiPhase !== "printing") {
      inputRow.innerHTML = `<button class="pill" type="button" data-open-final>VIEW RECEIPT</button>`;
    } else if (uiPhase === "printing") {
      inputRow.innerHTML = `<div class="text-input"><div class="input-label">$</div><input class="guess-input" type="text" inputmode="decimal" data-type="currency" aria-label="Your guess" placeholder="Printing..." disabled /></div><div class="button-wrap"><button class="guess-button" type="button" disabled>SUBMIT</button></div>`;
    } else if (uiPhase === "awaitingNext") {
      inputRow.innerHTML = `<button class="pill" type="button" data-next-round>NEXT ROUND</button>`;
    } else if (browsing) {
      inputRow.innerHTML = `<button class="pill" type="button" data-resume-round>RESUME ROUND ${
        done + 1
      }</button>`;
    } else {
      inputRow.innerHTML = `<div class="text-input"><div class="input-label">$</div><input class="guess-input" type="text" inputmode="decimal" data-type="currency" pattern="^\\$\\d{1,3}(,\\d{3})*(\\.\\d+)?$" aria-label="Your guess" placeholder="Enter a guess..." /></div><div class="button-wrap"><button class="guess-button" type="button">SUBMIT</button></div>`;
      const input = inputRow.querySelector(".guess-input");
      if (input) {
        input.addEventListener("focus", () => input.setAttribute("placeholder", "0.00"));
        input.addEventListener("blur", () =>
          input.setAttribute("placeholder", "Enter a guess...")
        );
      }
    }
  }

  const totalForLcd =
    displayedTotalCents != null
      ? displayedTotalCents
      : uiPhase === "printing"
        ? sumDiffs(state.rounds.slice(0, -1))
        : sumDiffs(state.rounds);

  const lcdRound = $("#lcd-round");
  const lcdTotal = $("#lcd-total");
  if (lcdRound) {
    if (browsing) {
      lcdRound.textContent = `RND ${roundNo}/5`;
    } else {
      lcdRound.textContent =
        finished && uiPhase !== "printing" ? "DONE 5/5" : `RND ${roundNo}/5`;
    }
  }
  if (lcdTotal) lcdTotal.textContent = lcdMoney(totalForLcd);


  const receiptFinished = finished && uiPhase !== "printing";
  const printed = renderReceipt(state.rounds, {
    gameNumber: checkoutGameNumber(state.gameNumber),
    date,
    finished: receiptFinished,
    animate: animate && !browsing,
    lastHeightRef,
  });
  if (animate && !browsing && printed) {
    if (printed.durationMs) lastPrintDurationMs = printed.durationMs;
    lastPrintLaunch = printed.launch || 0;
    lastPrintDone = printed.done || null;
  }
}

export function setModalOpen(open) {
  const modal = $("#end-modal");
  if (modal) modal.hidden = !open;
}

function fillFinalSheet(state, stats, date) {
  const sheet = $("#final-sheet");
  if (!sheet || !state) return;

  const hasRounds = state.rounds?.length === 5;
  const total = hasRounds
    ? sumDiffs(state.rounds)
    : state.totalCents != null
      ? state.totalCents
      : 0;
  const rating = state.rating || ratingForTotal(total);
  const totalText = money(total);

  const roundsBlock = hasRounds
    ? `<div class="f-grid f-head"><span>#</span><span>GUESS</span><span>PRICE</span><span>OFF</span></div>
    ${state.rounds
      .map(
        (r, i) => `
      <div class="f-item"><span>${i + 1}</span><span class="f-name">${escapeHtml(
          r.short || r.name
        )}</span></div>
      <div class="f-grid"><span></span><span>${money(r.guessCents, {
        sign: "",
        short: true,
      })}</span><span>${money(r.actualCents, {
        sign: "",
      })}</span><span>${money(r.diffCents, { sign: "", short: true })}</span></div>`
      )
      .join("")}`
    : `<div class="f-center f-faint">FINAL SCORE SAVED</div>`;

  sheet.innerHTML = `
    <button class="f-close" type="button" data-close-final aria-label="Close">&times;</button>
    <div class="f-logo">COSTCO<span>DLE</span></div>
    <div class="f-center" id="f-title">DAILY RECEIPT #${checkoutGameNumber(
      state.gameNumber
    )}</div>
    <div class="f-center f-faint">${formatLongDate(date)}</div>
    <div class="f-dash"></div>
    ${roundsBlock}
    <div class="f-dash double"></div>
    <div class="f-total"><span>TOTAL OFF</span><span class="f-amt ${
      totalText.length > 9 ? "long" : ""
    }">${totalText}</span></div>
    <div class="f-dash"></div>
    <div class="f-rating"><span class="f-faint">RATING</span><span>${rating}</span></div>
    <div class="f-center f-faint">${hotDogComboText(total)}</div>
    <div class="f-row"><span>STREAK ${stats.currentStreak}</span><span>BEST ${
      stats.bestCents == null ? "—" : money(stats.bestCents)
    }</span></div>
    <button class="pill f-share" type="button" data-share>SHARE RECEIPT <img src="./assets/share-icon.svg" alt="" /></button>
    <div class="f-center f-faint">THANK YOU FOR SHOPPING!<br />NEXT RECEIPT IN <span data-countdown>${formatCountdown(
      msUntilMidnight()
    )}</span></div>
    <div class="barcode" aria-hidden="true"></div>
    <div class="f-center f-faint">COSTCODLE.COM</div>`;

  startCountdownTicks();
}

export function renderEndModal({ state, stats, date, open }) {
  const modal = $("#end-modal");
  if (!modal) return;

  if (open && state) {
    fillFinalSheet(state, stats, date);
    modal.classList.remove("is-tearing", "is-flying", "is-announce");
    modal.hidden = false;

  } else if (!open) {

    modal.classList.remove("is-tearing", "is-flying", "is-announce");
    modal.hidden = true;

    $("#paper")?.classList.remove("is-torn");
  }
}

function fillAnnounceSheet() {
  const sheet = $("#final-sheet");
  if (!sheet) return;

  sheet.innerHTML = `
    <button class="f-close" type="button" data-close-announce aria-label="Close">&times;</button>
    <div class="f-logo">COSTCO<span>DLE</span></div>
    <div class="f-center" id="f-title">A NEW MODE JUST DROPPED!</div>
    <div class="f-dash"></div>
    <div class="f-announce">
      <div class="f-announce-block">
        <h3>Checkout</h3>
        <p>
          Costcodle now has a new game mode:
          <span class="costco-red">CHECKOUT</span>.
        </p>
        <p>
          Guess the prices of today's 5 Costco products. After each guess, the
          difference between your guess and the real price is printed on your
          receipt and added to your total. Your score is the total dollars you
          were off by — lower is better!
        </p>
      </div>
      <div class="f-announce-block">
        <h3>Classic</h3>
        <p>Don't worry, Classic mode is still available!</p>
      </div>
      <div class="f-announce-block">
        <h3>Archives</h3>
        <p>
          As an added bonus, we've introduced archives for both of our game
          modes!
        </p>
      </div>
    </div>
    <div class="f-dash"></div>
    <button class="pill f-share" type="button" data-dismiss-announce>LET'S PLAY</button>
    <div class="f-center f-faint">THANK YOU FOR SHOPPING!<br />COSTCODLE.COM</div>`;
}


export function renderAnnounceModal({ open }) {
  const modal = $("#end-modal");
  if (!modal) return;

  if (open) {
    fillAnnounceSheet();
    modal.classList.remove("is-tearing", "is-flying");
    modal.classList.add("is-announce");
    modal.hidden = false;
  } else {
    modal.classList.remove("is-tearing", "is-flying", "is-announce");
    modal.hidden = true;
  }
}

function startCountdownTicks() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    document.querySelectorAll("[data-countdown]").forEach((el) => {
      el.textContent = formatCountdown(msUntilMidnight());
    });
  }, 1000);
}

export function renderStats({ stats, state, date }) {
  const todayEl = $("#stats-today");
  let todayCents = null;
  if (state.phase === "complete") {
    todayCents =
      state.rounds?.length === 5
        ? sumDiffs(state.rounds)
        : state.totalCents != null
          ? state.totalCents
          : stats.history?.[String(state.gameNumber)]?.totalCents ?? null;
  }
  if (todayEl) {
    todayEl.textContent = todayCents == null ? "—" : money(todayCents);
  }

  const sheet = document.querySelector(
    '.view[data-view="stats"] .sheet'
  );
  if (!sheet) return;

  const avg = averageCents(stats);
  const maxBucket = Math.max(1, ...BUCKET_LABELS.map((b) => stats.buckets[b.key] || 0));

  sheet.innerHTML = `
    <div class="f-logo">COSTCO<span>DLE</span></div>
    <div class="f-center">MEMBER STATS</div>
    <div class="f-center f-faint">CHECKOUT MODE</div>
    <div class="f-dash"></div>
    <div class="s-grid">
      <div><b>${stats.numGames}</b><span>PLAYED</span></div>
      <div><b>${stats.currentStreak}</b><span>STREAK</span></div>
      <div><b>${stats.maxStreak}</b><span>MAX<br />STREAK</span></div>
      <div><b>${stats.bestCents == null ? "—" : money(stats.bestCents)}</b><span>BEST</span></div>
    </div>
    <div class="f-dash"></div>
    <div class="lead-row"><span>AVERAGE OFF</span><i></i><span>${
      avg == null ? "—" : money(avg)
    }</span></div>
    <div class="lead-row"><span>TODAY</span><i></i><span>${
      todayCents == null ? "—" : money(todayCents)
    }</span></div>
    <div class="f-dash"></div>
    <div class="f-center">DAILY TOTALS</div>
    ${BUCKET_LABELS.map((b) => {
      const n = stats.buckets[b.key] || 0;
      const pct = Math.max(8, Math.round((n / maxBucket) * 100));
      return `<div class="s-bar-row"><span>${b.label}</span><div class="s-bar" style="width: ${
        n ? pct : 0
      }%">${n || ""}</div></div>`;
    }).join("")}
    ${
      state.phase === "complete"
        ? `<button class="pill f-share" type="button" data-open-final>VIEW TODAY'S RECEIPT</button>`
        : ""
    }
  `;
}

export function renderArchive({
  stats,
  gameNumber,
  activeGameNumber,
  activeIncomplete = false,
  archYear,
}) {
  const history = stats.history || {};
  const inProgress = stats.inProgress || {};
  const rows = [];
  for (let n = gameNumber; n >= CHECKOUT_LAUNCH_GAME; n--) {
    const d = dateForGameNumber(n);
    const entry = history[String(n)];
    const parked = inProgress[String(n)];
    const liveIncomplete = n === activeGameNumber && activeIncomplete && !entry;
    rows.push({
      n,
      displayNum: checkoutGameNumber(n),
      date: d,
      year: d.getFullYear(),
      monthKey: `${d.getFullYear()}-${d.getMonth()}`,
      monthLabel: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      dayLabel: formatArchiveDay(d),
      played: Boolean(entry),
      inProgress: liveIncomplete || (Boolean(parked) && !entry),
      cents: entry ? entry.totalCents : null,
      active: n === activeGameNumber,
    });
  }

  const years = [...new Set(rows.map((r) => String(r.year)))];
  let year = archYear;
  if (year !== "all" && !years.includes(year)) year = "all";

  const filtered = year === "all" ? rows : rows.filter((r) => String(r.year) === year);
  const played = filtered.filter((r) => r.played);
  const missed = filtered.length - played.length;

  const summary = $("#arch-summary");
  if (summary) {
    summary.textContent = `${played.length} PLAYED · ${missed} MISSED · ${filtered.length} DAYS`;
  }

  const chips = $("#arch-chips");
  if (chips) {
    chips.innerHTML = ["all", ...years]
      .map((y) => {
        const label = y === "all" ? "ALL" : y;
        const pressed = year === y ? "true" : "false";
        return `<button class="arch-chip" type="button" data-arch-year="${y}" aria-pressed="${pressed}">${label}</button>`;
      })
      .join("");
  }

  const scroll = $("#arch-scroll");
  if (scroll) {
    if (!filtered.length) {
      scroll.innerHTML = `<div class="arch-empty">NO RECEIPTS IN THIS YEAR</div>`;
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
          score = `<span class="score">${money(row.cents)}</span>`;
          rowClass += " arch-open";
        } else if (row.inProgress) {
          score = `<span class="score open">RESUME &gt;</span>`;
          rowClass += " arch-playable";
        } else {
          score = `<span class="score open">PLAY &gt;</span>`;
          rowClass += " arch-playable";
        }
        html += `<div class="${rowClass}" data-arch-game="${row.n}" role="button" tabindex="0"><span class="num">#${row.displayNum}</span><span class="date">${row.dayLabel}</span><span class="dots"></span>${score}</div>`;
      }
      if (lastMonth) html += `</div></details>`;
      scroll.innerHTML = html;
    }
  }

  const foot = $("#arch-foot");
  if (foot) {
    foot.textContent = filtered.length
      ? `SHOWING ${filtered.length} DAYS · SCROLL FOR OLDER RECEIPTS`
      : "TRY ANOTHER YEAR";
  }

  return year;
}

export async function handleShare(state) {
  const displayNum = checkoutGameNumber(state.gameNumber);
  let text;
  if (state.rounds?.length === 5) {
    text = buildShareText(displayNum, state.rounds);
  } else if (state.totalCents != null && state.rating) {
    text = buildArchiveShareText(displayNum, {
      totalCents: state.totalCents,
      rating: state.rating,
    });
  } else {
    return;
  }
  const result = await shareResults(text);
  if (result === "copied") showShareToast(document.querySelector("[data-share]"));
}

export function resetPaperHeight() {
  lastHeightRef.current = null;
}
