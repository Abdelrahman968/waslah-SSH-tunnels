'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let profilesCache = [];
let sniCache = [];
let vlessCache = [];
let selectedProfileId = null;
let uptimeTimer = null;
let currentSettings = null;
let recentLogEntries = [];

// ================= Navigation =================
$$('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    $$('.nav-item').forEach((i) => i.classList.remove('active'));
    $$('.page').forEach((p) => p.classList.remove('active'));
    item.classList.add('active');
    $(`#page-${item.dataset.page}`).classList.add('active');
    if (item.dataset.page === 'logs') refreshLogTable();
  });
});

$('#viewAllLogsBtn').addEventListener('click', () => {
  $$('.nav-item').forEach((i) => i.classList.remove('active'));
  $$('.page').forEach((p) => p.classList.remove('active'));
  $('.nav-item[data-page="logs"]').classList.add('active');
  $('#page-logs').classList.add('active');
  refreshLogTable();
});

// ================= Toast =================
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ================= Theme =================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeLightBtn').classList.toggle('active', theme === 'light');
  $('#themeDarkBtn').classList.toggle('active', theme === 'dark');
}
$('#themeLightBtn').addEventListener('click', async () => {
  applyTheme('light');
  await window.waslah.settings.update({ theme: 'light' });
});
$('#themeDarkBtn').addEventListener('click', async () => {
  applyTheme('dark');
  await window.waslah.settings.update({ theme: 'dark' });
});

// ================= Language =================
async function applyLanguage(lang) {
  await I18N.load(lang);
  I18N.apply();
  $('#langArBtn').classList.toggle('active', lang === 'ar');
  $('#langEnBtn').classList.toggle('active', lang === 'en');
  renderMiniLogs();
  renderLogCategoryOptions();
}
$('#langArBtn').addEventListener('click', async () => {
  await applyLanguage('ar');
  await window.waslah.settings.update({ language: 'ar' });
});
$('#langEnBtn').addEventListener('click', async () => {
  await applyLanguage('en');
  await window.waslah.settings.update({ language: 'en' });
});

// ================= Profiles =================
async function loadSniOptionsInto(selectEl, selectedValue) {
  selectEl.innerHTML = '<option value="">—</option>';
  sniCache.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.host;
    opt.textContent = s.host + (s.favorite ? ' ★' : '');
    if (s.host === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

async function loadProfiles() {
  profilesCache = await window.waslah.profiles.list();
  renderProfileSelect();
  renderProfileTable();
}

function renderProfileSelect() {
  const sel = $('#profileSelect');
  sel.innerHTML = '';
  profilesCache.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} — ${p.host}:${p.port}`;
    sel.appendChild(opt);
  });
  if (profilesCache.length) {
    selectedProfileId = selectedProfileId || profilesCache[0].id;
    sel.value = selectedProfileId;
    updateProfileMeta();
  }
}

$('#profileSelect').addEventListener('change', (e) => {
  selectedProfileId = e.target.value;
  updateProfileMeta();
});

function updateProfileMeta() {
  const p = profilesCache.find((x) => x.id === selectedProfileId);
  const meta = $('#profileMeta');
  const serverLabel = $('#serverLabel');
  if (!p) { meta.innerHTML = ''; return; }
  meta.innerHTML = `
    <div>${p.host}:${p.port}</div>
    <div class="mono">${p.username}</div>
    ${p.sni ? `<div class="mono">SNI: ${p.sni}</div>` : ''}
  `;
  serverLabel.textContent = p.name;
}

function renderProfileTable() {
  const body = $('#profilesTableBody');
  const filter = ($('#profileSearch').value || '').toLowerCase();
  const rows = profilesCache.filter(
    (p) => p.name.toLowerCase().includes(filter) || p.host.toLowerCase().includes(filter)
  );

  body.innerHTML = rows.map((p) => `
    <tr>
      <td><span class="profile-dot" style="background:${p.color}"></span></td>
      <td>${p.name}</td>
      <td class="mono">${p.host}</td>
      <td class="mono">${p.port}</td>
      <td class="mono">${p.sni || '—'}</td>
      <td>
        <div class="table-actions">
          <button data-action="copy" data-id="${p.id}" data-icon="copy"></button>
          <button data-action="delete" data-id="${p.id}" data-icon="trash"></button>
        </div>
      </td>
    </tr>
  `).join('');
  applyIcons(body);

  body.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.waslah.profiles.delete(btn.dataset.id);
      toast(I18N.t('toast.profileDeleted'));
      await loadProfiles();
    });
  });
  body.querySelectorAll('[data-action="copy"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const str = await window.waslah.profiles.copyQuickAdd(btn.dataset.id);
      if (str) { navigator.clipboard.writeText(str); toast(I18N.t('toast.copied')); }
    });
  });
}
$('#profileSearch').addEventListener('input', renderProfileTable);

// ---- Quick add ----
let quickAddParsed = null;
$('#quickAddParseBtn').addEventListener('click', async () => {
  const raw = $('#quickAddInput').value;
  const result = await window.waslah.profiles.quickAddParse(raw);
  const preview = $('#quickPreview');
  if (result.ok) {
    quickAddParsed = result.data;
    preview.className = 'quick-preview ok';
    preview.innerHTML = `✓ ${result.data.host} — ${result.data.port} — ${result.data.username}${result.data.sni ? ' — SNI: ' + result.data.sni : ''}`;
    $('#quickAddSaveBtn').disabled = false;
  } else {
    quickAddParsed = null;
    preview.className = 'quick-preview err';
    preview.textContent = '✗ ' + I18N.t('toast.invalidQuickAdd');
    $('#quickAddSaveBtn').disabled = true;
  }
});
$('#quickAddSaveBtn').addEventListener('click', async () => {
  if (!quickAddParsed) return;
  await window.waslah.profiles.save({ name: quickAddParsed.host, ...quickAddParsed });
  toast(I18N.t('toast.profileSaved'));
  $('#quickAddInput').value = '';
  $('#quickPreview').textContent = '';
  $('#quickAddSaveBtn').disabled = true;
  await loadProfiles();
});

// ---- Manual add ----
$('#f_port').addEventListener('change', (e) => {
  $('#f_port_custom').style.display = e.target.value === 'custom' ? 'block' : 'none';
});
function readManualForm() {
  const portSel = $('#f_port').value;
  const port = portSel === 'custom' ? Number($('#f_port_custom').value) : Number(portSel);
  return {
    name: $('#f_name').value.trim() || $('#f_host').value.trim(),
    host: $('#f_host').value.trim(),
    port,
    username: $('#f_user').value.trim(),
    password: $('#f_pass').value,
    sni: $('#f_sni').value.trim(),
    color: $('#f_color').value,
  };
}
$('#testConnBtn').addEventListener('click', async () => {
  const { host, port } = readManualForm();
  if (!host || !port) return toast(I18N.t('toast.missingFields'));
  $('#testConnResult').textContent = '...';
  const res = await window.waslah.conn.testPing(host, port);
  $('#testConnResult').textContent = res.ok ? `✓ ${res.ms}ms` : '✗';
});
$('#saveProfileBtn').addEventListener('click', async () => {
  const data = readManualForm();
  if (!data.host || !data.username || !data.password || !data.port) return toast(I18N.t('toast.missingFields'));
  await window.waslah.profiles.save(data);
  toast(I18N.t('toast.profileSaved'));
  ['f_name', 'f_host', 'f_user', 'f_pass'].forEach((id) => ($(`#${id}`).value = ''));
  await loadProfiles();
});
$('#exportBtn').addEventListener('click', async () => { const r = await window.waslah.profiles.export(); if (r.ok) toast(I18N.t('toast.copied')); });
$('#importBtn').addEventListener('click', async () => { const r = await window.waslah.profiles.import(); if (r.ok) { toast(I18N.t('toast.copied')); await loadProfiles(); } });

// ================= SNI Manager =================
async function loadSni() {
  sniCache = await window.waslah.sni.list();
  renderSniList();
  loadSniOptionsInto($('#f_sni'), '');
}
function renderSniList() {
  const box = $('#sniList');
  if (!sniCache.length) { box.innerHTML = `<div class="empty-state">${I18N.t('sni.empty')}</div>`; return; }
  box.innerHTML = sniCache.map((s) => `
    <div class="sni-row">
      <span class="sni-host mono">${s.host}</span>
      <div class="sni-actions">
        <button data-action="fav" data-id="${s.id}" class="star-btn ${s.favorite ? 'active' : ''}" data-icon="star"></button>
        <button data-action="use" data-id="${s.id}" title="${I18N.t('sni.useAsDefault')}">↗</button>
        <button data-action="del" data-id="${s.id}" data-icon="trash"></button>
      </div>
    </div>
  `).join('');
  applyIcons(box);

  box.querySelectorAll('[data-action="del"]').forEach((b) => b.addEventListener('click', async () => {
    await window.waslah.sni.delete(b.dataset.id); await loadSni();
  }));
  box.querySelectorAll('[data-action="fav"]').forEach((b) => b.addEventListener('click', async () => {
    const entry = sniCache.find((s) => s.id === b.dataset.id);
    await window.waslah.sni.save({ ...entry, favorite: !entry.favorite });
    await loadSni();
  }));
  box.querySelectorAll('[data-action="use"]').forEach((b) => b.addEventListener('click', async () => {
    const entry = sniCache.find((s) => s.id === b.dataset.id);
    await window.waslah.settings.update({ defaultSni: entry.host });
    $('#s_defaultsni').value = entry.host;
    toast(I18N.t('toast.sniSaved'));
  }));
}
$('#sniAddBtn').addEventListener('click', async () => {
  const host = $('#sniInput').value.trim();
  if (!host) return;
  await window.waslah.sni.save({ host });
  $('#sniInput').value = '';
  await loadSni();
});

// ================= VLESS / V2Ray =================
async function loadVless() {
  vlessCache = await window.waslah.vless.list();
  renderVlessList();
}
function renderVlessList() {
  const box = $('#vlessList');
  if (!vlessCache.length) { box.innerHTML = `<div class="empty-state">—</div>`; return; }
  box.innerHTML = vlessCache.map((v) => `
    <div class="vless-row">
      <div>
        <div>${v.name}</div>
        <div class="mono muted small">${v.parsed?.host || ''}${v.parsed?.port ? ':' + v.parsed.port : ''}</div>
      </div>
      <div class="vless-actions">
        <button data-action="del" data-id="${v.id}" data-icon="trash"></button>
      </div>
    </div>
  `).join('');
  applyIcons(box);
  box.querySelectorAll('[data-action="del"]').forEach((b) => b.addEventListener('click', async () => {
    await window.waslah.vless.delete(b.dataset.id); await loadVless();
  }));
}
let vlessValidated = null;
$('#vlessValidateBtn').addEventListener('click', async () => {
  const raw = $('#vlessInput').value.trim();
  const result = await window.waslah.vless.validate(raw);
  const preview = $('#vlessPreview');
  if (result.ok) {
    vlessValidated = raw;
    preview.className = 'quick-preview ok';
    preview.textContent = '✓ ' + JSON.stringify(result.data).slice(0, 160);
    $('#vlessSaveBtn').disabled = false;
  } else {
    vlessValidated = null;
    preview.className = 'quick-preview err';
    preview.textContent = '✗ ' + result.error;
    $('#vlessSaveBtn').disabled = true;
  }
});
$('#vlessSaveBtn').addEventListener('click', async () => {
  if (!vlessValidated) return;
  await window.waslah.vless.save({ name: 'VLESS ' + (vlessCache.length + 1), raw: vlessValidated });
  toast(I18N.t('toast.profileSaved'));
  $('#vlessInput').value = '';
  $('#vlessPreview').textContent = '';
  $('#vlessSaveBtn').disabled = true;
  await loadVless();
});
$('#vlessQrBtn').addEventListener('click', async () => {
  const res = await window.waslah.vless.importQr();
  if (res.ok) { $('#vlessInput').value = res.text; toast(I18N.t('toast.copied')); }
  else if (res.error) toast('✗ ' + res.error);
});

// ================= Network tools =================
function bindTool(btnId, resultId, fn, formatter) {
  $(btnId).addEventListener('click', async () => {
    const resEl = $(resultId);
    resEl.textContent = '...';
    try {
      const data = await fn();
      resEl.textContent = formatter ? formatter(data) : JSON.stringify(data, null, 2);
    } catch (err) {
      resEl.textContent = '✗ ' + err.message;
    }
  });
}

bindTool('#toolMyIpBtn', '#toolMyIpResult', () => window.waslah.net.whatsMyIp(), (d) => d.ok ? d.ip : '✗ ' + d.error);
bindTool('#toolDnsBtn', '#toolDnsResult', () => window.waslah.net.dnsLookup($('#toolDnsHost').value.trim()));
bindTool('#toolTcpBtn', '#toolTcpResult', () => window.waslah.net.tcpPing($('#toolTcpHost').value.trim(), $('#toolTcpPort').value || 443), (d) => d.ok ? `✓ ${d.ms}ms` : `✗ ${d.error}`);
bindTool('#toolHttpBtn', '#toolHttpResult', () => window.waslah.net.httpPing($('#toolHttpUrl').value.trim()), (d) => d.ok ? `✓ HTTP ${d.status} — ${d.ms}ms` : `✗ ${d.error}`);
bindTool('#toolScanBtn', '#toolScanResult', () => {
  const [start, end] = $('#toolScanRange').value.split('-').map((x) => Number(x.trim()));
  return window.waslah.net.portScan($('#toolScanHost').value.trim(), start, end);
}, (ports) => ports.length ? `Open: ${ports.join(', ')}` : 'No open ports found');
bindTool('#toolTraceBtn', '#toolTraceResult', () => window.waslah.net.traceroute($('#toolTraceHost').value.trim()), (t) => t);
bindTool('#toolSslBtn', '#toolSslResult', () => window.waslah.net.sslCheck($('#toolSslHost').value.trim()), (c) =>
  `Subject: ${c.subject?.CN}\nIssuer: ${c.issuer?.O || c.issuer?.CN}\nValid: ${c.validFrom} → ${c.validTo}\nProtocol: ${c.protocol}`
);
bindTool('#toolWhoisBtn', '#toolWhoisResult', () => window.waslah.net.whois($('#toolWhoisHost').value.trim()), (t) => t);

$('#toolB64EncodeBtn').addEventListener('click', () => {
  $('#toolB64Result').textContent = btoa(unescape(encodeURIComponent($('#toolB64Input').value)));
});
$('#toolB64DecodeBtn').addEventListener('click', () => {
  try { $('#toolB64Result').textContent = decodeURIComponent(escape(atob($('#toolB64Input').value))); }
  catch { $('#toolB64Result').textContent = '✗ invalid base64'; }
});
$('#toolUrlEncodeBtn').addEventListener('click', () => { $('#toolUrlResult').textContent = encodeURIComponent($('#toolUrlInput').value); });
$('#toolUrlDecodeBtn').addEventListener('click', () => {
  try { $('#toolUrlResult').textContent = decodeURIComponent($('#toolUrlInput').value); }
  catch { $('#toolUrlResult').textContent = '✗ invalid'; }
});

async function loadProviders() {
  const providers = await window.waslah.providers.list();
  $('#providersList').innerHTML = providers.map((p) => `
    <div class="provider-row">
      <div><strong>${p.name}</strong><div class="muted">${p.notes}</div></div>
      <button data-url="${p.url}">${p.url.replace('https://', '')}</button>
    </div>
  `).join('');
  $('#providersList').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => window.waslah.app.openExternal(b.dataset.url));
  });
}

// ================= Connection state =================
function applyState(payload) {
  const { state } = payload;
  const pill = $('#globalStatusPill');
  pill.className = `status-pill ${state}`;
  $('#globalStatusText').textContent = I18N.t(`status.${state}`) || state;
  $('#tunnelStatusText').textContent = I18N.t(`status.${state}`) || state;

  const pulseLine = $('#pulseLine');
  pulseLine.classList.toggle('active', ['connected', 'connecting', 'reconnecting'].includes(state));

  const connectBtn = $('#connectBtn');
  const label = $('#connectBtnLabel');
  if (state === 'connected') {
    connectBtn.className = 'btn btn-danger btn-block';
    connectBtn.disabled = false;
    label.textContent = I18N.t('dashboard.disconnect');
    startUptimeTimer();
  } else if (state === 'connecting' || state === 'disconnecting') {
    connectBtn.className = 'btn btn-primary btn-block';
    connectBtn.disabled = true;
    label.textContent = '...';
  } else if (state === 'reconnecting') {
    connectBtn.className = 'btn btn-danger btn-block';
    connectBtn.disabled = false;
    label.textContent = I18N.t('dashboard.cancel');
  } else {
    connectBtn.className = 'btn btn-primary btn-block';
    connectBtn.disabled = false;
    label.textContent = I18N.t('dashboard.connect');
    stopUptimeTimer();
  }
}
function startUptimeTimer() {
  stopUptimeTimer();
  uptimeTimer = setInterval(async () => {
    const status = await window.waslah.conn.status();
    const s = Math.floor((status.uptimeMs || 0) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('#statUptime').textContent = `${hh}:${mm}:${ss}`;
    $('#statDown').textContent = formatBytes(status.bytesIn);
    $('#statUp').textContent = formatBytes(status.bytesOut);
  }, 1000);
}
function stopUptimeTimer() {
  if (uptimeTimer) clearInterval(uptimeTimer);
  $('#statUptime').textContent = '00:00:00';
  $('#statDown').textContent = '0 KB';
  $('#statUp').textContent = '0 KB';
}
function formatBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
$('#connectBtn').addEventListener('click', async () => {
  const status = await window.waslah.conn.status();
  if (['connected', 'connecting', 'reconnecting'].includes(status.state)) {
    await window.waslah.conn.disconnect();
  } else {
    if (!selectedProfileId) return toast(I18N.t('toast.pickProfile'));
    try { await window.waslah.conn.connect(selectedProfileId); }
    catch (err) { toast('✗ ' + err.message); }
  }
});

// ================= Logs =================
function statusBadge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}
function renderMiniLogs() {
  const box = $('#miniLogList');
  const last5 = recentLogEntries.slice(-5).reverse();
  box.innerHTML = last5.map((e) => `
    <div class="mini-log-row">${statusBadge(e.status)} <span>${e.message}</span></div>
  `).join('') || `<div class="empty-state">—</div>`;
}

function renderLogCategoryOptions() {
  const sel = $('#logCategoryFilter');
  const current = sel.value || 'all';
  const categories = ['all', 'manager', 'ssh', 'tls', 'socks', 'vpn', 'tun2socks', 'killswitch', 'general'];
  sel.innerHTML = categories.map((c) => `<option value="${c}">${c === 'all' ? I18N.t('logs.filterAll') : c}</option>`).join('');
  sel.value = current;
}

async function refreshLogTable() {
  const filter = {
    search: $('#logSearch').value.trim(),
    category: $('#logCategoryFilter').value || 'all',
    status: $('#logStatusFilter').value || 'all',
  };
  const rows = await window.waslah.logs.list(filter);
  const body = $('#logTableBody');
  body.innerHTML = rows.slice(-500).reverse().map((e) => `
    <tr>
      <td class="time">${new Date(e.ts).toLocaleTimeString()}</td>
      <td>${e.category}</td>
      <td>${statusBadge(e.status)}</td>
      <td class="msg">${escapeHtml(e.message)}</td>
    </tr>
  `).join('');
}
function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

$('#logSearch').addEventListener('input', debounce(refreshLogTable, 250));
$('#logCategoryFilter').addEventListener('change', refreshLogTable);
$('#logStatusFilter').addEventListener('change', refreshLogTable);
$('#logsClearBtn').addEventListener('click', async () => { await window.waslah.logs.clear(); recentLogEntries = []; renderMiniLogs(); refreshLogTable(); });
$('#logsExportBtn').addEventListener('click', async () => { const r = await window.waslah.logs.export(); if (r.ok) toast(I18N.t('toast.copied')); });
$('#logsCopyBtn').addEventListener('click', async () => {
  const rows = await window.waslah.logs.list({});
  navigator.clipboard.writeText(rows.map((r) => `[${new Date(r.ts).toISOString()}] [${r.category}] [${r.status}] ${r.message}`).join('\n'));
  toast(I18N.t('toast.copied'));
});
$('#logEnabledToggle').addEventListener('change', async (e) => { await window.waslah.logs.setEnabled(e.target.checked); });

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

window.waslah.on.logEntry((entry) => {
  recentLogEntries.push(entry);
  if (recentLogEntries.length > 200) recentLogEntries.shift();
  renderMiniLogs();
  if ($('#page-logs').classList.contains('active')) refreshLogTable();
});
window.waslah.on.state((payload) => applyState(payload));

// ================= Settings =================
async function loadSettings() {
  currentSettings = await window.waslah.settings.get();
  $('#s_defaultsni').value = currentSettings.defaultSni || '';
  $('#s_killswitch').checked = !!currentSettings.killSwitch;
  $('#s_reconnect').checked = !!currentSettings.reconnect?.enabled;
  $('#s_autoconnect').checked = !!currentSettings.autoConnectLastProfile;
  $('#s_autostart').checked = !!currentSettings.autoStartWindows;
  $('#s_maxretries').value = currentSettings.reconnect?.maxRetries ?? 5;
  $('#logEnabledToggle').checked = currentSettings.loggingEnabled !== false;
  applyTheme(currentSettings.theme || 'dark');
}
function bindSettingToggle(id, key, isNested) {
  $(id).addEventListener('change', async (e) => {
    const value = e.target.checked;
    if (isNested) {
      const s = await window.waslah.settings.get();
      await window.waslah.settings.update({ reconnect: { ...s.reconnect, enabled: value } });
    } else {
      await window.waslah.settings.update({ [key]: value });
    }
  });
}
bindSettingToggle('#s_killswitch', 'killSwitch');
bindSettingToggle('#s_reconnect', null, true);
bindSettingToggle('#s_autoconnect', 'autoConnectLastProfile');
bindSettingToggle('#s_autostart', 'autoStartWindows');
$('#s_maxretries').addEventListener('change', async (e) => {
  const s = await window.waslah.settings.get();
  await window.waslah.settings.update({ reconnect: { ...s.reconnect, maxRetries: Number(e.target.value) } });
});
let defaultSniSaveTimer = null;
$('#s_defaultsni').addEventListener('input', (e) => {
  clearTimeout(defaultSniSaveTimer);
  defaultSniSaveTimer = setTimeout(async () => {
    await window.waslah.settings.update({ defaultSni: e.target.value.trim() });
    toast(I18N.t('toast.sniSaved'));
  }, 500);
});

// ================= About =================
$$('.link-btn').forEach((btn) => btn.addEventListener('click', () => window.waslah.app.openExternal(btn.dataset.link)));

// ================= Init =================
(async function init() {
  const settings = await window.waslah.settings.get();
  await applyLanguage(settings.language || 'ar');
  applyIcons();

  await loadProfiles();
  await loadSni();
  await loadVless();
  await loadProviders();
  await loadSettings();
  renderLogCategoryOptions();

  const initialLogs = await window.waslah.logs.list({ limit: 5 });
  recentLogEntries = initialLogs;
  renderMiniLogs();

  const status = await window.waslah.conn.status();
  applyState(status);
  $('#appVersion').textContent = await window.waslah.app.getVersion();
})();
