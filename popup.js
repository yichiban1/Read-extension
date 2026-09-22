const openGuideButton = document.getElementById("open-guide");
const status = document.getElementById("status");

openGuideButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    status.textContent = "No active tab was found.";
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_DEEPREAD_GUIDE" });
    window.close();
  } catch (error) {
    status.textContent = "Open a normal article page, then try again.";
    console.warn("DeepRead could not reach this page.", error);
  }
});
