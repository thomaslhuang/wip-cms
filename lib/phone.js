// Uploading photos from your phone.
//
// The CMS shows a QR code. Scanning it on a phone on the same Wi-Fi opens a small upload
// page (public/phone.html) served by this computer. Photos land in the post's own image
// folder, and the editor on your Mac picks them up by itself.
//
// Safety: the link carries a secret that changes every time the CMS starts, and from
// other devices *only* the upload page and the upload itself work; everything else
// (the editor, your files) stays reachable from this computer alone, unless you've turned
// on Other devices (lib/remote.js), which asks for a password.
const os = require("os");
const crypto = require("crypto");
const QRCode = require("qrcode");

const TOKEN = crypto.randomBytes(16).toString("hex"); // new every start

// Is this request from this computer, in this computer's own browser? It has to arrive from
// the loopback address and:
//   - not through a proxy on this computer (Tailscale's "serve", a tunnel...): those forward
//     other people's requests from 127.0.0.1, and say so in a header
//   - be addressed to "localhost" (or 127.0.0.1): a web page can make its own name point at
//     127.0.0.1 and then talk to this editor from your browser ("DNS rebinding")
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const FORWARDED = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded", "cf-connecting-ip",
  "tailscale-user-login", "tailscale-user-name", "tailscale-user-profile-pic", "tailscale-headers-info"];
function isLocal(req) {
  if (!LOOPBACK.has(req.socket.remoteAddress || "")) return false;
  if (FORWARDED.some((name) => req.headers[name] !== undefined)) return false;
  const host = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

const validToken = (t) => typeof t === "string" && t.length === TOKEN.length &&
  crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));

// this computer's address(es) on the local network, Wi-Fi first
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
    }
  }
  out.sort((x, y) => (y.name === "en0") - (x.name === "en0")); // en0 is usually Wi-Fi on a Mac
  return out.map((x) => x.address);
}

// the link (and QR code) for uploading into one folder
async function phoneLink(port, folder, edge) {
  const hosts = lanAddresses();
  if (!hosts.length) return { links: [], qr: null, error: "This computer doesn't seem to be on a network." };
  const links = hosts.map((h) => `http://${h}:${port}/phone?t=${TOKEN}&folder=${encodeURIComponent(folder)}${Number(edge) > 0 ? "&edge=" + Number(edge) : ""}`);
  const qr = await QRCode.toString(links[0], { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return { links, qr };
}

module.exports = { TOKEN, isLocal, validToken, phoneLink, lanAddresses };
