// The spreadsheet view of a section (Settings → Advanced tools): one row per entry, one column
// per short field, edited right in the cells, the way the same information would be kept in
// a spreadsheet.
//
//   typing         changes a cell; it saves a moment after you leave it (Esc puts it back)
//   Enter / ↑ ↓    the cell above or below (Shift+Enter: a new line, in long text)
//   pasting        a block copied from Google Sheets, Numbers or Excel fills the cells from the
//                  one you're in, across and down; rows past the last one become new entries
//   Copy all       the whole table, to paste into a spreadsheet
//   a row's number opens it in the editor, for its writing, pictures and anything else
//
// Long or nested things (a post's text, galleries, blocks) are shown as a count, and open in
// the editor. Changing a permalink asks first; required fields can't be emptied; two items
// can't share a permalink (the server checks that too).
import { h, fill, icon, toast, confirmBox } from "./util.js";
import { api } from "./api.js";
import { t, t2, tl } from "./i18n.js";

// a permalink typed or pasted in: spaces and anything a web address can't hold become "-"
// (capitals are kept: some sites use them, like dosa's style numbers)
const slugify = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[^A-Za-z0-9._~-]+/g, "-").replace(/^-+|-+$/g, "");

// how each kind of field shows as a column
function kindOf(f) {
  if (f.type === "block" || (f.type === "object" && f.list) || f.type === "object") return "count";
  if (f.list && (!f.type || f.type === "string")) return "words";   // tags: "travel, art"
  if (f.type === "image") return f.options?.multiple ? "count" : "text";
  if (f.type === "boolean") return "bool";
  if (f.type === "number") return "number";
  if (f.type === "date") return "date";
  if (f.type === "select") return f.options?.multiple ? "words" : "select";
  if (["text", "rich-text", "code"].includes(f.type)) return "long";
  return "text";
}
// a column's heading: a set of pictures or videos (a gallery, a project's pictures, a press
// item's pages) is "Media" in every section, as in the sidebar; the rest use their label
const isMedia = (f) => (f.type === "image" && f.options?.multiple) || (f.type === "object" && f.list && (f.fields || []).some((x) => x.type === "image"));
const heading = (c) => (isMedia(c.field) ? t("Media") : tl(c.field.label || c.name));
const WIDTH = { words: 180, text: 170, long: 280, number: 80, bool: 64, date: 130, select: 130, count: 90 };
const choices = (f) => (f.options?.values || []).map((v) => (typeof v === "object" ? { value: String(v.value ?? v.name), label: String(v.label ?? v.value) } : { value: String(v), label: String(v) }));

// a cell's value as text (for copying, and for comparing)
function asText(col, v) {
  if (v === undefined || v === null) return "";
  if (col.kind === "bool") return v ? "TRUE" : "FALSE";
  if (col.kind === "date") return String(v).slice(0, 10);
  if (col.kind === "count") return Array.isArray(v) ? String(v.length) : "";
  if (col.kind === "words") return Array.isArray(v) ? v.join(", ") : String(v);
  return String(v);
}
// text from a spreadsheet -> the value to store (undefined: can't be used here)
function fromText(col, text, old) {
  const s = String(text ?? "").replace(/\r/g, "");
  if (s.trim() === "") return col.kind === "words" ? [] : "";
  // a list of words (tags): separated by commas
  if (col.kind === "words") return [...new Set(s.split(/[,、\n]/).map((w) => w.trim()).filter(Boolean))];
  if (col.kind === "number") { const n = Number(s.replace(/,/g, "")); return isFinite(n) ? n : undefined; }
  if (col.kind === "bool") return /^(true|yes|y|1|x|✓|✔|on|はい)$/i.test(s.trim());
  if (col.kind === "date") {
    const d = new Date(/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) + "T12:00:00" : s);
    if (isNaN(d)) return undefined;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rest = /^\d{4}-\d{2}-\d{2}(T.*)$/.exec(String(old || ""));
    return rest ? day + rest[1] : day;
  }
  if (col.kind === "select") {
    const hit = choices(col.field).find((c) => c.value.toLowerCase() === s.trim().toLowerCase() || c.label.toLowerCase() === s.trim().toLowerCase());
    return hit ? hit.value : undefined;
  }
  // a year column that the site keeps as a number stays a number
  if (typeof old === "number" && /^-?\d+(\.\d+)?$/.test(s.trim())) return Number(s.trim());
  return col.kind === "long" ? s : s.replace(/\n/g, " ");
}

// rows and columns of tab-separated text, as spreadsheets copy it (a cell with a line break or
// a tab in it comes in "quotes", with "" for a quote mark inside)
export function parseTSV(text) {
  const rows = [[]];
  let cell = "", i = 0, quoted = false;
  const s = String(text).replace(/\r\n?/g, "\n").replace(/\n$/, "");
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { quoted = true; i++; continue; }
    if (ch === "\t") { rows[rows.length - 1].push(cell); cell = ""; i++; continue; }
    if (ch === "\n") { rows[rows.length - 1].push(cell); rows.push([]); cell = ""; i++; continue; }
    cell += ch; i++;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}
const tsvCell = (v) => (/[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

export function tableView({ section, order, onOpen, onNew, beforeSave, afterSave }) {
  const s = section;
  const fields = s.fields.filter((f) => !f.hidden && f.name !== "newTags");
  const primary = fields.find((f) => f.name === s.primary) || fields[0];
  const cols = [primary, ...fields.filter((f) => f !== primary)].filter(Boolean).map((f) => ({ field: f, name: f.name, kind: kindOf(f) }));
  const editable = (col) => col.kind !== "count";

  let rows = [];          // { file, version, data }
  let filter = "", active = null;
  const el = h("div", { class: "sheet-wrap" });
  const scroller = h("div", { class: "sheet-scroll" });
  const table = h("table", { class: "sheet" });
  const tbody = h("tbody", {});
  const status = h("span", { class: "sheet-status muted" });
  el.append(
    h("div", { class: "sheet-bar" }, status,
      h("button", { class: "btn small", title: t("The whole table, to paste into a spreadsheet"), onclick: copyAll }, t("Copy all"))),
    scroller);
  scroller.append(table);
  table.append(
    h("colgroup", {}, h("col", { style: { width: "40px" } }), cols.map((c, i) => h("col", { style: { width: (i === 0 ? 220 : WIDTH[c.kind]) + "px" } }))),
    h("thead", {}, h("tr", {}, h("th", { class: "sheet-corner" }),
      cols.map((c) => h("th", { title: c.field.description ? tl(c.field.description) : isMedia(c.field) ? tl(c.field.label || c.name) : null, class: "kind-" + c.kind },
        heading(c), c.field.required ? h("span", { class: "required" }, " *") : null)))),
    tbody);

  // ----- saving: changes are collected and sent together, a moment after the last one -----
  let queue = [], timer = null, saving = Promise.resolve();
  const setStatus = (text) => { status.textContent = text; };
  function queueEdit(row, col, value) {
    queue = queue.filter((e) => !(e.file === row.file && e.field === col.name));
    queue.push({ file: row.file, field: col.name, value, version: row.version });
    if (value === "" || value === undefined) delete row.data[col.name]; else row.data[col.name] = value;
    setStatus(t("Edited"));
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  function flush() {
    clearTimeout(timer);
    if (!queue.length) return saving;
    const edits = queue; queue = [];
    saving = saving.then(async () => {
      setStatus(t("Saving…"));
      const files = [...new Set(edits.map((e) => e.file))];
      try {
        await beforeSave?.(files);
        // the newest version of each row (an earlier save may have changed it)
        for (const e of edits) e.version = rows.find((r) => r.file === e.file)?.version ?? e.version;
        const r = await api.tableSave(s.name, edits);
        for (const [file, v] of Object.entries(r.versions || {})) { const row = rows.find((x) => x.file === file); if (row) row.version = v; }
        setStatus(t("Saved"));
        afterSave?.(files);
      } catch (e) {
        setStatus(t("Not saved"));
        toast(e.message, "error");
        await refresh(true);
      }
    });
    return saving;
  }

  // ----- one cell -----
  function cell(row, col, r, c) {
    const v = row.data[col.name];
    const at = { "data-r": r, "data-c": c };
    if (col.kind === "count") {
      const n = Array.isArray(v) ? v.length : v && typeof v === "object" ? 1 : 0;
      return h("td", { class: "kind-count", ...at }, h("button", { class: "sheet-count", title: t("Open to edit"), onclick: () => onOpen(row.file) }, n ? t2(n, "{n} item", "{n} items") : "—"));
    }
    let control;
    const commit = async (raw) => {
      let value = col.kind === "bool" ? raw : fromText(col, raw, v);
      if (value === undefined) { toast(t("“{v}” can't go in {label}.", { v: raw, label: tl(col.field.label || col.name) }), "error"); redraw(); return; }
      if (col.name === "slug" && value) value = slugify(value);
      if (asText(col, value) === asText(col, row.data[col.name])) { if (control.value !== undefined && col.kind !== "bool") control.value = asText(col, row.data[col.name]); return; }
      if (col.field.required && value === "") { toast(t("{label} can't be empty.", { label: tl(col.field.label || col.name) }), "error"); redraw(); return; }
      if (col.name === "slug" && row.data.slug) {
        const ok = await confirmBox(t("Change the permalink from “{a}” to “{b}”? Links to the old address, from other sites or saved by people, will stop working.", { a: row.data.slug, b: value }), t("Change it"));
        if (!ok) { redraw(); return; }
        if (rows.some((x) => x !== row && x.data.slug === value)) { toast(t("Another item already has the permalink “{v}”. Each one needs its own.", { v: value }), "error"); redraw(); return; }
      }
      queueEdit(row, col, value);
      if (col.name === "slug" || col.kind === "date" || col.kind === "number") redraw();
    };
    const redraw = () => { const td = cell(row, col, r, c); control.closest("td")?.replaceWith(td); };
    const keys = (e) => {
      if (e.key === "Escape") { e.preventDefault(); control.value = asText(col, row.data[col.name]); control.blur(); return; }
      const multiline = col.kind === "long";
      if ((e.key === "Enter" && !e.shiftKey && !e.isComposing) || (!multiline && (e.key === "ArrowDown" || e.key === "ArrowUp") && col.kind !== "select")) {
        e.preventDefault();
        move(r + (e.key === "ArrowUp" ? -1 : 1), c);
      }
    };
    if (col.kind === "bool") {
      control = h("input", { type: "checkbox", class: "sheet-check", checked: !!v, "aria-label": tl(col.field.label || col.name), onchange: () => commit(control.checked), onkeydown: keys });
    } else if (col.kind === "select") {
      const opts = choices(col.field);
      control = h("select", { class: "sheet-input", onchange: () => commit(control.value), onkeydown: keys },
        h("option", { value: "" }, ""),
        opts.map((o) => h("option", { value: o.value, selected: String(v ?? "") === o.value }, tl(o.label))),
        v != null && v !== "" && !opts.some((o) => o.value === String(v)) ? h("option", { value: String(v), selected: true }, String(v)) : null);
    } else if (col.kind === "date") {
      control = h("input", { type: "date", class: "sheet-input", value: asText(col, v), onchange: () => commit(control.value), onkeydown: keys });
    } else if (col.kind === "long") {
      control = h("textarea", { class: "sheet-input sheet-long", rows: 1, value: v ?? "", spellcheck: true, onchange: () => commit(control.value), onkeydown: keys });
    } else {
      control = h("input", { type: "text", class: "sheet-input" + (col.kind === "number" ? " num" : ""), value: asText(col, v), inputmode: col.kind === "number" ? "decimal" : null,
        spellcheck: col.name !== "slug", onchange: () => commit(control.value), onkeydown: keys });
    }
    return h("td", { class: "kind-" + col.kind + (c === 0 ? " sticky" : ""), ...at }, control);
  }
  function move(r, c) {
    const td = tbody.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    const ctl = td?.querySelector("input, textarea, select, button");
    if (!ctl) return;
    ctl.focus();
    if (ctl.select && ctl.type !== "checkbox") ctl.select();
    td.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  // ----- the rows -----
  const shown = () => {
    const pos = new Map((order?.() || []).map((f, i) => [f, i]));
    const list = rows.slice().sort((a, b) => (pos.get(a.file) ?? 1e9) - (pos.get(b.file) ?? 1e9));
    if (!filter) return list;
    return list.filter((row) => cols.some((c) => asText(c, row.data[c.name]).toLowerCase().includes(filter)));
  };
  let visible = [];
  function draw() {
    visible = shown();
    fill(tbody, visible.map((row, r) => h("tr", { class: row.file === active ? "active" : "", "data-file": row.file },
      // the row's number opens it in the editor
      h("td", { class: "sheet-rownum" },
        h("button", { class: "sheet-open", title: t("Open"), "aria-label": t("Open") + " " + asText(cols[0], row.data[cols[0].name]), onclick: () => onOpen(row.file) }, r + 1)),
      cols.map((col, c) => cell(row, col, r, c)))),
      h("tr", { class: "sheet-new" }, h("td", { colspan: cols.length + 1 },
        h("button", { class: "sheet-add", onclick: () => onNew() }, icon("plus"), t("New")),
        h("span", { class: "muted small" }, t("Paste rows copied from a spreadsheet into any cell; rows past the last one are added.")))));
    setStatus(t2(rows.length, "{n} row", "{n} rows"));
  }
  async function refresh(force) {
    // don't pull the table out from under someone typing in it
    if (!force && el.contains(document.activeElement) && document.activeElement !== document.body) { pendingRefresh = true; return; }
    pendingRefresh = false;
    rows = (await api.table(s.name)).rows;
    draw();
  }
  let pendingRefresh = false;
  el.addEventListener("focusout", () => setTimeout(() => { if (pendingRefresh && !el.contains(document.activeElement)) refresh(); }, 0));

  // ----- pasting a block from a spreadsheet -----
  tbody.addEventListener("paste", async (e) => {
    const td = e.target.closest("td[data-c]");
    const text = e.clipboardData?.getData("text/plain");
    if (!td || !text || !/[\t\n]/.test(text.replace(/\n$/, ""))) return;   // one cell: the usual paste
    e.preventDefault();
    const grid = parseTSV(text);
    const r0 = Number(td.dataset.r), c0 = Number(td.dataset.c);
    const edits = [], fresh = [];
    let replaced = 0, skipped = 0, relinked = 0;
    grid.forEach((line, i) => {
      const row = visible[r0 + i];
      const add = row ? null : {};
      line.forEach((raw, j) => {
        const col = cols[c0 + j];
        if (!col || !editable(col)) { if (raw.trim()) skipped++; return; }
        const old = row?.data[col.name];
        let value = fromText(col, raw, old);
        if (value === undefined) { skipped++; return; }
        if (col.name === "slug" && value) value = slugify(value);
        if (row) {
          if (asText(col, value) === asText(col, old)) return;
          if (asText(col, old) !== "") replaced++;
          if (col.name === "slug" && old) relinked++;
          edits.push({ row, col, value });
        } else if (value !== "") add[col.name] = value;
      });
      if (add && Object.keys(add).length) fresh.push(add);
    });
    if (!edits.length && !fresh.length) { toast(t("Nothing to paste here."), "error"); return; }
    const msg = [
      edits.length ? t2(edits.length, "Change {n} cell", "Change {n} cells") : null,
      fresh.length ? t2(fresh.length, "add {n} new row", "add {n} new rows") : null,
    ].filter(Boolean).join(t(" and ")) + "?" + (replaced ? " " + t2(replaced, "{n} cell that already has something in it will be replaced.", "{n} cells that already have something in them will be replaced.") : "")
      + (relinked ? " " + t2(relinked, "That includes {n} permalink: links to its old address will stop working.", "That includes {n} permalinks: links to their old addresses will stop working.") : "");
    if ((replaced || fresh.length > 1) && !(await confirmBox(msg, t("Paste")))) return;
    for (const { row, col, value } of edits) queueEdit(row, col, value);
    await flush();
    if (fresh.length) {
      try {
        await beforeSave?.([]);
        const r = await api.tableAdd(s.name, fresh);
        toast(t2(r.added, "Added {n} row", "Added {n} rows"));
        afterSave?.([]);
      } catch (err) { toast(err.message, "error"); }
    }
    if (skipped) toast(t2(skipped, "{n} value didn't fit its column and was left out.", "{n} values didn't fit their columns and were left out."), "error");
    await refresh(true);
  });

  function copyAll() {
    const lines = [cols.map(heading), ...visible.map((row) => cols.map((c) => asText(c, row.data[c.name])))];
    navigator.clipboard.writeText(lines.map((l) => l.map(tsvCell).join("\t")).join("\n"))
      .then(() => toast(t2(visible.length, "Copied {n} row", "Copied {n} rows")), () => toast(t("Couldn't copy."), "error"));
  }

  return {
    el,
    refresh,
    flush,
    setFilter(text) { if (text !== filter) { filter = text; draw(); } },
    setActive(file) { active = file; tbody.querySelectorAll("tr[data-file]").forEach((tr) => tr.classList.toggle("active", tr.dataset.file === file)); },
    redraw: draw,
  };
}
