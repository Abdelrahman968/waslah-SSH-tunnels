"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let profilesCache = [];
let selectedProfileId = null;
let uptimeTimer = null;
let lastStatusPayload = null;

// ==========================================================
// i18n
// ==========================================================
const translations = {
  ar: {
    brand: { tagline: "وصلة SSH" },
    nav: {
      dashboard: "الاتصال",
      profiles: "البروفايلات",
      logs: "السجل",
      settings: "الإعدادات",
      about: "عن المطوّر",
    },
    status: {
      disconnected: "مش متصل",
      connecting: "بيتصل...",
      connected: "متصل ✅",
      reconnecting: "بيحاول يرجع يتصل...",
      disconnecting: "بيقطع الاتصال...",
      error: "حصل خطأ",
    },
    dashboard: {
      title: "الاتصال",
      subtitle: "اختار بروفايل وابدأ النفق",
      profileLabel: "البروفايل",
      noProfiles: "مفيش بروفايلات لسه — ضيف واحد من تبويب البروفايلات",
      connectBtn: "اتصال",
      disconnectBtn: "قطع الاتصال",
      cancelBtn: "إلغاء المحاولة",
      working: "...",
      device: "جهازك",
      server: "السيرفر",
      waiting: "مستني تبدأ الاتصال",
      uptime: "مدة الاتصال",
      download: "تحميل",
      upload: "رفع",
      ping: "البينج",
      metaHost: "الهوست",
      metaUser: "اليوزر",
      metaSni: "SNI",
    },
    profiles: {
      title: "البروفايلات",
      subtitle: "ضيف حساب SSH يدويًا أو بالصيغة السريعة",
      quickAddTitle: "إضافة سريعة",
      quickAddDesc:
        'صيغة: <code class="mono">host:port@user:pass</code> — البورت اختياري (افتراضي 443). تقدر تضيف SNI بـ <code class="mono">#sni.host</code>',
      quickAddPlaceholder: "IP:PORT@Username:Password",
      parseBtn: "تحليل ومعاينة",
      saveQuickBtn: "حفظ كبروفايل",
      manualTitle: "إضافة يدوية",
      nameLabel: "اسم البروفايل",
      namePlaceholder: "مثلاً: سيرفر شغل",
      hostLabel: "الهوست",
      portLabel: "البورت",
      port22: "22 (SSH افتراضي)",
      portCustom: "مخصص...",
      portCustomPlaceholder: "رقم البورت",
      userLabel: "اليوزرنيم",
      passLabel: "الباسورد",
      sniLabel: "SNI (اختياري)",
      sniPlaceholder: "مثلاً: cdn.example.com",
      colorLabel: "لون التمييز",
      testBtn: "اختبار الاتصال",
      saveBtn: "حفظ البروفايل",
      testing: "بنختبر...",
      allTitle: "كل البروفايلات",
      searchPlaceholder: "بحث...",
      exportBtn: "تصدير",
      importBtn: "استيراد",
      thName: "الاسم",
      thHost: "الهوست",
      thPort: "البورت",
      thSni: "SNI",
      copyTitle: "نسخ الصيغة السريعة",
      deleteTitle: "حذف",
      noResultsRow: "مفيش نتائج مطابقة",
    },
    logs: {
      title: "السجل",
      subtitle: "تفاصيل تقنية لكل خطوة في الاتصال",
      clearBtn: "مسح",
      copyBtn: "نسخ الكل",
    },
    settings: {
      title: "الإعدادات",
      langTitle: "لغة الواجهة",
      langDesc: "اختار اللغة اللي تفضل تستخدم بيها البرنامج",
      sniTitle: "SNI افتراضي لكل البروفايلات",
      sniDesc:
        "لو بروفايل معينله SNI خاص بيتجاهل ده، أما لو فاضي بيستخدم القيمة دي تلقائيًا لكل الاتصالات",
      sniPlaceholder: "مثلاً: ea.com",
      killTitle: "Kill Switch",
      killDesc:
        "يقفل الإنترنت تمامًا لو النفق وقع، بدل ما يسرّب ترافيك بره الـ VPN",
      reconnectTitle: "إعادة الاتصال التلقائي",
      reconnectDesc: "يحاول يرجع يتصل لوحده لو النفق اتقطع",
      autoconnectTitle: "الاتصال التلقائي عند فتح البرنامج",
      autoconnectDesc: "يتصل بآخر بروفايل استخدمته أوتوماتيك",
      autostartTitle: "تشغيل مع ويندوز",
      autostartDesc: "يفتح Waslah تلقائيًا عند تشغيل الجهاز",
      retriesTitle: "عدد محاولات إعادة الاتصال",
    },
    about: {
      title: "عن المطوّر",
      role: "Frontend Developer — React / Next.js",
      body: 'تطبيق <strong>Waslah</strong> اتبنى كأداة شخصية لإدارة وتشغيل أنفاق SSH مع دعم SNI bypass، مبني بالكامل بـ Electron + Node.js، وبيستخدم <code class="mono">ssh2</code> للاتصال، <code class="mono">socksv5</code> للبروكسي المحلي، و<code class="mono">tun2socks</code> + Wintun لتحويله لـ VPN حقيقي على مستوى النظام.',
      version: "الإصدار",
      madeIn: "Made in Dakahlia, Egypt 🇪🇬",
    },
    toast: {
      profileDeleted: "اتمسح البروفايل",
      formatCopied: "اتنسخت الصيغة السريعة",
      profileSaved: "اتحفظ البروفايل",
      missingFields: "فيه حقول ناقصة",
      exported: "اتصدّرت البروفايلات (ملف فيه باسوردات — احفظه بأمان)",
      imported: "اتستوردت البروفايلات",
      chooseProfileFirst: "اختار بروفايل الأول",
      connectFailed: "فشل الاتصال: ",
      sniSaved: "اتحفظ الـ SNI الافتراضي",
      logsCopied: "اتنسخ السجل كامل",
      fillHostPort: "املأ الهوست والبورت الأول",
    },
    test: { ok: "✓ السيرفر بيرد — ", fail: "✗ السيرفر مش بيرد على البورت ده" },
    quick: {
      ok: "✓ هوست: ",
      portLbl: "— بورت: ",
      userLbl: "— يوزر: ",
      sniLbl: "— SNI: ",
      fail: "✗ الصيغة غلط. لازم تكون: host:port@user:pass",
    },
  },
  en: {
    brand: { tagline: "SSH Tunnel" },
    nav: {
      dashboard: "Connection",
      profiles: "Profiles",
      logs: "Logs",
      settings: "Settings",
      about: "About",
    },
    status: {
      disconnected: "Disconnected",
      connecting: "Connecting...",
      connected: "Connected ✅",
      reconnecting: "Reconnecting...",
      disconnecting: "Disconnecting...",
      error: "Error",
    },
    dashboard: {
      title: "Connection",
      subtitle: "Pick a profile and start the tunnel",
      profileLabel: "Profile",
      noProfiles: "No profiles yet — add one from the Profiles tab",
      connectBtn: "Connect",
      disconnectBtn: "Disconnect",
      cancelBtn: "Cancel attempt",
      working: "...",
      device: "Your device",
      server: "Server",
      waiting: "Waiting to connect",
      uptime: "Uptime",
      download: "Download",
      upload: "Upload",
      ping: "Ping",
      metaHost: "Host",
      metaUser: "User",
      metaSni: "SNI",
    },
    profiles: {
      title: "Profiles",
      subtitle: "Add an SSH account manually or with quick add",
      quickAddTitle: "Quick add",
      quickAddDesc:
        'Format: <code class="mono">host:port@user:pass</code> — port is optional (default 443). Add an SNI with <code class="mono">#sni.host</code>',
      quickAddPlaceholder: "IP:PORT@Username:Password",
      parseBtn: "Parse & preview",
      saveQuickBtn: "Save as profile",
      manualTitle: "Manual add",
      nameLabel: "Profile name",
      namePlaceholder: "e.g. Work server",
      hostLabel: "Host",
      portLabel: "Port",
      port22: "22 (SSH default)",
      portCustom: "Custom...",
      portCustomPlaceholder: "Port number",
      userLabel: "Username",
      passLabel: "Password",
      sniLabel: "SNI (optional)",
      sniPlaceholder: "e.g. cdn.example.com",
      colorLabel: "Accent color",
      testBtn: "Test connection",
      saveBtn: "Save profile",
      testing: "Testing...",
      allTitle: "All profiles",
      searchPlaceholder: "Search...",
      exportBtn: "Export",
      importBtn: "Import",
      thName: "Name",
      thHost: "Host",
      thPort: "Port",
      thSni: "SNI",
      copyTitle: "Copy quick-add string",
      deleteTitle: "Delete",
      noResultsRow: "No matching profiles",
    },
    logs: {
      title: "Logs",
      subtitle: "Technical detail for every step of the connection",
      clearBtn: "Clear",
      copyBtn: "Copy all",
    },
    settings: {
      title: "Settings",
      langTitle: "Interface language",
      langDesc: "Choose the language you want the app to use",
      sniTitle: "Default SNI for all profiles",
      sniDesc:
        "If a profile has its own SNI it overrides this. Otherwise this value is used for every connection",
      sniPlaceholder: "e.g. ea.com",
      killTitle: "Kill Switch",
      killDesc:
        "Cuts the internet completely if the tunnel drops, instead of leaking traffic outside the VPN",
      reconnectTitle: "Auto-reconnect",
      reconnectDesc: "Automatically tries to reconnect if the tunnel drops",
      autoconnectTitle: "Connect on launch",
      autoconnectDesc: "Automatically connects to your last used profile",
      autostartTitle: "Start with Windows",
      autostartDesc: "Opens Waslah automatically when your device starts",
      retriesTitle: "Reconnect attempts",
    },
    about: {
      title: "About the developer",
      role: "Frontend Developer — React / Next.js",
      body: 'Waslah was built as a personal tool for managing and running SSH tunnels with SNI bypass support, built entirely with Electron + Node.js. It uses <code class="mono">ssh2</code> for the connection, <code class="mono">socksv5</code> for the local proxy, and <code class="mono">tun2socks</code> + Wintun to turn it into a real system-wide VPN.',
      version: "Version",
      madeIn: "Made in Dakahlia, Egypt 🇪🇬",
    },
    toast: {
      profileDeleted: "Profile deleted",
      formatCopied: "Quick-add string copied",
      profileSaved: "Profile saved",
      missingFields: "Some fields are missing",
      exported:
        "Profiles exported (the file contains passwords — keep it safe)",
      imported: "Profiles imported",
      chooseProfileFirst: "Choose a profile first",
      connectFailed: "Connection failed: ",
      sniSaved: "Default SNI saved",
      logsCopied: "Full log copied",
      fillHostPort: "Fill in the host and port first",
    },
    test: {
      ok: "✓ Server responded — ",
      fail: "✗ Server did not respond on that port",
    },
    quick: {
      ok: "✓ Host: ",
      portLbl: "— Port: ",
      userLbl: "— User: ",
      sniLbl: "— SNI: ",
      fail: "✗ Wrong format. Must be: host:port@user:pass",
    },
  },
};

let currentLang = localStorage.getItem("waslah_lang") || "ar";

function t(path) {
  const parts = path.split(".");
  let node = translations[currentLang];
  for (const p of parts) {
    if (node == null) break;
    node = node[p];
  }
  return node != null ? node : path;
}

function applyTranslations() {
  $$("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $$("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  $$("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  document.title =
    currentLang === "ar" ? "Waslah — وصلة" : "Waslah — SSH Tunnel";
}

function updateLangSwitchUI() {
  $$(".lang-switch .lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
}

function setLanguage(lang) {
  if (lang !== "ar" && lang !== "en") return;
  currentLang = lang;
  localStorage.setItem("waslah_lang", lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  applyTranslations();
  updateLangSwitchUI();
  renderProfileSelect();
  renderProfileTable();
  if (lastStatusPayload) applyState(lastStatusPayload);
}

$$(".lang-switch .lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
});

// ---------------- Navigation ----------------
$$(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    $$(".nav-item").forEach((i) => i.classList.remove("active"));
    $$(".page").forEach((p) => p.classList.remove("active"));
    item.classList.add("active");
    $(`#page-${item.dataset.page}`).classList.add("active");
  });
});

// ---------------- Toast ----------------
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

// ---------------- Profiles ----------------
async function loadProfiles() {
  profilesCache = await window.waslah.profiles.list();
  renderProfileSelect();
  renderProfileTable();
}

function renderProfileSelect() {
  const sel = $("#profileSelect");
  sel.innerHTML = profilesCache.length
    ? ""
    : `<option value="">${t("dashboard.noProfiles")}</option>`;

  profilesCache.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.host}:${p.port}`;
    sel.appendChild(opt);
  });

  if (profilesCache.length) {
    selectedProfileId = selectedProfileId || profilesCache[0].id;
    sel.value = selectedProfileId;
    updateProfileMeta();
  } else {
    $("#profileMeta").innerHTML = "";
  }
}

$("#profileSelect").addEventListener("change", (e) => {
  selectedProfileId = e.target.value;
  updateProfileMeta();
});

function updateProfileMeta() {
  const p = profilesCache.find((x) => x.id === selectedProfileId);
  const meta = $("#profileMeta");
  const serverLabel = $("#serverLabel");
  if (!p) {
    meta.innerHTML = "";
    return;
  }
  meta.innerHTML = `
    <div>${t("dashboard.metaHost")}: <span class="mono">${p.host}:${p.port}</span></div>
    <div>${t("dashboard.metaUser")}: <span class="mono">${p.username}</span></div>
    ${p.sni ? `<div>${t("dashboard.metaSni")}: <span class="mono">${p.sni}</span></div>` : ""}
  `;
  serverLabel.textContent = p.name;
}

function renderProfileTable() {
  const body = $("#profilesTableBody");
  const filter = ($("#profileSearch").value || "").toLowerCase();
  const rows = profilesCache.filter(
    (p) =>
      p.name.toLowerCase().includes(filter) ||
      p.host.toLowerCase().includes(filter),
  );

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted small" style="text-align:center;padding:20px;">${t("profiles.noResultsRow")}</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map(
      (p) => `
    <tr>
      <td><span class="profile-dot" style="background:${p.color}"></span></td>
      <td>${p.name}</td>
      <td class="mono">${p.host}</td>
      <td class="mono">${p.port}</td>
      <td class="mono">${p.sni || "—"}</td>
      <td>
        <div class="table-actions">
          <button data-action="copy" data-id="${p.id}" title="${t("profiles.copyTitle")}">📋</button>
          <button data-action="delete" data-id="${p.id}" title="${t("profiles.deleteTitle")}">🗑</button>
        </div>
      </td>
    </tr>
  `,
    )
    .join("");

  body.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      await window.waslah.profiles.delete(btn.dataset.id);
      toast(t("toast.profileDeleted"));
      await loadProfiles();
    });
  });

  body.querySelectorAll('[data-action="copy"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const str = await window.waslah.profiles.copyQuickAdd(btn.dataset.id);
      if (str) {
        navigator.clipboard.writeText(str);
        toast(t("toast.formatCopied"));
      }
    });
  });
}

$("#profileSearch").addEventListener("input", renderProfileTable);

// ---------------- Quick add ----------------
let quickAddParsed = null;

$("#quickAddParseBtn").addEventListener("click", async () => {
  const raw = $("#quickAddInput").value;
  const result = await window.waslah.profiles.quickAddParse(raw);
  const preview = $("#quickPreview");
  if (result.ok) {
    quickAddParsed = result.data;
    preview.className = "quick-preview ok";
    preview.innerHTML = `${t("quick.ok")}${result.data.host} ${t("quick.portLbl")}${result.data.port} ${t("quick.userLbl")}${result.data.username}${result.data.sni ? " " + t("quick.sniLbl") + result.data.sni : ""}`;
    $("#quickAddSaveBtn").disabled = false;
  } else {
    quickAddParsed = null;
    preview.className = "quick-preview err";
    preview.textContent = t("quick.fail");
    $("#quickAddSaveBtn").disabled = true;
  }
});

$("#quickAddSaveBtn").addEventListener("click", async () => {
  if (!quickAddParsed) return;
  await window.waslah.profiles.save({
    name: quickAddParsed.host,
    ...quickAddParsed,
  });
  toast(t("toast.profileSaved"));
  $("#quickAddInput").value = "";
  $("#quickPreview").textContent = "";
  $("#quickAddSaveBtn").disabled = true;
  await loadProfiles();
});

// ---------------- Manual add form ----------------
$("#f_port").addEventListener("change", (e) => {
  $("#f_port_custom").style.display =
    e.target.value === "custom" ? "block" : "none";
});

function readManualForm() {
  const portSel = $("#f_port").value;
  const port =
    portSel === "custom" ? Number($("#f_port_custom").value) : Number(portSel);
  return {
    name: $("#f_name").value.trim() || $("#f_host").value.trim(),
    host: $("#f_host").value.trim(),
    port,
    username: $("#f_user").value.trim(),
    password: $("#f_pass").value,
    sni: $("#f_sni").value.trim(),
    color: $("#f_color").value,
  };
}

$("#testConnBtn").addEventListener("click", async () => {
  const { host, port } = readManualForm();
  if (!host || !port) return toast(t("toast.fillHostPort"));
  $("#testConnResult").textContent = t("profiles.testing");
  const res = await window.waslah.conn.testPing(host, port);
  $("#testConnResult").textContent = res.ok
    ? `${t("test.ok")}${res.ms}ms`
    : t("test.fail");
});

$("#saveProfileBtn").addEventListener("click", async () => {
  const data = readManualForm();
  if (!data.host || !data.username || !data.password || !data.port) {
    return toast(t("toast.missingFields"));
  }
  await window.waslah.profiles.save(data);
  toast(t("toast.profileSaved"));
  ["f_name", "f_host", "f_user", "f_pass", "f_sni"].forEach(
    (id) => ($(`#${id}`).value = ""),
  );
  await loadProfiles();
});

$("#exportBtn").addEventListener("click", async () => {
  const res = await window.waslah.profiles.export();
  if (res.ok) toast(t("toast.exported"));
});

$("#importBtn").addEventListener("click", async () => {
  const res = await window.waslah.profiles.import();
  if (res.ok) {
    toast(t("toast.imported"));
    await loadProfiles();
  }
});

// ---------------- Connection ----------------
function applyState(payload) {
  lastStatusPayload = payload;
  const { state } = payload;
  const pill = $("#globalStatusPill");
  pill.className = `status-pill ${state}`;
  $("#globalStatusText").textContent = t(`status.${state}`);

  const pulseLine = $("#pulseLine");
  pulseLine.classList.toggle(
    "active",
    state === "connected" || state === "connecting" || state === "reconnecting",
  );

  $("#tunnelStatusText").textContent = t(`status.${state}`);

  const connectBtn = $("#connectBtn");
  const label = $("#connectBtnLabel");
  if (state === "connected") {
    connectBtn.classList.remove("btn-primary");
    connectBtn.classList.add("btn-danger");
    connectBtn.disabled = false;
    label.textContent = t("dashboard.disconnectBtn");
    startUptimeTimer();
  } else if (state === "connecting" || state === "disconnecting") {
    connectBtn.classList.add("btn-primary");
    connectBtn.classList.remove("btn-danger");
    connectBtn.disabled = true;
    label.textContent = t("dashboard.working");
  } else if (state === "reconnecting") {
    connectBtn.classList.remove("btn-primary");
    connectBtn.classList.add("btn-danger");
    connectBtn.disabled = false;
    label.textContent = t("dashboard.cancelBtn");
  } else {
    connectBtn.classList.add("btn-primary");
    connectBtn.classList.remove("btn-danger");
    connectBtn.disabled = false;
    label.textContent = t("dashboard.connectBtn");
    stopUptimeTimer();
  }
}

function startUptimeTimer() {
  stopUptimeTimer();
  uptimeTimer = setInterval(async () => {
    const status = await window.waslah.conn.status();
    const s = Math.floor((status.uptimeMs || 0) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    $("#statUptime").textContent = `${hh}:${mm}:${ss}`;
    $("#statDown").textContent = formatBytes(status.bytesIn);
    $("#statUp").textContent = formatBytes(status.bytesOut);
  }, 1000);
}
function stopUptimeTimer() {
  if (uptimeTimer) clearInterval(uptimeTimer);
  $("#statUptime").textContent = "00:00:00";
  $("#statDown").textContent = "0 KB";
  $("#statUp").textContent = "0 KB";
}

function formatBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

$("#connectBtn").addEventListener("click", async () => {
  const status = await window.waslah.conn.status();
  if (
    status.state === "connected" ||
    status.state === "connecting" ||
    status.state === "reconnecting"
  ) {
    await window.waslah.conn.disconnect();
  } else {
    if (!selectedProfileId) return toast(t("toast.chooseProfileFirst"));
    try {
      await window.waslah.conn.connect(selectedProfileId);
    } catch (err) {
      toast(t("toast.connectFailed") + err.message);
    }
  }
});

// ---------------- Logs ----------------
window.waslah.on.log((line) => {
  const box = $("#consoleBox");
  box.textContent += line + "\n";
  box.scrollTop = box.scrollHeight;
});

window.waslah.on.state((payload) => applyState(payload));

$("#clearLogsBtn").addEventListener(
  "click",
  () => ($("#consoleBox").textContent = ""),
);
$("#copyLogsBtn").addEventListener("click", () => {
  navigator.clipboard.writeText($("#consoleBox").textContent);
  toast(t("toast.logsCopied"));
});

// ---------------- Settings ----------------
async function loadSettings() {
  const s = await window.waslah.settings.get();
  $("#s_defaultsni").value = s.defaultSni || "";
  $("#s_killswitch").checked = !!s.killSwitch;
  $("#s_reconnect").checked = !!s.reconnect?.enabled;
  $("#s_autoconnect").checked = !!s.autoConnectLastProfile;
  $("#s_autostart").checked = !!s.autoStartWindows;
  $("#s_maxretries").value = s.reconnect?.maxRetries ?? 5;
}

let defaultSniSaveTimer = null;
$("#s_defaultsni").addEventListener("input", (e) => {
  clearTimeout(defaultSniSaveTimer);
  defaultSniSaveTimer = setTimeout(async () => {
    await window.waslah.settings.update({ defaultSni: e.target.value.trim() });
    toast(t("toast.sniSaved"));
  }, 500);
});

function bindSettingToggle(id, key, isNested) {
  $(id).addEventListener("change", async (e) => {
    const value = e.target.checked;
    if (isNested) {
      const s = await window.waslah.settings.get();
      await window.waslah.settings.update({
        reconnect: { ...s.reconnect, enabled: value },
      });
    } else {
      await window.waslah.settings.update({ [key]: value });
    }
  });
}
bindSettingToggle("#s_killswitch", "killSwitch");
bindSettingToggle("#s_reconnect", null, true);
bindSettingToggle("#s_autoconnect", "autoConnectLastProfile");
bindSettingToggle("#s_autostart", "autoStartWindows");

$("#s_maxretries").addEventListener("change", async (e) => {
  const s = await window.waslah.settings.get();
  await window.waslah.settings.update({
    reconnect: { ...s.reconnect, maxRetries: Number(e.target.value) },
  });
});

// ---------------- About ----------------
$$(".link-btn").forEach((btn) => {
  btn.addEventListener("click", () =>
    window.waslah.app.openExternal(btn.dataset.link),
  );
});

// ---------------- Init ----------------
(async function init() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
  applyTranslations();
  updateLangSwitchUI();

  await loadProfiles();
  await loadSettings();
  const status = await window.waslah.conn.status();
  applyState(status);
  $("#appVersion").textContent = await window.waslah.app.getVersion();
})();
