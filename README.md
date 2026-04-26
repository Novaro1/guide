# Interactive Guide

A static, branching, flow-chart–style guide site. Loads straight into the tutorial. Edits happen via a built-in admin page that commits to GitHub via your own fine-grained token — secure, revocable, and free.

```
index.html      ← the guide users see
admin.html      ← editor (you only)
content.json    ← all of the guide's content
assets/         ← app.js, admin.js, uploaded images
```

## 1. Deploy (one time, ~5 min)

1. **Create a new GitHub repo** (public or private — both work). Push these files to the `main` branch.
   ```bash
   cd "The Guide Website"
   git init
   git add .
   git commit -m "Initial guide"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   The workflow in `.github/workflows/pages.yml` will deploy on every push.
3. After the first deploy, your site is at `https://<your-username>.github.io/<your-repo>/`.

   The guide loads at `/` and the admin at `/admin.html`.

## 2. Edit content — two ways

### A) Inline edit on the live site (recommended, WYSIWYG)

1. Visit your site (just `/`, the main URL).
2. Press **`Cmd/Ctrl + Shift + E`** *or* go to `/#edit` to open the sign-in modal.
3. Enter your repo + PAT (see token setup below). Tick "Remember on this device" so you don't have to do it every time.
4. The page becomes editable in place — title, body (with live markdown preview), warning, and option buttons all editable inline. A toolbar at the top has **Save**, **Steps** (jump between steps), **+ Step**, **⚙ Settings** (theme, header, footer, welcome popup), **👁 Preview** (see what visitors see), and **⋯** (image upload, duplicate, delete, sign out).
5. Edit, click **Save** → GitHub Pages rebuilds in ~30 seconds.

After signing in once, a small **✎ Edit** button appears in the corner on every visit (only visible to you on your own browser — invisible to public visitors).

### B) Structured admin (alternate)

Visit `/admin.html` for a list-based editor of all steps and site settings — same data, different layout. Useful for big restructures.

### One-time token setup

1. Open https://github.com/settings/personal-access-tokens/new
2. **Resource owner:** your account
3. **Repository access:** *Only select repositories* → pick this guide's repo
4. **Permissions → Repository permissions → Contents:** *Read and write* (leave everything else)
5. **Expiration:** 90 days is fine; you can re-issue any time
6. Generate, copy the `github_pat_...` token
7. Paste it into the inline editor sign-in modal (or `/admin.html`).

### Why this is secure

- **No shared password.** Auth = GitHub itself.
- **Token is fine-grained:** scoped to one repo, write-only to file contents. Cannot do anything else with your account.
- **Revocable instantly** at https://github.com/settings/personal-access-tokens — kill the token and the admin is dead.
- **Auto-expiring** if you set an expiration.
- **No backend to compromise.** The admin lives in your browser and talks directly to the GitHub API over HTTPS.
- **Token never leaves your device.** Stored in browser session memory by default (cleared when you close the tab); only persists if you tick "remember on this device".

## 3. What you can customize from the admin

- **Site:** title, subtitle, header banner, footer (all support markdown)
- **Theme:** primary, accent, background, surface, text colors
- **Welcome popup:** toggle, title, body
- **Behavior:** show/hide restart, back, progress bar
- **Steps:** unlimited; each has a title, markdown body, optional warning, and any number of options
- **Options:** label, target step, optional confirmation popup before continuing
- **Start step:** pick any step as the entry point
- **Images:** upload through the admin, get a markdown snippet, paste anywhere
- **Videos:** paste a YouTube/Vimeo URL on its own line in any body — auto-embeds
- **Code blocks:** ```` ```js ... ``` ```` with syntax highlighting
- **Markdown:** bold, italic, lists, links, blockquotes, etc.

## 4. Editing `content.json` directly (optional)

The admin is the easiest way, but you can also edit `content.json` directly (in GitHub's web editor or locally). Schema:

```jsonc
{
  "site": {
    "title": "...",
    "subtitle": "...",
    "header": "markdown",
    "footer": "markdown",
    "theme": { "primary": "#hex", "accent": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex" },
    "welcomePopup": { "enabled": false, "title": "...", "body": "markdown" },
    "showRestart": true, "showBack": true, "showProgress": true
  },
  "startNodeId": "start",
  "nodes": {
    "start": {
      "id": "start",
      "title": "...",
      "body": "markdown — supports images, code, video URLs",
      "warning": "optional warning shown in a yellow box",
      "isEnd": false,
      "options": [
        { "id": "opt-1", "label": "Choice A", "nextNodeId": "node-x", "confirmPopup": null },
        { "id": "opt-2", "label": "Choice B", "nextNodeId": "node-y",
          "confirmPopup": { "title": "Sure?", "body": "markdown", "confirmLabel": "Yes" } }
      ]
    }
  }
}
```

End steps have `"isEnd": true` and an empty `options` array — they get a "Result" badge and a "Start over" button.

## 5. Local preview

Just open `index.html` in a browser, or run any static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## 6. Custom domain (optional)

In your repo: **Settings → Pages → Custom domain** → add your domain, then point a DNS CNAME at `<your-username>.github.io`. GitHub auto-issues an HTTPS cert.
