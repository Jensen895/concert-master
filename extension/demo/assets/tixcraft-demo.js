(function initializeDemoPurchaseDisclosure() {
  "use strict";

  const purchaseButton = document.querySelector("[data-action='buy'][aria-controls='gameList']");
  const gameList = document.getElementById("gameList");
  if (!purchaseButton || !gameList) return;

  purchaseButton.addEventListener("click", () => {
    gameList.hidden = false;
    purchaseButton.setAttribute("aria-expanded", "true");
    gameList.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
