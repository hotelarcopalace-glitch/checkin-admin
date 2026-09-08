/* Checkin guest widget — Login button + bottom-sheet OTP popup, and after login
   a full-screen "SMS Notifications" page (date filter, total, message cards).
   Self-contained, same-origin APIs, no deps. */
(function () {
  if (window.__ckGuest) return;
  window.__ckGuest = true;

  var API = {
    me: "/api/user/messages",
    send: "/api/user/otp/send",
    verify: "/api/user/otp/verify",
    logout: "/api/user/logout",
  };

  var st = { loggedIn: false, mobile: "", name: "", total: 0, messages: [], date: "", step: "mobile", code: "", dev: null, skip: false, busy: false, err: "", drawer: false, push: false, view: "messages", profile: {} };
  var RATE_URL = "https://www.google.com/search?q=Hotel+Arco+Palace+Jaipur+review"; // owner can change

  var css =
    "#ckfab{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#4f46e5;color:#fff;border:none;border-radius:999px;padding:13px 20px;font:600 15px system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(79,70,229,.4);cursor:pointer}" +
    "#ckmenufab{position:fixed;right:16px;bottom:74px;z-index:2147483000;width:50px;height:50px;background:#ea580c;color:#fff;border:none;border-radius:999px;font:400 22px system-ui;box-shadow:0 8px 24px rgba(234,88,12,.4);cursor:pointer;display:none}" +
    "#ckmenufab.on{display:block}" +
    "#ckov{position:fixed;inset:0;z-index:2147483001;display:none;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.55);font:400 15px system-ui,-apple-system,Segoe UI,sans-serif}" +
    "#ckov.on{display:flex}" +
    "#ckov.full{align-items:stretch;background:#eef1f6}" +
    "#cksheet{position:relative;width:100%;max-width:440px;max-height:90vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:16px 16px 24px;box-shadow:0 -8px 40px rgba(0,0,0,.25)}" +
    "#ckov.full #cksheet{max-width:480px;max-height:100vh;height:100vh;border-radius:0;padding:0;background:#eef1f6;box-shadow:0 0 40px rgba(0,0,0,.15);display:flex;flex-direction:column}" +
    "@media(min-width:640px){#ckov:not(.full){align-items:center}#ckov:not(.full) #cksheet{border-radius:22px}}" +
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
    /* full page */
    ".ckph{display:flex;align-items:center;gap:12px;background:#fff;padding:12px 14px;border-bottom:1px solid #e5e9f0;flex:none}" +
    ".ckback{width:34px;height:34px;border:none;border-radius:999px;background:#f1f5f9;color:#334155;font-size:18px;cursor:pointer}" +
    ".ckpt{font-size:16px;font-weight:700;color:#0f172a}" +
    ".ckpsub{font-size:12px;color:#94a3b8}" +
    ".ckbody{flex:1;overflow:auto;padding:14px}" +
    ".ckfrow{display:flex;gap:8px;align-items:center;margin-bottom:10px}" +
    ".ckdate{flex:1;border:1px solid #cbd5e1;border-radius:12px;padding:11px 12px;font-size:15px;background:#fff;outline:none}" +
    ".ckref{width:44px;height:44px;flex:none;border:none;border-radius:12px;background:#4f46e5;color:#fff;font-size:18px;cursor:pointer}" +
    ".cktotal{font-size:22px;font-weight:800;color:#1e3a8a;margin:6px 2px 0}" +
    ".ckclear{border:none;background:none;color:#4f46e5;font-size:13px;font-weight:600;cursor:pointer;padding:2px 0;margin-bottom:8px}" +
    ".ckcap{display:flex;justify-content:space-between;align-items:baseline;margin:6px 2px 8px}" +
    ".ckcap b{font-size:15px;color:#0f172a}" +
    ".ckcap span{font-size:12px;color:#94a3b8}" +
    ".ckcard{background:#fff;border:1px solid #e5e9f0;border-radius:14px;padding:12px 14px;margin-bottom:9px;box-shadow:0 1px 2px rgba(0,0,0,.03)}" +
    ".ckcard p{margin:0;font-size:14px;color:#1e3a8a;line-height:1.45}" +
    ".ckcard small{display:block;margin-top:5px;color:#94a3b8;font-size:12px}" +
    ".ckempty{text-align:center;color:#94a3b8;padding:40px 0;font-size:14px}" +
    ".ckfld{margin-bottom:10px}" +
    ".cklbl{font-size:13px;font-weight:600;color:#334155;margin:14px 2px 6px}" +
    "select.ckinp{-webkit-appearance:none;appearance:none;background:#fff}" +
    "#cksheet .ckrow{margin-bottom:0}" +
    ".ckinp[disabled]{background:#f1f5f9;color:#64748b}" +
    ".ckmenu{width:34px;height:34px;border:none;border-radius:999px;background:#f1f5f9;color:#334155;font-size:16px;cursor:pointer}" +
    ".ckdrw{position:absolute;inset:0;z-index:5;display:none}" +
    ".ckdrw.on{display:block}" +
    ".ckdrw .bg{position:absolute;inset:0;background:rgba(0,0,0,.4)}" +
    ".ckdrw .panel{position:absolute;left:0;top:0;bottom:0;width:78%;max-width:300px;background:linear-gradient(165deg,#fb923c,#ea580c);color:#fff;overflow:auto;padding:22px 0;animation:ckslide .18s ease-out}" +
    "@keyframes ckslide{from{transform:translateX(-100%)}to{transform:none}}" +
    ".ckdrw .prof{text-align:center;padding:4px 16px 14px}" +
    ".ckdrw .av{width:64px;height:64px;border-radius:999px;border:2px solid #fff;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:26px;background:rgba(255,255,255,.18)}" +
    ".ckdrw .edit{border:1px solid rgba(255,255,255,.6);background:none;color:#fff;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;margin-top:6px}" +
    ".ckdi{display:flex;align-items:center;gap:12px;padding:13px 20px;font-size:15px;font-weight:500;cursor:pointer}" +
    ".ckdi:hover{background:rgba(255,255,255,.12)}" +
    ".ckdi .sw{margin-left:auto;width:38px;height:22px;border-radius:999px;background:rgba(255,255,255,.35);position:relative;flex:none}" +
    ".ckdi .sw.on{background:#22c55e}" +
    ".ckdi .sw::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:999px;background:#fff;transition:.15s}" +
    ".ckdi .sw.on::after{left:18px}";

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(v) { var d = new Date(v); if (isNaN(d)) return ""; return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  var fab, menufab, ov, sheet;

  function setPath(p) { try { if (location.pathname !== p) history.pushState({}, "", p); } catch (e) {} }
  function open() { render(); ov.classList.add("on"); }
  function close() { ov.classList.remove("on"); setPath("/"); try { sessionStorage.setItem("ck_skip", "1"); } catch (e) {} }

  async function refreshMe() {
    try {
      var url = API.me + (st.date ? "?date=" + encodeURIComponent(st.date) : "");
      var r = await fetch(url, { credentials: "same-origin" });
      var d = await r.json();
      st.loggedIn = !!d.loggedIn; st.mobile = d.mobile || ""; st.name = d.name || ""; st.messages = d.messages || []; st.total = d.total || 0; st.profile = d.profile || {};
    } catch (e) { st.loggedIn = false; }
    if (fab) fab.textContent = st.loggedIn ? "🔔 My SMS" : "Login";
    if (menufab) menufab.classList.toggle("on", st.loggedIn);
    ov.classList.toggle("full", st.loggedIn);
  }

  async function sendOtp() {
    if (st.busy) return; st.busy = true; st.err = ""; render();
    try {
      var r = await fetch(API.send, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mobile: st.mobile }) });
      var d = await r.json();
      if (!r.ok) st.err = d.error || "Could not send code.";
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
    st.loggedIn = false; st.step = "mobile"; st.mobile = ""; st.code = ""; st.date = ""; st.drawer = false; st.view = "messages"; try { close(); } catch (e) {} await refreshMe(); render();
  }

  function renderLogin() {
    var h = '<div class="ckgrip"></div>';
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
    sheet.innerHTML = h;
    var mob = sheet.querySelector("#ckmob"); if (mob) mob.oninput = function () { st.mobile = this.value.replace(/\D/g, ""); };
    var cod = sheet.querySelector("#ckcode"); if (cod) { cod.oninput = function () { st.code = this.value.replace(/\D/g, ""); }; cod.focus(); }
  }

  function renderPage() {
    if (typeof Notification !== "undefined") st.push = Notification.permission === "granted";
    setPath("/sms");
    var h = "";
    h += '<div class="ckph"><button class="ckmenu" data-a="opendrawer">☰</button><div style="flex:1"><div class="ckpt">SMS Notifications</div><div class="ckpsub">+91 ' + esc(st.mobile) + (st.name ? " · " + esc(st.name) : "") + '</div></div><button class="ckback" data-a="close">✕</button></div>';
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

  function renderDrawer() {
    if (typeof Notification !== "undefined") st.push = Notification.permission === "granted";
    var h = '<div class="ckdrw on"><div class="bg" data-a="closedrawer"></div><div class="panel">';
    h += '<div class="prof"><div class="av">👤</div><div style="font-weight:600;font-size:16px">' + esc(st.name || "User") + '</div><div style="font-size:12px;opacity:.9">+91 ' + esc(st.mobile) + '</div><button class="edit" data-a="editprofile">✎ Edit profile</button></div>';
    h += '<div class="ckdi" data-a="closedrawer">📩 SMS Notifications <span class="sw on"></span></div>';
    h += '<div class="ckdi" data-a="push">🔔 Push Notification <span class="sw' + (st.push ? " on" : "") + '"></span></div>';
    h += '<div class="ckdi" data-a="editprofile">👤 Edit Profile</div>';
    h += '<div class="ckdi" data-a="rate">⭐ Rate on Google</div>';
    h += '<div class="ckdi" data-a="help">💬 Help &amp; Support</div>';
    h += '<div class="ckdi" data-a="share">↗ Share App</div>';
    h += '<div class="ckdi" data-a="logout">⎋ Log out</div>';
    h += "</div></div>";
    sheet.innerHTML = h;
  }

  function renderEdit() {
    var p = st.profile || {};
    var titles = ["", "Mr.", "Mrs.", "Ms.", "Dr."];
    var mm = [], dd = [], yy = [];
    for (var i = 1; i <= 12; i++) mm.push(("0" + i).slice(-2));
    for (var j = 1; j <= 31; j++) dd.push(("0" + j).slice(-2));
    for (var y = new Date().getFullYear(); y >= 1940; y--) yy.push("" + y);
    var dob = (p.dob || "").split("-"); // stored YYYY-MM-DD
    var cy = dob[0] || "", cm = dob[1] || "", cd = dob[2] || "";
    function opts(arr, cur, ph) { var s = '<option value="">' + ph + "</option>"; arr.forEach(function (v) { if (v) s += '<option value="' + v + '"' + (v === cur ? " selected" : "") + ">" + v + "</option>"; }); return s; }
    var h = "";
    h += '<div class="ckph"><button class="ckback" data-a="tomsg">←</button><div style="flex:1"><div class="ckpt">Edit Profile</div><div class="ckpsub">Manage your account details</div></div></div>';
    h += '<div class="ckbody">';
    h += '<div class="ckfld"><select class="ckinp" id="pt">';
    titles.forEach(function (t) { h += '<option value="' + t + '"' + (t === (p.title || "") ? " selected" : "") + ">" + (t || "Title") + "</option>"; });
    h += "</select></div>";
    h += '<div class="ckrow"><input class="ckinp" id="pf" placeholder="First Name" value="' + esc(p.firstName || "") + '"><input class="ckinp" id="pl" placeholder="Last Name" value="' + esc(p.lastName || "") + '"></div>';
    h += '<input class="ckinp" id="pe" style="margin-top:10px" type="email" placeholder="Email Address" value="' + esc(p.email || "") + '">';
    h += '<div class="ckrow" style="margin-top:10px"><span class="ckpre">🇮🇳 +91</span><input class="ckinp" value="' + esc(st.mobile) + '" disabled></div>';
    h += '<div class="cklbl">Date of Birth</div>';
    h += '<div class="ckrow"><select class="ckinp" id="pm">' + opts(mm, cm, "MM") + '</select><select class="ckinp" id="pd">' + opts(dd, cd, "DD") + '</select><select class="ckinp" id="py">' + opts(yy, cy, "YYYY") + "</select></div>";
    if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
    h += '<button class="ckbtn" style="background:#f97316;margin-top:16px" data-a="savep"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? "Saving…" : "Edit Profile") + "</button>";
    h += '<button class="ckbtn" style="background:#fff;color:#dc2626;border:1px solid #fca5a5;margin-top:10px" data-a="logout">Logout</button>';
    h += "</div>";
    sheet.innerHTML = h;
  }

  function render() { if (st.loggedIn && st.drawer) renderDrawer(); else if (!st.loggedIn) renderLogin(); else if (st.view === "edit") renderEdit(); else renderPage(); }

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
    else if (a === "opendrawer") { st.drawer = true; render(); }
    else if (a === "closedrawer") { st.drawer = false; render(); }
    else if (a === "editprofile") { st.drawer = false; st.view = "edit"; st.err = ""; render(); }
    else if (a === "tomsg") { st.view = "messages"; render(); }
    else if (a === "savep") saveProfileForm();
    else if (a === "rate") { window.open(RATE_URL, "_blank"); }
    else if (a === "push") askPush();
    else if (a === "help") { window.location.href = "mailto:hotelarcopalace@gmail.com?subject=Help%20-%20Checkin"; }
    else if (a === "share") { if (navigator.share) navigator.share({ title: "Checkin", text: "Apne hotel messages dekhein", url: location.origin }); else { try { navigator.clipboard.writeText(location.origin); alert("Link copy ho gaya: " + location.origin); } catch (e) {} } }
  }

  async function saveProfileForm() {
    if (st.busy) return;
    var g = function (id) { var e = sheet.querySelector("#" + id); return e ? e.value : ""; };
    var mm = g("pm"), dd = g("pd"), yy = g("py");
    var dob = (yy && mm && dd) ? yy + "-" + mm + "-" + dd : "";
    var body = { title: g("pt"), firstName: g("pf"), lastName: g("pl"), email: g("pe"), dob: dob };
    st.busy = true; st.err = ""; render();
    try {
      var r = await fetch("/api/user/profile", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
      var d = await r.json();
      if (!r.ok) { st.err = d.error || "Save failed."; st.busy = false; render(); return; }
      await refreshMe(); st.busy = false; st.view = "messages"; render();
    } catch (e) { st.err = "Network error."; st.busy = false; render(); }
  }

  function askPush() {
    if (typeof Notification === "undefined") { alert("Is browser me notifications support nahi."); return; }
    Notification.requestPermission().then(function (p) { st.push = p === "granted"; render(); });
  }

  function boot() {
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    fab = el('<button id="ckfab">Login</button>');
    menufab = el('<button id="ckmenufab" aria-label="Menu">☰</button>');
    ov = el('<div id="ckov"><div id="cksheet"></div></div>');
    sheet = ov.querySelector("#cksheet");
    document.body.appendChild(fab); document.body.appendChild(menufab); document.body.appendChild(ov);
    fab.onclick = open;
    menufab.onclick = function () { st.drawer = true; ov.classList.add("on"); ov.classList.add("full"); render(); };
    ov.onclick = function (e) { if (e.target === ov && !st.loggedIn) close(); };
    sheet.addEventListener("click", onClick);
    window.addEventListener("popstate", function () {
      if (location.pathname === "/sms") { if (!ov.classList.contains("on")) open(); }
      else { ov.classList.remove("on"); }
    });
    refreshMe().then(function () {
      var skipped = false; try { skipped = sessionStorage.getItem("ck_skip") === "1"; } catch (e) {}
      if (location.pathname === "/sms") { open(); }          // deep link -> SMS view (or login)
      else if (!st.loggedIn && !skipped) setTimeout(open, 700);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
