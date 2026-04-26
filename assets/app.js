// Main guide runtime
(function () {
  const STORE_KEY = "guide-history-v1";

  const state = {
    content: null,
    historyStack: [], // node ids visited
  };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function setCSSVar(name, value) { document.documentElement.style.setProperty(name, value); }

  function applyTheme(theme) {
    if (!theme) return;
    if (theme.primary) setCSSVar("--primary", theme.primary);
    if (theme.accent) setCSSVar("--accent", theme.accent);
    if (theme.background) setCSSVar("--bg", theme.background);
    if (theme.surface) setCSSVar("--surface", theme.surface);
    if (theme.text) setCSSVar("--text", theme.text);
  }

  // Configure marked + highlight.js
  marked.use({
    breaks: true,
    gfm: true,
  });
  if (window.hljs) {
    marked.use({
      renderer: {
        code(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : "plaintext";
          const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
          return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
        }
      }
    });
  }

  // Auto-embed YouTube/Vimeo URLs that appear on their own line
  function autoEmbedVideos(md) {
    if (!md) return md;
    const lines = md.split(/\r?\n/);
    return lines.map(line => {
      const trimmed = line.trim();
      const yt = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})(?:\S*)?$/);
      if (yt) {
        return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${yt[1]}" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      }
      const vm = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)(?:\S*)?$/);
      if (vm) {
        return `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${vm[1]}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
      }
      return line;
    }).join("\n");
  }

  function renderMarkdown(md) {
    const withEmbeds = autoEmbedVideos(md || "");
    const html = marked.parse(withEmbeds);
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "loading", "referrerpolicy", "target", "rel"],
    });
  }

  // ---------- modal ----------
  function showModal({ title, body, confirmLabel = "Continue", cancelLabel = "Cancel", showCancel = true, onConfirm }) {
    const m = $("modal");
    $("modal-title").textContent = title || "";
    $("modal-body").innerHTML = renderMarkdown(body || "");
    const cancelBtn = $("modal-cancel");
    const confirmBtn = $("modal-confirm");
    cancelBtn.style.display = showCancel ? "" : "none";
    cancelBtn.textContent = cancelLabel;
    confirmBtn.textContent = confirmLabel;
    m.classList.remove("hidden");
    const close = () => m.classList.add("hidden");
    cancelBtn.onclick = close;
    confirmBtn.onclick = () => { close(); onConfirm && onConfirm(); };
  }

  // ---------- rendering ----------
  function renderSiteChrome() {
    const s = state.content.site || {};
    document.title = s.title || "Guide";
    $("site-title").textContent = s.title || "Guide";
    $("site-subtitle").textContent = s.subtitle || "";
    if (s.header && s.header.trim()) {
      const banner = $("header-banner");
      banner.classList.remove("hidden");
      banner.innerHTML = `<div class="glass rounded-xl px-4 py-2 text-sm opacity-90">${renderMarkdown(s.header)}</div>`;
    }
    if (s.footer && s.footer.trim()) {
      $("site-footer").innerHTML = renderMarkdown(s.footer);
    }
  }

  function maybeShowWelcome() {
    const w = state.content.site && state.content.site.welcomePopup;
    if (!w || !w.enabled) return;
    const seenKey = "guide-welcome-seen-v1";
    if (sessionStorage.getItem(seenKey)) return;
    sessionStorage.setItem(seenKey, "1");
    showModal({
      title: w.title || "Welcome",
      body: w.body || "",
      confirmLabel: "Get started",
      showCancel: false,
    });
  }

  function totalDepth() {
    // Heuristic: avg longest path; simple count of unique nodes for progress sizing
    return Math.max(3, Object.keys(state.content.nodes || {}).length);
  }

  function renderProgress() {
    const s = state.content.site || {};
    const p = $("progress");
    if (!s.showProgress) { p.classList.add("hidden"); return; }
    p.classList.remove("hidden");
    const step = state.historyStack.length;
    const total = totalDepth();
    const pct = Math.min(100, Math.round((step / total) * 100));
    $("progress-bar").style.width = pct + "%";
    $("progress-label").textContent = `Step ${step}`;
  }

  function renderNode(nodeId, opts = {}) {
    const node = state.content.nodes[nodeId];
    if (!node) {
      $("card-content").innerHTML = `<div class="text-red-300">Missing node: <code>${nodeId}</code></div>`;
      return;
    }
    if (!opts.skipHistory) state.historyStack.push(nodeId);
    persistHistory();

    const s = state.content.site || {};
    $("restart-btn").classList.toggle("hidden", !s.showRestart || state.historyStack.length <= 1);
    $("back-btn").classList.toggle("hidden", !s.showBack || state.historyStack.length <= 1);

    renderProgress();

    const isEnd = !!node.isEnd || !node.options || node.options.length === 0;

    const optionsHtml = (node.options || []).map((opt, idx) => `
      <button data-opt-idx="${idx}" class="option-btn w-full text-left px-5 py-4 rounded-2xl flex items-center justify-between gap-3 group">
        <span class="font-medium">${escapeHtml(opt.label || "(no label)")}</span>
        <span class="opacity-50 group-hover:opacity-100 transition">→</span>
      </button>
    `).join("");

    const warningHtml = node.warning && node.warning.trim()
      ? `<div class="warning rounded-xl p-4 text-sm mb-4 prose-custom">${renderMarkdown(node.warning)}</div>`
      : "";

    const endBadge = isEnd
      ? `<div class="inline-flex items-center gap-2 text-xs uppercase tracking-wider px-3 py-1 rounded-full" style="background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 30%, transparent), color-mix(in oklab, var(--accent) 30%, transparent));">Result</div>`
      : "";

    const html = `
      <div class="space-y-5">
        ${endBadge ? `<div>${endBadge}</div>` : ""}
        <h1 class="text-2xl md:text-3xl font-bold leading-tight">${escapeHtml(node.title || "")}</h1>
        ${warningHtml}
        <div class="prose-custom text-base opacity-95">${renderMarkdown(node.body || "")}</div>
        ${optionsHtml ? `<div class="grid gap-3 pt-2">${optionsHtml}</div>` : ""}
        ${isEnd ? `
          <div class="pt-3 flex flex-wrap gap-3">
            <button id="end-restart" class="btn-primary px-5 py-2.5 rounded-xl font-medium">Start over</button>
            ${state.historyStack.length > 1 ? `<button id="end-back" class="option-btn px-5 py-2.5 rounded-xl">Go back</button>` : ""}
          </div>` : ""}
      </div>
    `;

    const card = $("card-content");
    card.classList.remove("fade-active");
    card.classList.add("fade-enter");
    card.innerHTML = html;
    requestAnimationFrame(() => {
      card.classList.add("fade-active");
    });

    // wire options
    card.querySelectorAll("[data-opt-idx]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-opt-idx"), 10);
        const opt = node.options[idx];
        if (!opt) return;
        const goNext = () => {
          if (opt.nextNodeId && state.content.nodes[opt.nextNodeId]) {
            renderNode(opt.nextNodeId);
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            showModal({ title: "Configuration error", body: `Option points to missing node: \`${opt.nextNodeId}\``, showCancel: false });
          }
        };
        if (opt.confirmPopup && (opt.confirmPopup.title || opt.confirmPopup.body)) {
          showModal({
            title: opt.confirmPopup.title || "Are you sure?",
            body: opt.confirmPopup.body || "",
            confirmLabel: opt.confirmPopup.confirmLabel || "Continue",
            cancelLabel: opt.confirmPopup.cancelLabel || "Cancel",
            onConfirm: goNext,
          });
        } else {
          goNext();
        }
      });
    });

    if (isEnd) {
      const r = document.getElementById("end-restart");
      const b = document.getElementById("end-back");
      if (r) r.addEventListener("click", restart);
      if (b) b.addEventListener("click", goBack);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function restart() {
    state.historyStack = [];
    persistHistory();
    renderNode(state.content.startNodeId);
  }

  function goBack() {
    if (state.historyStack.length <= 1) return;
    state.historyStack.pop(); // current
    const prev = state.historyStack.pop(); // go to previous
    persistHistory();
    if (prev) renderNode(prev);
  }

  function persistHistory() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state.historyStack)); } catch {}
  }

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) state.historyStack = JSON.parse(raw) || [];
    } catch { state.historyStack = []; }
  }

  // ---------- bootstrap ----------
  async function loadContent() {
    // Cache-bust to ensure latest after admin commits
    const url = `content.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load content.json");
    return res.json();
  }

  async function init() {
    try {
      state.content = await loadContent();
    } catch (e) {
      $("card-content").innerHTML = `<div class="text-red-300">Couldn't load <code>content.json</code>. ${escapeHtml(e.message)}</div>`;
      return;
    }
    applyTheme(state.content.site && state.content.site.theme);
    renderSiteChrome();
    loadHistory();

    // resume if session has history and node still exists
    const last = state.historyStack[state.historyStack.length - 1];
    if (last && state.content.nodes[last]) {
      // re-render last node without pushing again
      const tmp = state.historyStack.slice(0, -1);
      state.historyStack = tmp;
      renderNode(last);
    } else {
      state.historyStack = [];
      renderNode(state.content.startNodeId);
    }
    maybeShowWelcome();

    $("restart-btn").addEventListener("click", restart);
    $("back-btn").addEventListener("click", goBack);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
