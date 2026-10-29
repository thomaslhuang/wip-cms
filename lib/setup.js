// Setting up a new site: writes a .pages.yml so w·i·p cms (and Pages CMS) can edit it.
//
//   inspect(folder)        what's there: is it set up already, which site generator,
//                          where the pages and images probably live, which folders exist
//   create(folder, plan)   writes .pages.yml from the choices made in the "Set up" window,
//                          and makes the folders it names. Never overwrites a .pages.yml.
//
// Each section in the plan is a folder of posts or pages, one folder per item
// (e.g. src/work/new-bakery-site/index.md), which is what w·i·p cms lists and creates.
//   kind:     "dated"  (posts, projects, case studies: title, featured image, date, draft, tags)
//             "pages"  (title and a short description)
//   content:  "text"   one block of writing under the title (Markdown)
//             "blocks" text, images, carousels, collages... like studiotomby.com. The site's
//                      templates need to know how to show blocks (see studiotomby's lib/blocks.js)
//   template: optional; becomes a hidden "layout" field, for Eleventy and similar
const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");

const expandHome = (p) => path.resolve(String(p || "").replace(/^~(?=$|\/)/, os.homedir()));
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function inspect(folder) {
  const root = expandHome(folder);
  if (!isDir(root)) return { root, exists: false };
  const hasConfig = fs.existsSync(path.join(root, ".pages.yml"));
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); } catch { /* not a node project */ }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const generator = deps["@11ty/eleventy"] ? "Eleventy" : deps.astro ? "Astro" : deps.next ? "Next.js"
    : fs.existsSync(path.join(root, "hugo.toml")) || fs.existsSync(path.join(root, "config.toml")) ? "Hugo"
    : fs.existsSync(path.join(root, "_config.yml")) ? "Jekyll" : null;
  // where pages live: Eleventy's "input" setting if we can spot it, else src/ if there is one
  let source = isDir(path.join(root, "src")) ? "src" : ".";
  for (const name of ["eleventy.config.js", "eleventy.config.mjs", "eleventy.config.cjs", ".eleventy.js"]) {
    try {
      const m = /input\s*:\s*["'`]([^"'`]+)["'`]/.exec(fs.readFileSync(path.join(root, name), "utf8"));
      if (m) { source = m[1].replace(/^\.\/?/, "").replace(/\/$/, "") || "."; break; }
    } catch { /* no such file */ }
  }
  const sourceDir = path.join(root, source);
  const folders = isDir(sourceDir)
    ? fs.readdirSync(sourceDir).filter((n) => !/^[._]/.test(n) && n !== "node_modules" && isDir(path.join(sourceDir, n))).sort()
    : [];
  const images = ["images", "img", "assets/images"].find((n) => isDir(path.join(sourceDir, n)) && !n.includes("/")) || "images";
  return { root, exists: true, hasConfig, generator, hasPackages: isDir(path.join(root, "node_modules")), source, images, folders };
}

// ---------- the fields each kind of section gets ----------

const BLOCKS = [
  { name: "text", label: "text", fields: [{ name: "text", label: "text", type: "rich-text", options: { format: "markdown" } }] },
  { name: "image", label: "image", fields: [
    { name: "image", label: "image", type: "image" },
    { name: "caption", label: "caption", type: "text" },
    { name: "pair", label: "aside next", type: "boolean" },
    { name: "layout", label: "caption position", type: "select", default: "below", options: { values: [{ value: "below", label: "below" }, { value: "side", label: "side" }] } },
    { name: "alt", label: "alt text", type: "string" },
  ] },
  { name: "photos", label: "multi-upload", fields: [{ name: "images", label: "images", type: "image", options: { multiple: true } }] },
  { name: "carousel", label: "carousel", fields: [
    { name: "images", label: "images", type: "image", options: { multiple: true } },
    { name: "caption", label: "caption (optional)", type: "text" },
    { name: "seconds", label: "seconds per image", type: "number" },
    { name: "alt", label: "alt text (optional)", type: "string" },
  ] },
  { name: "collage", label: "collage", fields: [
    { name: "images", label: "images", type: "image", options: { multiple: true } },
    { name: "caption", label: "caption (optional)", type: "text" },
    { name: "alt", label: "alt text (optional)", type: "string" },
  ] },
  { name: "html", label: "html", fields: [{ name: "html", label: "html", type: "code", options: { format: "html" } }] },
];

function sectionConfig(s, source) {
  const name = slug(s.folder || s.label) || "posts";
  const dated = s.kind === "dated";
  const fields = [{ name: "title", label: "title", type: "string", required: true }];
  if (dated) {
    fields.push(
      { name: "featuredImage", label: "featured image", type: "image" },
      { name: "date", label: "date", type: "date", options: { format: "yyyy-MM-dd'T'HH:mm:ssXXX" } },
      { name: "draft", label: "draft", type: "boolean" },
      { name: "tags", label: "tags", type: "select", options: { multiple: true, creatable: true, placeholder: "pick tags…", values: [] } },
    );
  } else {
    fields.push({ name: "description", label: "description (for search engines and link previews)", type: "text" });
  }
  if (s.template) fields.push({ name: "layout", label: "template", type: "string", hidden: true, default: s.template });
  fields.push(s.content === "blocks"
    ? { name: "blocks", label: "blocks", type: "block", blockKey: "type", blocks: BLOCKS }
    : { name: "body", label: "text", type: "rich-text", options: { format: "markdown" } });
  return {
    name,
    label: s.label || name,
    type: "collection",
    path: path.posix.join(source === "." ? "" : source, name),
    view: {
      layout: "tree",
      node: { filename: "index.md", hideDirs: "nodes" },
      primary: "title",
      fields: dated ? ["title", "date", "draft"] : ["title"],
      ...(dated ? { sort: ["date", "title"], default: { sort: "date", order: "desc" } } : {}),
    },
    filename: { template: "{primary}/index.md", field: false },
    fields,
  };
}

function create(folder, plan) {
  const info = inspect(folder);
  if (!info.exists) throw Object.assign(new Error(`There's no folder at ${info.root}.`), { status: 400 });
  if (info.hasConfig) throw Object.assign(new Error("This folder already has a .pages.yml; open it instead."), { status: 400 });
  const source = String(plan.source || ".").replace(/^\.?\/+|\/+$/g, "") || ".";
  const images = slug(plan.images || "images") || "images";
  const sections = (plan.sections || []).filter((s) => s && (s.label || s.folder));
  if (!sections.length) throw Object.assign(new Error("Add at least one section."), { status: 400 });
  const names = new Set();
  const content = sections.map((s) => {
    const c = sectionConfig(s, source);
    if (names.has(c.name)) throw Object.assign(new Error(`Two sections use the folder "${c.name}".`), { status: 400 });
    names.add(c.name);
    return c;
  });
  const mediaInput = path.posix.join(source === "." ? "" : source, images);
  const config = {
    media: { input: mediaInput, output: "/" + images, extensions: ["webp", "jpg", "jpeg", "png", "gif", "svg", "heic"] },
    content,
  };
  let text = yaml.dump(config, { lineWidth: -1, noRefs: true });
  // keep the tag suggestions up to date automatically (see lib/tags.js)
  text = text.replace(/^(\s*)values: \[\]$/gm, "$1values: [] # tags: kept up to date automatically");
  const header = [
    `# Settings for editing this site in w·i·p cms (and Pages CMS, which reads the same file).`,
    `# Made by w·i·p cms on ${new Date().toISOString().slice(0, 10)}. Docs: https://pagescms.org/docs/configuration/`,
    `#`,
    `# media:    where uploaded images go (${mediaInput}/), and their address on the site (/${images}/...)`,
    `# content:  the sections in the sidebar; each item is a folder with an index.md inside`,
    ``,
  ].join("\n");
  fs.mkdirSync(path.join(info.root, mediaInput), { recursive: true });
  for (const c of content) fs.mkdirSync(path.join(info.root, c.path), { recursive: true });
  fs.writeFileSync(path.join(info.root, ".pages.yml"), header + text, { encoding: "utf8", flag: "wx" });
  return { root: info.root };
}

module.exports = { inspect, create };
