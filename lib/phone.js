// Uploading photos from your phone.
//
// The CMS shows a QR code. Scanning it on a phone on the same Wi-Fi opens a small upload
// page (public/phone.html) served by this computer. Photos land in the post's own image
// folder, and the editor on your Mac picks them up by itself.
//
// Safety: the link carries a secret that changes every time the CMS starts, and from
// other devices *only* the upload page and the upload itself work; everything else
// (the editor, your files) stays reachable from this computer alone.
const os = require("os");
const crypto = require("crypto");
const QRCode = require("qrcode");

const TOKEN = crypto.randomBytes(16).toString("hex"); // new every start

// is this request from this computer?
function isLocal(req) {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
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
async function phoneLink(port, folder) {
  const hosts = lanAddresses();
  if (!hosts.length) return { links: [], qr: null, error: "This computer doesn't seem to be on a network." };
  const links = hosts.map((h) => `http://${h}:${port}/phone?t=${TOKEN}&folder=${encodeURIComponent(folder)}`);
  const qr = await QRCode.toString(links[0], { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return { links, qr };
}

module.exports = { TOKEN, isLocal, validToken, phoneLink, lanAddresses };
