import { parseCatalogPrice, parseGuessToCents, sumDiffs } from "./money.js";
import {
  getGameNumber,
  checkoutProductIds,
  dateForGameNumber,
} from "./daily.js";
import {
  PHASE,
  ensureTodayState,
  saveState,
  loadMuted,
  saveMuted,
  recordCompletedGame,
  loadStats,
  loadGameState,
  parkActiveState,
  historyEntry,
  hasSeenV2Announce,
  markV2AnnounceSeen,
} from "./storage.js";
import * as ui from "./ui.js";
import { preloadPrintSound } from "./sound.js";

export async function loadCatalog() {
  const res = await fetch("./games.json");
  if (!res.ok) throw new Error("Failed to load games.json");
  return res.json();
}

export function productsFromCatalog(catalog, productIds) {
  return productIds.map((id) => {
    const entry = catalog[`game-${id}`];
    if (!entry) {
      throw new Error(`Missing product game-${id} in games.json`);
    }
    return {
      id,
      name: entry.name,
      short: entry.short || entry.name,
      image: entry.image,
      priceCents: parseCatalogPrice(entry.price),
    };
  });
}

export function createCheckoutGame() {
  const todayGameNumber = getGameNumber();

  let catalog = null;
  let products = [];
  let state = null;
  let stats = null;
  let activeGameNumber = todayGameNumber;
  let activeDate = dateForGameNumber(activeGameNumber);
  let mode = new URLSearchParams(location.search).get("mode") === "classic"
    ? "classic"
    : "checkout";
  let view = "game";
  let muted = loadMuted();
  let archYear = "all";
  let classicArchYear = "all";
  let modalOpen = false;
  let announceOpen = !hasSeenV2Announce();
  let uiPhase = PHASE.GUESSING;
  let busy = false;
  let viewRoundIndex = null;

  function dismissAnnounce() {
    if (!announceOpen) return;
    announceOpen = false;
    markV2AnnounceSeen();
    render();
  }

  function syncUiPhaseFromState() {
    if (state.phase === PHASE.COMPLETE) uiPhase = "complete";
    else if (state.phase === PHASE.AWAITING_NEXT) uiPhase = "awaitingNext";
    else uiPhase = "guessing";
  }

  function clearRoundBrowse() {
    viewRoundIndex = null;
  }

  function setMode(nextMode) {
    mode = nextMode;
    view = "game";
    modalOpen = false;
    clearRoundBrowse();
    const url = new URL(location.href);
    if (mode === "classic") url.searchParams.set("mode", "classic");
    else url.searchParams.delete("mode");
    history.replaceState(null, "", url);
  }

  function activateGame(gameNumber, { openModalIfComplete = false } = {}) {
    stats = parkActiveState(state, loadStats());
    const ids = checkoutProductIds(gameNumber);
    products = productsFromCatalog(catalog, ids);
    state = loadGameState(gameNumber, ids, stats);
    activeGameNumber = gameNumber;
    activeDate = dateForGameNumber(gameNumber);
    clearRoundBrowse();
    saveState(state);
    syncUiPhaseFromState();
    ui.resetPaperHeight();

    if (state.phase === PHASE.COMPLETE) {
      stats = recordCompletedGame(state, stats, { todayGameNumber });
      modalOpen = openModalIfComplete;
    } else {
      modalOpen = false;
    }
  }

  function render({ animate = false, displayedTotalCents = null } = {}) {
    document.body.dataset.gameMode = mode;
    ui.setChrome({ mode, view, muted });

    if (mode === "checkout" && view === "game") {
      ui.renderGameBoard({
        products,
        state,
        date: activeDate,
        uiPhase,
        animate,
        displayedTotalCents,
        viewRoundIndex,
      });
    } else if (mode === "checkout") {
      ui.resetPaperHeight();
    }

    if (mode === "checkout" && view === "stats") {
      ui.renderStats({ stats, state, date: activeDate });
    }
    if (mode === "checkout" && view === "archive") {
      archYear = ui.renderArchive({
        stats,
        gameNumber: todayGameNumber,
        activeGameNumber,
        activeIncomplete: state.phase !== PHASE.COMPLETE,
        archYear,
      });
    }

    if (mode === "classic" && view === "stats") {
      window.CostcodleClassic?.refreshStats?.();
    }
    if (mode === "classic" && view === "archive") {
      classicArchYear =
        window.CostcodleClassic?.renderArchive?.(classicArchYear) ??
        classicArchYear;
    }

    if (announceOpen) {
      ui.renderAnnounceModal({ open: true });
      return;
    }

    const canShowModal =
      mode === "checkout" &&
      modalOpen &&
      state.phase === PHASE.COMPLETE &&
      (state.rounds?.length === 5 ||
        state.fromArchiveComplete ||
        state.totalCents != null);

    ui.renderEndModal({
      state,
      stats,
      date: activeDate,
      open: canShowModal,
    });
  }

  async function start() {
    document.body.dataset.gameMode = mode;
    ui.setChrome({ mode, view, muted });

    catalog = await loadCatalog();
    const todayIds = checkoutProductIds(todayGameNumber);
    ({ state, stats } = ensureTodayState(todayGameNumber, todayIds));
    products = productsFromCatalog(catalog, state.productIds || todayIds);
    activeGameNumber = state.gameNumber;
    activeDate = dateForGameNumber(activeGameNumber);

    if (state.phase === PHASE.COMPLETE) {
      stats = recordCompletedGame(state, stats, { todayGameNumber });
    }

    syncUiPhaseFromState();
    modalOpen = false;

    ui.initPrinterArt();
    ui.bindImageFallback(document.getElementById("r-image"));

    await document.fonts.ready;
    render();

    const playCol = document.getElementById("col-play");
    if (playCol) {
      new ResizeObserver(() => {
        if (
          mode === "checkout" &&
          view === "game" &&
          uiPhase !== "printing" &&
          !busy
        ) {
          render();
        }
      }).observe(playCol);
    }

    bindEvents();
  }

  function bindEvents() {
    const warmAudio = () => {
      preloadPrintSound();
      document.removeEventListener("pointerdown", warmAudio, true);
    };
    document.addEventListener("pointerdown", warmAudio, true);

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (announceOpen) {
          e.preventDefault();
          dismissAnnounce();
          return;
        }
        if (modalOpen) {
          e.preventDefault();
          modalOpen = false;
          render();
          return;
        }
        if (view === "about" || view === "archive" || view === "stats") {
          e.preventDefault();
          view = "game";
          clearRoundBrowse();
          render();
        }
        return;
      }

      if (e.key !== "Enter" || busy) return;

      const classicArchRow = e.target.closest?.("[data-classic-arch-game]");
      if (classicArchRow && mode === "classic" && view === "archive") {
        e.preventDefault();
        openClassicArchiveGame(Number(classicArchRow.dataset.classicArchGame));
        return;
      }
      const archRow = e.target.closest?.("[data-arch-game]");
      if (archRow && mode === "checkout" && view === "archive") {
        e.preventDefault();
        openArchiveGame(Number(archRow.dataset.archGame));
        return;
      }

      if (mode !== "checkout" || view !== "game") return;

      if (uiPhase === "awaitingNext" && state.phase === PHASE.AWAITING_NEXT) {
        e.preventDefault();
        advanceToNextRound();
        return;
      }

      if (uiPhase === "complete" && !modalOpen) {
        e.preventDefault();
        modalOpen = true;
        render();
        return;
      }

      if (uiPhase !== "guessing") return;
      const input = document.querySelector("#input-row .guess-input");
      if (!input || document.activeElement !== input) return;
      e.preventDefault();
      submitGuess();
    });
  }

  function openArchiveGame(gameNumber) {
    if (!Number.isFinite(gameNumber) || busy) return;
    const entry = historyEntry(loadStats(), gameNumber);
    activateGame(gameNumber, { openModalIfComplete: Boolean(entry) });
    view = "game";
    mode = "checkout";
    render();
  }

  function openClassicArchiveGame(gameNumber) {
    if (!Number.isFinite(gameNumber)) return;
    window.CostcodleClassic?.loadGame?.(gameNumber);
    view = "game";
    render();
  }

  function onClick(e) {
    const target = e.target.closest(
      "button, a.tab-link, #end-modal, .guess-button, [data-arch-game], [data-classic-arch-game], [data-view-round], [data-resume-round]"
    );
    if (!target) return;

    if (target.matches("[data-mode-btn]")) {
      setMode(target.dataset.modeBtn);
      render();
      return;
    }

    if (target.matches("[data-view-btn]")) {
      const next = target.dataset.viewBtn;
      view = view === next ? "game" : next;
      clearRoundBrowse();
      render();
      return;
    }

    if (target.matches("[data-view-round]")) {
      if (busy || uiPhase === "printing" || mode !== "checkout" || view !== "game") {
        return;
      }
      const i = Number(target.dataset.viewRound);
      if (!Number.isFinite(i) || i < 0 || i >= (state.rounds?.length || 0)) return;
      viewRoundIndex = viewRoundIndex === i ? null : i;
      render();
      return;
    }

    if (target.matches("[data-resume-round]")) {
      if (busy || uiPhase === "printing") return;
      clearRoundBrowse();
      render();
      document.querySelector("#input-row .guess-input")?.focus();
      return;
    }

    if (target.matches("#mute-btn")) {
      muted = !muted;
      saveMuted(muted);
      if (busy || uiPhase === "printing") {
        ui.setPrintMuted(muted);
        ui.setChrome({ mode, view, muted });
      } else {
        render();
      }
      return;
    }

    if (target.matches("[data-classic-arch-year]")) {
      classicArchYear = target.dataset.classicArchYear;
      view = "archive";
      render();
      return;
    }

    if (target.matches("[data-arch-year]")) {
      archYear = target.dataset.archYear;
      view = "archive";
      render();
      return;
    }

    if (target.matches("[data-classic-arch-game]")) {
      openClassicArchiveGame(Number(target.dataset.classicArchGame));
      return;
    }

    if (target.matches("[data-arch-game]")) {
      openArchiveGame(Number(target.dataset.archGame));
      return;
    }

    if (target.matches("[data-open-final]")) {
      if (state.phase === PHASE.COMPLETE) {
        modalOpen = true;
        render();
      }
      return;
    }

    if (
      target.matches("[data-close-announce]") ||
      target.matches("[data-dismiss-announce]")
    ) {
      dismissAnnounce();
      return;
    }

    if (
      target.matches("[data-close-final]") ||
      (target.id === "end-modal" && e.target === target)
    ) {
      if (announceOpen) {
        dismissAnnounce();
        return;
      }
      modalOpen = false;
      render();
      return;
    }

    if (target.matches("[data-share]")) {
      ui.handleShare(state);
      return;
    }

    if (target.matches("[data-next-round]")) {
      advanceToNextRound();
      return;
    }

    if (target.matches(".guess-button") && !target.disabled) {
      submitGuess();
    }
  }

  async function submitGuess() {
    if (busy || uiPhase !== "guessing" || state.phase !== PHASE.GUESSING) return;
    if (state.fromArchiveComplete) return;
    if (viewRoundIndex != null) return;

    const input = document.querySelector("#input-row .guess-input");
    const cents = parseGuessToCents(input?.value);
    if (cents == null) {
      ui.showWarningToast();
      return;
    }

    const product = products[state.rounds.length];
    if (!product) return;

    busy = true;
    clearRoundBrowse();
    const round = {
      productId: product.id,
      name: product.name,
      short: product.short,
      image: product.image,
      guessCents: cents,
      actualCents: product.priceCents,
      diffCents: Math.abs(cents - product.priceCents),
    };

    state.rounds.push(round);
    const justFinished = state.rounds.length === 5;
    state.phase = justFinished ? PHASE.COMPLETE : PHASE.AWAITING_NEXT;
    if (justFinished) {
      state.completedAt = new Date().toISOString();
      state.totalCents = sumDiffs(state.rounds);
      state.rating = undefined; // filled by recordCompletedGame via ratings
    }
    saveState(state);

    uiPhase = "printing";
    const previousTotal = sumDiffs(state.rounds.slice(0, -1));
    render({ animate: true, displayedTotalCents: previousTotal });

    await ui.animatePrint({ muted });

    if (justFinished) {
      stats = recordCompletedGame(state, loadStats(), { todayGameNumber });
      saveState(state);
      uiPhase = "complete";
      modalOpen = false;
      render({ displayedTotalCents: sumDiffs(state.rounds) });
      await new Promise((r) => setTimeout(r, 900));
      try {
        await ui.animateReceiptTearIn({
          muted,
          state,
          stats,
          date: activeDate,
        });
      } catch (err) {
        console.error("[checkout] receipt tear failed", err);
      }
      modalOpen = true;
      render({ displayedTotalCents: sumDiffs(state.rounds) });
    } else {
      uiPhase = "awaitingNext";
      render({ displayedTotalCents: sumDiffs(state.rounds) });
    }

    busy = false;
  }

  function advanceToNextRound() {
    if (busy || state.phase !== PHASE.AWAITING_NEXT) return;
    state.phase = PHASE.GUESSING;
    clearRoundBrowse();
    saveState(state);
    uiPhase = "guessing";
    render();
    document.querySelector("#input-row .guess-input")?.focus();
  }

  return { start };
}
