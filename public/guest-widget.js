/* Checkin guest widget — golden CHECKIN theme. Login popup + SMS-notifications
   page (own /sms URL). Menu items live in the site's own nav drawer (no
   separate menu). Self-contained, same-origin APIs, no deps. */
(function () {
  if (window.__ckGuest) return;
  window.__ckGuest = true;

  var API = { me: "/api/user/messages", send: "/api/user/otp/send", verify: "/api/user/otp/verify", logout: "/api/user/logout" };
  var st = { loggedIn: false, mobile: "", name: "", total: 0, messages: [], date: "", step: "mobile", code: "", dev: null, skip: false, busy: false, err: "", view: "messages", profile: {} };
  var RATE_URL = "https://www.google.com/search?q=Hotel+Arco+Palace+Jaipur+review";

  var css =
    "#ckfab{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#5E1B22;color:#FBF4E8;border:1.5px solid #E0952A;border-radius:999px;padding:12px 20px;font:700 15px 'Figtree',system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 10px 26px rgba(67,16,22,.4);cursor:pointer}" +
    "#ckov{position:fixed;inset:0;z-index:2147483001;display:none;align-items:flex-end;justify-content:center;background:rgba(43,16,22,.5);font:400 15px 'Figtree',system-ui,-apple-system,Segoe UI,sans-serif}" +
    "#ckov.on{display:flex}" +
    "#ckov.full{align-items:stretch;background:#f7efdf}" +
    "#cksheet{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:16px 16px 24px;box-shadow:0 -8px 40px rgba(43,16,22,.28)}" +
    "#ckov.full #cksheet{max-width:480px;max-height:100vh;height:100vh;border-radius:0;padding:0;background:#f7efdf;display:flex;flex-direction:column}" +
    "@media(min-width:640px){#ckov:not(.full){align-items:center}#ckov:not(.full) #cksheet{border-radius:22px}}" +
    ".ckgrip{width:44px;height:5px;border-radius:999px;background:#eaddc4;margin:2px auto 12px}" +
    ".ckban{position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(120deg,#5E1B22,#7A2A31);color:#FBF4E8;padding:12px 36px 12px 12px}" +
    ".ckx{position:absolute;right:8px;top:8px;width:26px;height:26px;border:none;border-radius:999px;background:rgba(255,255,255,.2);color:#fff;font-size:14px;cursor:pointer}" +
    ".ckbanrow{display:flex;align-items:center;gap:12px}" +
    ".ckbadge{width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:999px;background:#E0952A;color:#431016;font-size:20px}" +
    ".ckh{font-size:19px;font-weight:700;color:#2C231B;margin:16px 2px 2px}" +
    ".cksub{font-size:14px;color:#7C6A55;margin:0 2px 14px}" +
    ".ckrow{display:flex;gap:8px}" +
    ".ckpre{display:flex;align-items:center;gap:4px;border:1px solid #E7D9BF;background:#FBF4E8;border-radius:12px;padding:0 12px;font-weight:700;color:#5E1B22}" +
    ".ckinp{width:100%;border:1px solid #E7D9BF;border-radius:12px;padding:13px 14px;font-size:16px;outline:none;box-sizing:border-box;color:#2C231B}" +
    ".ckinp:focus{border-color:#E0952A;box-shadow:0 0 0 3px rgba(224,149,42,.18)}" +
    ".ckbtn{width:100%;border:none;border-radius:12px;background:#5E1B22;color:#FBF4E8;padding:14px;font-size:16px;font-weight:700;cursor:pointer;margin-top:12px}" +
    ".ckbtn:disabled{opacity:.6}" +
    ".ckskip{width:100%;border:none;background:none;color:#a08a6e;font-size:14px;font-weight:600;padding:10px;cursor:pointer}" +
    ".ckerr{background:#fbeaea;color:#8a1f1f;border-radius:10px;padding:8px 12px;font-size:14px;margin-top:10px}" +
    ".ckinfo{background:#FBF4E8;color:#7a4d0a;border:1px solid #F1CB86;border-radius:10px;padding:8px 12px;font-size:14px;margin-top:10px}" +
    ".ckph{display:flex;align-items:center;gap:12px;background:#5E1B22;color:#FBF4E8;padding:14px 16px;flex:none}" +
    ".ckpt{font-size:16px;font-weight:700}" +
    ".ckback{width:34px;height:34px;border:none;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-size:16px;cursor:pointer}" +
    ".ckbody{flex:1;overflow:auto;padding:14px}" +
    ".ckfrow{display:flex;gap:8px;align-items:center;margin-bottom:10px}" +
    ".ckdate{flex:1;border:1px solid #E7D9BF;border-radius:12px;padding:11px 12px;font-size:15px;background:#fff;outline:none;color:#2C231B}" +
    ".ckref{width:44px;height:44px;flex:none;border:none;border-radius:12px;background:#E0952A;color:#431016;font-size:18px;cursor:pointer}" +
    ".cktotal{font-size:22px;font-weight:800;color:#5E1B22;margin:6px 2px 0}" +
    ".ckclear{border:none;background:none;color:#A9660F;font-size:13px;font-weight:700;cursor:pointer;padding:2px 0;margin-bottom:8px}" +
    ".ckcap{display:flex;justify-content:space-between;align-items:baseline;margin:6px 2px 8px}" +
    ".ckcap b{font-size:15px;color:#2C231B}" +
    ".ckcap span{font-size:12px;color:#a08a6e}" +
    ".ckcard{background:#fff;border:1px solid #ecdfc6;border-radius:14px;padding:12px 14px;margin-bottom:9px;box-shadow:0 1px 2px rgba(67,16,22,.04)}" +
    ".ckcard p{margin:0;font-size:14px;color:#431016;line-height:1.45}" +
    ".ckcard small{display:block;margin-top:5px;color:#a08a6e;font-size:12px}" +
    ".ckempty{text-align:center;color:#a08a6e;padding:40px 0;font-size:14px}" +
    ".ckfld{margin-bottom:10px}" +
    ".cklbl{font-size:13px;font-weight:700;color:#5E1B22;margin:14px 2px 6px}" +
    "select.ckinp{-webkit-appearance:none;appearance:none;background:#fff}" +
    ".ckinp[disabled]{background:#FBF4E8;color:#7C6A55}" +
    "nav.main a.ck-navitem{color:#5E1B22 !important}";

  function el(h) { var d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(v) { var d = new Date(v); if (isNaN(d)) return ""; return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  var fab, ov, sheet;

  function setPath(p) { try { if (location.pathname !== p) history.pushState({}, "", p); } catch (e) {} }
  function open() { render(); ov.classList.add("on"); }
  function close() { ov.classList.remove("on"); setPath("/"); try { sessionStorage.setItem("ck_skip", "1"); } catch (e) {} }
  function closeSiteMenu() { var h = document.querySelector("header"); if (h) h.classList.remove("nav-open"); }

  async function refreshMe() {
    try {
      var url = API.me + (st.date ? "?date=" + encodeURIComponent(st.date) : "");
      var r = await fetch(url, { credentials: "same-origin" });
      var d = await r.json();
      st.loggedIn = !!d.loggedIn; st.mobile = d.mobile || ""; st.name = d.name || ""; st.messages = d.messages || []; st.total = d.total || 0; st.profile = d.profile || {};
    } catch (e) { st.loggedIn = false; }
    if (fab) fab.textContent = st.loggedIn ? "My SMS" : "Login";
    injectMenu();
  }

  async function sendOtp() {
    if (st.busy) return; st.busy = true; st.err = ""; render();
    try {
      var r = await fetch(API.send, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mobile: st.mobile }) });
      var d = await r.json();
      if (!r.ok) st.err = d.error || "Could not send code."; else { st.dev = d.devCode || null; st.skip = !!d.skipVerification; st.step = "otp"; }
    } catch (e) { st.err = "Network error."; }
    st.busy = false; render();
  }
  async function verify() {
    if (st.busy) return; st.busy = true; st.err = ""; render();
    try {
      var r = await fetch(API.verify, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mobile: st.mobile, code: st.code }) });
      var d = await r.json();
      if (!r.ok) { st.err = d.error || "Wrong code."; st.busy = false; render(); return; }
      st.view = "messages"; await refreshMe(); st.busy = false; render();
    } catch (e) { st.err = "Network error."; st.busy = false; render(); }
  }
  async function logout() {
    try { await fetch(API.logout, { method: "POST", credentials: "same-origin" }); } catch (e) {}
    st.loggedIn = false; st.step = "mobile"; st.mobile = ""; st.code = ""; st.date = ""; st.view = "messages";
    try { close(); } catch (e) {} await refreshMe();
  }

  function renderLogin() {
    var h = '<div class="ckgrip"></div>';
    h += '<div class="ckban"><button class="ckx" data-a="close">✕</button><div class="ckbanrow"><div class="ckbadge">🔔</div><div><div style="font-weight:700">Login Now</div><div style="font-size:12px;opacity:.92">Login karke apne hotel messages &amp; alerts turant paayein ✨</div></div></div></div>';
    h += '<div class="ckh">Login with Mobile</div><div class="cksub">Hum aapke number par OTP bhejenge.</div>';
    if (st.step === "mobile") {
      h += '<div class="ckrow"><span class="ckpre">🇮🇳 +91</span><input class="ckinp" id="ckmob" inputmode="numeric" maxlength="10" placeholder="Enter mobile number" value="' + esc(st.mobile) + '"></div>';
      if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
      h += '<button class="ckbtn" data-a="send"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? "Sending…" : "Send OTP →") + "</button>";
      h += '<button class="ckskip" data-a="close">Skip for now</button>';
    } else {
      h += '<div class="cksub" style="margin-bottom:8px">Code sent to <b>+91 ' + esc(st.mobile) + '</b> · <a href="#" data-a="back" style="color:#A9660F">Change</a></div>';
      if (st.skip) h += '<div class="ckinfo">SMS abhi connect nahi hai — koi bhi code chalega.' + (st.dev ? " Aapka code: <b>" + esc(st.dev) + "</b>" : "") + "</div>";
      h += '<input class="ckinp" id="ckcode" style="text-align:center;letter-spacing:.4em" inputmode="numeric" maxlength="6" placeholder="••••••" value="' + esc(st.code || "") + '">';
      if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
      h += '<button class="ckbtn" data-a="verify"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? "Verifying…" : "Verify & continue") + "</button>";
    }
    sheet.innerHTML = h;
    var mob = sheet.querySelector("#ckmob"); if (mob) mob.oninput = function () { st.mobile = this.value.replace(/\D/g, ""); };
    var cod = sheet.querySelector("#ckcode"); if (cod) { cod.oninput = function () { st.code = this.value.replace(/\D/g, ""); }; cod.focus(); }
  }

  function renderPage() {
    setPath("/sms");
    var h = '<div class="ckph"><div style="flex:1"><div class="ckpt">+91 ' + esc(st.mobile) + '</div></div><button class="ckback" data-a="close">✕</button></div>';
    h += '<div class="ckbody">';
    h += '<div class="ckfrow"><input class="ckdate" type="date" id="ckdate" value="' + esc(st.date) + '"><button class="ckref" data-a="refresh" title="Refresh">⟳</button></div>';
    h += '<div class="cktotal">Total SMS - ' + st.total + "</div>";
    if (st.date) h += '<button class="ckclear" data-a="clear">Clear Filters</button>';
    h += '<div class="ckcap"><b>' + (st.date ? "Filtered" : "All SMS") + "</b><span>" + st.messages.length + " messages</span></div>";
    if (!st.messages.length) h += '<div class="ckempty">Koi SMS nahi mila.' + (st.date ? " (is date par)" : "") + "</div>";
    st.messages.forEach(function (m) { h += '<div class="ckcard"><p>' + esc(m.message) + "</p><small>" + esc(fmt(m.created_at)) + "</small></div>"; });
    h += "</div>";
    sheet.innerHTML = h;
    var dt = sheet.querySelector("#ckdate"); if (dt) dt.onchange = function () { st.date = this.value; refreshMe().then(render); };
  }

  function renderEdit() {
    var p = st.profile || {};
    var titles = ["", "Mr.", "Mrs.", "Ms.", "Dr."], mm = [], dd = [], yy = [];
    for (var i = 1; i <= 12; i++) mm.push(("0" + i).slice(-2));
    for (var j = 1; j <= 31; j++) dd.push(("0" + j).slice(-2));
    for (var y = new Date().getFullYear(); y >= 1940; y--) yy.push("" + y);
    var dob = (p.dob || "").split("-"), cy = dob[0] || "", cm = dob[1] || "", cd = dob[2] || "";
    function opts(arr, cur, ph) { var s = '<option value="">' + ph + "</option>"; arr.forEach(function (v) { if (v) s += '<option value="' + v + '"' + (v === cur ? " selected" : "") + ">" + v + "</option>"; }); return s; }
    var h = '<div class="ckph"><button class="ckback" data-a="tomsg">←</button><div style="flex:1"><div class="ckpt">Edit Profile</div></div></div><div class="ckbody">';
    h += '<div class="ckfld"><select class="ckinp" id="pt">';
    titles.forEach(function (t) { h += '<option value="' + t + '"' + (t === (p.title || "") ? " selected" : "") + ">" + (t || "Title") + "</option>"; });
    h += "</select></div>";
    h += '<div class="ckrow"><input class="ckinp" id="pf" placeholder="First Name" value="' + esc(p.firstName || "") + '"><input class="ckinp" id="pl" placeholder="Last Name" value="' + esc(p.lastName || "") + '"></div>';
    h += '<input class="ckinp" id="pe" style="margin-top:10px" type="email" placeholder="Email Address" value="' + esc(p.email || "") + '">';
    h += '<div class="ckrow" style="margin-top:10px"><span class="ckpre">🇮🇳 +91</span><input class="ckinp" value="' + esc(st.mobile) + '" disabled></div>';
    h += '<div class="cklbl">Date of Birth</div>';
    h += '<div class="ckrow"><select class="ckinp" id="pm">' + opts(mm, cm, "MM") + '</select><select class="ckinp" id="pd">' + opts(dd, cd, "DD") + '</select><select class="ckinp" id="py">' + opts(yy, cy, "YYYY") + "</select></div>";
    if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
    h += '<button class="ckbtn" style="background:#E0952A;color:#431016;margin-top:16px" data-a="savep"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? "Saving…" : "Save Profile") + "</button>";
    h += '<button class="ckbtn" style="background:#fff;color:#b3261e;border:1px solid #e6a9a9;margin-top:10px" data-a="logout">Logout</button></div>';
    sheet.innerHTML = h;
  }

  function render() {
    if (!st.loggedIn) { ov.classList.remove("full"); renderLogin(); }
    else if (st.view === "edit") { ov.classList.add("full"); renderEdit(); }
    else { ov.classList.add("full"); renderPage(); }
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
    else if (a === "refresh") refreshMe().then(render);
    else if (a === "clear") { st.date = ""; refreshMe().then(render); }
    else if (a === "tomsg") { st.view = "messages"; render(); }
    else if (a === "editprofile") { st.view = "edit"; st.err = ""; render(); }
    else if (a === "savep") saveProfileForm();
  }

  async function saveProfileForm() {
    if (st.busy) return;
    var g = function (id) { var e = sheet.querySelector("#" + id); return e ? e.value : ""; };
    var mm = g("pm"), dd = g("pd"), yy = g("py"), dob = (yy && mm && dd) ? yy + "-" + mm + "-" + dd : "";
    var body = { title: g("pt"), firstName: g("pf"), lastName: g("pl"), email: g("pe"), dob: dob };
    st.busy = true; st.err = ""; render();
    try {
      var r = await fetch("/api/user/profile", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
      var d = await r.json();
      if (!r.ok) { st.err = d.error || "Save failed."; st.busy = false; render(); return; }
      await refreshMe(); st.busy = false; st.view = "messages"; render();
    } catch (e) { st.err = "Network error."; st.busy = false; render(); }
  }

  // Navigation from the SITE's own menu (injected items).
  function ckNav(a) {
    closeSiteMenu();
    if (a === "dologin") { st.step = "mobile"; open(); }
    else if (a === "sms") { st.view = "messages"; open(); }
    else if (a === "editprofile") { st.view = "edit"; open(); }
    else if (a === "logout") logout();
    else if (a === "rate") window.open(RATE_URL, "_blank");
  }

  function injectMenu() {
    var ul = document.querySelector("nav.main ul");
    if (!ul) return;
    Array.prototype.slice.call(ul.querySelectorAll("li.ck-li")).forEach(function (x) { x.remove(); });
    var items = st.loggedIn
      ? [["My SMS Notifications", "sms"], ["Edit Profile", "editprofile"], ["Rate on Google", "rate"], ["Logout", "logout"]]
      : [["My SMS / Login", "dologin"]];
    items.forEach(function (it) {
      var li = document.createElement("li"); li.className = "ck-li";
      var a = document.createElement("a"); a.href = "#"; a.className = "ck-navitem"; a.textContent = it[0];
      a.addEventListener("click", function (e) { e.preventDefault(); ckNav(it[1]); });
      li.appendChild(a); ul.appendChild(li);
    });
  }

  function boot() {
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    fab = el('<button id="ckfab">Login</button>');
    ov = el('<div id="ckov"><div id="cksheet"></div></div>');
    sheet = ov.querySelector("#cksheet");
    document.body.appendChild(fab); document.body.appendChild(ov);
    fab.onclick = open;
    ov.onclick = function (e) { if (e.target === ov && !st.loggedIn) close(); };
    sheet.addEventListener("click", onClick);
    window.addEventListener("popstate", function () {
      if (location.pathname === "/sms") { if (!ov.classList.contains("on")) open(); } else { ov.classList.remove("on"); }
    });
    refreshMe().then(function () {
      var skipped = false; try { skipped = sessionStorage.getItem("ck_skip") === "1"; } catch (e) {}
      if (location.pathname === "/sms") open();
      else if (!st.loggedIn && !skipped) setTimeout(open, 700);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
