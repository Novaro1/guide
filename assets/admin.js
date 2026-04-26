// Admin: edits content.json directly via the GitHub Contents API.
(function () {
  const LS_KEY = "guide-admin-creds-v1";   // localStorage when "remember" is checked
  const SS_KEY = "guide-admin-creds-v1";   // sessionStorage otherwise
  const FILE_PATH = "content.json";

  let creds = null;       // {owner, repo, branch, token, remember}
  let content = null;     // current edited content
  let contentSha = null;  // sha of the current content.json on GitHub
  let dirty = false;

  // ---------- utilities ----------
  function $(id) { return document.getElementById(id); }

  function toast(msg, kind = "ok", ms = 3000) {
    const c = $("toast-container");
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function confirmModal({ title, body, confirmLabel = "Confirm", danger = true }) {
    return new Promise(resolve => {
      const m = $("modal");
      $("modal-title").textContent = title;
      $("modal-body").textContent = body;
      const c = $("modal-confirm");
      c.textContent = confirmLabel;
      c.className = `btn ${danger ? "btn-danger" : "btn-primary"} text-sm`;
      m.classList.remove("hidden");
      const close = (val) => { m.classList.add("hidden"); resolve(val); };
      $("modal-cancel").onclick = () => close(false);
      c.onclick = () => close(true);
    });
  }

  function uid(prefix = "id") {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function setDirty(v) {
    dirty = v;
    $("dirty-indicator").classList.toggle("hidden", !v);
  }

  function setByPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  function getByPath(obj, path) {
    return path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
  }

  // ---------- credentials ----------
  function loadCreds() {
    const raw = localStorage.getItem(LS_KEY) || sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function saveCreds(c) {
    const json = JSON.stringify(c);
    if (c.remember) {
      localStorage.setItem(LS_KEY, json);
      sessionStorage.removeItem(SS_KEY);
    } else {
      sessionStorage.setItem(SS_KEY, json);
      localStorage.removeItem(LS_KEY);
    }
  }
  function clearCreds() {
    localStorage.removeItem(LS_KEY);
    sessionStorage.removeItem(SS_KEY);
  }

  // ---------- GitHub API ----------
  async function gh(path, opts = {}) {
    const url = `https://api.github.com${path}`;
    const headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${creds.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    }, opts.headers || {});
    if (opts.body && typeof opts.body !== "string") {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      let msg = `GitHub API error ${res.status}`;
      try { const j = await res.json(); if (j && j.message) msg = j.message; } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function fetchContent() {
    const path = `/repos/${creds.owner}/${creds.repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(creds.branch)}`;
    const data = await gh(path);
    contentSha = data.sha;
    const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
    return JSON.parse(decoded);
  }

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function commitContent(message = "Update content via admin") {
    const path = `/repos/${creds.owner}/${creds.repo}/contents/${FILE_PATH}`;
    const body = {
      message,
      content: utf8ToBase64(JSON.stringify(content, null, 2)),
      branch: creds.branch,
    };
    if (contentSha) body.sha = contentSha;
    const res = await gh(path, { method: "PUT", body });
    contentSha = res.content.sha;
    return res;
  }

  async function uploadAsset(file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `assets/uploads/${Date.now()}-${safeName}`;
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const apiPath = `/repos/${creds.owner}/${creds.repo}/contents/${path}`;
    await gh(apiPath, {
      method: "PUT",
      body: { message: `Upload ${safeName}`, content: b64, branch: creds.branch },
    });
    // raw URL for display
    return `https://raw.githubusercontent.com/${creds.owner}/${creds.repo}/${creds.branch}/${path}`;
  }

  // ---------- bind site fields ----------
  function bindSiteFields() {
    document.querySelectorAll("[data-bind]").forEach(el => {
      const path = el.getAttribute("data-bind");
      const cur = getByPath(content, path);
      if (el.type === "checkbox") {
        el.checked = !!cur;
      } else if (el.type === "color") {
        el.value = cur || "#000000";
      } else {
        el.value = cur == null ? "" : cur;
      }
      el.addEventListener("input", () => {
        const v = el.type === "checkbox" ? el.checked : el.value;
        setByPath(content, path, v);
        setDirty(true);
      });
    });
  }

  // ---------- nodes UI ----------
  function refreshStartNodeSelect() {
    const sel = $("start-node-select");
    const ids = Object.keys(content.nodes);
    sel.innerHTML = ids.map(id => `<option value="${id}" ${id === content.startNodeId ? "selected" : ""}>${escapeHtml(content.nodes[id].title || id)} (${id})</option>`).join("");
    sel.onchange = () => { content.startNodeId = sel.value; setDirty(true); };
  }

  function nodeOptionsHtml(nodeId) {
    const ids = Object.keys(content.nodes).filter(id => id !== nodeId);
    return ids.map(id => `<option value="${id}">${escapeHtml(content.nodes[id].title || id)} (${id})</option>`).join("");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderNodes() {
    const list = $("nodes-list");
    list.innerHTML = "";
    const ids = Object.keys(content.nodes);
    ids.forEach((id, idx) => {
      const node = content.nodes[id];
      const isStart = id === content.startNodeId;
      const card = document.createElement("div");
      card.className = "glass node-card rounded-xl p-4 border border-white/10";
      card.dataset.nodeId = id;
      card.draggable = true;
      card.innerHTML = `
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="drag-handle opacity-50 hover:opacity-100" title="Drag to reorder">⋮⋮</span>
          <span class="chip">${idx + 1}</span>
          ${isStart ? `<span class="chip" style="background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 30%, transparent), color-mix(in oklab, var(--accent) 30%, transparent)); color: white;">Start</span>` : ""}
          <code class="opacity-70">${escapeHtml(id)}</code>
          ${node.isEnd ? `<span class="chip">End</span>` : ""}
          <div class="ml-auto flex gap-2">
            <button class="btn btn-ghost text-xs js-duplicate">Duplicate</button>
            <button class="btn btn-danger text-xs js-delete">Delete</button>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-3">
          <div><label>Step ID (must be unique)</label><input class="js-id" value="${escapeHtml(id)}" /></div>
          <div><label>Title</label><input class="js-title" value="${escapeHtml(node.title || "")}" /></div>
        </div>

        <div class="mt-3"><label>Body (markdown — supports images, links, code blocks; YouTube/Vimeo URLs on their own line auto-embed)</label>
          <textarea class="js-body" rows="5">${escapeHtml(node.body || "")}</textarea>
        </div>

        <div class="mt-3"><label>Warning (optional, shown in a yellow box)</label>
          <textarea class="js-warning" rows="2">${escapeHtml(node.warning || "")}</textarea>
        </div>

        <div class="mt-3 flex gap-4 items-center text-sm">
          <label class="flex items-center gap-2"><input type="checkbox" class="js-isEnd w-4 h-4 accent-indigo-500" style="width:auto;" ${node.isEnd ? "checked" : ""} /> This is an end / result step</label>
        </div>

        <div class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <label style="margin-bottom:0;">Options (each is a button users click to go to another step)</label>
            <button class="btn btn-ghost text-xs js-add-option">+ Add option</button>
          </div>
          <div class="js-options space-y-2"></div>
        </div>
      `;
      list.appendChild(card);

      // wire fields
      const titleEl = card.querySelector(".js-title");
      const bodyEl = card.querySelector(".js-body");
      const warnEl = card.querySelector(".js-warning");
      const idEl = card.querySelector(".js-id");
      const isEndEl = card.querySelector(".js-isEnd");

      titleEl.oninput = () => { node.title = titleEl.value; setDirty(true); refreshStartNodeSelect(); };
      bodyEl.oninput = () => { node.body = bodyEl.value; setDirty(true); };
      warnEl.oninput = () => { node.warning = warnEl.value; setDirty(true); };
      isEndEl.onchange = () => { node.isEnd = isEndEl.checked; setDirty(true); };
      idEl.onchange = () => {
        const newId = idEl.value.trim();
        if (!newId || newId === id) { idEl.value = id; return; }
        if (content.nodes[newId]) { toast(`Step "${newId}" already exists`, "err"); idEl.value = id; return; }
        // rename: move node, update startNodeId, update any options pointing here
        content.nodes[newId] = Object.assign({}, content.nodes[id], { id: newId });
        delete content.nodes[id];
        if (content.startNodeId === id) content.startNodeId = newId;
        Object.values(content.nodes).forEach(n => (n.options || []).forEach(o => { if (o.nextNodeId === id) o.nextNodeId = newId; }));
        setDirty(true);
        renderNodes();
        refreshStartNodeSelect();
      };

      card.querySelector(".js-duplicate").onclick = () => {
        const newId = uid("step");
        content.nodes[newId] = JSON.parse(JSON.stringify(node));
        content.nodes[newId].id = newId;
        content.nodes[newId].title = (node.title || "Step") + " (copy)";
        setDirty(true); renderNodes(); refreshStartNodeSelect();
      };

      card.querySelector(".js-delete").onclick = async () => {
        if (Object.keys(content.nodes).length <= 1) { toast("Need at least one step", "err"); return; }
        const ok = await confirmModal({ title: "Delete step?", body: `Delete "${node.title || id}"? Any options pointing to it will become broken (you can re-link them).` });
        if (!ok) return;
        delete content.nodes[id];
        if (content.startNodeId === id) content.startNodeId = Object.keys(content.nodes)[0];
        setDirty(true); renderNodes(); refreshStartNodeSelect();
      };

      // options
      const optsWrap = card.querySelector(".js-options");
      function renderOpts() {
        optsWrap.innerHTML = "";
        (node.options || []).forEach((opt, oi) => {
          const row = document.createElement("div");
          row.className = "rounded-lg p-3 border border-white/10";
          row.style.background = "rgba(255,255,255,0.02)";
          row.innerHTML = `
            <div class="grid md:grid-cols-12 gap-2">
              <div class="md:col-span-6"><label>Button label</label><input class="js-opt-label" value="${escapeHtml(opt.label || "")}" /></div>
              <div class="md:col-span-5"><label>Goes to step</label><select class="js-opt-next">${nodeOptionsHtml(id)}</select></div>
              <div class="md:col-span-1 flex items-end gap-1">
                <button class="btn btn-ghost text-xs js-opt-up" title="Move up">↑</button>
                <button class="btn btn-ghost text-xs js-opt-down" title="Move down">↓</button>
                <button class="btn btn-danger text-xs js-opt-del" title="Delete">×</button>
              </div>
            </div>
            <details class="mt-2">
              <summary class="text-xs opacity-70 hover:opacity-100">Confirmation popup before continuing (optional)</summary>
              <div class="grid md:grid-cols-2 gap-2 mt-2">
                <div><label>Popup title</label><input class="js-popup-title" value="${escapeHtml(opt.confirmPopup ? opt.confirmPopup.title || "" : "")}" /></div>
                <div><label>Confirm button label</label><input class="js-popup-confirm" value="${escapeHtml(opt.confirmPopup ? opt.confirmPopup.confirmLabel || "" : "")}" placeholder="Continue" /></div>
                <div class="md:col-span-2"><label>Popup body (markdown)</label><textarea class="js-popup-body" rows="2">${escapeHtml(opt.confirmPopup ? opt.confirmPopup.body || "" : "")}</textarea></div>
              </div>
            </details>
          `;
          optsWrap.appendChild(row);

          const sel = row.querySelector(".js-opt-next");
          sel.value = opt.nextNodeId || "";
          sel.onchange = () => { opt.nextNodeId = sel.value; setDirty(true); };

          row.querySelector(".js-opt-label").oninput = e => { opt.label = e.target.value; setDirty(true); };
          row.querySelector(".js-popup-title").oninput = e => { opt.confirmPopup = opt.confirmPopup || {}; opt.confirmPopup.title = e.target.value; cleanPopup(opt); setDirty(true); };
          row.querySelector(".js-popup-body").oninput = e => { opt.confirmPopup = opt.confirmPopup || {}; opt.confirmPopup.body = e.target.value; cleanPopup(opt); setDirty(true); };
          row.querySelector(".js-popup-confirm").oninput = e => { opt.confirmPopup = opt.confirmPopup || {}; opt.confirmPopup.confirmLabel = e.target.value; cleanPopup(opt); setDirty(true); };

          row.querySelector(".js-opt-up").onclick = () => { if (oi > 0) { const a = node.options.splice(oi, 1)[0]; node.options.splice(oi - 1, 0, a); setDirty(true); renderOpts(); } };
          row.querySelector(".js-opt-down").onclick = () => { if (oi < node.options.length - 1) { const a = node.options.splice(oi, 1)[0]; node.options.splice(oi + 1, 0, a); setDirty(true); renderOpts(); } };
          row.querySelector(".js-opt-del").onclick = () => { node.options.splice(oi, 1); setDirty(true); renderOpts(); };
        });
      }
      function cleanPopup(opt) {
        if (!opt.confirmPopup) return;
        const { title, body, confirmLabel } = opt.confirmPopup;
        if (!title && !body && !confirmLabel) opt.confirmPopup = null;
      }
      renderOpts();

      card.querySelector(".js-add-option").onclick = () => {
        if (!node.options) node.options = [];
        const otherIds = Object.keys(content.nodes).filter(x => x !== id);
        node.options.push({ id: uid("opt"), label: "New option", nextNodeId: otherIds[0] || id, confirmPopup: null });
        setDirty(true); renderOpts();
      };

      // drag-reorder cards
      card.addEventListener("dragstart", e => { card.classList.add("dragging"); e.dataTransfer.setData("text/plain", id); });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dragover", e => { e.preventDefault(); card.classList.add("drag-over"); });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", e => {
        e.preventDefault();
        card.classList.remove("drag-over");
        const fromId = e.dataTransfer.getData("text/plain");
        if (!fromId || fromId === id) return;
        const ids2 = Object.keys(content.nodes);
        const fromIdx = ids2.indexOf(fromId);
        const toIdx = ids2.indexOf(id);
        const reordered = ids2.slice();
        reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, fromId);
        const newNodes = {};
        reordered.forEach(k => newNodes[k] = content.nodes[k]);
        content.nodes = newNodes;
        setDirty(true); renderNodes();
      });
    });
  }

  // ---------- save ----------
  async function save() {
    if (!validate()) return;
    const btn = $("save-btn");
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await commitContent("Update guide content via admin");
      setDirty(false);
      toast("Saved. GitHub Pages will rebuild in ~30s.", "ok");
    } catch (e) {
      toast(`Save failed: ${e.message}`, "err", 6000);
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  function validate() {
    if (!content.startNodeId || !content.nodes[content.startNodeId]) {
      toast("Start step is missing or invalid", "err"); return false;
    }
    let bad = [];
    Object.entries(content.nodes).forEach(([id, n]) => {
      (n.options || []).forEach(o => {
        if (!o.nextNodeId || !content.nodes[o.nextNodeId]) bad.push(`"${n.title || id}" → "${o.label}"`);
      });
    });
    if (bad.length) {
      toast(`Some options point to missing steps: ${bad.slice(0, 2).join(", ")}${bad.length > 2 ? "…" : ""}`, "err", 6000);
      return false;
    }
    return true;
  }

  // ---------- bootstrap ----------
  async function start() {
    $("login").classList.add("hidden");
    $("editor").classList.remove("hidden");
    $("repo-label").textContent = `${creds.owner}/${creds.repo} · ${creds.branch}`;
    try {
      content = await fetchContent();
    } catch (e) {
      toast(`Couldn't load content.json: ${e.message}`, "err", 6000);
      return;
    }
    bindSiteFields();
    refreshStartNodeSelect();
    renderNodes();
    setDirty(false);

    $("add-node-btn").onclick = () => {
      const id = uid("step");
      const otherIds = Object.keys(content.nodes);
      content.nodes[id] = {
        id,
        title: "New step",
        body: "Edit this step.",
        warning: "",
        options: otherIds.length ? [{ id: uid("opt"), label: "Continue", nextNodeId: otherIds[0], confirmPopup: null }] : [],
        isEnd: false,
      };
      setDirty(true);
      renderNodes();
      refreshStartNodeSelect();
    };

    $("save-btn").onclick = save;
    $("logout-btn").onclick = async () => {
      if (dirty) {
        const ok = await confirmModal({ title: "Discard unsaved changes?", body: "You have unsaved edits. Sign out anyway?", confirmLabel: "Sign out" });
        if (!ok) return;
      }
      clearCreds();
      location.reload();
    };

    $("upload-btn").onclick = async () => {
      const f = $("image-input").files[0];
      if (!f) { toast("Pick a file first", "err"); return; }
      $("upload-status").textContent = "Uploading…";
      try {
        const url = await uploadAsset(f);
        const md = `![${f.name}](${url})`;
        const out = $("upload-result");
        out.classList.remove("hidden");
        out.value = md;
        out.select();
        $("upload-status").textContent = "Uploaded.";
        toast("Uploaded — markdown copied below", "ok");
      } catch (e) {
        $("upload-status").textContent = "";
        toast(`Upload failed: ${e.message}`, "err", 6000);
      }
    };

    window.addEventListener("beforeunload", e => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  async function tryLogin(c) {
    creds = c;
    // verify token + access
    try {
      await gh(`/repos/${c.owner}/${c.repo}`);
      saveCreds(c);
      await start();
    } catch (e) {
      $("login-error").textContent = `Couldn't access repo: ${e.message}`;
      $("login-error").classList.remove("hidden");
      creds = null;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const stored = loadCreds();
    if (stored) {
      // prefill but still verify
      tryLogin(stored);
      return;
    }
    $("login-btn").onclick = () => {
      const repoStr = $("repo-input").value.trim();
      const branch = $("branch-input").value.trim() || "main";
      const token = $("token-input").value.trim();
      const remember = $("remember").checked;
      if (!repoStr.includes("/")) { $("login-error").textContent = "Repository must be in the form owner/repo"; $("login-error").classList.remove("hidden"); return; }
      if (!token.startsWith("github_pat_") && !token.startsWith("ghp_")) { $("login-error").textContent = "Token doesn't look like a GitHub PAT"; $("login-error").classList.remove("hidden"); return; }
      const [owner, repo] = repoStr.split("/");
      tryLogin({ owner, repo, branch, token, remember });
    };
  });
})();
