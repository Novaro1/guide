// Inline edit overlay: WYSIWYG-ish editing on the live site.
(function () {
  const $ = (id) => document.getElementById(id);
  let dirty = false;
  let editing = false;

  function setDirty(v) {
    dirty = v;
    const ind = $("edit-dirty");
    if (ind) ind.classList.toggle("hidden", !v);
    const sb = $("edit-save");
    if (sb) sb.classList.toggle("opacity-50", !v);
  }

  function uid(prefix = "id") { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }

  function toast(msg, kind = "ok", ms = 3000) {
    let c = $("edit-toast-container");
    if (!c) {
      c = document.createElement("div");
      c.id = "edit-toast-container";
      document.body.appendChild(c);
    }
    const el = document.createElement("div");
    el.className = `edit-toast ${kind}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // ---------- styles ----------
  function injectStyles() {
    if ($("edit-styles")) return;
    const s = document.createElement("style");
    s.id = "edit-styles";
    s.textContent = `
      body.edit-mode { padding-top: 56px; }
      #edit-toolbar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 60;
        display: flex; align-items: center; gap: 8px; padding: 8px 12px;
        background: color-mix(in oklab, var(--surface) 85%, transparent);
        backdrop-filter: blur(14px) saturate(120%);
        border-bottom: 1px solid color-mix(in oklab, white 10%, transparent);
      }
      #edit-toolbar .et-btn {
        padding: 6px 12px; border-radius: 9px; font-size: 13px; font-weight: 500;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        color: var(--text); cursor: pointer; transition: background .15s ease, transform .1s ease;
        display: inline-flex; align-items: center; gap: 6px;
      }
      #edit-toolbar .et-btn:hover { background: rgba(255,255,255,0.08); }
      #edit-toolbar .et-btn:active { transform: translateY(1px); }
      #edit-toolbar .et-btn.primary {
        background: linear-gradient(135deg, var(--primary), var(--accent));
        border-color: transparent; color: white;
        box-shadow: 0 6px 20px -8px color-mix(in oklab, var(--primary) 70%, transparent);
      }
      #edit-toolbar .et-btn.danger { background: rgba(220,38,38,0.15); border-color: rgba(220,38,38,0.4); color: #fecaca; }
      #edit-toolbar .et-chip { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: rgba(245,158,11,.2); border:1px solid rgba(245,158,11,.4); color:#fde68a; }
      #edit-toolbar .et-spacer { flex: 1; }
      #edit-toolbar .et-brand { font-size: 13px; font-weight: 600; opacity: .9; display: flex; align-items: center; gap: 8px; }
      #edit-toolbar .et-brand .dot { width: 8px; height: 8px; border-radius: 999px; background: linear-gradient(135deg, var(--primary), var(--accent)); }
      .et-menu { position: relative; }
      .et-menu-pop {
        position: absolute; top: calc(100% + 6px); right: 0; min-width: 220px;
        background: color-mix(in oklab, var(--surface) 96%, black); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px; padding: 6px; z-index: 70; box-shadow: 0 12px 40px -10px rgba(0,0,0,0.5);
        max-height: 70vh; overflow: auto;
      }
      .et-menu-pop button {
        width: 100%; text-align: left; padding: 8px 10px; border-radius: 8px; font-size: 13px;
        color: var(--text); background: transparent; border: 0; cursor: pointer; display: flex; align-items: center; gap: 8px;
      }
      .et-menu-pop button:hover { background: rgba(255,255,255,0.06); }
      .et-menu-pop .et-menu-current { background: color-mix(in oklab, var(--primary) 25%, transparent); }
      .et-menu-pop .et-menu-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 6px 4px; }

      /* Editable card field styling */
      .ed-field { position: relative; }
      .ed-input, .ed-textarea {
        width: 100%;
        background: color-mix(in oklab, var(--surface) 80%, black 5%);
        color: var(--text);
        border: 1px solid color-mix(in oklab, white 12%, transparent);
        border-radius: 10px;
        padding: 8px 12px;
        font-size: inherit; font-family: inherit;
      }
      .ed-input:focus, .ed-textarea:focus {
        outline: none;
        border-color: color-mix(in oklab, var(--primary) 80%, transparent);
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent);
      }
      .ed-textarea { resize: vertical; min-height: 90px; line-height: 1.5; }
      .ed-title-input {
        font-size: 1.65rem; font-weight: 700; line-height: 1.2; padding: 6px 10px;
      }
      @media (min-width: 768px) { .ed-title-input { font-size: 1.85rem; } }
      .ed-label { font-size: 11px; opacity: .7; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; display: block; }
      .ed-row { display: grid; gap: 10px; }
      @media (min-width: 768px) { .ed-row.cols-2 { grid-template-columns: 1fr 1fr; } }
      .ed-preview {
        border: 1px dashed rgba(255,255,255,0.15); border-radius: 10px; padding: 12px;
        background: rgba(255,255,255,0.02);
      }
      .ed-preview-label {
        font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
        opacity: .55; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;
      }
      .ed-option {
        background: color-mix(in oklab, var(--surface) 80%, white 2%);
        border: 1px solid color-mix(in oklab, white 10%, transparent);
        border-radius: 16px; padding: 12px;
      }
      .ed-option-row { display: flex; align-items: center; gap: 8px; }
      .ed-option-label-input {
        flex: 1; font-weight: 500; font-size: 1rem;
        background: transparent; border: 1px dashed transparent; border-radius: 8px;
        padding: 8px 10px; color: var(--text);
      }
      .ed-option-label-input:hover { border-color: rgba(255,255,255,0.1); }
      .ed-option-label-input:focus {
        outline: none; border-style: solid;
        border-color: color-mix(in oklab, var(--primary) 80%, transparent);
        background: color-mix(in oklab, var(--surface) 70%, black 8%);
      }
      .ed-option-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); }
      .ed-option-controls .ed-mini-btn { font-size: 12px; padding: 4px 10px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: var(--text); cursor: pointer; }
      .ed-option-controls .ed-mini-btn:hover { background: rgba(255,255,255,0.08); }
      .ed-option-controls .ed-mini-btn.danger { background: rgba(220,38,38,0.1); border-color: rgba(220,38,38,0.3); color: #fecaca; }
      .ed-option-controls .ed-mini-btn.popup-on { background: color-mix(in oklab, var(--accent) 25%, transparent); border-color: color-mix(in oklab, var(--accent) 60%, transparent); }
      .ed-target-select {
        font-size: 12px; padding: 4px 8px; border-radius: 8px;
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: var(--text);
      }
      .ed-popup-editor {
        margin-top: 10px; padding: 10px; border-radius: 10px;
        background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06);
        display: grid; gap: 8px;
      }
      .ed-add-option, .ed-add-step {
        width: 100%; padding: 12px; border-radius: 14px;
        background: rgba(255,255,255,0.03); border: 2px dashed rgba(255,255,255,0.15);
        color: var(--text); cursor: pointer; font-size: 14px; opacity: .8;
        transition: opacity .15s ease, border-color .15s ease;
      }
      .ed-add-option:hover, .ed-add-step:hover { opacity: 1; border-color: color-mix(in oklab, var(--primary) 70%, transparent); }

      /* Drawer */
      #edit-drawer {
        position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100vw); z-index: 80;
        background: color-mix(in oklab, var(--surface) 96%, black);
        border-left: 1px solid rgba(255,255,255,0.12); padding: 18px;
        overflow-y: auto; transform: translateX(100%); transition: transform .25s ease;
        box-shadow: -10px 0 40px -10px rgba(0,0,0,0.5);
      }
      #edit-drawer.open { transform: translateX(0); }
      #edit-drawer h3 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
      #edit-drawer details { margin-top: 14px; }
      #edit-drawer summary { cursor: pointer; font-size: 13px; opacity: .85; padding: 6px 0; }
      #edit-drawer summary::-webkit-details-marker { display: none; }
      #edit-drawer summary::before { content: "▸ "; opacity: .6; }
      #edit-drawer details[open] summary::before { content: "▾ "; opacity: .6; }
      #edit-drawer .ed-row { margin-top: 8px; }
      #edit-drawer-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
        z-index: 75; opacity: 0; pointer-events: none; transition: opacity .25s ease;
      }
      #edit-drawer-backdrop.open { opacity: 1; pointer-events: auto; }

      /* Sign-in modal */
      #signin-modal {
        position: fixed; inset: 0; z-index: 100; display: none;
        align-items: center; justify-content: center; padding: 20px;
        background: rgba(5, 8, 16, 0.7); backdrop-filter: blur(8px);
      }
      #signin-modal.open { display: flex; }
      #signin-modal .panel { max-width: 460px; width: 100%; background: color-mix(in oklab, var(--surface) 90%, transparent); border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; padding: 22px; }
      #signin-modal label { font-size: 12px; opacity: .7; display: block; margin-bottom: 4px; }
      #signin-modal input { width: 100%; background: color-mix(in oklab, var(--surface) 80%, black 5%); color: var(--text); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 9px 12px; font-size: 14px; font-family: inherit; }
      #signin-modal input:focus { outline: none; border-color: color-mix(in oklab, var(--primary) 80%, transparent); box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 25%, transparent); }

      /* Toasts */
      #edit-toast-container { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 110; display: flex; flex-direction: column; gap: 8px; align-items: center; }
      .edit-toast { padding: 10px 16px; border-radius: 10px; font-size: 14px; }
      .edit-toast.ok { background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.5); color: #bbf7d0; }
      .edit-toast.err { background: rgba(239,68,68,.2); border: 1px solid rgba(239,68,68,.5); color: #fecaca; }

      /* Floating sign-in / edit button (only visible when user has Cmd+E or hash) */
      #edit-fab {
        position: fixed; bottom: 20px; right: 20px; z-index: 50;
        padding: 11px 16px; border-radius: 14px; color: white;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        box-shadow: 0 10px 30px -8px color-mix(in oklab, var(--primary) 70%, transparent);
        font-size: 14px; font-weight: 500; cursor: pointer; border: 0;
        display: inline-flex; align-items: center; gap: 8px;
      }
      #edit-fab:hover { transform: translateY(-1px); }

      /* End-of-flow editing affordance */
      .ed-end-actions {
        display: flex; gap: 8px; padding: 10px; border-radius: 12px;
        background: rgba(99,102,241,0.08); border: 1px dashed rgba(99,102,241,0.3);
        font-size: 13px; align-items: center; flex-wrap: wrap;
      }
    `;
    document.head.appendChild(s);
  }

  // ---------- toolbar ----------
  function buildToolbar() {
    if ($("edit-toolbar")) return;
    const tb = document.createElement("div");
    tb.id = "edit-toolbar";
    tb.innerHTML = `
      <div class="et-brand"><span class="dot"></span><span>Editing</span></div>
      <span id="edit-dirty" class="et-chip hidden">Unsaved</span>
      <div class="et-spacer"></div>
      <div class="et-menu">
        <button class="et-btn" id="edit-steps-btn" title="Switch step">Steps ▾</button>
        <div class="et-menu-pop hidden" id="edit-steps-pop"></div>
      </div>
      <button class="et-btn" id="edit-add-step" title="Add new step">+ Step</button>
      <button class="et-btn" id="edit-settings" title="Site settings">⚙ Settings</button>
      <button class="et-btn" id="edit-preview" title="Preview as visitor">👁 Preview</button>
      <button class="et-btn primary" id="edit-save" title="Save & publish">💾 Save</button>
      <div class="et-menu">
        <button class="et-btn" id="edit-more" title="More">⋯</button>
        <div class="et-menu-pop hidden" id="edit-more-pop">
          <button id="em-upload">📷 Upload image</button>
          <button id="em-duplicate">⎘ Duplicate this step</button>
          <button id="em-delete-step" class="text-red-300">🗑 Delete this step</button>
          <div class="et-menu-divider"></div>
          <button id="em-discard">↺ Discard unsaved changes</button>
          <button id="em-signout">Sign out</button>
        </div>
      </div>
    `;
    document.body.appendChild(tb);

    $("edit-save").onclick = save;
    $("edit-add-step").onclick = addStep;
    $("edit-preview").onclick = togglePreview;
    $("edit-settings").onclick = openDrawer;
    $("edit-steps-btn").onclick = (e) => { e.stopPropagation(); toggleMenu("edit-steps-pop", refreshStepsMenu); };
    $("edit-more").onclick = (e) => { e.stopPropagation(); toggleMenu("edit-more-pop"); };

    $("em-upload").onclick = () => { closeMenus(); openImageUpload(); };
    $("em-duplicate").onclick = () => { closeMenus(); duplicateCurrent(); };
    $("em-delete-step").onclick = () => { closeMenus(); deleteCurrent(); };
    $("em-discard").onclick = () => { closeMenus(); discardChanges(); };
    $("em-signout").onclick = () => { closeMenus(); signOut(); };

    document.addEventListener("click", () => closeMenus());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeMenus(); closeDrawer(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); }
    });
  }

  function toggleMenu(id, beforeShow) {
    const all = document.querySelectorAll(".et-menu-pop");
    all.forEach(p => { if (p.id !== id) p.classList.add("hidden"); });
    const el = $(id);
    if (!el) return;
    const show = el.classList.contains("hidden");
    if (show && beforeShow) beforeShow();
    el.classList.toggle("hidden");
  }
  function closeMenus() { document.querySelectorAll(".et-menu-pop").forEach(p => p.classList.add("hidden")); }

  function refreshStepsMenu() {
    const pop = $("edit-steps-pop");
    const c = Guide.state.content;
    const cur = currentNodeId();
    const items = Object.keys(c.nodes).map(id => {
      const n = c.nodes[id];
      const isStart = id === c.startNodeId;
      const isCur = id === cur;
      return `<button data-step-id="${id}" class="${isCur ? "et-menu-current" : ""}">
        ${isStart ? "★ " : ""}${escapeHtml(n.title || id)} <span class="opacity-50 ml-auto" style="font-size:11px;">${escapeHtml(id)}</span>
      </button>`;
    }).join("");
    pop.innerHTML = items;
    pop.querySelectorAll("[data-step-id]").forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); navigateToStep(b.dataset.stepId); closeMenus(); };
    });
  }

  function escapeHtml(s) { return Guide.escapeHtml(s); }

  // ---------- node access ----------
  function currentNodeId() {
    const h = Guide.state.historyStack;
    return h.length ? h[h.length - 1] : Guide.state.content.startNodeId;
  }
  function currentNode() { return Guide.state.content.nodes[currentNodeId()]; }

  function navigateToStep(id) {
    Guide.state.historyStack = []; // editing nav resets history
    Guide.renderNode(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- edit renderer ----------
  function editRenderer(node) {
    const card = $("card-content");
    const c = Guide.state.content;
    const otherIds = Object.keys(c.nodes);

    card.classList.remove("fade-active");
    card.classList.add("fade-enter");
    card.innerHTML = `
      <div class="space-y-5">
        <div class="flex items-center gap-2 flex-wrap text-xs opacity-70">
          <span>Step ID:</span>
          <input class="ed-input" id="ed-id" value="${escapeHtml(node.id || currentNodeId())}" style="font-family: ui-monospace, monospace; font-size: 12px; width: auto; min-width: 160px;" />
          ${currentNodeId() === c.startNodeId ? `<span class="et-chip" style="background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 25%, transparent), color-mix(in oklab, var(--accent) 25%, transparent)); color: white; border-color: transparent;">Start step</span>` : `<button class="ed-mini-btn" id="ed-make-start" style="font-size: 11px;">Make this the start step</button>`}
          <label class="flex items-center gap-1 ml-auto"><input type="checkbox" id="ed-isend" ${node.isEnd ? "checked" : ""} class="accent-indigo-500" /> End / result step</label>
        </div>

        <div class="ed-field">
          <input class="ed-input ed-title-input" id="ed-title" value="${escapeHtml(node.title || "")}" placeholder="Step title…" />
        </div>

        <div class="ed-field">
          <label class="ed-label">Warning (optional, shown in a yellow box)</label>
          <textarea class="ed-textarea" id="ed-warning" rows="2" placeholder="Leave empty for no warning">${escapeHtml(node.warning || "")}</textarea>
          <div class="ed-preview" id="ed-warning-preview" style="margin-top:8px; ${node.warning && node.warning.trim() ? "" : "display:none;"}"></div>
        </div>

        <div class="ed-field">
          <label class="ed-label">Body (markdown — supports images, links, code blocks; YouTube/Vimeo URLs auto-embed)</label>
          <div class="ed-row cols-2">
            <textarea class="ed-textarea" id="ed-body" rows="8">${escapeHtml(node.body || "")}</textarea>
            <div>
              <div class="ed-preview-label">↳ live preview (what visitors see)</div>
              <div class="ed-preview prose-custom" id="ed-body-preview"></div>
            </div>
          </div>
        </div>

        <div class="ed-field">
          <label class="ed-label">Options (clickable buttons — each leads to another step)</label>
          <div id="ed-options" class="space-y-3"></div>
          <button class="ed-add-option mt-3" id="ed-add-option">+ Add option</button>
          ${(!node.options || node.options.length === 0) ? `<p class="text-xs opacity-60 mt-2">A step with no options is treated as an end / result step.</p>` : ""}
        </div>
      </div>
    `;
    requestAnimationFrame(() => card.classList.add("fade-active"));

    // Wire title
    $("ed-title").addEventListener("input", (e) => {
      node.title = e.target.value;
      $("site-title").textContent = c.site.title || "Guide";
      setDirty(true);
    });
    $("ed-title").addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });

    // ID rename
    $("ed-id").addEventListener("change", (e) => {
      const newId = e.target.value.trim();
      const oldId = currentNodeId();
      if (!newId || newId === oldId) { e.target.value = oldId; return; }
      if (c.nodes[newId]) { toast(`Step "${newId}" already exists`, "err"); e.target.value = oldId; return; }
      c.nodes[newId] = Object.assign({}, c.nodes[oldId], { id: newId });
      delete c.nodes[oldId];
      if (c.startNodeId === oldId) c.startNodeId = newId;
      Object.values(c.nodes).forEach(n => (n.options || []).forEach(o => { if (o.nextNodeId === oldId) o.nextNodeId = newId; }));
      Guide.state.historyStack[Guide.state.historyStack.length - 1] = newId;
      setDirty(true);
      Guide.state.historyStack.pop(); // renderNode will re-push
      Guide.renderNode(newId);
    });

    // Make start
    if ($("ed-make-start")) $("ed-make-start").onclick = () => {
      c.startNodeId = currentNodeId();
      setDirty(true);
      // re-render to swap badges
      const cur = currentNodeId();
      Guide.state.historyStack.pop();
      Guide.renderNode(cur);
    };

    // isEnd
    $("ed-isend").onchange = (e) => { node.isEnd = e.target.checked; setDirty(true); };

    // Warning live preview
    const warnEl = $("ed-warning");
    const warnPrev = $("ed-warning-preview");
    function updateWarnPrev() {
      if (warnEl.value.trim()) {
        warnPrev.style.display = "";
        warnPrev.innerHTML = `<div class="warning rounded-xl p-3 text-sm prose-custom">${Guide.renderMarkdown(warnEl.value)}</div>`;
      } else { warnPrev.style.display = "none"; }
    }
    warnEl.addEventListener("input", () => { node.warning = warnEl.value; setDirty(true); updateWarnPrev(); });
    updateWarnPrev();

    // Body live preview
    const bodyEl = $("ed-body");
    const bodyPrev = $("ed-body-preview");
    function updateBodyPrev() { bodyPrev.innerHTML = Guide.renderMarkdown(bodyEl.value); }
    bodyEl.addEventListener("input", () => { node.body = bodyEl.value; setDirty(true); updateBodyPrev(); });
    updateBodyPrev();

    // Options
    renderOptions(node);

    $("ed-add-option").onclick = () => {
      if (!node.options) node.options = [];
      const otherIds = Object.keys(c.nodes).filter(x => x !== currentNodeId());
      let target = otherIds[0];
      if (!target) {
        // create a new step inline
        const newId = uid("step");
        c.nodes[newId] = { id: newId, title: "New step", body: "", warning: "", options: [], isEnd: true };
        target = newId;
      }
      node.options.push({ id: uid("opt"), label: "New option", nextNodeId: target, confirmPopup: null });
      setDirty(true);
      renderOptions(node);
    };
  }

  function renderOptions(node) {
    const wrap = $("ed-options");
    wrap.innerHTML = "";
    const c = Guide.state.content;
    const curId = currentNodeId();
    (node.options || []).forEach((opt, idx) => {
      const div = document.createElement("div");
      div.className = "ed-option";
      const optionsList = Object.keys(c.nodes).filter(id => id !== curId);
      const targetSelectHtml = optionsList.map(id => `<option value="${id}" ${opt.nextNodeId === id ? "selected" : ""}>${escapeHtml(c.nodes[id].title || id)}</option>`).join("");
      const popupOn = !!(opt.confirmPopup && (opt.confirmPopup.title || opt.confirmPopup.body));

      div.innerHTML = `
        <div class="ed-option-row">
          <input class="ed-option-label-input" data-field="label" value="${escapeHtml(opt.label || "")}" placeholder="Button label visitors will see…" />
          <span class="opacity-40">→</span>
        </div>
        <div class="ed-option-controls">
          <span class="text-xs opacity-60">Goes to:</span>
          <select class="ed-target-select" data-field="next">
            ${targetSelectHtml}
            <option value="__new__" style="font-style: italic;">+ Create a new step…</option>
          </select>
          <button class="ed-mini-btn ${popupOn ? "popup-on" : ""}" data-act="popup">${popupOn ? "✓ Popup" : "+ Popup"}</button>
          <button class="ed-mini-btn" data-act="up" title="Move up" ${idx === 0 ? "disabled style='opacity:0.3'" : ""}>↑</button>
          <button class="ed-mini-btn" data-act="down" title="Move down" ${idx === node.options.length - 1 ? "disabled style='opacity:0.3'" : ""}>↓</button>
          <button class="ed-mini-btn danger" data-act="delete" title="Delete">×</button>
        </div>
        <div class="ed-popup-editor" data-popup style="${popupOn ? "" : "display:none;"}">
          <div><label class="ed-label">Popup title</label><input class="ed-input" data-field="popup-title" value="${escapeHtml(opt.confirmPopup ? opt.confirmPopup.title || "" : "")}" placeholder="Are you sure?" /></div>
          <div><label class="ed-label">Popup body (markdown)</label><textarea class="ed-textarea" data-field="popup-body" rows="2">${escapeHtml(opt.confirmPopup ? opt.confirmPopup.body || "" : "")}</textarea></div>
          <div><label class="ed-label">Confirm button label</label><input class="ed-input" data-field="popup-confirm" value="${escapeHtml(opt.confirmPopup ? opt.confirmPopup.confirmLabel || "" : "")}" placeholder="Continue" /></div>
        </div>
      `;
      wrap.appendChild(div);

      div.querySelector('[data-field="label"]').addEventListener("input", (e) => { opt.label = e.target.value; setDirty(true); });
      const sel = div.querySelector('[data-field="next"]');
      sel.value = opt.nextNodeId || optionsList[0] || "";
      sel.addEventListener("change", (e) => {
        if (e.target.value === "__new__") {
          const newId = uid("step");
          c.nodes[newId] = { id: newId, title: "New step", body: "", warning: "", options: [], isEnd: true };
          opt.nextNodeId = newId;
          setDirty(true);
          renderOptions(node);
          toast(`Created step "${newId}"`, "ok");
        } else {
          opt.nextNodeId = e.target.value;
          setDirty(true);
        }
      });

      div.querySelector('[data-act="popup"]').onclick = () => {
        if (popupOn) {
          opt.confirmPopup = null;
        } else {
          opt.confirmPopup = { title: "Are you sure?", body: "", confirmLabel: "Continue" };
        }
        setDirty(true);
        renderOptions(node);
      };
      div.querySelector('[data-act="up"]').onclick = () => { if (idx > 0) { node.options.splice(idx - 1, 0, node.options.splice(idx, 1)[0]); setDirty(true); renderOptions(node); } };
      div.querySelector('[data-act="down"]').onclick = () => { if (idx < node.options.length - 1) { node.options.splice(idx + 1, 0, node.options.splice(idx, 1)[0]); setDirty(true); renderOptions(node); } };
      div.querySelector('[data-act="delete"]').onclick = () => { node.options.splice(idx, 1); setDirty(true); renderOptions(node); };

      const pt = div.querySelector('[data-field="popup-title"]');
      const pb = div.querySelector('[data-field="popup-body"]');
      const pc = div.querySelector('[data-field="popup-confirm"]');
      [pt, pb, pc].forEach(el => el && el.addEventListener("input", () => {
        opt.confirmPopup = opt.confirmPopup || {};
        opt.confirmPopup.title = pt.value;
        opt.confirmPopup.body = pb.value;
        opt.confirmPopup.confirmLabel = pc.value;
        setDirty(true);
      }));
    });
  }

  // ---------- toolbar actions ----------
  function addStep() {
    const id = uid("step");
    const c = Guide.state.content;
    c.nodes[id] = { id, title: "New step", body: "", warning: "", options: [], isEnd: false };
    setDirty(true);
    navigateToStep(id);
    toast(`Created step "${id}". Edit it now.`, "ok");
  }

  function duplicateCurrent() {
    const c = Guide.state.content;
    const cur = currentNode();
    if (!cur) return;
    const newId = uid("step");
    c.nodes[newId] = JSON.parse(JSON.stringify(cur));
    c.nodes[newId].id = newId;
    c.nodes[newId].title = (cur.title || "Step") + " (copy)";
    setDirty(true);
    navigateToStep(newId);
    toast("Step duplicated", "ok");
  }

  function deleteCurrent() {
    const c = Guide.state.content;
    const ids = Object.keys(c.nodes);
    if (ids.length <= 1) { toast("You need at least one step", "err"); return; }
    const cur = currentNodeId();
    if (!confirm(`Delete step "${c.nodes[cur].title || cur}"? Any options pointing here will become broken.`)) return;
    delete c.nodes[cur];
    if (c.startNodeId === cur) c.startNodeId = Object.keys(c.nodes)[0];
    setDirty(true);
    navigateToStep(c.startNodeId);
    toast("Step deleted", "ok");
  }

  function discardChanges() {
    if (!dirty) { toast("Nothing to discard", "ok"); return; }
    if (!confirm("Discard all unsaved changes and reload?")) return;
    location.reload();
  }

  function signOut() {
    if (dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
    GH.clearCreds();
    location.reload();
  }

  let previewing = false;
  function togglePreview() {
    previewing = !previewing;
    Guide.state.editMode = !previewing;
    document.body.classList.toggle("edit-mode", !previewing);
    const tb = $("edit-toolbar");
    if (tb) tb.style.display = previewing ? "none" : "";
    document.body.style.paddingTop = previewing ? "0" : "";
    const cur = currentNodeId();
    Guide.state.historyStack.pop();
    Guide.renderNode(cur);
    if (previewing) {
      // exit-preview floating button
      const ex = document.createElement("button");
      ex.id = "preview-exit";
      ex.textContent = "← Back to editing";
      ex.style.cssText = "position:fixed;top:12px;right:12px;z-index:200;padding:8px 14px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent));color:white;border:0;font-size:13px;cursor:pointer;box-shadow:0 8px 24px -8px color-mix(in oklab,var(--primary) 70%,transparent);";
      ex.onclick = togglePreview;
      document.body.appendChild(ex);
    } else {
      $("preview-exit")?.remove();
    }
  }

  // ---------- save ----------
  async function save() {
    if (!validate()) return;
    const btn = $("edit-save");
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await GH.saveContent(Guide.state.content);
      setDirty(false);
      toast("Saved. GitHub Pages rebuilds in ~30s.", "ok");
    } catch (e) {
      toast(`Save failed: ${e.message}`, "err", 6000);
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  function validate() {
    const c = Guide.state.content;
    if (!c.startNodeId || !c.nodes[c.startNodeId]) { toast("Start step is missing", "err"); return false; }
    let bad = [];
    Object.entries(c.nodes).forEach(([id, n]) => {
      (n.options || []).forEach(o => {
        if (!o.nextNodeId || !c.nodes[o.nextNodeId]) bad.push(`"${n.title || id}" → "${o.label}"`);
      });
    });
    if (bad.length) {
      toast(`Some options point to missing steps: ${bad.slice(0, 2).join(", ")}${bad.length > 2 ? "…" : ""}`, "err", 6000);
      return false;
    }
    return true;
  }

  // ---------- settings drawer ----------
  function openDrawer() {
    let d = $("edit-drawer"), bd = $("edit-drawer-backdrop");
    if (!d) { buildDrawer(); d = $("edit-drawer"); bd = $("edit-drawer-backdrop"); }
    fillDrawer();
    d.classList.add("open");
    bd.classList.add("open");
  }
  function closeDrawer() {
    $("edit-drawer")?.classList.remove("open");
    $("edit-drawer-backdrop")?.classList.remove("open");
  }
  function buildDrawer() {
    const bd = document.createElement("div"); bd.id = "edit-drawer-backdrop"; bd.onclick = closeDrawer;
    document.body.appendChild(bd);
    const d = document.createElement("div"); d.id = "edit-drawer";
    d.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h3>Site settings</h3>
        <button class="ed-mini-btn" id="ed-drawer-close">Close</button>
      </div>
      <div class="space-y-3">
        <div><label class="ed-label">Site title</label><input class="ed-input" data-bind="site.title" /></div>
        <div><label class="ed-label">Subtitle</label><input class="ed-input" data-bind="site.subtitle" /></div>
        <div><label class="ed-label">Header banner (markdown)</label><textarea class="ed-textarea" data-bind="site.header" rows="2"></textarea></div>
        <div><label class="ed-label">Footer (markdown)</label><textarea class="ed-textarea" data-bind="site.footer" rows="2"></textarea></div>
      </div>
      <details>
        <summary>Theme colors</summary>
        <div class="ed-row cols-2">
          <div><label class="ed-label">Primary</label><input type="color" data-bind="site.theme.primary" /></div>
          <div><label class="ed-label">Accent</label><input type="color" data-bind="site.theme.accent" /></div>
          <div><label class="ed-label">Background</label><input type="color" data-bind="site.theme.background" /></div>
          <div><label class="ed-label">Surface</label><input type="color" data-bind="site.theme.surface" /></div>
          <div><label class="ed-label">Text</label><input type="color" data-bind="site.theme.text" /></div>
        </div>
      </details>
      <details>
        <summary>Welcome popup (shown once per session on first load)</summary>
        <div class="space-y-3 mt-2">
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-bind="site.welcomePopup.enabled" class="accent-indigo-500" /> Enable</label>
          <div><label class="ed-label">Title</label><input class="ed-input" data-bind="site.welcomePopup.title" /></div>
          <div><label class="ed-label">Body (markdown)</label><textarea class="ed-textarea" data-bind="site.welcomePopup.body" rows="3"></textarea></div>
        </div>
      </details>
      <details>
        <summary>Behavior</summary>
        <div class="space-y-2 mt-2 text-sm">
          <label class="flex items-center gap-2"><input type="checkbox" data-bind="site.showRestart" class="accent-indigo-500" /> Show restart button</label>
          <label class="flex items-center gap-2"><input type="checkbox" data-bind="site.showBack" class="accent-indigo-500" /> Show back button</label>
          <label class="flex items-center gap-2"><input type="checkbox" data-bind="site.showProgress" class="accent-indigo-500" /> Show progress bar</label>
        </div>
      </details>
      <details>
        <summary>Start step</summary>
        <div class="mt-2"><select id="ed-start-select" class="ed-input"></select></div>
      </details>
    `;
    document.body.appendChild(d);
    $("ed-drawer-close").onclick = closeDrawer;
  }
  function fillDrawer() {
    const c = Guide.state.content;
    document.querySelectorAll("#edit-drawer [data-bind]").forEach(el => {
      const path = el.getAttribute("data-bind");
      const val = path.split(".").reduce((a, k) => (a == null ? a : a[k]), c);
      if (el.type === "checkbox") el.checked = !!val;
      else if (el.type === "color") el.value = val || "#000000";
      else el.value = val == null ? "" : val;
      el.oninput = () => {
        const v = el.type === "checkbox" ? el.checked : el.value;
        const parts = path.split(".");
        let cur = c;
        for (let i = 0; i < parts.length - 1; i++) {
          if (cur[parts[i]] == null) cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = v;
        setDirty(true);
        Guide.applyTheme(c.site.theme);
        Guide.renderSiteChrome();
      };
    });
    const sel = $("ed-start-select");
    sel.innerHTML = Object.keys(c.nodes).map(id => `<option value="${id}" ${id === c.startNodeId ? "selected" : ""}>${escapeHtml(c.nodes[id].title || id)} (${id})</option>`).join("");
    sel.onchange = (e) => { c.startNodeId = e.target.value; setDirty(true); };
  }

  // ---------- image upload ----------
  function openImageUpload() {
    let m = $("image-upload-modal");
    if (!m) {
      m = document.createElement("div");
      m.id = "image-upload-modal";
      m.style.cssText = "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,8,16,0.7);backdrop-filter:blur(8px);";
      m.innerHTML = `
        <div class="glass" style="max-width:480px;width:100%;border-radius:18px;padding:22px;">
          <h3 class="text-lg font-semibold mb-3">Upload image</h3>
          <p class="text-xs opacity-70 mb-3">Uploads to <code>assets/uploads/</code> in your repo.</p>
          <input type="file" id="iu-file" accept="image/*" />
          <div id="iu-status" class="text-xs opacity-70 mt-3"></div>
          <textarea id="iu-result" rows="2" placeholder="Markdown snippet appears here after upload" class="ed-textarea hidden mt-3" readonly></textarea>
          <div class="flex justify-end gap-2 mt-4">
            <button class="ed-mini-btn" id="iu-close">Close</button>
            <button class="ed-mini-btn" id="iu-copy" style="display:none;">Copy markdown</button>
            <button class="et-btn primary" id="iu-upload">Upload</button>
          </div>
        </div>
      `;
      document.body.appendChild(m);
      $("iu-close").onclick = () => m.remove();
      $("iu-upload").onclick = async () => {
        const f = $("iu-file").files[0];
        if (!f) { toast("Pick a file first", "err"); return; }
        $("iu-status").textContent = "Uploading…";
        try {
          const url = await GH.uploadAsset(f);
          const md = `![${f.name}](${url})`;
          const r = $("iu-result");
          r.classList.remove("hidden");
          r.value = md;
          r.select();
          $("iu-copy").style.display = "";
          $("iu-status").textContent = "Uploaded.";
        } catch (e) {
          $("iu-status").textContent = "";
          toast(`Upload failed: ${e.message}`, "err", 6000);
        }
      };
      $("iu-copy").onclick = async () => {
        const r = $("iu-result");
        try { await navigator.clipboard.writeText(r.value); toast("Copied to clipboard", "ok"); }
        catch { r.select(); document.execCommand("copy"); toast("Copied", "ok"); }
      };
    }
  }

  // ---------- sign-in modal ----------
  function buildSigninModal() {
    if ($("signin-modal")) return;
    const m = document.createElement("div");
    m.id = "signin-modal";
    m.innerHTML = `
      <div class="panel">
        <div class="flex items-center gap-3 mb-4">
          <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--primary),var(--accent));"></div>
          <div>
            <h3 style="font-size:18px;font-weight:600;">Sign in to edit</h3>
            <p class="text-xs opacity-70">Use a GitHub fine-grained Personal Access Token.</p>
          </div>
        </div>
        <details class="text-sm mb-4">
          <summary class="opacity-80">How to set up your token (one time)</summary>
          <ol class="list-decimal pl-5 mt-2 space-y-1 opacity-90 text-xs">
            <li>Open <a class="underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>
            <li>Resource owner = your account · Repository access = "Only select repositories" → pick your guide repo</li>
            <li>Repository permissions → <b>Contents</b> = <b>Read and write</b></li>
            <li>Set expiration (90 days recommended), generate, copy the <code>github_pat_…</code> token</li>
          </ol>
        </details>
        <div class="space-y-3">
          <div><label>Repository (owner/repo)</label><input id="si-repo" placeholder="yourname/your-repo" /></div>
          <div><label>Branch</label><input id="si-branch" value="main" /></div>
          <div><label>GitHub Personal Access Token</label><input id="si-token" type="password" placeholder="github_pat_…" /></div>
          <label class="flex items-center gap-2 text-sm"><input id="si-remember" type="checkbox" class="accent-indigo-500" /> Remember on this device</label>
          <div id="si-error" class="text-sm text-red-300 hidden"></div>
          <div class="flex gap-2 justify-end">
            <button class="ed-mini-btn" id="si-cancel">Cancel</button>
            <button class="et-btn primary" id="si-go">Sign in</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    $("si-cancel").onclick = () => m.classList.remove("open");
    $("si-go").onclick = async () => {
      const repo = $("si-repo").value.trim();
      const branch = $("si-branch").value.trim() || "main";
      const token = $("si-token").value.trim();
      const remember = $("si-remember").checked;
      const err = $("si-error");
      err.classList.add("hidden");
      if (!repo.includes("/")) { err.textContent = "Repository must be owner/repo"; err.classList.remove("hidden"); return; }
      if (!token.startsWith("github_pat_") && !token.startsWith("ghp_")) { err.textContent = "Token doesn't look like a GitHub PAT"; err.classList.remove("hidden"); return; }
      const [owner, r] = repo.split("/");
      GH.setCreds({ owner, repo: r, branch, token, remember });
      try {
        await GH.verifyAccess();
        m.classList.remove("open");
        await enterEditMode();
      } catch (e) {
        GH.clearCreds();
        err.textContent = `Couldn't access repo: ${e.message}`;
        err.classList.remove("hidden");
      }
    };
  }
  function openSignin() {
    buildSigninModal();
    $("signin-modal").classList.add("open");
    setTimeout(() => $("si-repo")?.focus(), 50);
  }

  // ---------- enter / exit ----------
  async function enterEditMode() {
    if (!GH.isSignedIn()) { openSignin(); return; }
    try { await GH.verifyAccess(); }
    catch (e) {
      GH.clearCreds();
      toast(`Token rejected: ${e.message}`, "err", 6000);
      openSignin();
      return;
    }
    // Load latest content from GitHub (so we edit the source-of-truth, not a stale Pages copy)
    try {
      Guide.state.content = await GH.fetchContent();
      Guide.applyTheme(Guide.state.content.site && Guide.state.content.site.theme);
      Guide.renderSiteChrome();
    } catch (e) {
      toast(`Couldn't load content: ${e.message}`, "err", 6000);
      return;
    }

    editing = true;
    Guide.state.editMode = true;
    Guide.editRenderer = editRenderer;
    document.body.classList.add("edit-mode");
    $("edit-fab")?.remove();
    buildToolbar();

    // Ensure we have a node to edit
    let cur = Guide.state.historyStack[Guide.state.historyStack.length - 1];
    if (!cur || !Guide.state.content.nodes[cur]) cur = Guide.state.content.startNodeId;
    Guide.state.historyStack = [];
    Guide.renderNode(cur);

    // sync URL so refresh stays in edit
    if (!location.hash.includes("edit")) location.hash = "#edit";
  }

  function injectFab() {
    if ($("edit-fab") || $("edit-toolbar")) return;
    const b = document.createElement("button");
    b.id = "edit-fab";
    b.innerHTML = "✎ Edit";
    b.title = GH.isSignedIn() ? "Enter edit mode" : "Sign in to edit";
    b.onclick = enterEditMode;
    document.body.appendChild(b);
  }

  // ---------- bootstrap ----------
  function init() {
    injectStyles();

    // expose for sign-in trigger
    window.GuideEdit = { enterEditMode, openSignin };

    const wantsEdit = location.hash === "#edit" || /[?&]edit=1\b/.test(location.search);

    if (GH.isSignedIn()) {
      // Already signed in: show edit FAB. If hash says edit, enter immediately.
      if (wantsEdit) enterEditMode();
      else injectFab();
    } else if (wantsEdit) {
      openSignin();
    }
    // Otherwise: no UI shown to public visitors.

    // Keyboard shortcut (Cmd/Ctrl+E) to open sign-in / edit mode
    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (GH.isSignedIn()) enterEditMode(); else openSignin();
      }
    });

    // Warn on unload if dirty
    window.addEventListener("beforeunload", (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
