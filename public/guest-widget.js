/* Checkin guest widget — a self-contained Login button + bottom-sheet popup +
   messages panel, dropped onto the marketing site. Same-origin APIs, no deps. */
(function () {
  if (window.__ckGuest) return;
  window.__ckGuest = true;

  var API = {
    me: "/api/user/messages",
    send: "/api/user/otp/send",
    verify: "/api/user/otp/verify",
    logout: "/api/user/logout",
  };

  var st = { loggedIn: false, mobile: "", name: "", messages: [], step: "mobile", dev: null, skip: false, busy: false, err: "" };

  var css =
    "#ckfab{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#4f46e5;color:#fff;border:none;border-radius:999px;padding:13px 20px;font:600 15px system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(79,70,229,.4);cursor:pointer}" +
    "#ckov{position:fixed;inset:0;z-index:2147483001;display:none;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.55);font:400 15px system-ui,-apple-system,Segoe UI,sans-serif}" +
    "#ckov.on{display:flex}" +
    "#cksheet{position:relative;width:100%;max-width:440px;max-height:90vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:16px 16px 24px;box-shadow:0 -8px 40px rgba(0,0,0,.25)}" +
    "@media(min-width:640px){#ckov{align-items:center}#cksheet{border-radius:22px}}" +
    ".ckgrip{width:44px;height:5px;border-radius:999px;background:#e2e8f0;margin:2px auto 12px}" +
    ".ckban{position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(90deg,#4f46e5,#7c3aed,#c026d3);color:#fff;padding:12px 36px 12px 12px}" +
    ".ckx{position:absolute;right:8px;top:8px;width:26px;height:26px;border:none;border-radius:999px;background:rgba(255,255,255,.2);color:#fff;font-size:14px;cursor:pointer}" +
    ".ckbanrow{display:flex;align-items:center;gap:12px}" +
    ".ckbadge{width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:999px;background:#fbbf24;font-size:20px}" +
    ".ckh{font-size:19px;font-weight:600;color:#0f172a;margin:16px 2px 2px}" +
    ".cksub{font-size:14px;color:#64748b;margin:0 2px 14px}" +
    ".ckrow{display:flex;gap:8px}" +
    ".ckpre{display:flex;align-items:center;gap:4px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:12px;padding:0 12px;font-weight:600;color:#334155}" +
    ".ckinp{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:13px 14px;font-size:16px;outline:none;box-sizing:border-box}" +
    ".ckinp:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.15)}" +
    ".ckbtn{width:100%;border:none;border-radius:12px;background:#0f172a;color:#fff;padding:14px;font-size:16px;font-weight:600;cursor:pointer;margin-top:12px}" +
    ".ckbtn:disabled{opacity:.6}" +
    ".ckskip{width:100%;border:none;background:none;color:#94a3b8;font-size:14px;font-weight:500;padding:10px;cursor:pointer}" +
    ".ckerr{background:#fef2f2;color:#b91c1c;border-radius:10px;padding:8px 12px;font-size:14px;margin-top:10px}" +
    ".ckinfo{background:#fffbeb;color:#92400e;border-radius:10px;padding:8px 12px;font-size:14px;margin-top:10px}" +
    ".ckmsg{border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-top:8px}" +
    ".ckmsg p{margin:0;font-size:14px;color:#1e293b}" +
    ".ckmsg small{color:#94a3b8;font-size:12px}" +
    ".cktop{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}" +
    ".cklogout{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:6px 12px;font-size:13px;font-weight:600;color:#334155;cursor:pointer}";

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(v) { var d = new Date(v); return isNaN(d) ? "" : d.toLocaleString(); }

  var fab, ov, sheet;

  function open() { render(); ov.classList.add("on"); }
  function close() { ov.classList.remove("on"); try { sessionStorage.setItem("ck_skip", "1"); } catch (e) {} }

  async function refreshMe() {
    try {
      var r = await fetch(API.me, { credentials: "same-origin" });
      var d = await r.json();
      st.loggedIn = !!d.loggedIn; st.mobile = d.mobile || ""; st.name = d.name || ""; st.messages = d.messages || [];
    } catch (e) { st.loggedIn = false; }
    fab.textContent = st.loggedIn ? "🔔 My Messages" : "Login";
  }

  async function sendOtp() {
    if (st.busy) return; st.busy = true; st.err = ""; render();
    try {
      var r = await fetch(API.send, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mobile: st.mobile }) });
      var d = await r.json();
      if (!r.ok) { st.err = d.error || "Could not send code."; }
      else { st.dev = d.devCode || null; st.skip = !!d.skipVerification; st.step = "otp"; }
    } catch (e) { st.err = "Network error."; }
    st.busy = false; render();
  }

  async function verify() {
    if (st.busy) return; st.busy = true; st.err = ""; render();
    try {
      var r = await fetch(API.verify, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mobile: st.mobile, code: st.code }) });
      var d = await r.json();
      if (!r.ok) { st.err = d.error || "Wrong code."; st.busy = false; render(); return; }
      await refreshMe(); st.busy = false; render();
    } catch (e) { st.err = "Network error."; st.busy = false; render(); }
  }

  async function logout() {
    try { await fetch(API.logout, { method: "POST", credentials: "same-origin" }); } catch (e) {}
    st.loggedIn = false; st.step = "mobile"; st.mobile = ""; st.code = ""; await refreshMe(); render();
  }

  function render() {
    var h = '<div class="ckgrip"></div>';
    if (st.loggedIn) {
      h += '<div class="ckban"><button class="ckx" data-a="close">✕</button><div class="ckbanrow"><div class="ckbadge">🔔</div><div><div style="font-weight:600">' + esc(st.name || "My Messages") + '</div><div style="font-size:12px;opacity:.9">+91 ' + esc(st.mobile) + '</div></div></div></div>';
      h += '<div class="cktop" style="margin-top:14px"><div class="ckh" style="margin:0">Messages</div><button class="cklogout" data-a="logout">Log out</button></div>';
      if (!st.messages.length) h += '<p class="cksub">Abhi koi message nahi. Naya aate hi yahan dikhega.</p>';
      st.messages.forEach(function (m) { h += '<div class="ckmsg"><p>' + esc(m.message) + '</p><small>' + esc(fmt(m.created_at)) + "</small></div>"; });
    } else {
      h += '<div class="ckban"><button class="ckx" data-a="close">✕</button><div class="ckbanrow"><div class="ckbadge">🔔</div><div><div style="font-weight:600">Login Now</div><div style="font-size:12px;opacity:.9">Login karke apne hotel messages &amp; alerts turant paayein ✨</div></div></div></div>';
      h += '<div class="ckh">Login with Mobile</div><div class="cksub">Hum aapke number par OTP bhejenge.</div>';
      if (st.step === "mobile") {
        h += '<div class="ckrow"><span class="ckpre">🇮🇳 +91</span><input class="ckinp" id="ckmob" inputmode="numeric" maxlength="10" placeholder="Enter mobile number" value="' + esc(st.mobile) + '"></div>';
        if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
        h += '<button class="ckbtn" data-a="send"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? "Sending…" : "Send OTP →") + "</button>";
        h += '<button class="ckskip" data-a="close">Skip for now</button>';
      } else {
        h += '<div class="cksub" style="margin-bottom:8px">Code sent to <b>+91 ' + esc(st.mobile) + '</b> · <a href="#" data-a="back" style="color:#4f46e5">Change</a></div>';
        if (st.skip) h += '<div class="ckinfo">SMS abhi connect nahi hai — koi bhi code chalega.' + (st.dev ? " Aapka code: <b>" + esc(st.dev) + "</b>" : "") + "</div>";
        h += '<input class="ckinp" id="ckcode" style="text-align:center;letter-spacing:.4em" inputmode="numeric" maxlength="6" placeholder="••••••" value="' + esc(st.code || "") + '">';
        if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
        h += '<button class="ckbtn" data-a="verify"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? "Verifying…" : "Verify & continue") + "</button>";
      }
    }
    sheet.innerHTML = h;
    var mob = sheet.querySelector("#ckmob"); if (mob) mob.oninput = function () { st.mobile = this.value.replace(/\D/g, ""); };
    var cod = sheet.querySelector("#ckcode"); if (cod) { cod.oninput = function () { st.code = this.value.replace(/\D/g, ""); }; cod.focus(); }
  }

  function onClick(e) {
    var t = e.target.closest("[data-a]"); if (!t) return;
    e.preventDefault();
    var a = t.getAttribute("data-a");
    if (a === "close") close();
    else if (a === "send") { if ((st.mobile || "").length >= 8) sendOtp(); else { st.err = "Sahi mobile number daalein."; render(); } }
    else if (a === "verify") verify();
    else if (a === "back") { st.step = "mobile"; st.code = ""; st.err = ""; render(); }
    else if (a === "logout") logout();
  }

  function boot() {
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    fab = el('<button id="ckfab">Login</button>');
    ov = el('<div id="ckov"><div id="cksheet"></div></div>');
    sheet = ov.querySelector("#cksheet");
    document.body.appendChild(fab); document.body.appendChild(ov);
    fab.onclick = open;
    ov.onclick = function (e) { if (e.target === ov) close(); };
    sheet.addEventListener("click", onClick);
    refreshMe().then(function () {
      var skipped = false; try { skipped = sessionStorage.getItem("ck_skip") === "1"; } catch (e) {}
      if (!st.loggedIn && !skipped) setTimeout(open, 700); // website par aate hi popup
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
