import { createCheckoutGame } from "./game.js";

const game = createCheckoutGame();
game.start().catch((err) => {
  console.error(err);
  const name = document.getElementById("r-name");
  if (name) name.textContent = "Unable to load today's game. Please refresh.";
});
