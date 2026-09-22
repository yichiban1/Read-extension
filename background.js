// Service worker: keeps extension-level behaviour in place.
// No storage, API calls, or analysis orchestration are implemented yet.
chrome.runtime.onInstalled.addListener(() => {
  console.log("DeepRead prototype installed.");
});
