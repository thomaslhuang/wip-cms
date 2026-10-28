# wip cms

A local editor for static sites that use a `.pages.yml` (the Pages CMS settings file).
It runs on your Mac and edits the site's files directly. Nothing goes online until you
commit and push, for example in GitHub Desktop. It reads the same `.pages.yml` as Pages
CMS, so you can use both.

It's laid out like a Mac app (think Notes or Pages): your sections on the left, your
posts next to them, the post itself as a document, and its details in an inspector on
the right. It saves as you type, has a **live preview** of the real site beside your
writing, and comes in light and dark.

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

**The window, left to right**

| | |
|---|---|
| **Sidebar** | Your sections (blog posts, projects), Images, pages and settings. At the bottom: how many changes are waiting to be published. Click the site name at the top to open another site. |
| **List** | The posts in that section, newest first, grouped by month. Search at the top; the pencil makes a new one. |
| **Document** | The open post: its title, then its blocks as they'll read. Click a block to select it: its options (caption position, alt text…) appear, with a small bar to move it up or down or delete it. Point between two blocks for a **+** that inserts one there. |
| **Inspector** | The post's details: featured image, date, switches, tags, and its web address. |

**Toolbar**

- **Write / Split / Preview:** just the document, the document beside the live site
  (drag the line between them), or just the site. In Split, the post list steps aside
  to make room.
- **⊕ Insert a block**, **Add photos** (one image block per photo), and **Rearrange**
  (each block shrinks to one line you can drag).
- **Open on your site** in a new tab, and **show / hide the inspector**.
- **⋯** has **Revert to when opened**, **Move to Trash**, **Appearance** (match your
  Mac, light or dark) and **Open another site…**
- The sidebar button (top of the sidebar) hides the sidebar and list for more room.

In a narrower window the list, then the sidebar, step aside while you write. On a phone
it shows one column at a time, details open as a sheet from the bottom, and insert,
photos and rearrange float at the bottom of the screen.

**Saving and publishing**

- There's no Save button: it saves a moment after you stop typing (the toolbar shows
  Edited, Saving…, Saved). **⌘S** saves straight away.
- **Revert to when opened** (in ⋯) puts the post back the way it was when you opened it.
- Saving writes into the site folder. Publish the way you normally do: commit and push
  in GitHub Desktop.
- **Move to Trash** moves the post and its image folder into `.cms-trash` in the site,
  so you can get them back.

**Images**

- **Images** in the sidebar shows the whole library: drop files on it to upload, use
  **From phone**, or click an image to copy its address.
- Uploads are converted in the browser to WebP, 1500px on the longest edge. They go
  into the post's own image folder, e.g. `src/images/blog/2026/10/my-post/`.
- **From phone** shows a QR code. Your phone needs to be on the same Wi-Fi. The phone
  can only reach the upload page; the editor is only reachable from your Mac. The link
  changes every time wip cms starts.

## How the live preview works

When a site opens, wip cms:

1. Copies the site into a temporary folder, the "shadow copy". `node_modules` and the
   image library are linked rather than copied.
2. Runs the site's own Eleventy on that copy at http://localhost:8080.

In Split or Preview, what you type goes into the shadow copy straight away, so the page
updates in place without waiting for the save a moment later.

Changes you make outside wip cms are copied into the shadow copy too, for example
editing a template in VS Code or pulling in GitHub Desktop.

The preview needs an Eleventy site with its packages installed (`npm install` in the
site folder). For other sites, everything except the preview still works.

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
  index.html         the window: sidebar, list, toolbar, document, preview, inspector
  styles.css         all the styling; light and dark colours at the top
  phone.html         the page your phone sees
  js/
    app.js           the columns, the toolbar and ⋯ menu, the preview, opening things
    editor.js        one open post: the document and the inspector, saving as you type
    fields.js        each kind of field (text, date, switch, tags, image…)
    blocks.js        the blocks: select, insert, move, rearrange, delete
    media.js         image uploads (WebP), the picker window, the Images page
    api.js           talking to server.js
    util.js          small helpers and the icons
```

Some common changes:

- **Colours (light and dark):** the top of `public/styles.css`.
- **How long it waits before saving:** `SAVE_AFTER` at the top of `public/js/editor.js`.
- **Which block options only show when a block is selected:** `isSecondary` at the top
  of `public/js/blocks.js`.
- **Upload size or format:** `LONGEST_EDGE` in `public/js/media.js`.
