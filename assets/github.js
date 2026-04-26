// Shared GitHub API + credential storage. Loaded by both admin.html and index.html (edit mode).
(function () {
  const STORE_KEY = "guide-admin-creds-v1";
  const FILE_PATH = "content.json";

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function base64ToUtf8(b64) {
    const binary = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    let str = new TextDecoder("utf-8").decode(bytes);
    // Strip UTF-8 BOM if present
    if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1);
    return str;
  }

  const GH = {
    creds: null,
    contentSha: null,

    loadStoredCreds() {
      const raw = localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    saveCreds(c) {
      const json = JSON.stringify(c);
      if (c.remember) {
        localStorage.setItem(STORE_KEY, json);
        sessionStorage.removeItem(STORE_KEY);
      } else {
        sessionStorage.setItem(STORE_KEY, json);
        localStorage.removeItem(STORE_KEY);
      }
    },
    clearCreds() {
      localStorage.removeItem(STORE_KEY);
      sessionStorage.removeItem(STORE_KEY);
      this.creds = null;
      this.contentSha = null;
    },
    setCreds(c) {
      this.creds = c;
      this.saveCreds(c);
    },
    isSignedIn() {
      if (!this.creds) this.creds = this.loadStoredCreds();
      return !!this.creds;
    },

    async api(path, opts = {}) {
      if (!this.creds) throw new Error("Not signed in");
      const headers = Object.assign({
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${this.creds.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      }, opts.headers || {});
      if (opts.body && typeof opts.body !== "string") {
        headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(opts.body);
      }
      const res = await fetch(`https://api.github.com${path}`, Object.assign({}, opts, { headers }));
      if (!res.ok) {
        let msg = `GitHub API error ${res.status}`;
        try { const j = await res.json(); if (j && j.message) msg = j.message; } catch {}
        throw new Error(msg);
      }
      if (res.status === 204) return null;
      return res.json();
    },

    async verifyAccess() {
      return await this.api(`/repos/${this.creds.owner}/${this.creds.repo}`);
    },

    async fetchContent() {
      const data = await this.api(`/repos/${this.creds.owner}/${this.creds.repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(this.creds.branch)}`);
      this.contentSha = data.sha;
      const decoded = base64ToUtf8(data.content);
      try {
        return JSON.parse(decoded);
      } catch (e) {
        console.error("content.json parse failed. First 200 chars:", JSON.stringify(decoded.slice(0, 200)));
        throw new Error(`content.json is not valid JSON (${e.message}). Check the file in your repo. First chars: ${decoded.slice(0, 60)}`);
      }
    },

    async saveContent(content, message = "Update guide content") {
      const body = {
        message,
        content: utf8ToBase64(JSON.stringify(content, null, 2)),
        branch: this.creds.branch,
      };
      if (this.contentSha) body.sha = this.contentSha;
      const res = await this.api(
        `/repos/${this.creds.owner}/${this.creds.repo}/contents/${FILE_PATH}`,
        { method: "PUT", body }
      );
      this.contentSha = res.content.sha;
      return res;
    },

    async uploadAsset(file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `assets/uploads/${Date.now()}-${safeName}`;
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      await this.api(`/repos/${this.creds.owner}/${this.creds.repo}/contents/${path}`, {
        method: "PUT",
        body: { message: `Upload ${safeName}`, content: b64, branch: this.creds.branch },
      });
      return `https://raw.githubusercontent.com/${this.creds.owner}/${this.creds.repo}/${this.creds.branch}/${path}`;
    },
  };

  window.GH = GH;
})();
