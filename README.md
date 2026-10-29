# w·i·p cms

A local editor for static sites that use a `.pages.yml` (the Pages CMS settings file).
It runs on your Mac and edits the site's files directly. Nothing goes online until you
commit and push, for example in GitHub Desktop. It reads the same `.pages.yml` as Pages
CMS, so you can use both.

It's laid out like a Mac app (think Notes or Pages): your sections on the left, your
posts next to them, the post itself as a document, and its details in an inspector on
the right. It saves as you type, has a **live preview** of the real site beside your
writing, and comes in light and dark.

## Starting it

**Double-click `w·i·p cms.app`** in this folder. That's it: no Terminal.

- It starts the editor in the background and opens it in its own window (an app window in
  Chrome, Edge or Brave if you have one; otherwise your default browser).
- The first time, and after you pull an update, it gets things ready for a moment first.
- Drag it to the Dock to keep it handy. (It used to be called "wip cms.app": if the Dock
  shows a question mark, drag the new one there instead.) It can also live in Applications: it remembers
  where this folder is (and asks, if it ever can't find it).
- **Quit** from the ⋯ menu stops the editor. Closing the window leaves it running quietly
  in the background, so the next open is instant.
- It needs Node.js (18 or newer). If it isn't installed, the app says so and opens
  nodejs.org. Messages go to `~/Library/Logs/wip cms.log`.

The first time, it asks which site to open: give it the site's main folder, the one with
`.pages.yml` in it. Click the site name (top left) to switch sites later.

**From Terminal instead** (the same thing):

```sh
cd ~/path/to/wip-cms
npm install                         # first time only
npm start                           # opens the site you used last
npm start -- ~/path/to/my-site      # opens a particular site
```

Then go to **http://localhost:4321**. Stop it with **Ctrl+C**.

**A new site (for a client, say):** click the site name, paste the new site's folder,
and press Open. If it isn't set up yet, w·i·p cms asks a few questions instead:

- which folder the pages live in and where images go;
- which sections it should have (case studies, news, pages…);
- whether each is **Posts** (title, featured image, date, draft, tags) or **Pages** (title,
  description);
- whether you write **Text** (one piece of Markdown under the title) or **Blocks** (text,
  images, carousels, collages, like studiotomby.com; the site's templates need to show
  them).

It then writes the site's `.pages.yml`, makes the folders and opens the site. It never
overwrites an existing `.pages.yml`, and you can edit the file by hand afterwards.

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
| **Sidebar** | **Collections**: things you keep adding to (blog posts, projects). Then single **pages**, under the group they're in in `.pages.yml` (e.g. Pages: Home, About). Then **Site**: the Images library, and one-of-a-kind items that aren't in a group (the site's title and description, say). At the bottom: how many changes are waiting to be published. Click the site name at the top to open another site. |
| **List** | The posts in that section. The ⇅ button picks how they're **grouped** (by month, by year, by any choice field such as Category, or not at all) and **sorted** (newest first, oldest first, or by title). Each section remembers its own, and it only changes this list, never the order on your site. Out of the box, sections filed by month (like blog posts) group by year and month, with the weekday and day beside each post; other dated sections (like projects) group by year, without dates. Click a group to fold it away. Search at the top; the pencil makes a new one. The three buttons beside the search show it as a **list** (picture, title, first words), a **grid** (square pictures, three across, edge to edge; point at one for its title) or **titles only**; each section remembers its own. Drag the list's right edge to make it wider. |
| **Document** | The open post: its title, then its blocks as they'll read. Click a block to select it: its options (caption position, alt text…) appear, with a small bar to move it up or down or delete it. Point between two blocks for a **+** that inserts one there. |
| **Inspector** | The post's details: featured image, date, switches, tags, and its permalink. |

**New posts:** the pencil above the list asks for a title and a **permalink** (the end of
its web address, e.g. `/blog/2026/10/cafe-opening/`). The permalink follows the title as
you type; change it and it stays as you set it.

**Projects:** the document holds what you'd read and see: the short title, the full title
under it, the project text, and then the gallery (in the staggered layout the site uses).
The inspector keeps the smaller details: featured image, date, ongoing, book, category and
related posts. The site's own layout doesn't change. (Any section works this way: a field
called `longTitle` goes under the title, and fields with several images go after the text.)

**Under the title:** the date, **Draft / Published** and the tags can be changed right
there. Click the date for a date picker, click Draft or Published to switch, and type in
"add tag" (Return adds it, suggestions come from tags you've used). The inspector shows
the same and stays in step.

**Pictures:** there's one **image** choice in the Insert menu. Choose or upload one
picture, or several at once: the first fills that block and each of the others gets its
own image block right after it. (The "multi-upload" block in `.pages.yml` stays for Pages
CMS, but w·i·p cms doesn't offer it, since image does the same.)

**Moving blocks:** point at a block and drag the ⠿ handle in the margin to its left. The
block itself moves through the post as you drag (with a small label following the
pointer), so you see the result before letting go; dragging near the top or bottom of the
window scrolls. (Rearrange in the toolbar still shrinks every block to a
line, for big reshuffles.)

**Writing**

- Text shows its formatting as you write: *italic* looks italic, **bold** looks bold,
  links look like links. Typing `*word*` or `**word**` formats it as you go; ⌘B and ⌘I
  work too, and ⇧↩ (or the line-break button) starts a new line in the same paragraph.
  Captions work the same way.
- It's still saved as Markdown, exactly as the site expects, and only text you change is
  rewritten. (One small difference: italics you edit are saved as `*word*` even if they
  were `<i>word</i>` before. They look the same on the site.)
- **Source** (top right of a selected text block) shows the Markdown itself in a
  monospace font, color-coded with the ayu colors. HTML blocks are color-coded too.
  w·i·p cms remembers whether you last used Write or Source.

**Settings:** ⋯ → **Settings…** has how w·i·p cms works for you (Customize is how it looks):

- **Language:** English or 日本語. Japanese switches all of w·i·p cms (your section and field
  names from .pages.yml too, for the common ones). Translations live in
  `public/js/i18n.js`; anything without one stays in English.
- **Dates:** October 28, 2026 · 2026年10月28日.
- **Interface Size:** makes the sidebar, list, toolbar and inspector bigger or smaller
  (85–130%). The writing has its own size, in Customize → Typography.
- **Site:** which site is open, and opening another.

**Customize:** ⋯ → **Customize…** has three tabs. **Themes**: match your Mac or pick
light or dark, and choose a theme for each (Light, Paper and Dark come built in);
duplicate one to make your own. **Export** saves the theme you're on as a
`.wiptheme.json` file in Downloads; **Import…** adds one from a file (to share a theme
or move it to another Mac). **Colors** and **Typography** change the theme you're on: its
colors; fonts (System, EB Garamond, SF Mono, Menlo, Zen Old Mincho, Zen Kaku Gothic New,
or any other font on your Mac or on Google Fonts); writing size, weight, line, letter and
word spacing; the interface's font and weight; and code colors (ayu dark or ayu light), with a preview at the
top as you go. "Match my Mac" switches between your light and dark theme. Themes are kept
in this browser.

**Toolbar**

- **Write / Split / Preview:** just the document, the document beside the live site
  (drag the line between them), or just the site. In Split, the post list steps aside
  to make room.
- **⊕ Insert a block**, **Add photos** (one image block per photo), and **Rearrange**
  (each block shrinks to one line you can drag).
- **Open on your site** in a new tab, and **show / hide the inspector**.
- **⋯** has **Revert to when opened**, **Move to Trash**, **Appearance** (match your
  Mac, light or dark), **Customize…**, **Settings…**, **Open another site…** and **Quit**.
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

- Under an image field: **Choose from Library**, or upload from **Computer** or **Phone**.
  You can also drag pictures from Finder straight onto an image field.
- In carousels, collages and galleries, **drag a picture** to change the order: a copy
  follows the pointer, a faded spot shows where it will land, and dragging near the end
  of a carousel strip scrolls it. (On a touch screen, press and hold first.) Carousel
  pictures show their number, like "2/6", top right.
- **Drag files from Finder onto a post** to add them where the blue line shows: pictures
  become image blocks, videos (mp4, mov, webm) become video blocks, and anything else (a
  PDF, say) becomes a link. Files over 95 MB are refused, because GitHub won't take them.
- Uploads are converted in the browser to WebP, 1500px on the longest edge. They go
  into the post's own image folder, e.g. `src/images/blog/2026/10/my-post/`.
- **From phone** shows a QR code. Your phone needs to be on the same Wi-Fi. The phone
  can only reach the upload page; the editor is only reachable from your Mac. The link
  changes every time w·i·p cms starts.

## Other sites

w·i·p cms isn't tied to studiotomby.com. What it needs from a site is a `.pages.yml` (the
Pages CMS format) whose sections are folders of Markdown files. It works out the rest
from the fields:

- **Entries** can be folders (`my-post/index.md`) or plain files (`2026-10-28-my-post.md`),
  whichever the section's `filename` template says. `{year}`, `{month}`, `{day}` and
  `{primary}` work in templates.
- **The date** is a field called `date`, or else the first date field.
- **The list picture** is `featuredImage`, or else the first single-image field.
- **Grouping** offers every single-choice (select) field.
- **Blocks** are only used if the section has a blocks field; otherwise you write one
  piece of Markdown.

Things that are specific to one site should go in that site's `.pages.yml`, not in wip
cms's code.

**Sites that keep everything in data files** (like dosa, whose projects are a list in
`src/_data/projects.json`): describe the file the Pages CMS way, `type: file` with
`list: true`, and w·i·p cms shows each item as an entry of its own, like a blog post.

- The list's order is the order on the site, so these lists start in that order (**Order on
  the site** under ⇅) and you can **drag an item** to move it. New items go at the top.
- Its permalink comes from the site's own Eleventy template (the one with
  `pagination: data: projects` and a `permalink:`), so the preview and "Open on your site"
  go to the right page. Or say it in .pages.yml: `url: "/projects/{slug}/"`.
- The name shown is the `title` field, or whatever `view: { primary: style }` says.
- Saving changes only that item, keeping the file's own formatting, so GitHub Desktop
  shows just the lines you changed. If the list was changed somewhere else since you
  opened the item, w·i·p cms says so rather than saving over it.
- A long text field (`type: rich-text`) is written in the document like a post; a list of
  pictures with captions shows as the gallery, with **Add pictures** to add several at once.
- **Move to Trash** takes the item out of the list and keeps it as a small file in
  `.cms-trash`, with its own image folder.
- A year that's a number or text ("2016–2019") groups by its first year.

**Pictures saved as just a file name**, for templates that add the folder themselves
(`<img src="/img/projects/{{ project.slug }}/{{ image.src }}">`):

```yaml
- name: src
  type: image
  options:
    path: "src/img/projects/{slug}"   # where its pictures live; {slug} comes from the entry
    store: filename                   # save "photo.jpg", not the full address
    links: true                       # also allow a web address, e.g. a video on Google Drive
```

Uploads go into that folder, and a picture chosen from elsewhere in the library is copied
in. `path` is Pages CMS's own option (the folder its picker opens in); `store` and `links`
are w·i·p cms's.

`examples/dosa.pages.yml` is a complete one for the dosa site: copy it into that site's
folder as `.pages.yml` to use it there. The preview runs a site's Eleventy the way its
package.json does (dosa's uses `--config=config.js`).

## How the live preview works

When a site opens, w·i·p cms:

1. Copies the site into a temporary folder, the "shadow copy". `node_modules` and the
   image library are linked rather than copied.
2. Runs the site's own Eleventy on that copy at http://localhost:8080.

In Split or Preview, what you type goes into the shadow copy straight away, so the page
updates in place without waiting for the save a moment later.

Changes you make outside w·i·p cms are copied into the shadow copy too, for example
editing a template in VS Code or pulling in GitHub Desktop.

The preview needs an Eleventy site with its packages installed (`npm install` in the
site folder). For other sites, everything except the preview still works.

## Where things are (for changing it later)

```
w·i·p cms.app        the Mac app: double-click to start (Contents/MacOS/wip-cms is the script)
examples/            .pages.yml files for other sites (dosa)
mac/make-icon.py     draws the app's icon (AppIcon.icns, and the browser tab icons)
server.js            the switchboard: each web address hands off to a module below
lib/
  site.js            which site is open; turning paths into files and back
  config.js          reads .pages.yml (sections, fields)
  entries.js         list / read / save / create / delete posts and pages
  listfile.js        sections kept as one list in a data file (dosa's projects.json)
  permalinks.js      a list item's page address, from the site's Eleventy templates
  frontmatter.js     the --- YAML --- at the top of .md files
  media.js           the image library: listing folders, saving uploads
  tags.js            keeps the tag suggestions in .pages.yml up to date
  preview.js         the live preview (shadow copy + Eleventy)
  phone.js           phone uploads: the secret link, the QR code, who may connect
  setup.js           setting up a new site: writes its .pages.yml
public/
  index.html         the window: sidebar, list, toolbar, document, preview, inspector
  styles.css         all the styling; light and dark colors at the top
  phone.html         the page your phone sees
  js/
    app.js           the columns, the toolbar and ⋯ menu, the preview, opening things
    editor.js        one open post: the document and the inspector, saving as you type
    fields.js        each kind of field (text, date, switch, tags, image…)
    blocks.js        the blocks: select, insert, move, rearrange, delete
    media.js         image uploads (WebP), the picker window, the Images page
    setup.js         the "Set up a site" window
    rich.js          the writing box: Markdown shown formatted, and turned back into Markdown
    code.js          color-coded Source view
    theme.js         themes and the Customize window
    settings.js      the Settings window (language, dates, interface size)
    i18n.js          English / Japanese words, and date styles
    api.js           talking to server.js
    util.js          small helpers and the icons
```

Some common changes:

- **Built-in themes and font choices:** `BUILT_IN` and `FONTS` at the top of
  `public/js/theme.js`. How the other colors are mixed from a theme's eight: the top of
  `public/styles.css`.
- **Code colors:** the `--syn-…` lines near the top of `public/styles.css`.
- **How long it waits before saving:** `SAVE_AFTER` at the top of `public/js/editor.js`.
- **Which block options only show when a block is selected:** `isSecondary` at the top
  of `public/js/blocks.js`.
- **Upload size or format:** `LONGEST_EDGE` in `public/js/media.js`.
