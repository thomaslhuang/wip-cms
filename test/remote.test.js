require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const remote = require("../lib/remote");
const phone = require("../lib/phone");

const req = (headers = {}, address = "100.64.0.9") => ({ headers, socket: { remoteAddress: address } });

test("the password must be long enough, and sign-in then works", async () => {
  await assert.rejects(remote.configure({ password: "short" }), (e) => e.status === 400);
  await remote.configure({ password: "a long enough password", enabled: true });
  const cookie = await remote.login(req(), "a long enough password");
  assert.ok(cookie.includes("."));
  await assert.rejects(remote.login(req(), "nope nope nope nope"), (e) => e.status === 401);
});

test("a cookie from the right secret is accepted, a forged one isn't", async () => {
  await remote.configure({ password: "a long enough password", enabled: true });
  const good = await remote.login(req(), "a long enough password");
  assert.ok(remote.sessionLeft(req({ cookie: "wip_session=" + good })) > 0);
  const forged = good.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
  assert.strictEqual(remote.sessionLeft(req({ cookie: "wip_session=" + forged })), 0);
});

test("changing the password signs everyone out", async () => {
  await remote.configure({ password: "a long enough password", enabled: true });
  const cookie = await remote.login(req(), "a long enough password");
  await remote.configure({ password: "a different long password" });
  assert.strictEqual(remote.sessionLeft(req({ cookie: "wip_session=" + cookie })), 0);
});

test("five wrong tries lock one device out, not the others", async () => {
  await remote.configure({ password: "a long enough password", enabled: true });
  for (let i = 0; i < 5; i++) await assert.rejects(remote.login(req({}, "100.64.0.50"), "wrong wrong wrong"), (e) => e.status === 401);
  await assert.rejects(remote.login(req({}, "100.64.0.50"), "a long enough password"), (e) => e.status === 429);
  await remote.login(req({}, "100.64.0.51"), "a long enough password");
});

test("behind Tailscale's https, the cookie is Secure and each phone is counted by its own address", async () => {
  await remote.configure({ password: "a long enough password", enabled: true });
  assert.match(remote.sessionCookie(req({ "x-forwarded-proto": "https" })), /; Secure/);
  assert.doesNotMatch(remote.sessionCookie(req()), /Secure/);
  const proxied = (ip) => req({ "x-forwarded-for": ip, "x-forwarded-proto": "https" }, "127.0.0.1");
  assert.strictEqual(remote.clientKey(proxied("100.64.0.7")), "100.64.0.7");
  // a device on the network can't pick its own key by sending the header
  assert.strictEqual(remote.clientKey(req({ "x-forwarded-for": "1.2.3.4" }, "100.64.0.8")), "100.64.0.8");
  for (let i = 0; i < 5; i++) await assert.rejects(remote.login(proxied("100.64.0.60"), "wrong wrong wrong"), (e) => e.status === 401);
  await assert.rejects(remote.login(proxied("100.64.0.60"), "a long enough password"), (e) => e.status === 429);
  await remote.login(proxied("100.64.0.61"), "a long enough password");
});

test("a request through a proxy on this Mac is never 'this computer'", () => {
  assert.strictEqual(phone.isLocal(req({ host: "localhost:4321" }, "127.0.0.1")), true);
  assert.strictEqual(phone.isLocal(req({ host: "localhost:4321", "x-forwarded-for": "100.64.0.9" }, "127.0.0.1")), false);
  assert.strictEqual(phone.isLocal(req({ host: "mac.tail1.ts.net", "tailscale-user-login": "a@b" }, "127.0.0.1")), false);
  assert.strictEqual(phone.isLocal(req({ host: "evil.example" }, "127.0.0.1")), false);
});

test("tailscale serve's status is read into the https address", () => {
  const serving = (proxy) => ({ TCP: { 443: { HTTPS: true } }, Web: { "mac.tail1234.ts.net:443": { Handlers: { "/": { Proxy: proxy } } } } });
  assert.deepStrictEqual(remote.parseServe(serving("http://127.0.0.1:4321"), 4321), { url: "https://mac.tail1234.ts.net" });
  assert.strictEqual(remote.parseServe(serving("http://127.0.0.1:9999"), 4321), null);
  assert.strictEqual(remote.parseServe({}, 4321), null);
  assert.strictEqual(remote.parseServe("not json", 4321), null);
});
