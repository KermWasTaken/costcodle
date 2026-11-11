/*
  Day N → catalog SKUs for Classic + Checkout.
  N < 1148: classic SKU = N
  N >= 1148: base = 1148 + (N - 1148) * 6
             classic = base, checkout = base+1 … base+5
*/
(function (global) {
  const CHECKOUT_LAUNCH_GAME = 1148;

  function classicProductId(gameNumber) {
    const n = Number(gameNumber);
    if (!Number.isFinite(n) || n < 1) return n;
    if (n < CHECKOUT_LAUNCH_GAME) return n;
    return CHECKOUT_LAUNCH_GAME + (n - CHECKOUT_LAUNCH_GAME) * 6;
  }

  function checkoutProductIds(gameNumber) {
    const n = Number(gameNumber);
    const dayIndex = Math.max(0, n - CHECKOUT_LAUNCH_GAME);
    const base = CHECKOUT_LAUNCH_GAME + dayIndex * 6;
    return [1, 2, 3, 4, 5].map((i) => base + i);
  }

  function checkoutGameNumber(gameNumber) {
    const n = Number(gameNumber);
    if (!Number.isFinite(n)) return n;
    return Math.max(1, n - CHECKOUT_LAUNCH_GAME + 1);
  }

  global.CostcodleDaily = {
    CHECKOUT_LAUNCH_GAME,
    classicProductId,
    checkoutProductIds,
    checkoutGameNumber,
  };
})(typeof window !== "undefined" ? window : globalThis);
