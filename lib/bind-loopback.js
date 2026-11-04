// Loaded into the site's own Eleventy while it runs the live preview (lib/preview.js passes it
// in with NODE_OPTIONS), so Eleventy's server answers only this computer. Its own default is to
// answer everyone on the network. The preview you open goes through w·i·p cms's go-between
// instead, which asks other devices to sign in first.
//
// Only a server that's told a port and nothing else about where to listen is changed.
const net = require("net");
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const first = args[0];
  if (first && typeof first === "object" && first.port != null && !first.host && !first.path && !first.fd) {
    args[0] = { ...first, host: "127.0.0.1" };
  } else if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    if (typeof args[1] !== "string") args.splice(1, 0, "127.0.0.1");   // listen(port, [backlog], [callback])
  }
  return listen.apply(this, args);
};
