// "Can't reach your Mac": when the editor can't talk to w·i·p cms (the Mac is asleep or off, the phone
// lost its connection), a note says so, nothing you typed is thrown away (the open post keeps
// trying to save), and the moment the Mac answers again it saves.
import { h, announce } from "./util.js";
import { api, onConnection, isOnline } from "./api.js";
import { t } from "./i18n.js";

export function watchConnection({ onBack = () => {} } = {}) {
  let banner = null, timer = null;
  const check = () => api.version().catch(() => {});   // (api.js notices the answer, or the lack of one)
  function show() {
    if (banner) return;
    banner = h("div", { class: "conn-banner", role: "status" },
      h("span", { class: "conn-dot", "aria-hidden": "true" }),
      h("span", { class: "conn-text" }, t("Can't reach your Mac. What you write stays here and saves when it's back.")),
      h("button", { class: "conn-retry", onclick: check }, t("Try again")));
    document.body.append(banner);
    announce(t("Can't reach your Mac. What you write stays here and saves when it's back."), true);
    timer = setInterval(check, 3000);
  }
  function hide() {
    clearInterval(timer);
    banner?.remove(); banner = null;
  }
  onConnection((ok) => {
    if (!ok) return show();
    const wasShowing = !!banner;
    hide();
    if (wasShowing) { announce(t("Reconnected. Saving…")); onBack(); }
  });
  window.addEventListener("online", check);
  if (!isOnline()) show();
}
