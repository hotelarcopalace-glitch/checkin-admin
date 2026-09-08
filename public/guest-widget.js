/* Checkin guest widget — golden theme. Login = bottom-sheet popup. The SMS
   notifications page renders IN THE PAGE (between the site header and footer),
   so it is a real, responsive page — not a separate overlay. Menu items live in
   the site's own nav. Same-origin APIs, no deps. */
(function () {
  if (window.__ckGuest) return;
  window.__ckGuest = true;

  var API = { me: "/api/user/messages", send: "/api/user/otp/send", verify: "/api/user/otp/verify", logout: "/api/user/logout" };
  var st = { loggedIn: false, mobile: "", name: "", total: 0, messages: [], date: "", step: "mobile", code: "", dev: null, skip: false, busy: false, err: "", view: "messages", profile: {} };
  var RATE_URL = "https://www.google.com/search?q=Hotel+Arco+Palace+Jaipur+review";

  var css =
    "#ckfab{position:fixed;right:16px;bottom:16px;z-index:900;background:#5E1B22;color:#FBF4E8;border:1.5px solid #E0952A;border-radius:999px;padding:12px 20px;font:700 15px 'Figtree',system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 10px 26px rgba(67,16,22,.4);cursor:pointer}" +
    "#ckov{position:fixed;inset:0;z-index:2000;display:none;align-items:flex-end;justify-content:center;background:rgba(43,16,22,.5);font:400 15px 'Figtree',system-ui,-apple-system,Segoe UI,sans-serif}" +
    "#ckov.on{display:flex}" +
    "#cksheet{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;background:#fff;border-radius:22px 22px 0 0;padding:16px 16px 24px;box-shadow:0 -8px 40px rgba(43,16,22,.28)}" +
    "@media(min-width:640px){#ckov{align-items:center}#cksheet{border-radius:22px}}" +
    ".ckgrip{width:44px;height:5px;border-radius:999px;background:#eaddc4;margin:2px auto 12px}" +
    ".ckban{position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(120deg,#5E1B22,#7A2A31);color:#FBF4E8;padding:12px 36px 12px 12px}" +
    ".ckx{position:absolute;right:8px;top:8px;width:26px;height:26px;border:none;border-radius:999px;background:rgba(255,255,255,.2);color:#fff;font-size:14px;cursor:pointer}" +
    ".ckbanrow{display:flex;align-items:center;gap:12px}" +
    ".ckbadge{width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:999px;background:#E0952A;color:#431016;font-size:20px}" +
    ".ckh{font-size:19px;font-weight:700;color:#2C231B;margin:16px 2px 2px}" +
    ".cksub{font-size:14px;color:#7C6A55;margin:0 2px 14px}" +
    ".ckrow{display:flex;gap:8px}" +
    ".ckpre{display:flex;align-items:center;gap:4px;border:1px solid #E7D9BF;background:#FBF4E8;border-radius:12px;padding:0 12px;font-weight:700;color:#5E1B22}" +
    ".ckinp{width:100%;border:1px solid #E7D9BF;border-radius:12px;padding:13px 14px;font-size:16px;outline:none;box-sizing:border-box;color:#2C231B;background:#fff}" +
    ".ckinp:focus{border-color:#E0952A;box-shadow:0 0 0 3px rgba(224,149,42,.18)}" +
    "select.ckinp{-webkit-appearance:none;appearance:none}" +
    ".ckinp[disabled]{background:#FBF4E8;color:#7C6A55}" +
    ".ckbtn{width:100%;border:none;border-radius:12px;background:#5E1B22;color:#FBF4E8;padding:14px;font-size:16px;font-weight:700;cursor:pointer;margin-top:12px}" +
    ".ckbtn:disabled{opacity:.6}" +
    ".ckskip{width:100%;border:none;background:none;color:#a08a6e;font-size:14px;font-weight:600;padding:10px;cursor:pointer}" +
    ".ckerr{background:#fbeaea;color:#8a1f1f;border-radius:10px;padding:8px 12px;font-size:14px;margin-top:10px}" +
    ".ckinfo{background:#FBF4E8;color:#7a4d0a;border:1px solid #F1CB86;border-radius:10px;padding:8px 12px;font-size:14px;margin-top:10px}" +
    ".cklbl{font-size:13px;font-weight:700;color:#5E1B22;margin:14px 2px 6px}" +
    /* in-page SMS section */
    "#ck-sms{max-width:760px;margin:0 auto;padding:16px 16px 84px;min-height:60vh}" +
    "#ck-bar{position:fixed;bottom:0;left:0;right:0;z-index:800;display:none;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #E7D9BF;box-shadow:0 -4px 16px rgba(67,16,22,.08)}" +
    "#ck-bar.on{display:flex}" +
    "#ck-bar button{flex:1;border:1px solid #E7D9BF;background:#FBF4E8;color:#5E1B22;border-radius:12px;padding:11px;font-weight:700;font-size:.92rem;cursor:pointer}" +
    "#ck-bar button.pri{background:#5E1B22;color:#FBF4E8;border-color:#5E1B22}" +
    "#ck-sms .top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}" +
    "#ck-sms .ttl{font:700 1.05rem 'Fraunces',Georgia,serif;color:#5E1B22;display:inline}" +
    "#ck-sms .num{font-size:.8rem;color:#7C6A55;font-weight:600}" +
    "#ck-sms .filt{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}" +
    "#ck-sms .dt{flex:1;min-width:150px;border:1px solid #E7D9BF;border-radius:12px;padding:11px 12px;font-size:15px;background:#fff;color:#2C231B;outline:none}" +
    "#ck-sms .rf{width:46px;height:46px;flex:none;border:none;border-radius:12px;background:#E0952A;color:#431016;font-size:18px;cursor:pointer}" +
    "#ck-sms .total{font-size:1.5rem;font-weight:800;color:#5E1B22}" +
    "#ck-sms .clr{border:none;background:none;color:#A9660F;font-size:.85rem;font-weight:700;cursor:pointer;padding:2px 0}" +
    "#ck-sms .cap{display:flex;justify-content:space-between;align-items:baseline;margin:8px 2px 10px;color:#7C6A55;font-size:.85rem}" +
    "#ck-sms .cap b{font-size:1rem;color:#2C231B}" +
    "#ck-sms .card{background:#fff;border:1px solid #ecdfc6;border-radius:10px;padding:9px 12px;margin-bottom:7px}" +
    "#ck-sms .card p{margin:0;font-size:.8rem;color:#431016;line-height:1.4}" +
    "#ck-sms .card small{display:block;margin-top:3px;color:#a08a6e;font-size:.7rem}" +
    "#ck-sms .empty{text-align:center;color:#a08a6e;padding:40px 0}" +
    "#ck-sms .back{border:1px solid #E7D9BF;background:#fff;color:#5E1B22;border-radius:999px;padding:7px 14px;font-weight:700;font-size:.8rem;cursor:pointer;white-space:nowrap}" +
    "#ck-sms .form{max-width:520px}" +
    "#ck-sms .fld{margin-bottom:10px}" +
    "nav.main a.ck-navitem{color:#5E1B22 !important;display:flex;align-items:center;justify-content:space-between;gap:10px}" +
    ".ck-sw{width:38px;height:22px;border-radius:999px;background:#d8c7ad;position:relative;flex:none}" +
    ".ck-sw.on{background:#198754}" +
    ".ck-sw::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:999px;background:#fff;transition:.15s}" +
    ".ck-sw.on::after{left:18px}" +
    "nav.main .ck-prof{margin:0 0 4px;padding:0 18px 10px;text-align:center;border-bottom:1px solid #E7D9BF}" +
    "nav.main .ck-av{width:48px;height:48px;border-radius:999px;margin:0 auto 5px;display:flex;align-items:center;justify-content:center;font-size:22px;background:#5E1B22;color:#E0952A;border:2px solid #E0952A;cursor:pointer}" +
    "nav.main .ck-pn{font-weight:700;font-size:.95rem;color:#5E1B22}" +
    "nav.main .ck-pm{font-size:.75rem;color:#7C6A55}" +
    "nav.main .ck-ep{margin-top:6px;border:1px solid #E0952A;background:#FBF4E8;color:#5E1B22;border-radius:999px;padding:5px 14px;font-weight:700;font-size:.78rem;cursor:pointer}" +
    "body.ck-sms-mode footer{padding-top:26px;padding-bottom:26px}" +
    "body.ck-sms-mode footer .wrap>*+*{margin-top:10px}";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(v) { var d = new Date(v); if (isNaN(d)) return ""; return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  function elem(h) { var d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; }

  var fab, ov, sheet, marketMain, smsBox, bar;

  function setPath(p) { try { if (location.pathname !== p) history.pushState({}, "", p); } catch (e) {} }
  function closeSiteMenu() { var h = document.querySelector("header"); if (h) h.classList.remove("nav-open"); }

  function ensureSmsBox() {
    if (smsBox) return;
    marketMain = document.querySelector("main#home") || document.querySelector("main");
    smsBox = document.createElement("main");
    smsBox.id = "ck-sms";
    smsBox.hidden = true;
    smsBox.addEventListener("click", onSmsClick);
    if (marketMain && marketMain.parentNode) marketMain.parentNode.insertBefore(smsBox, marketMain.nextSibling);
    else document.body.appendChild(smsBox);
  }

  // ---- login bottom sheet ----
  function openLogin() { renderLogin(); ov.classList.add("on"); }
  function closeLogin() { ov.classList.remove("on"); try { sessionStorage.setItem("ck_skip", "1"); } catch (e) {} }

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
    if (st.busy) return; st.busy = true; st.err = ""; renderLogin();
    try {
      var r = await fetch(API.send, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mobile: st.mobile }) });
      var d = await r.json();
      if (!r.ok) st.err = d.error || "Could not send code."; else { st.dev = d.devCode || null; st.skip = !!d.skipVerification; st.step = "otp"; }
    } catch (e) { st.err = "Network error."; }
    st.busy = false; renderLogin();
  }
  async function verify() {
    if (st.busy) return; st.busy = true; st.err = ""; renderLogin();
    try {
      var r = await fetch(API.verify, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ mobile: st.mobile, code: st.code }) });
      var d = await r.json();
      if (!r.ok) { st.err = d.error || "Wrong code."; st.busy = false; renderLogin(); return; }
      st.busy = false; closeLogin(); await refreshMe(); showSms("messages");
    } catch (e) { st.err = "Network error."; st.busy = false; renderLogin(); }
  }
  async function logout() {
    try { await fetch(API.logout, { method: "POST", credentials: "same-origin" }); } catch (e) {}
    st.loggedIn = false; st.step = "mobile"; st.mobile = ""; st.code = ""; st.date = ""; st.view = "messages";
    hideSms(); await refreshMe();
  }

  function renderLogin() {
    var h = '<div class="ckgrip"></div>';
    h += '<div class="ckban"><button class="ckx" data-a="closeLogin">✕</button><div class="ckbanrow"><div class="ckbadge">🔔</div><div><div style="font-weight:700">Login Now</div><div style="font-size:12px;opacity:.92">Login karke apne hotel messages &amp; alerts turant paayein ✨</div></div></div></div>';
    h += '<div class="ckh">Login with Mobile</div><div class="cksub">Hum aapke number par OTP bhejenge.</div>';
    if (st.step === "mobile") {
      h += '<div class="ckrow"><span class="ckpre">🇮🇳 +91</span><input class="ckinp" id="ckmob" inputmode="numeric" maxlength="10" placeholder="Enter mobile number" value="' + esc(st.mobile) + '"></div>';
      if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
      h += '<button class="ckbtn" data-a="send"' + (st.busy ? " disabled" : "") + ">" + (st.busy ? "Sending…" : "Send OTP →") + "</button>";
      h += '<button class="ckskip" data-a="closeLogin">Skip for now</button>';
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
  function onSheetClick(e) {
    var t = e.target.closest("[data-a]"); if (!t) return; e.preventDefault();
    var a = t.getAttribute("data-a");
    if (a === "closeLogin") closeLogin();
    else if (a === "send") { if ((st.mobile || "").length >= 8) sendOtp(); else { st.err = "Sahi mobile number daalein."; renderLogin(); } }
    else if (a === "verify") verify();
    else if (a === "back") { st.step = "mobile"; st.code = ""; st.err = ""; renderLogin(); }
  }

  // ---- in-page SMS section ----
  function showSms(view) {
    ensureSmsBox();
    st.view = view || "messages";
    if (marketMain) marketMain.hidden = true;
    smsBox.hidden = false;
    if (bar) bar.classList.add("on");
    document.body.classList.add("ck-sms-mode");
    setPath("/sms");
    try { window.scrollTo(0, 0); } catch (e) {}
    renderSms();
  }
  function hideSms() {
    if (marketMain) marketMain.hidden = false;
    if (smsBox) smsBox.hidden = true;
    if (bar) bar.classList.remove("on");
    document.body.classList.remove("ck-sms-mode");
    setPath("/");
  }
  function renderSms() {
    if (!smsBox) return;
    smsBox.innerHTML = st.view === "edit" ? editHtml() : pageHtml();
    var dt = smsBox.querySelector("#cksmsdate"); if (dt) dt.onchange = function () { st.date = this.value; refreshMe().then(renderSms); };
  }
  function mob10() { return (st.mobile || "").replace(/^\+?91/, ""); }
  function pageHtml() {
    var h = '<div class="top"><div><span class="ttl">My SMS Notifications</span></div><span class="num">+91 ' + esc(mob10()) + '</span></div>';
    h += '<div class="filt"><input class="dt" type="date" id="cksmsdate" value="' + esc(st.date) + '"><button class="rf" data-a="refresh" title="Refresh">⟳</button></div>';
    h += '<div class="total">Total SMS - ' + st.total + "</div>";
    if (st.date) h += '<button class="clr" data-a="clear">Clear Filters</button>';
    h += '<div class="cap"><b>' + (st.date ? "Filtered" : "All SMS") + "</b><span>" + st.messages.length + " messages</span></div>";
    if (!st.messages.length) h += '<div class="empty">Koi SMS nahi mila.' + (st.date ? " (is date par)" : "") + "</div>";
    st.messages.forEach(function (m) { h += '<div class="card"><p>' + esc(m.message) + "</p><small>" + esc(fmt(m.created_at)) + "</small></div>"; });
    return h;
  }
  function editHtml() {
    var p = st.profile || {}, titles = ["", "Mr.", "Mrs.", "Ms.", "Dr."], mm = [], dd = [], yy = [];
    for (var i = 1; i <= 12; i++) mm.push(("0" + i).slice(-2));
    for (var j = 1; j <= 31; j++) dd.push(("0" + j).slice(-2));
    for (var y = new Date().getFullYear(); y >= 1940; y--) yy.push("" + y);
    var dob = (p.dob || "").split("-"), cy = dob[0] || "", cm = dob[1] || "", cd = dob[2] || "";
    function opts(arr, cur, ph) { var s = '<option value="">' + ph + "</option>"; arr.forEach(function (v) { if (v) s += '<option value="' + v + '"' + (v === cur ? " selected" : "") + ">" + v + "</option>"; }); return s; }
    var h = '<div class="top"><h1>Edit Profile</h1><button class="back" data-a="tomsg">← Back</button></div><div class="form">';
    h += '<div class="fld"><select class="ckinp" id="pt">';
    titles.forEach(function (t) { h += '<option value="' + t + '"' + (t === (p.title || "") ? " selected" : "") + ">" + (t || "Title") + "</option>"; });
    h += "</select></div>";
    h += '<div class="ckrow"><input class="ckinp" id="pf" placeholder="First Name" value="' + esc(p.firstName || "") + '"><input class="ckinp" id="pl" placeholder="Last Name" value="' + esc(p.lastName || "") + '"></div>';
    h += '<input class="ckinp" id="pe" style="margin-top:10px" type="email" placeholder="Email Address" value="' + esc(p.email || "") + '">';
    h += '<div class="ckrow" style="margin-top:10px"><span class="ckpre">🇮🇳 +91</span><input class="ckinp" value="' + esc(mob10()) + '" disabled></div>';
    h += '<div class="cklbl">Date of Birth</div>';
    h += '<div class="ckrow"><select class="ckinp" id="pm">' + opts(mm, cm, "MM") + '</select><select class="ckinp" id="pd">' + opts(dd, cd, "DD") + '</select><select class="ckinp" id="py">' + opts(yy, cy, "YYYY") + "</select></div>";
    if (st.err) h += '<div class="ckerr">' + esc(st.err) + "</div>";
    h += '<button class="ckbtn" style="background:#E0952A;color:#431016;margin-top:16px" data-a="savep">Save Profile</button>';
    h += '<button class="ckbtn" style="background:#fff;color:#b3261e;border:1px solid #e6a9a9;margin-top:10px" data-a="logout">Logout</button></div>';
    return h;
  }
  function onSmsClick(e) {
    var t = e.target.closest("[data-a]"); if (!t) return; e.preventDefault();
    var a = t.getAttribute("data-a");
    if (a === "home") hideSms();
    else if (a === "refresh") refreshMe().then(renderSms);
    else if (a === "clear") { st.date = ""; refreshMe().then(renderSms); }
    else if (a === "tomsg") { st.view = "messages"; renderSms(); }
    else if (a === "editprofile") { st.view = "edit"; renderSms(); }
    else if (a === "logout") logout();
    else if (a === "savep") saveProfileForm();
  }
  async function saveProfileForm() {
    var g = function (id) { var e = smsBox.querySelector("#" + id); return e ? e.value : ""; };
    var mm = g("pm"), dd = g("pd"), yy = g("py"), dob = (yy && mm && dd) ? yy + "-" + mm + "-" + dd : "";
    var body = { title: g("pt"), firstName: g("pf"), lastName: g("pl"), email: g("pe"), dob: dob };
    st.err = "";
    try {
      var r = await fetch("/api/user/profile", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
      var d = await r.json();
      if (!r.ok) { st.err = d.error || "Save failed."; renderSms(); return; }
      await refreshMe(); st.view = "messages"; renderSms();
    } catch (e) { st.err = "Network error."; renderSms(); }
  }

  // ---- site menu integration ----
  function askPush() {
    if (typeof Notification === "undefined") { alert("Is browser me notifications support nahi."); return; }
    Notification.requestPermission().then(function (p) { st.push = p === "granted"; injectMenu(); });
  }
  function ckNav(a) {
    if (a === "push") { askPush(); return; }
    closeSiteMenu();
    if (a === "dologin") { if (st.loggedIn) showSms("messages"); else { st.step = "mobile"; openLogin(); } }
    else if (a === "sms") { if (st.loggedIn) showSms("messages"); else { st.step = "mobile"; openLogin(); } }
    else if (a === "editprofile") { if (st.loggedIn) showSms("edit"); else openLogin(); }
    else if (a === "logout") logout();
    else if (a === "rate") window.open(RATE_URL, "_blank");
  }
  function injectMenu() {
    var nav = document.querySelector("nav.main");
    var ul = nav ? nav.querySelector("ul") : null;
    if (!nav || !ul) return;
    if (typeof Notification !== "undefined") st.push = Notification.permission === "granted";
    // Profile header at the very top (above Home) — round avatar + Edit Profile.
    var prof = nav.querySelector(".ck-prof");
    if (!prof) { prof = document.createElement("div"); prof.className = "ck-prof"; nav.insertBefore(prof, ul); }
    if (st.loggedIn) {
      prof.innerHTML = '<div class="ck-av" data-cka="editprofile">👤</div><div class="ck-pn">' + esc(st.name || "User") + '</div><div class="ck-pm">+91 ' + esc(mob10()) + '</div><button class="ck-ep" data-cka="editprofile">✎ Edit Profile</button>';
    } else {
      prof.innerHTML = '<div class="ck-av" data-cka="dologin">👤</div><div class="ck-pn">Guest</div><button class="ck-ep" data-cka="dologin">Login / Sign in</button>';
    }
    Array.prototype.slice.call(prof.querySelectorAll("[data-cka]")).forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); ckNav(b.getAttribute("data-cka")); });
    });
    // Menu list items (Edit Profile is now the top profile block).
    Array.prototype.slice.call(ul.querySelectorAll("li.ck-li")).forEach(function (x) { x.remove(); });
    var items = st.loggedIn
      ? [{ t: "My SMS Notifications", a: "sms", sw: "on" }, { t: "Push Notification", a: "push", sw: st.push ? "on" : "" }, { t: "Rate on Google", a: "rate" }, { t: "Logout", a: "logout" }]
      : [{ t: "My SMS / Login", a: "dologin" }];
    items.forEach(function (it) {
      var li = document.createElement("li"); li.className = "ck-li";
      var a = document.createElement("a"); a.href = "#"; a.className = "ck-navitem";
      a.innerHTML = esc(it.t) + (it.sw !== undefined ? '<span class="ck-sw ' + it.sw + '"></span>' : "");
      a.addEventListener("click", function (e) { e.preventDefault(); ckNav(it.a); });
      li.appendChild(a); ul.appendChild(li);
    });
  }

  function fabClick() { if (st.loggedIn) showSms("messages"); else { st.step = "mobile"; openLogin(); } }

  function boot() {
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    ov = elem('<div id="ckov"><div id="cksheet"></div></div>');
    sheet = ov.querySelector("#cksheet");
    document.body.appendChild(ov);
    ensureSmsBox();
    bar = elem('<div id="ck-bar"><button data-a="barback">← Back</button><button class="pri" data-a="home">🏠 Home</button></div>');
    document.body.appendChild(bar);
    bar.addEventListener("click", function (e) {
      var t = e.target.closest("[data-a]"); if (!t) return;
      var a = t.getAttribute("data-a");
      if (a === "home") hideSms();
      else if (a === "barback") { if (st.view === "edit") { st.view = "messages"; renderSms(); } else hideSms(); }
    });
    ov.onclick = function (e) { if (e.target === ov) closeLogin(); };
    sheet.addEventListener("click", onSheetClick);
    // Logo = Home (also leaves the SMS page).
    var brand = document.querySelector(".brand");
    if (brand) { brand.style.cursor = "pointer"; brand.addEventListener("click", function () { if (smsBox && !smsBox.hidden) hideSms(); try { window.scrollTo(0, 0); } catch (e) {} }); }
    // A real site nav link (Home/About/…) while on the SMS page -> show the site first.
    var nav = document.querySelector("nav.main");
    if (nav) nav.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (a && !a.classList.contains("ck-navitem") && smsBox && !smsBox.hidden) hideSms();
    });
    window.addEventListener("popstate", function () {
      if (location.pathname === "/sms") { if (st.loggedIn) showSms("messages"); }
      else hideSms();
    });
    refreshMe().then(function () {
      var skipped = false; try { skipped = sessionStorage.getItem("ck_skip") === "1"; } catch (e) {}
      if (location.pathname === "/sms") { if (st.loggedIn) showSms("messages"); else openLogin(); }
      else if (!st.loggedIn && !skipped) setTimeout(openLogin, 700);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
