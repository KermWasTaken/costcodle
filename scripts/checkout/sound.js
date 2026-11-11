/* Receipt print audio */

let sharedCtx = null;
let sampleBuffer = null;
let sampleTried = false;
let sampleLoading = null;

const MASTER_GAIN = 0.22;
const SAMPLE_PEAK = 0.28;

function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

async function loadSample(ctx) {
  if (sampleBuffer) return sampleBuffer;
  if (sampleLoading) return sampleLoading;
  if (sampleTried && !sampleLoading) return null;

  sampleLoading = (async () => {
    sampleTried = true;
    const candidates = [
      "./assets/thermal-printer.wav",
      "./assets/thermal-printer.mp3",
      "./assets/thermal-printer.ogg",
      "./assets/thermal-print.mp3",
      "./assets/thermal-print.wav",
      "./assets/thermal-print.ogg",
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) continue;
        const raw = await res.arrayBuffer();
        sampleBuffer = await ctx.decodeAudioData(raw.slice(0));
        return sampleBuffer;
      } catch {
        /* try next */
      }
    }
    sampleBuffer = null;
    return null;
  })();

  try {
    return await sampleLoading;
  } finally {
    sampleLoading = null;
  }
}

function playSample(ctx, buffer, durationMs, master, launch = 0) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const durSec = Math.max(0.05, durationMs / 1000);
  const L = Math.min(1, Math.max(0, launch));
  if (buffer.duration > 0.05 && buffer.duration < durSec * 0.85) {
    src.loop = true;
  }

  const rateStart = 1 + 0.55 * L;
  const rateEnd = Math.max(0.88, 1 - 0.1 * L);
  const now = ctx.currentTime;
  src.playbackRate.setValueAtTime(rateStart, now);
  src.playbackRate.exponentialRampToValueAtTime(rateEnd, now + Math.max(0.12, durSec * 0.62));
  src.playbackRate.linearRampToValueAtTime(rateEnd * 0.98, now + durSec);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(SAMPLE_PEAK, now + 0.05);
  gain.gain.setValueAtTime(SAMPLE_PEAK, now + Math.max(0.06, durSec - 0.1));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

  src.connect(gain);
  gain.connect(master);
  src.start(now);
  src.stop(now + durSec + 0.05);
  return () => {
    try {
      src.stop();
    } catch {
      /* already ended */
    }
  };
}


function playSynth(ctx, durationMs, master, launch = 0) {
  const now = ctx.currentTime;
  const dur = durationMs / 1000;
  const L = Math.min(1, Math.max(0, launch));
  const nodes = [];

  const motor = ctx.createOscillator();
  motor.type = "sawtooth";
  const motorStart = 92 * (1 + 0.65 * L);
  const motorEnd = 92;
  motor.frequency.setValueAtTime(motorStart, now);
  motor.frequency.exponentialRampToValueAtTime(motorEnd, now + Math.max(0.12, dur * 0.6));
  const motorFilter = ctx.createBiquadFilter();
  motorFilter.type = "lowpass";
  motorFilter.frequency.value = 240 + 80 * L;
  const motorGain = ctx.createGain();
  motorGain.gain.value = 0.028;
  motor.connect(motorFilter);
  motorFilter.connect(motorGain);
  motorGain.connect(master);
  motor.start(now);
  motor.stop(now + dur + 0.05);
  nodes.push(motor);

  const hissLen = Math.floor(ctx.sampleRate * (dur + 0.1));
  const hissBuf = ctx.createBuffer(1, hissLen, ctx.sampleRate);
  const hissData = hissBuf.getChannelData(0);
  for (let i = 0; i < hissLen; i++) {
    const t = i / ctx.sampleRate;
    const flutter = 0.82 + 0.18 * Math.sin(t * Math.PI * 2 * 18);
    hissData[i] = (Math.random() * 2 - 1) * flutter;
  }
  const hiss = ctx.createBufferSource();
  hiss.buffer = hissBuf;
  const hissBp = ctx.createBiquadFilter();
  hissBp.type = "bandpass";
  hissBp.frequency.value = 3200;
  hissBp.Q.value = 0.7;
  const hissHp = ctx.createBiquadFilter();
  hissHp.type = "highpass";
  hissHp.frequency.value = 900;
  const hissGain = ctx.createGain();
  hissGain.gain.setValueAtTime(0.0001, now);
  hissGain.gain.exponentialRampToValueAtTime(0.09, now + 0.05);
  hissGain.gain.setValueAtTime(0.09, now + Math.max(0.05, dur - 0.1));
  hissGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  hiss.connect(hissHp);
  hissHp.connect(hissBp);
  hissBp.connect(hissGain);
  hissGain.connect(master);
  hiss.start(now);
  nodes.push(hiss);

  const tickEvery = 0.07;
  for (let t = 0; t < dur; t += tickEvery) {
    const tickDur = 0.012;
    const n = Math.floor(ctx.sampleRate * tickDur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1400 + (t / dur) * 600;
    f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.value = 0.02;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(now + t);
  }

  return () => {
    nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    });
  };
}

export function playTearSound({ muted = false, durationMs = 480 } = {}) {
  const noop = { stop() {}, setMuted() {} };
  if (muted) return noop;

  const ctx = getCtx();
  if (!ctx) return noop;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const dur = Math.max(0.2, durationMs / 1000);
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN * 0.95;
  master.connect(ctx.destination);

  const len = Math.floor(ctx.sampleRate * (dur + 0.08));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;

    const burst =
      Math.exp(-t * 9) * 0.55 +
      Math.exp(-Math.max(0, t - 0.05) * 14) * 0.85 +
      Math.exp(-Math.max(0, t - 0.12) * 11) * 0.7 +
      Math.exp(-Math.max(0, t - 0.22) * 16) * 0.45;
    const flutter = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * 62);
    data[i] = (Math.random() * 2 - 1) * burst * flutter;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 700;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 0.55;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(gain);
  gain.connect(master);
  src.start(now);
  src.stop(now + dur + 0.05);

  let stopped = false;
  const teardown = setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
  }, durationMs + 120);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(teardown);
      try {
        src.stop();
      } catch {
        /* ignore */
      }
      try {
        master.disconnect();
      } catch {
        /* ignore */
      }
    },
    setMuted(next) {
      if (stopped) return;
      try {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(next ? 0.0001 : MASTER_GAIN * 0.95, t);
      } catch {
        /* ignore */
      }
    },
  };
}

export function preloadPrintSound() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  loadSample(ctx).catch(() => {});
}

export function playPrintSound({ durationMs = 1800, muted = false, launch = 0 } = {}) {
  const noop = { stop() {}, setMuted() {} };
  const ctx = getCtx();
  if (!ctx) return noop;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const master = ctx.createGain();

  master.gain.value = muted ? 0.0001 : MASTER_GAIN;
  master.connect(ctx.destination);

  let stopInner = () => {};
  let stopped = false;

  if (sampleBuffer) {
    stopInner = playSample(ctx, sampleBuffer, durationMs, master, launch);
  } else {

    stopInner = playSynth(ctx, durationMs, master, launch);
    loadSample(ctx).then((buf) => {
      if (stopped || !buf) return;
      stopInner();
      stopInner = playSample(ctx, buf, durationMs, master, launch);
    });
  }

  const teardown = setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
  }, durationMs + 120);

  return {
    stop() {
      stopped = true;
      clearTimeout(teardown);
      stopInner();
      try {
        master.disconnect();
      } catch {
        /* ignore */
      }
    },
    setMuted(next) {
      if (stopped) return;
      try {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(next ? 0.0001 : MASTER_GAIN, now);
      } catch {
        /* ignore */
      }
    },
  };
}
