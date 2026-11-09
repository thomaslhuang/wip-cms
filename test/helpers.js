// Shared by the tests: a throwaway site folder, and a throwaway home folder so the tests never
// touch the real ~/.wip-cms.json or ~/.wip-cms-remote.json. Require this file FIRST in a test.
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wip-home-"));

const PAGES_YML = `media: src/images
content:
  - name: blog
    label: Blog
    type: collection
    path: src/blog
    filename: "{year}/{month}/{primary}/index.md"
    view:
      primary: title
    fields:
      - { name: title, type: string }
      - { name: date, type: date }
      - { name: draft, type: boolean }
      - name: blocks
        type: block
        list: true
        blocks:
          - name: text
            fields:
              - { name: text, type: rich-text }
          - name: image
            fields:
              - { name: src, type: image }
              - { name: alt, type: string }
  - name: projects
    label: Projects
    type: file
    list: true
    path: src/_data/projects.json
    fields:
      - { name: title, type: string }
      - { name: slug, type: string }
      - { name: year, type: number }
  - name: about
    label: About
    type: file
    path: src/_data/about.json
    fields:
      - { name: heading, type: string }
`;

const POST = `---
title: Cafe opening
date: 2026-10-22T00:00:00-07:00
draft: false
blocks:
  - type: text
    text: We opened the doors on a Tuesday.
  - type: image
    src: /images/blog/2026/10/cafe-opening/front.webp
    alt: The front door
---
`;

const PROJECTS = JSON.stringify([
  { title: "First", slug: "first", year: 2024 },
  { title: "Second", slug: "second", year: 2023 },
], null, 4) + "\n";

// a site on disk, opened. `extra`: more files, { "src/x.md": "text" }
function makeSite(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wip-site-"));
  const files = {
    ".pages.yml": PAGES_YML,
    "src/blog/2026/10/cafe-opening/index.md": POST,
    "src/_data/projects.json": PROJECTS,
    "src/_data/about.json": JSON.stringify({ heading: "About this studio" }, null, 2) + "\n",
    "src/images/blog/2026/10/cafe-opening/front.webp": "pretend-image",
    ...extra,
  };
  for (const [name, text] of Object.entries(files)) {
    if (text === null) continue;
    const full = path.join(root, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  require("../lib/site").openSite(root);
  return root;
}

const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (root, file, text) => { const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, text); };

module.exports = { makeSite, read, write, POST, PROJECTS };
