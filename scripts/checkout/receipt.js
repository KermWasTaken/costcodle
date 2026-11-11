import { money, escapeHtml } from "./money.js";
import { formatShortDate } from "./daily.js";

const TICK = 250;
const LABEL_STEP_CENTS = 500;
const RULER_LINEAR_CENTS = 2500;
const MIN_MARK_GAP_PX = 22;

const PRINT_MIN_MS = 1600;
const PRINT_MAX_MS = 4200;
const PRINT_MS_PER_PX = 2.15;

let activeAnim = null;

function artScale() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--p")) || 4;
}

function receiptMoney(cents) {
  return money(cents, { sign: "", short: true, shortFrom: artScale() < 4 ? 1000 : 10000 });
}

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

/* Soften huge misses for paper height; amounts stay exact. */
export function visualFeedCents(cents) {
  const n = Math.max(0, Number(cents) || 0);
  if (n <= RULER_LINEAR_CENTS) return n;
  const over = n - RULER_LINEAR_CENTS;
  return RULER_LINEAR_CENTS + Math.sqrt(over) * 18;
}

export function printDurationForDelta(deltaPx) {
  const px = Math.max(0, deltaPx || 0);
  return Math.min(PRINT_MAX_MS, Math.max(PRINT_MIN_MS, PRINT_MIN_MS + px * PRINT_MS_PER_PX));
}

function launchEase(t) {
  const x = Math.min(1, Math.max(0, t));
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

function readPrev(ref) {
  const v = ref?.current;
  if (v == null) return null;
  if (typeof v === "number") return { height: v, offset: 0 };
  return {
    height: Number(v.height) || 0,
    offset: Number(v.offset) || 0,
  };
}

function applyPaperVisual(paper, roll, height, offset) {
  paper.style.height = `${height}px`;
  paper.style.justifyContent = "flex-start";
  if (roll) {
    roll.style.transform = offset > 0.5 ? `translateY(-${offset}px)` : "";
  }
  paper.classList.toggle("is-overflowing", offset > 0.5);
}

function withCum(rounds) {
  let cum = 0;
  let visualCum = 0;
  return rounds.map((r, i) => {
    const off = r.diffCents;
    const visualOff = visualFeedCents(off);
    cum += off;
    visualCum += visualOff;
    return {
      round: i + 1,
      name: r.short || r.name,
      off,
      visualOff,
      cum,
      visualCum,
    };
  });
}

function feedSegment(r, s, cap) {
  const feed = el("div", "r-feed");
  const height = Math.min(r.visualOff * s, cap);
  feed.style.height = `${height}px`;
  if (s > 0 && r.visualOff > 0 && r.off > 0 && height > 8) {
    feed.style.setProperty("--period", `${TICK * s}px`);
    feed.style.setProperty("--shift", `${(r.visualCum % TICK) * s}px`);

    const maxBySpace = Math.max(1, Math.floor(height / MIN_MARK_GAP_PX));
    const idealCount = Math.min(10, maxBySpace);
    const rawStep = r.off / Math.max(1, idealCount);
    const step = Math.max(
      LABEL_STEP_CENTS,
      Math.ceil(rawStep / LABEL_STEP_CENTS) * LABEL_STEP_CENTS
    );

    const start = r.cum - r.off;
    let c = Math.floor((r.cum - 1) / step) * step;
    for (; c > start; c -= step) {
      const frac = (r.cum - c) / r.off;
      const y = frac * height;
      if (y < MIN_MARK_GAP_PX * 0.4 || y > height - 4) continue;
      const mark = el("span", "mark", `$${(c / 100).toLocaleString("en-US")}`);
      mark.style.bottom = `${y}px`;
      feed.append(mark);
    }
  }
  return feed;
}

function itemLine(r) {
  return el(
    "div",
    "r-line",
    `<span class="n">${r.round}</span><span class="name">${escapeHtml(
      r.name
    )}</span><span class="lead"></span><span class="amt">${receiptMoney(r.off)}</span>`
  );
}

function buildRoll({ rs, count, finished, s, cap, gameNumber, shortDate }) {
  const roll = el("div", "r-roll");
  roll.append(el("div", "r-edge r-edge-top"));
  const sheet = el("div", "r-sheet");
  roll.append(sheet);

  const stub = el("div", "r-stub", `<div class="r-logo">COSTCO<span>DLE</span></div>`);
  stub.append(el("div", "r-meta", `<span>#${gameNumber}</span><span>${shortDate}</span>`));
  sheet.append(stub);
  sheet.append(el("div", "r-dash"));
  for (const r of rs.slice(0, count)) sheet.append(feedSegment(r, s, cap), itemLine(r));
  if (finished) {
    sheet.append(el("div", "r-dash"));
    sheet.append(
      el(
        "div",
        "r-line r-total",
        `<span class="lbl-long">TOTAL</span><span class="lbl-short">TTL</span><span class="lead"></span><span class="amt">${receiptMoney(
          rs[4].cum
        )}</span>`
      )
    );
    roll.append(el("div", "r-edge r-edge-bottom"));
  }
  return roll;
}

function runLaunchAnimation(paper, roll, { fromH, toH, fromOff, toOff, durationMs }) {
  if (activeAnim) {
    cancelAnimationFrame(activeAnim.raf);
    activeAnim.resolve?.();
    activeAnim = null;
  }

  paper.style.transition = "none";
  applyPaperVisual(paper, roll, fromH, fromOff);
  paper.offsetHeight;

  const heightTravel = Math.max(0, toH - fromH);
  const offsetTravel = Math.max(0, toOff - fromOff);
  const totalTravel = heightTravel + offsetTravel;
  const steps = Math.max(28, Math.round(durationMs / 45));

  return new Promise((resolve) => {
    const started = performance.now();
    const state = { raf: 0, resolve };
    activeAnim = state;

    const tick = (now) => {
      const t = Math.min(1, (now - started) / durationMs);
      const eased = launchEase(t);
      const q = Math.round(eased * steps) / steps;
      const dist = q * totalTravel;

      let h;
      let o;
      if (dist <= heightTravel) {
        h = fromH + dist;
        o = fromOff;
      } else {
        h = toH;
        o = fromOff + (dist - heightTravel);
      }
      applyPaperVisual(paper, roll, h, o);

      if (t < 1) {
        state.raf = requestAnimationFrame(tick);
      } else {
        applyPaperVisual(paper, roll, toH, toOff);
        activeAnim = null;
        resolve();
      }
    };

    state.raf = requestAnimationFrame(tick);
  });
}


export function renderReceipt(rounds, { gameNumber, date, finished = false, animate = false, lastHeightRef }) {
  const paper = document.getElementById("paper");
  const col = document.getElementById("col-printer");
  if (!paper || !col) {
    return { height: 0, durationMs: 0, launch: 0, done: Promise.resolve() };
  }

  const p = artScale();
  const slot = 20 * p;
  const reach = col.clientHeight - slot;
  const cap = Math.max(reach, 1);
  const shortDate = formatShortDate(date);
  const rs = withCum(rounds);
  const count = rounds.length;

  const probeRs =
    rs.length === 5
      ? rs
      : [
          ...rs,
          ...Array.from({ length: 5 - rs.length }, (_, i) => ({
            round: rs.length + i + 1,
            name: "—",
            off: 0,
            visualOff: 0,
            cum: rs.length ? rs[rs.length - 1].cum : 0,
            visualCum: rs.length ? rs[rs.length - 1].visualCum : 0,
          })),
        ];
  const probe = buildRoll({
    rs: probeRs,
    count: 5,
    finished: true,
    s: 0,
    cap,
    gameNumber,
    shortDate,
  });
  paper.replaceChildren(probe);
  const overhead = probe.offsetHeight;
  const s = Math.max((reach - overhead) / RULER_LINEAR_CENTS, 0.02);

  const roll = buildRoll({
    rs: count ? rs : [],
    count,
    finished: finished && count === 5,
    s,
    cap,
    gameNumber,
    shortDate,
  });
  paper.replaceChildren(roll);
  const rollHeight = roll.offsetHeight;
  const height = Math.min(rollHeight, cap);
  const offset = Math.max(0, rollHeight - height);

  const prev = readPrev(lastHeightRef);
  const prevH = prev?.height ?? height;
  const prevOff = prev?.offset ?? 0;
  const travel = Math.abs(height - prevH) + Math.abs(offset - prevOff);
  const durationMs = animate && prev != null ? printDurationForDelta(travel) : 0;
  const launch = Math.min(1, travel / Math.max(140, cap * 0.55));

  let done = Promise.resolve();

  if (!animate || prev == null) {
    paper.style.transition = "none";
    applyPaperVisual(paper, roll, height, offset);
    paper.offsetHeight;
    paper.style.transition = "";
  } else if (travel < 1) {
    applyPaperVisual(paper, roll, height, offset);
  } else {
    done = runLaunchAnimation(paper, roll, {
      fromH: prevH,
      toH: height,
      fromOff: prevOff,
      toOff: offset,
      durationMs,
    });
  }

  if (lastHeightRef) lastHeightRef.current = { height, offset };
  return { height, durationMs, launch, done };
}

export function waitForPrintAnimation(
  paper = document.getElementById("paper"),
  durationMs = PRINT_MIN_MS,
  donePromise = null
) {
  if (donePromise) {
    return Promise.race([
      donePromise,
      new Promise((resolve) => setTimeout(resolve, Math.max(PRINT_MIN_MS, durationMs) + 400)),
    ]);
  }
  return new Promise((resolve) => {
    if (!paper) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      paper.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target === paper && e.propertyName === "height") finish();
    };
    paper.addEventListener("transitionend", onEnd);
    const timer = setTimeout(finish, Math.max(PRINT_MIN_MS, durationMs) + 250);
  });
}
