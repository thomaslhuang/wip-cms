// Using w·i·p cms from your other devices (your phone), when you've turned that on.
//
// Off by default. When it's on, a device that isn't this computer has to sign in with the
// password you chose (Settings → Other devices) before it can see anything. Then it can edit
// the open site like you can here, but not quit, open other sites or reach the rest of
// this Mac (server.js has the list).
//
//   password   kept as a salted scrypt hash, never the password itself, in
//              ~/.wip-cms-remote.json (readable by you only)
//   sign-in    a cookie signed with a secret kept in that file; it lasts 60 days. Changing the
//              password, turning this off, or "Sign out all devices" makes a new secret, so
//              every device has to sign in again
//   guessing   5 wrong tries from one device lock it out for 15 minutes; 20 from all devices
//              lock everyone out for a while
//
// The connection itself is meant to run over a private network such as Tailscale, which
// encrypts it and keeps everyone else off it (see README.md).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const QRCode = require("qrcode");
const phone = require("./phone");

const FILE = path.join(os.homedir(), ".wip-cms-remote.json");
const COOKIE = "wip_session";
const SESSION_MS = 60 * 24 * 3600 * 1000;
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 256;

// ---------- what's saved ----------

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { enabled: !!s.enabled && !!s.hash && !!s.secret, salt: s.salt || null, hash: s.hash || null, secret: s.secret || null };
  } catch { return { enabled: false, salt: null, hash: null, secret: null }; }
}
let state = load();
function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.chmodSync(FILE, 0o600);   // (the mode above only counts when the file is first made)
  } catch (e) { throw Object.assign(new Error("Couldn't save this setting: " + e.message), { status: 500 }); }
}
const newSecret = () => crypto.randomBytes(32).toString("hex");
const enabled = () => state.enabled;

// ---------- the password ----------

const scrypt = (password, salt) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));

async function setPassword(password) {
  const pw = String(password);
  if (pw.length < MIN_PASSWORD) throw Object.assign(new Error(`Use at least ${MIN_PASSWORD} characters: it protects your site from anyone who finds this address.`), { status: 400 });
  if (pw.length > MAX_PASSWORD) throw Object.assign(new Error(`Use at most ${MAX_PASSWORD} characters.`), { status: 400 });
  const salt = crypto.randomBytes(16);
  state.salt = salt.toString("hex");
  state.hash = (await scrypt(pw, salt)).toString("hex");
  state.secret = newSecret();   // everyone signs in again with the new one
}

async function passwordIsRight(password) {
  if (!state.hash || typeof password !== "string" || password.length > MAX_PASSWORD) return false;
  const key = await scrypt(password, Buffer.from(state.salt, "hex"));
  const want = Buffer.from(state.hash, "hex");
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

// Settings → Other devices: { enabled, password } (either, or both)
async function configure({ enabled: on, password } = {}) {
  if (typeof password === "string" && password !== "") await setPassword(password);
  if (typeof on === "boolean") {
    if (on && !state.hash) throw Object.assign(new Error("Choose a password first."), { status: 400 });
    if (!on && state.enabled) state.secret = newSecret();   // turning it off signs everyone out
    state.enabled = on;
  }
  save();
}
function signOutAll() { state.secret = newSecret(); save(); }

// ---------- guessing: how many wrong tries ----------

const WINDOW = 15 * 60 * 1000, PER_DEVICE = 5, ALL_DEVICES = 20;
const tries = new Map();   // address -> times of recent tries that weren't right (yet)
let allTries = [];
const recent = (list, now) => { while (list.length && now - list[0] > WINDOW) list.shift(); return list; };
const waitFor = (ip, now) => {
  const mine = recent(tries.get(ip) || [], now);
  recent(allTries, now);
  const waits = [];
  if (mine.length >= PER_DEVICE) waits.push(WINDOW - (now - mine[0]));
  if (allTries.length >= ALL_DEVICES) waits.push(WINDOW - (now - allTries[0]));
  return waits.length ? Math.max(...waits) : 0;
};

// The try is counted before the password is checked, so a burst of tries sent all at once
// can't slip through while the first ones are still being checked; a right one is un-counted.
async function login(req, password) {
  if (!state.enabled) throw Object.assign(new Error("Other devices can't connect right now."), { status: 403 });
  const ip = req.socket.remoteAddress || "?";
  const now = Date.now();
  const wait = waitFor(ip, now);
  if (wait > 0) throw Object.assign(new Error(`Too many tries. Wait ${Math.ceil(wait / 60000)} minute${wait > 60000 ? "s" : ""} and try again.`), { status: 429, retryAfter: Math.ceil(wait / 1000) });
  const mine = tries.get(ip) || [];
  mine.push(now); tries.set(ip, mine); allTries.push(now);
  if (!(await passwordIsRight(password))) throw Object.assign(new Error("That password isn't right."), { status: 401 });
  const undo = (list) => { const i = list.indexOf(now); if (i >= 0) list.splice(i, 1); };
  undo(mine); undo(allTries);
  return issue();
}

// ---------- signing in: the cookie ----------

const sign = (payload) => crypto.createHmac("sha256", Buffer.from(state.secret, "hex")).update(payload).digest("base64url");
function issue() {
  const payload = `${Date.now() + SESSION_MS}.${crypto.randomBytes(8).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}
const cookieHeader = (value, seconds = SESSION_MS / 1000) => `${COOKIE}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; SameSite=Strict`;
const sessionCookie = () => cookieHeader(issue());
const clearCookie = () => cookieHeader("", 0);

function cookiesOf(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// how long this request's sign-in has left, in ms (0: not signed in, or it isn't valid any more)
function sessionLeft(req) {
  if (!state.enabled || !state.secret) return 0;
  const value = cookiesOf(req)[COOKIE];
  const parts = String(value || "").split(".");
  if (parts.length !== 3) return 0;
  const payload = parts[0] + "." + parts[1];
  const want = sign(payload);
  if (want.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(parts[2]))) return 0;
  const left = Number(parts[0]) - Date.now();
  return left > 0 ? left : 0;
}

// may this request see the editor (or its preview)? This computer always; another device only
// once it has signed in
const allowed = (req) => phone.isLocal(req) || sessionLeft(req) > 0;

// ---------- the addresses to open on the phone ----------

let nameCache = { at: 0, name: null };
function tailscaleName() {
  if (Date.now() - nameCache.at < 60000) return Promise.resolve(nameCache.name);
  const candidates = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];
  const next = (i) => new Promise((resolve) => {
    if (i >= candidates.length) return resolve(null);
    execFile(candidates[i], ["status", "--json"], { timeout: 2500 }, (err, out) => {
      if (err) return resolve(next(i + 1));
      try { resolve(String(JSON.parse(out)?.Self?.DNSName || "").replace(/\.$/, "") || null); } catch { resolve(null); }
    });
  });
  return next(0).then((name) => { nameCache = { at: Date.now(), name }; return name; });
}

const isTailscale = (address) => { const [a, b] = address.split(".").map(Number); return a === 100 && b >= 64 && b <= 127; };

// everything Settings shows
async function status(port) {
  const found = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === "IPv4" && !a.internal) found.push(a.address);
  }
  const tailscale = found.filter(isTailscale);
  const name = tailscale.length ? await tailscaleName() : null;
  const addresses = [
    ...(name ? [{ kind: "tailscale", label: "Tailscale", url: `http://${name}:${port}` }] : []),
    ...tailscale.map((a) => ({ kind: "tailscale", label: "Tailscale", url: `http://${a}:${port}` })),
    ...found.filter((a) => !isTailscale(a)).map((a) => ({ kind: "wifi", label: "Same Wi-Fi", url: `http://${a}:${port}` })),
  ];
  const first = addresses[0];
  const qr = first ? await QRCode.toString(first.url, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } }) : null;
  return { enabled: state.enabled, hasPassword: !!state.hash, minPassword: MIN_PASSWORD, tailscale: tailscale.length > 0, addresses, qr };
}

module.exports = { enabled, configure, signOutAll, login, sessionCookie, clearCookie, sessionLeft, allowed, status, SESSION_MS };
