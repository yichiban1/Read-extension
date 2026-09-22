// DeepRead prototype content script.
// Reads the current page, extracts its main text (article mode first,
// whole-page fallback), and builds a source-linked page guide in the side panel.

const GUIDE_ID = "deepread-guide";
const WORDS_PER_MINUTE = 220;
const MIN_ARTICLE_CHARS = 200;
const MIN_PAGE_TEXT_CHARS = 60;
const MAX_FALLBACK_STRUCTURE_ITEMS = 6;
const MIN_FALLBACK_PASSAGE_CHARS = 36;

function getPageContext() {
  return {
    title: document.title || "Untitled page",
    hostname: window.location.hostname || "Current page"
  };
}

function clonePageWithoutDeepRead() {
  const clone = document.cloneNode(true);
  clone.querySelector(`#${GUIDE_ID}`)?.remove();
  return clone;
}

function extractArticle() {
  return new Readability(clonePageWithoutDeepRead()).parse();
}

// Fallback for pages Readability does not recognise as an article:
// strip obvious chrome (nav, scripts, headers…) and take remaining text.
function extractWholePageText() {
  const clone = document.body.cloneNode(true);
  clone.querySelector(`#${GUIDE_ID}`)?.remove();
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

function countExtractedParagraphs(article) {
  if (!article.content) {
    return 0;
  }

  if (typeof article.content.querySelectorAll === "function") {
    return article.content.querySelectorAll("p").length;
  }

  const contentContainer = document.createElement("div");
  contentContainer.innerHTML = String(article.content);
  return contentContainer.querySelectorAll("p").length;
}

function getStructureSources(sourceMap) {
  const sources = sourceMap && Array.isArray(sourceMap.sources)
    ? sourceMap.sources
    : [];
  const headings = sources.filter((source) => /^h[1-6]$/.test(source.tag));

  if (headings.length >= 2) {
    return { mode: "headings", sources: headings };
  }

  const contentBlocks = sources.filter((source) =>
    ["p", "li", "blockquote", "pre"].includes(source.tag)
  );
  const substantialBlocks = contentBlocks.filter(
    (source) => source.text.trim().length >= MIN_FALLBACK_PASSAGE_CHARS
  );
  const fallbackBlocks = (substantialBlocks.length > 0
    ? substantialBlocks
    : contentBlocks
  ).slice(0, MAX_FALLBACK_STRUCTURE_ITEMS);

  if (headings.length === 1) {
    return {
      mode: "passages",
      sources: [headings[0], ...fallbackBlocks]
        .filter((source, index, list) =>
          list.findIndex((candidate) => candidate.id === source.id) === index
        )
        .slice(0, MAX_FALLBACK_STRUCTURE_ITEMS + 1)
    };
  }

  return { mode: "passages", sources: fallbackBlocks };
}

function shortenSourceText(text, maxLength = 120) {
  const compactText = text.replace(/\s+/g, " ").trim();
  return compactText.length > maxLength
    ? `${compactText.slice(0, maxLength - 1).trimEnd()}…`
    : compactText;
}

function renderStructureItem(list, source, index, mode) {
  const item = document.createElement("li");
  item.className = "deepread-structure-item";
  item.dataset.level = mode === "headings" ? source.tag.slice(1) : "0";

  const button = document.createElement("button");
  button.className = "deepread-structure-button";
  button.type = "button";
  button.dataset.sourceId = source.id;
  button.setAttribute(
    "aria-label",
    `Jump to ${mode === "headings" ? source.text : `passage ${index + 1}`}`
  );

  const number = document.createElement("span");
  number.className = "deepread-structure-number";
  number.textContent = String(index + 1).padStart(2, "0");

  const copy = document.createElement("span");
  copy.className = "deepread-structure-copy";

  const label = document.createElement("strong");
  label.className = "deepread-structure-label";
  label.textContent = mode === "headings"
    ? source.text
    : `Passage ${String(index + 1).padStart(2, "0")}`;

  const meta = document.createElement("small");
  meta.className = "deepread-structure-meta";
  meta.textContent = `${source.tag.toUpperCase()} · LIVE SOURCE`;

  copy.append(label, meta);
  if (mode === "passages") {
    const excerpt = document.createElement("span");
    excerpt.className = "deepread-structure-excerpt";
    excerpt.textContent = shortenSourceText(source.text);
    copy.append(excerpt);
  }

  const arrow = document.createElement("span");
  arrow.className = "deepread-structure-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";

  button.append(number, copy, arrow);
  button.addEventListener("click", () => {
    const didNavigate = globalThis.DeepReadSourceMapping?.scrollToSourceId?.(source.id);
    if (!didNavigate) {
      return;
    }

    list.querySelectorAll(".deepread-structure-button.is-active").forEach((activeButton) => {
      activeButton.classList.remove("is-active");
      activeButton.removeAttribute("aria-current");
    });
    button.classList.add("is-active");
    button.setAttribute("aria-current", "location");
  });

  item.append(button);
  return item;
}

function renderStructure(guide, sourceMap) {
  const list = guide.querySelector(".deepread-structure-list");
  const count = guide.querySelector(".deepread-structure-count");
  const empty = guide.querySelector(".deepread-structure-empty");
  const note = guide.querySelector(".deepread-structure-note");
  const structure = getStructureSources(sourceMap);

  list.replaceChildren();
  count.textContent = structure.sources.length
    ? `${structure.sources.length} ${structure.mode === "headings" ? "headings" : "reading points"}`
    : "No mapped structure";
  note.textContent = structure.mode === "headings"
    ? "Click a heading to jump to its live passage."
    : "No heading outline was available, so these points use real page text.";

  if (structure.sources.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  structure.sources.forEach((source, index) => {
    list.append(renderStructureItem(list, source, index, structure.mode));
  });
}

function createGuide() {
  const { title, hostname } = getPageContext();
  let sourceMap = null;
  try {
    sourceMap = globalThis.DeepReadSourceMapping.buildSourceMap();
  } catch (error) {
    console.warn("DeepRead source mapping failed.", error);
  }

  const guide = document.createElement("aside");
  guide.id = GUIDE_ID;
  guide.setAttribute("aria-label", "DeepRead Reading Guide");

  guide.innerHTML = `
    <header class="deepread-header">
      <div>
        <p>DEEPREAD / SOURCE GUIDE</p>
        <h1>Page guide</h1>
      </div>
      <button class="deepread-close" type="button" aria-label="Close guide">×</button>
    </header>

    <section class="deepread-page-context">
      <span>◉ ACTIVE PAGE CAPTURED</span>
      <strong class="deepread-page-title"></strong>
      <em class="deepread-page-hostname"></em>
    </section>

    <section class="deepread-guide-intro">
      <span>LIVE PAGE GUIDE</span>
      <p>Follow the page's own structure, then jump straight back to the source.</p>
    </section>

    <section class="deepread-analysis">
      <section class="deepread-structure" aria-labelledby="deepread-structure-title">
        <div class="deepread-structure-heading">
          <span id="deepread-structure-title">PAGE STRUCTURE</span>
          <small class="deepread-structure-count"></small>
        </div>
        <ol class="deepread-structure-list"></ol>
        <p class="deepread-structure-empty" hidden>No useful source blocks were found for a guide.</p>
        <small class="deepread-structure-note"></small>
      </section>

      <section class="deepread-snapshot" aria-label="Page snapshot">
        <span>PAGE SNAPSHOT</span>
        <div class="deepread-snapshot-loading">Reading details…</div>
        <div class="deepread-result" hidden>
          <div class="deepread-stats">
            <div class="deepread-stat-row"><b>Words</b><i class="deepread-stat-words"></i></div>
            <div class="deepread-stat-row"><b>Reading time</b><i class="deepread-stat-time"></i></div>
            <div class="deepread-stat-row deepread-stat-paras-row"><b>Blocks</b><i class="deepread-stat-paras"></i></div>
            <em class="deepread-article-title"></em>
            <small class="deepread-article-meta"></small>
          </div>
        </div>
        <div class="deepread-failure" hidden>
          <p>There is not enough readable text for a page snapshot.</p>
          <small>The source guide can still work when mapped passages are available.</small>
        </div>
      </section>
    </section>

    <footer>Live source layer · nothing leaves your browser.</footer>
  `;

  guide.querySelector(".deepread-page-title").textContent = title;
  guide.querySelector(".deepread-page-hostname").textContent = hostname;
  guide.querySelector(".deepread-close").addEventListener("click", () => guide.remove());
  document.documentElement.appendChild(guide);

  renderStructure(guide, sourceMap);
  fillAnalysis(guide);
}

function fillAnalysis(guide) {
  const analysis = analysePage();
  guide.querySelector(".deepread-snapshot-loading").remove();

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
      ? String(countExtractedParagraphs(article))
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
