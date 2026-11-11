export const RATINGS = [
  [500, "EXECUTIVE MEMBER"],
  [1500, "GOLD STAR MEMBER"],
  [3000, "BULK BUYER"],
  [6000, "FREE SAMPLE HUNTER"],
  [15000, "LOST IN AISLE 12"],
  [Infinity, "FORGOT YOUR CARD"],
];

export const HOT_DOG_COMBO_CENTS = 150;

export function ratingForTotal(totalCents) {
  return RATINGS.find(([max]) => totalCents <= max)[1];
}

export function hotDogCombos(totalCents) {
  return Math.floor(totalCents / HOT_DOG_COMBO_CENTS);
}

export function hotDogComboText(totalCents) {
  const n = hotDogCombos(totalCents);
  if (n === 0) return "NOT EVEN ONE HOT DOG COMBO!";
  return `THAT'S ${n.toLocaleString("en-US")} HOT DOG COMBO${n === 1 ? "" : "S"}`;
}

export function bucketForTotal(totalCents) {
  if (totalCents < 500) return "lt5";
  if (totalCents < 1000) return "b5_10";
  if (totalCents < 2500) return "b10_25";
  if (totalCents < 5000) return "b25_50";
  return "gte50";
}

export const BUCKET_LABELS = [
  { key: "lt5", label: "<$5" },
  { key: "b5_10", label: "$5-10" },
  { key: "b10_25", label: "$10-25" },
  { key: "b25_50", label: "$25-50" },
  { key: "gte50", label: "$50+" },
];
