// Talking to the CMS server (server.js). Every function returns the server's answer.

async function call(method, url, body, isRaw = false) {
  const res = await fetch(url, {
    method,
    headers: body && !isRaw ? { "Content-Type": "application/json" } : {},
    body: body ? (isRaw ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const qs = (o) => new URLSearchParams(o).toString();

export const api = {
  site: () => call("GET", "/api/site"),
  setNickname: (path, nickname) => call("POST", "/api/site/nickname", { path, nickname }),
  openSite: (path) => call("POST", "/api/site", { path }),
  inspectSite: (path) => call("GET", "/api/site/inspect?" + qs({ path })),
  setupSite: (path, plan) => call("POST", "/api/site/setup", { path, plan }),
  quit: () => call("POST", "/api/quit"),
  version: () => call("GET", "/api/version"),
  restart: () => call("POST", "/api/restart"),
  changes: () => call("GET", "/api/changes"),
  preview: () => call("GET", "/api/preview"),
  draft: (file, data, body) => call("PUT", "/api/draft", { file, data, body }),
  discardDraft: (file) => call("DELETE", "/api/draft?" + qs({ file })),
  sectionOptions: () => call("GET", "/api/sections/options"),
  addSection: (plan) => call("POST", "/api/sections", { plan }),
  config: () => call("GET", "/api/config"),
  list: (section) => call("GET", "/api/entries?" + qs({ section })),
  read: (file) => call("GET", "/api/entry?" + qs({ file })),
  save: (file, data, body, version) => call("PUT", "/api/entry", { file, data, body, version }),
  table: (section) => call("GET", "/api/table?" + qs({ section })),
  tableSave: (section, edits) => call("PUT", "/api/table", { section, edits }),
  tableAdd: (section, rows) => call("POST", "/api/table", { section, rows }),
  move: (section, from, to) => call("POST", "/api/move", { section, from, to }),
  mediaUsage: (urls) => call("POST", "/api/media/usage", { urls }),
  trashMedia: (urls) => call("POST", "/api/media/trash", { urls }),
  copyMedia: (url, folder) => call("POST", "/api/media/copy", { url, folder }),
  create: (section, title, slug, extra) => call("POST", "/api/entry", { section, title, slug, extra }),
  remove: (file) => call("DELETE", "/api/entry?" + qs({ file })),
  imageFolder: (file) => call("GET", "/api/image-folder?" + qs({ file })),
  media: (folder) => call("GET", "/api/media?" + qs(folder ? { folder } : {})),
  phoneLink: (folder, edge) => call("GET", "/api/phone-link?" + qs(edge ? { folder, edge } : { folder })),
  replaceMedia: (url, blob) => call("POST", "/api/media/replace?" + qs({ url }), blob, true),
  upload: (folder, name, blob, kind) => call("POST", "/api/upload?" + qs(kind ? { folder, name, kind } : { folder, name }), blob, true),
};
