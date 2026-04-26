// Shared GitHub API + credential storage. Loaded by both admin.html and index.html (edit mode).
(function () {
  const STORE_KEY = "guide-admin-creds-v1";
  const FILE_PATH = "content.json";

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
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
      return JSON.parse(base64ToUtf8(data.content));
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
