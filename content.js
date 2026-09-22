// DeepRead prototype content script.
// Reads the current page, extracts its main text (article mode first,
// whole-page fallback), and drafts a short local summary in the side panel.

const GUIDE_ID = "deepread-guide";
const WORDS_PER_MINUTE = 220;
const SUMMARY_SENTENCES = 3;
const MIN_ARTICLE_CHARS = 200;
const MIN_PAGE_TEXT_CHARS = 60;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "this", "that", "it", "its", "as",
  "at", "by", "from", "not", "you", "your", "we", "our", "they", "their",
  "he", "she", "his", "her", "about", "into", "over", "after", "can", "will",
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一个",
  "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看"
]);

function getPageContext() {
  return {
    title: document.title || "Untitled page",
    hostname: window.location.hostname || "Current page"
  };
}

function extractArticle() {
  return new Readability(document.cloneNode(true)).parse();
}

// Fallback for pages Readability does not recognise as an article:
// strip obvious chrome (nav, scripts, headers…) and take remaining text.
function extractWholePageText() {
  const clone = document.body.cloneNode(true);
  clone
    .querySelectorAll("script, style, noscript, template, svg, nav, header, footer, aside")
    .forEach((element) => element.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

// Returns { article, text, mode } or null when a page has almost no text.
function analysePage() {
  let parsed = null;
  try {
    parsed = extractArticle();
  } catch (error) {
    console.warn("DeepRead article extraction failed.", error);
  }

  const articleText = parsed && parsed.textContent ? parsed.textContent.trim() : "";
  if (parsed && articleText.length >= MIN_ARTICLE_CHARS) {
    return { article: parsed, text: articleText, mode: "article" };
  }

  const pageText = extractWholePageText();
  if (pageText.length >= MIN_PAGE_TEXT_CHARS) {
    return {
      article: {
        title: document.title,
        byline: null,
        siteName: null,
        content: null,
        paragraphCount: document.body.querySelectorAll("p").length
      },
      text: pageText,
      mode: "page"
    };
  }

  return null;
}

function countWords(text) {
  const latinWords = (text.match(/[A-Za-z0-9'’]+/g) || []).length;
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return latinWords + cjkChars;
}

function estimateReadingMinutes(wordCount) {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

function tokenize(sentence) {
  return (sentence.toLowerCase().match(/[a-z0-9'’]+|[\u4e00-\u9fff]/g) || [])
    .filter((token) =>
      !STOP_WORDS.has(token) &&
      (token.length > 1 || /[\u4e00-\u9fff]/.test(token))
    );
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

// Extractive draft summary: score sentences by word frequency,
// keep the strongest few in their original order.
// Accepts shorter sentences so brief pages can still get a summary.
function buildSummary(text, maxSentences) {
  let sentences = splitSentences(text).filter(
    (sentence) => sentence.length >= 40 && sentence.length <= 320
  );
  if (sentences.length === 0) {
    sentences = splitSentences(text).filter(
      (sentence) => sentence.length >= 12 && sentence.length <= 320
    );
  }
  if (sentences.length === 0) {
    return [];
  }

  const frequency = new Map();
  for (const sentence of sentences) {
    for (const token of tokenize(sentence)) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }

  return sentences
    .map((sentence, index) => {
      const tokens = tokenize(sentence);
      const score =
        tokens.reduce((sum, token) => sum + (frequency.get(token) || 0), 0) /
        Math.sqrt(tokens.length || 1);
      return { index, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((item) => sentences[item.index]);
}

function createGuide() {
  const { title, hostname } = getPageContext();
  const guide = document.createElement("aside");
  guide.id = GUIDE_ID;
  guide.setAttribute("aria-label", "DeepRead Reading Guide");

  guide.innerHTML = `
    <header class="deepread-header">
      <div>
        <p>DEEPREAD / PROTOTYPE</p>
        <h1>Reading guide</h1>
      </div>
      <button class="deepread-close" type="button" aria-label="Close guide">×</button>
    </header>

    <section class="deepread-page-context">
      <span>◉ ACTIVE PAGE CAPTURED</span>
      <strong class="deepread-page-title"></strong>
      <em class="deepread-page-hostname"></em>
    </section>

    <section class="deepread-analysis">
      <span>READING THE PAGE…</span>
      <div class="deepread-loading">Extracting text…</div>
      <div class="deepread-result" hidden>
        <div class="deepread-stats">
          <div class="deepread-stat-row"><b>Words</b><i class="deepread-stat-words"></i></div>
          <div class="deepread-stat-row"><b>Reading time</b><i class="deepread-stat-time"></i></div>
          <div class="deepread-stat-row deepread-stat-paras-row"><b>Paragraphs</b><i class="deepread-stat-paras"></i></div>
          <em class="deepread-article-title"></em>
          <small class="deepread-article-meta"></small>
        </div>
        <div class="deepread-summary">
          <span>DRAFT SUMMARY — KEY POINTS</span>
          <ul class="deepread-summary-list"></ul>
          <small>Local extractive draft. A model-based guide is planned.</small>
        </div>
      </div>
      <div class="deepread-failure" hidden>
        <p>There is almost no readable text on this page.</p>
        <small>DeepRead works on any page that contains actual written content.</small>
      </div>
    </section>

    <footer>Local prototype · nothing leaves your browser.</footer>
  `;

  guide.querySelector(".deepread-page-title").textContent = title;
  guide.querySelector(".deepread-page-hostname").textContent = hostname;
  guide.querySelector(".deepread-close").addEventListener("click", () => guide.remove());
  document.documentElement.appendChild(guide);

  fillAnalysis(guide);
}

function fillAnalysis(guide) {
  const analysis = analysePage();
  guide.querySelector(".deepread-loading").remove();

  if (!analysis) {
    guide.querySelector(".deepread-failure").hidden = false;
    return;
  }

  const { article, text, mode } = analysis;
  const result = guide.querySelector(".deepread-result");
  result.hidden = false;

  const wordCount = countWords(text);
  result.querySelector(".deepread-stat-words").textContent =
    wordCount.toLocaleString();
  result.querySelector(".deepread-stat-time").textContent =
    `${estimateReadingMinutes(wordCount)} min`;

  result.querySelector(".deepread-stat-paras").textContent =
    mode === "article"
      ? String(article.content ? article.content.querySelectorAll("p").length : 0)
      : String(article.paragraphCount);

  result.querySelector(".deepread-article-title").textContent =
    article.title || "";
  result.querySelector(".deepread-article-meta").textContent = [
    mode === "article" ? "Article extraction" : "Full-page capture",
    article.byline ? `By ${article.byline}` : null,
    article.siteName || null
  ]
    .filter(Boolean)
    .join(" · ");

  const list = result.querySelector(".deepread-summary-list");
  const keyPoints = buildSummary(text, SUMMARY_SENTENCES);
  if (keyPoints.length === 0) {
    list.innerHTML = `<li>Text was captured, but it is too short to summarise.</li>`;
  } else {
    for (const point of keyPoints) {
      const item = document.createElement("li");
      item.textContent = point;
      list.appendChild(item);
    }
  }
}

function toggleGuide() {
  const existingGuide = document.getElementById(GUIDE_ID);
  if (existingGuide) {
    existingGuide.remove();
  } else {
    createGuide();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_DEEPREAD_GUIDE") {
    toggleGuide();
    sendResponse({ ok: true, context: getPageContext() });
  }
});
