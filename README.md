# w·i·p cms

A local editor for static sites that use `.pages.yml` (it reads the same `.pages.yml` as Pages
CMS, so you can use both.) It edits site files directly. Nothing goes online until you
commit and push, for example in GitHub Desktop. 

Key features:
- Live preview for viewing changes before publishing
- Automatic image conversion and sorting
- Batch editing of posts for ease of data management
- Document-like text editor
- Direct file management (no Google Drive intermediary or need to manually go into local files on computer)
- Search across every section, a list of the files waiting to be published, and a check for unused pictures and pictures without alt text

## Starting it

**Double-click `w·i·p cms.app`** in this folder.

- It starts the editor in the background and opens it in your default browser.
- The first time, and after you pull an update, it gets things ready for a moment first.
- Drag it to the Dock to keep it handy. (It used to be called "wip cms.app": if the Dock
  shows a question mark, drag the new one there instead.) It can also live in Applications: it remembers
  where this folder is (and asks, if it ever can't find it).
- **Quit** from the ⋯ menu stops the editor. Closing the tab leaves it running quietly
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
| **Sidebar** | **Collections**: things you keep adding to (blog posts, projects). Then single **pages**, under the group they're in in `.pages.yml` (e.g. Pages: Home, About). Then **Site**: the Images library, and one-of-a-kind items that aren't in a group (the site's title and description, say). At the bottom: how many files are waiting to be published (click it to see which). **Search** at the top looks through every section at once. Click the site name at the top to open another site; in that list, the pencil gives a site a **nickname** (also in Settings → Site). |
| **List** | The posts in that section. The ⇅ button picks how they're **grouped** (by month, by year, by any choice field such as Category, or not at all) and **sorted** (newest first, oldest first, or by title). Each section remembers its own for each view (list, grid, titles only), and it only changes this list, never the order on your site. Out of the box, sections filed by month (like blog posts) group by year and month in titles only, with no date beside each post (the month heading says when); grouped by year, titles only shows each post's date as 10/22 (10月22日 in Japanese). Other dated sections (like projects) group by year, without dates. Click a group to fold it away. Search at the top; the pencil makes a new one. The three buttons beside the search show it as a **list** (picture, title, first words), a **grid** (square pictures, three across, edge to edge; point at one for its title) or **titles only**; each section remembers its own. Drag the list's right edge to make it wider. |
| **Document** | The open post: its title, then its blocks as they'll read. Click a block to select it: its options (caption position, alt text…) appear, with a small bar to move it up or down or delete it. Point between two blocks for a **+** that inserts one there. |
| **Inspector** | The post's details: featured image, date, switches, tags, and its permalink. |

**New posts:** the pencil above the list asks for a title and a **permalink** (the end of
its web address, e.g. `/blog/2026/10/cafe-opening/`). The permalink follows the title as
you type; change it and it stays as you set it. Where a section has a full title (projects), it asks for
the **full title** and an optional **short title**, and the permalink follows the short
title (or the full title, if that's all there is). Give just one and it's the title.

**Projects:** the document holds what you'd read and see: the full title as the heading (as
on the project's own page; when there isn't one, the short title shows there in gray), the
short title under it, the project text, and then the gallery (in the staggered layout the site uses).
The inspector keeps the smaller details: featured image, date, ongoing, book, category and
related posts. The site's own layout doesn't change. (Any section works this way: a field
called `longTitle` or `fullTitle` becomes the heading, with the title under it, and fields with several images go after the text.)

**Lists inside a page** (the home page's collage spots, exhibitions): items with a picture
show as **tiles**; drag them into order, click one to edit it underneath. Short items (a
year and a line) are one **row** each, with a handle to drag. Anything bigger folds into cards.

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
  monospace font, color-coded. HTML blocks are color-coded too.
  Text always opens in Write; Source lasts while you stay on that page.

**Settings:** ⋯ → **Settings…** has how w·i·p cms works for you (Customize is how it looks):

- **Language:** English or 日本語. Japanese switches all of w·i·p cms (your section and field
  names from .pages.yml too, for the common ones). Translations live in
  `public/js/i18n.js`; anything without one stays in English.
- **Date format:** October 28, 2026 · 2026年10月28日.
- **Interface size:** makes the sidebar, list, toolbar and inspector bigger or smaller
  (85–130%). The writing has its own size, in Customize → Typography.
- **Use typographer's quotes:** " and ' become “ ” and ‘ ’ as you type (apostrophes too),
  as in InDesign. Not in Source, HTML or web addresses.
- **Save after:** how many seconds after you stop typing it saves. ⌘S always saves straight away.
- **When w·i·p cms opens:** the last site, or the list of sites.
- **Site:** which site is open, its nickname, and opening another.

**Customize:** ⋯ → **Customize…** has three tabs. **Themes**: match your Mac or pick
light or dark, and choose a theme for each (Light, Paper and Dark come built in);
duplicate one to make your own. **Export** saves the theme you're on as a
`.wiptheme.json` file in Downloads; **Import…** adds one from a file (to share a theme
or move it to another Mac). **Colors** and **Typography** change the theme you're on: its
colors; fonts (System, EB Garamond, SF Mono, Menlo, Zen Old Mincho, Zen Kaku Gothic New,
or any other font on your Mac or on Google Fonts); writing size, weight, line, letter and
word spacing; the interface's font and weight; and code colors (for dark or light backgrounds), with a preview at the
top as you go. "Match my computer" switches between your light and dark theme. Themes are kept
in this browser.

**Toolbar**

- **Write / Split / Preview:** just the document, the document beside the live site
  (drag the line between them), or just the site. In Split, the post list steps aside
  to make room.
- **⊕ Insert a block**, **Add photos** (one image block per photo), and **Rearrange**
  (each block shrinks to one line you can drag).
- **Open on your site** in a new tab, and **show / hide the inspector**.
- **⋯** has **Revert to when opened**, **Open on your site**, **Appearance** (match your
  Mac, light or dark), **Customize…**, **Settings…**, **Open another site…** and **Quit**.
- The sidebar button (top of the sidebar) hides the sidebar and list for more room.

In a narrower window the list, then the sidebar, step aside while you write. On a phone
it shows one column at a time, details open as a sheet from the bottom, and insert,
photos and rearrange float at the bottom of the screen.

**Saving and publishing**

- There's no Save button: it saves a moment after you stop typing (the toolbar shows
  Edited, Saving…, Saved). **⌘S** saves straight away.
- If a file changes somewhere else while it's open here (a pull in GitHub Desktop, a text editor,
  your phone), the next save is refused with a message instead of undoing that change. Reopen the
  post to see the latest, then make your change again.
- **Revert to when opened** (in ⋯) puts the post back the way it was when you opened it.
- Saving writes into the site folder. Publish the way you normally do: commit and push
  in GitHub Desktop.
- **Move to Trash** moves the post and its image folder into `.cms-trash` in the site,
  so you can get them back: **Trash** at the bottom of the sidebar lists what's there, newest
  first, with **Put back** for each (a post comes back with its pictures, a list item goes back
  to its place in the list). To empty it, delete `.cms-trash` in the Finder (**Show in Finder**). It's the red trash can in the toolbar while a post is open
  (it asks first), and in the menu when you right-click a post in the list.
- **Select** (the checklist beside +, or ⌘-click a post) picks several in the list, in any
  view but Spreadsheet; how many shows under the list's title. Three icons float at the
  bottom of the list: **Select all** (press again for none), the trash can (moves them all
  to `.cms-trash` together) and ✓ to stop selecting (or Esc).
- **Open on your site** (in ⋯) opens the post's page on the live preview in a new tab.

**Changes** (click "N changes to publish" at the bottom of the sidebar): every file that differs
from the last commit, marked New, Changed, Deleted or Renamed, with a button to show it in the Finder.
It only shows; publishing stays in GitHub Desktop. (The count is per file, so a new post with
four pictures is five changes.)

**Search** (top of the sidebar): type a few words and every post, project, list item and page
that has all of them (in its title or text, any order) is listed, titles first. Click one to open it.

**Check content** (sidebar, under Media): **Pictures nothing uses** are files in the media library
that no post, data file or template mentions by address or by file name; tick some and **Move to
Trash** (they can be put back). **Pictures without alt text** lists posts and pages with a picture
that has none: Markdown `![](photo.webp)` or an `<img>` with no `alt`, a block or list item whose
`alt` is empty, or (only in sections whose fields in `.pages.yml` include an `alt` field) one with no
`alt` at all. A decorative picture can honestly have none, so it's a list to look through.
**Stray formatting marks** lists text where a typed `**`, `__` or `~~` (or two or more single `*`)
never turned into formatting, and **Double spaces** lists text with two or more spaces in a row
(shown as ␣). Both look at a post's body and every text field, skip code, and leave a lone `*` (a
footnote star) and Markdown's two-spaces line break alone. Click a row to open it at the spot, or press **Fix** to put it right without opening it
(**Fix all** on a tab does every item; a toast has Undo). Fix collapses double spaces to one and
removes a stray mark; a pair with a misplaced space (`**Kim **The`) keeps its bold (`**Kim** The`).
It changes the files only, like any edit, so publishing is still up to you.

**Slips in Write:** a double space or a leftover `**`, `__` or `~~` gets a red dotted underline in the
writing box (drawn with the browser's highlight feature, so the text and ⌘Z are untouched). Click it
for the fix (remove the extra space, remove the mark). Settings → Writing → Mark slips as you write
turns it off. Titles and other single-line fields aren't underlined; Check content still lists them.

**Media** (in the sidebar, under Site): every picture, video and file in the site's media
folder, shown as **icons**, a **list** (name, kind, size, date modified) or **columns** (a
column per folder, and a preview of the file you click), like Finder. Click one to copy its address. **Select** (or ⌘-click) picks several; **Move to
Trash** moves them into `.cms-trash`, after saying which are still used on the site.

**Images**

- Under an image field: **Choose from Library**, or upload from **Computer** or **Phone**.
- **Crop and rotate** (point at a picture in a post for its tools): drag to move, zoom, turn a
  quarter at a time or straighten. **Match the others** makes it exactly the shape most of the
  pictures beside it share (the rest of its carousel or gallery; for a picture on its own, the
  other single pictures in the post), for pictures that are nearly but not quite the same shape.
  It's saved under the same name; the first crop keeps the uncropped original in
  `.cms-trash/originals/`, and cropping again starts from that.
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
  can only reach the upload page; the editor is only reachable from your Mac (unless you turn
  on **Other devices**, below). The link changes every time w·i·p cms starts.

**Adding a collection or page:** the **+** at the bottom of the sidebar. Choose
**Collection** (many entries, like blog posts) or **Page** (one, like About), give it a name,
and it's added to `.pages.yml` with a place for its content, ready to write in.

- **Fields** start as **Same as** one of the site's existing ones (so a new collection on
  studiotomby.com is like Projects, and on dosa it's a list like dosa's projects). Picture
  folders named after the one copied are renamed for the new one. Or start fresh: Posts
  (title, picture, date, draft, tags) or Simple (title and text).
- **Kept as:** Markdown files in a folder, or a list in one data file (collections); a
  Markdown page, or a data file (pages). It starts as whatever the copied one uses.
- Pages go under one of the sidebar's groups, or Site.
- Only additions are made to `.pages.yml`: your comments and layout stay as they are.
- What w·i·p cms can't do is make the site show it: that needs a template on the site, which
  is different for every site. After adding, it says what the site needs.

## Shortcuts, links, history

- **⌘K** opens quick open: type to jump to any post or page, or search the text of the whole site.
- **⌘\** cycles Write / Split / Preview. **⌥⌘N** starts a new item in the section you're in.
  (⌘N and ⌘⇧P belong to the browser, so these two use other keys.)
- **⌘Z / ⇧⌘Z** undo and redo block changes (moving, deleting, adding) when you're not typing in a
  block; typing itself keeps the browser's own undo. Deleting a block also shows an **Undo** button.
- **Paste** an image into a text block to add it as a picture block. Paste a web address over
  selected text to make it a link.
- **Links:** the link button opens a small picker that searches your own posts and pages, or
  takes any address.
- **Word count and reading time** show under the blocks.
- **Drafts only:** click the drafts count in a section to show only drafts.
- **Version history** (⋯ menu): earlier saved versions from git, with what changed. **Put this
  version back** first keeps the current text in `.cms-trash/replaced-versions/`.
- **Can't reach your Mac:** if the connection drops, a banner appears, what you type stays in the
  page, and it saves when the connection is back.
- **Slash menu:** type **/** on an empty line in a text block to open the block menu (↑ ↓ and Return,
  Esc to go back). What you choose replaces the empty line.
- **Pictures** (beside the writing): the pictures in this post's own folder. Drag one into the post, or
  click it. An image block with no alt text says so; click the note to type one.
- **Keyboard shortcuts:** press **?** for the list.
- **Edges:** drag the edge of the sidebar or the details column to resize it (double-click puts it
  back; with the keyboard, focus the edge and use ← →).
- **Sorting:** in a collection's sort menu, **Recently edited** (posts kept as files). The status under
  the title shows when it was last saved if you hover it.
- **On a phone:** swipe a row right to make it a draft (or take it out of drafts), with Undo; the
  formatting bar rides above the keyboard; the page can be added to the Home Screen.
- **Accessibility:** works with the keyboard and screen readers (skip link, labeled fields,
  dialogs that trap and return focus, reduced-motion respected); pinch zoom is allowed.

## Using it from your phone (or anywhere)

⋯ → **Settings… → Other devices** lets a phone open the whole editor, so you can write a post
away from your desk. It's off until you turn it on.

1. Install **Tailscale** (free, tailscale.com/download) on the Mac and on the phone, and sign
   in to the same account on both. It makes a private, encrypted connection between your
   devices; nobody else can reach either one, and nothing is put on the public internet.
2. In Settings → Other devices, choose a **password** (12 characters or more) and turn on
   **Let my other devices connect**.
3. On the phone, open the address shown there (or scan the QR code), sign in with the password,
   and use it like on the Mac. Safari's Share → Add to Home Screen gives it an icon.
4. Optional: turn on **Secure address (https)** in the same place. It runs `tailscale serve` so the
   phone gets a normal `https://<your-mac>.<tailnet>.ts.net` address: Safari stops saying "not
   secure" and copying works. Tailscale needs HTTPS certificates turned on for your account first
   (tailscale.com/admin/dns); if it isn't, the toggle shows what Tailscale said. It stays inside your
   Tailscale network (this is **not** Funnel). Requests come through that proxy still need the password,
   and the sign-in cookie is marked Secure.

The Mac has to be awake and w·i·p cms running (closing its window is fine). What you write is
saved in the site's folder on the Mac, so you publish the way you always do, in GitHub Desktop.

What a signed-in phone can't do: quit w·i·p cms, open other sites, show things in the Finder,
or change this setting. It can edit and add posts and pictures, crop, move things to the Trash and
put them back.

**Safety**

- The password is kept as a salted hash (`~/.wip-cms-remote.json`, readable by you only), five
  wrong tries lock a device out for 15 minutes, and a sign-in lasts 60 days.
- Changing the password, turning the setting off, or **Sign out all devices** signs every
  device out at once. Do that if you lose a phone.
- Anyone who signs in can edit the site's files. Don't share the password or the Tailscale
  account, and don't turn on Tailscale's **Funnel** (it publishes things to the whole internet).
- Without the secure address, the connection runs over plain `http` inside Tailscale's encrypted
  network, so Safari calls the page "not secure" and a few small conveniences, such as copying to the
  clipboard, may not work there. Turn on **Secure address (https)** to fix that.
- Even with this off, the preview is only reachable from this Mac. (Eleventy's own server used
  to answer anyone on the same network; w·i·p cms now starts it so it only answers this
  computer, and its go-between asks other devices to sign in.) Requests from other web pages
  are refused, and a proxy on this Mac (Tailscale's `serve`, a tunnel) can't pass for the Mac
  itself.

### What it does on a phone

It behaves like an app rather than a small desktop window:

- **Go back** by dragging from the left edge; the screen follows your finger.
- **Swipe a row left** for Trash (swipe all the way to trash it right away). **Press and hold** a row for Open, Select, Move to Trash.
- **Pull the list down** to refresh it.
- **Menus are sheets** from the bottom: swipe down to dismiss. **Details** is a sheet you can drag to half height, full height, or away.
- Lists have a large title that shrinks into the bar as you scroll. Buttons are 44px, and floating bars rise above the keyboard.
- **Add it to your Home Screen** (Share → Add to Home Screen) and it opens full screen, without Safari's bars.

## Other sites

w·i·p cms isn't tied to studiotomby.com. What it needs from a site is a `.pages.yml` (the
Pages CMS format) whose sections are folders of Markdown files. It works out the rest
from the fields:

- **Entries** can be folders (`my-post/index.md`) or plain files (`2026-10-28-my-post.md`),
  whichever the section's `filename` template says. `{year}`, `{month}`, `{day}` and
  `{primary}` work in templates.
- **The date** is a field called `date`, or else the first date field.
- **The list picture** is `featuredImage`, or else the first single-image field.
- **A gallery shown one picture per row** is switched by a yes/no field called
  `singleWidth`: when it's on, the gallery here is one picture per row instead of the
  staggered grid, and changes as you flip it (a site whose gallery looks that way should
  use that name for its switch).
- **Grouping** offers every single-choice (select) field.
- **New choices:** a select with `creatable: true` in its options (as in Pages CMS) lets you
  type a new value as well as pick one; typing an existing one in other capitals keeps its spelling.
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

Clicking a link in the preview opens that page's post (or page) in the editor, when one makes
it; a listing page, say, leaves the editor as it is. To know which page the preview is on,
http://localhost:8080 is a small go-between in front of Eleventy (which really runs at 9080)
that adds one line of script to each page; nothing in your site changes.

Changes you make outside w·i·p cms are copied into the shadow copy too, for example
editing a template in VS Code or pulling in GitHub Desktop.

The preview needs an Eleventy site with its packages installed (`npm install` in the
site folder). For other sites, everything except the preview still works.

## Where things are (for changing it later)

```
w·i·p cms.app        the Mac app: double-click to start (Contents/MacOS/wip-cms is the script)
test/                automated tests: `npm test` (see below)
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
  preview.js         the live preview (shadow copy + Eleventy, and the go-between in front of it)
  history.js         version history from git: list, diff, put a version back
  trash.js           the Trash page: what's in .cms-trash, and putting things back
  phone.js           phone uploads: the secret link, the QR code, who counts as "this computer"
  remote.js          Other devices: the password, signing in, locking out guessers, the addresses, https
  changes.js         the Changes page: what git says is waiting to be published (read-only)
  search.js          searching every section at once
  audit.js           Check content: unused pictures, pictures without alt text, stray marks, double spaces
  textcheck.js       the stray-mark and double-space checks
  textfix.js         the fixes for them (Check content → Fix)
  bind-loopback.js   makes the preview's Eleventy answer only this computer
  setup.js           setting up a new site: writes its .pages.yml
  sections.js        adding a collection or page to a site that's set up (the sidebar's +)
public/
  index.html         the window: sidebar, list, toolbar, document, preview, inspector
  login.html         what another device sees until it has signed in
  styles.css         all the styling; light and dark colors at the top
  phone.html         the page your phone sees
  js/
    app.js           the columns, the toolbar and ⋯ menu, the preview, opening things
    editor.js        one open post: the document and the inspector, saving as you type
    fields.js        each kind of field (text, date, switch, tags, image…)
    blocks.js        the blocks: select, insert, move, rearrange, delete
    media.js         image uploads (WebP), the picker window, the Images page
    crop.js          the Crop and rotate window
    touch.js         phone gestures and sheets: edge-swipe back, swipe a row to Trash, press and hold, pull to refresh, bottom sheets, haptics
    trash.js         the Trash page
    changes.js       the Changes page
    search.js        the Search page
    audit.js         the Check content page
    setup.js         the "Set up a site" window
    rich.js          the writing box: Markdown shown formatted, and turned back into Markdown
    code.js          color-coded Source view
    theme.js         themes and the Customize window
    addsection.js    the "Add to the sidebar" window (the sidebar's +)
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

## Tests

```sh
npm test
```

Runs in a few seconds, on throwaway sites it builds in your temp folder (it never touches your real
sites or your `~/.wip-cms*.json` files). They check the parts that rewrite your files: front matter
round trips, saving one list item without touching the rest, refusing a save over a file that
changed elsewhere, the Trash and putting things back, search, the picture checks, the changes list,
version history and restoring, and the sign-in rules for Other devices. Run it after changing anything in `lib/`. The tests are in
`test/*.test.js`; `test/helpers.js` builds the sample site.
