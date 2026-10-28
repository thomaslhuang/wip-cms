# WIP CMS

A local editor for static sites that use a `.pages.yml` (the Pages CMS settings file).
It runs on your Mac and edits the site's files directly. Nothing goes online until you
commit and push, for example in GitHub Desktop. It reads the same `.pages.yml` as Pages
CMS, so you can use both.

The editor is made of panels, the way InDesign is. You can drag them around, dock them
side by side or stack them as tabs. One of them is a **live preview** of the real site
that updates as you type, before you save.

## Starting it

You need Node 18 or newer (`node -v` in Terminal to check).

```sh
cd ~/path/to/wip-cms
npm install                         # first time only
npm start                           # opens the site you used last
npm start -- ~/path/to/my-site      # opens a particular site
```

Then go to **http://localhost:4321**. The first time, it asks which site to open: give it
the site's main folder, the one with `.pages.yml` in it. Click the site name (top left)
to switch sites later.

Stop it with **Ctrl+C** in Terminal.

Options:

| | |
|---|---|
| `npm start -- --no-preview` | skip the live preview (starts faster) |
| `WIP_PORT=5000 npm start` | use another address for the editor (default 4321) |
| `WIP_PREVIEW_PORT=8181 npm start` | use another address for the preview (default 8080) |

## Using it

**Panels**

| Panel | What's in it |
|---|---|
| **Navigator** | Your sections (blog posts, projects) and pages. Use **+** to make a new post, and the box at the top to find one. |
| **Details** | The open post's title, featured image, date, switches and tags. |
| **Content** | The post's blocks. Pages without blocks show all their fields here. |
| **Preview** | The real page, updating as you type. You can view it at full, tablet or phone width. |
| **Images** | The image library. You can drop files on it to upload, use **From phone** to upload from your phone, or click an image to copy its address. |

**Arranging panels**

- **Move a panel:** drag it by its tab onto another panel. A blue area shows where it
  will land. Drop on an edge to dock it beside, above or below that panel, or drop in
  the middle to add it as a tab.
- **Resize:** drag the thin line between two panels.
- **Close a panel:** click the **×** on its tab.
- **Window** (top right): reopen closed panels or switch to a ready-made layout.
  - **Write with preview:** everything side by side.
  - **Write:** no preview.
  - **Focus:** content and preview only.
  - **Preview below:** the preview under the editor.
- Your layout is remembered. In a narrow window, all panels become tabs.

**Saving and publishing**

- Press **Save** or **⌘S**. If you try to leave with unsaved changes, it asks first.
- Saving writes into the site folder. Publish the way you normally do: commit and push
  in GitHub Desktop.
- **Delete** (the ⋮ menu) moves the post and its image folder into `.cms-trash` in the
  site, so you can get them back.

**Images**

- Uploads are converted in the browser to WebP, 1500px on the longest edge. They go
  into the post's own image folder, e.g. `src/images/blog/2026/10/my-post/`.
- **From phone** shows a QR code. Your phone needs to be on the same Wi-Fi. The phone
  can only reach the upload page; the editor is only reachable from your Mac. The link
  changes every time WIP CMS starts.

## How the live preview works

When a site opens, WIP CMS:

1. Copies the site into a temporary folder, the "shadow copy". `node_modules` and the
   image library are linked rather than copied.
2. Runs the site's own Eleventy on that copy at http://localhost:8080.

While you type, your unsaved changes are written only into the shadow copy. Eleventy
rebuilds, and the Preview panel updates in place. Your real files change only when you
save.

Changes you make outside WIP CMS are copied into the shadow copy too, for example
editing a template in VS Code or pulling in GitHub Desktop.

The preview needs an Eleventy site with its packages installed (`npm install` in the
site folder). For other sites, everything except the Preview panel still works.

## Where things are (for changing it later)

```
server.js            the switchboard: each web address hands off to a module below
lib/
  site.js            which site is open; turning paths into files and back
  config.js          reads .pages.yml (sections, fields)
  entries.js         list / read / save / create / delete posts and pages
  frontmatter.js     the --- YAML --- at the top of .md files
  media.js           the image library: listing folders, saving uploads
  tags.js            keeps the tag suggestions in .pages.yml up to date
  preview.js         the live preview (shadow copy + Eleventy)
  phone.js           phone uploads: the secret link, the QR code, who may connect
public/
  index.html         the page: top bar + panel area
  styles.css         all the styling; colours and sizes at the top
  phone.html         the page your phone sees
  js/
    app.js           the panels, the top bar, the Window menu, opening things
    dock.js          the panel system: tabs, docking, resizing, layouts
    editor.js        one open post: builds the Details and Content panels, Save, Delete
    fields.js        each kind of field (text, date, switch, tags, image…)
    blocks.js        the block list: add, rearrange, collapse, delete
    media.js         image uploads (WebP), the picker window, the Images panel
    api.js           talking to server.js
    util.js          small helpers and the icons
```

Some common changes:

- **Colours and sizes:** the top of `public/styles.css`.
- **Ready-made layouts:** `PRESETS` near the top of `public/js/app.js`.
- **Which fields sit side by side in Details:** `ROLES` at the top of
  `public/js/editor.js`.
- **Upload size or format:** `LONGEST_EDGE` in `public/js/media.js`.
