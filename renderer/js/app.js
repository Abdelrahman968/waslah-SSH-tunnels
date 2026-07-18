'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let profilesCache = [];
let sniCache = [];
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

$('#copyIpBtn').addEventListener('click', async () => {
  const r = await window.waslah.net.whatsMyIp();
  if (r.ok) { navigator.clipboard.writeText(r.ip); toast(r.ip + ' — ' + I18N.t('toast.copied')); }
  else toast('✗ ' + r.error);
});

async function loadVpnOnlyApps() {
  const box = $('#vpnOnlyAppsList');
  const apps = await window.waslah.appfw.list();
  if (!apps.length) { box.innerHTML = `<div class="empty-state">—</div>`; return; }
  box.innerHTML = apps.map((a) => `
    <div class="sni-row">
      <span class="mono small">${a.label}</span>
      <button data-id="${a.id}" data-icon="trash"></button>
    </div>
  `).join('');
  applyIcons(box);
  box.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', async () => {
    await window.waslah.appfw.remove(b.dataset.id);
    await loadVpnOnlyApps();
  }));
}
$('#addVpnOnlyAppBtn').addEventListener('click', async () => {
  const r = await window.waslah.appfw.add();
  if (r.ok) await loadVpnOnlyApps();
});

$$('.legal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.legal-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.legal-panel').forEach((p) => (p.style.display = 'none'));
    $(`#legalPanel-${tab.dataset.tab}`).style.display = 'block';
  });
});
const legalDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
if ($('#legalDateTerms')) $('#legalDateTerms').textContent = legalDate;
if ($('#legalDatePrivacy')) $('#legalDatePrivacy').textContent = legalDate;

$('#togglePassBtn').addEventListener('click', () => {
  const input = $('#f_pass');
  input.type = input.type === 'password' ? 'text' : 'password';
});

// ================= Elevation banner =================
function applyElevation({ elevated, platform }) {
  const banner = $('#elevationBanner');
  banner.style.display = platform === 'win32' && !elevated ? 'flex' : 'none';
}
$('#elevationRelaunchBtn').addEventListener('click', async () => {
  await window.waslah.elevation.relaunch();
});
window.waslah.on.elevationStatus((payload) => applyElevation(payload));

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
    refreshDashboardSniOptions();
  }
}

function refreshDashboardSniOptions() {
  const sel = $('#dashboardSniSelect');
  const current = sel.value;
  sel.innerHTML = `<option value="" data-i18n="dashboard.sniUseDefault">${I18N.t('dashboard.sniUseDefault')}</option>`;
  sniCache.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.host;
    opt.textContent = s.host + (s.favorite ? ' ★' : '');
    sel.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = I18N.t('dashboard.sniCustom');
  sel.appendChild(customOpt);
  sel.value = current || '';
}
$('#dashboardSniSelect').addEventListener('change', (e) => {
  $('#dashboardSniCustomInput').style.display = e.target.value === '__custom__' ? 'block' : 'none';
});

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
      <td class="mono small">${formatBytes((p.totalBytesIn || 0) + (p.totalBytesOut || 0))}</td>
      <td>
        <div class="table-actions">
          <button data-action="edit" data-id="${p.id}" data-icon="edit" title="Edit"></button>
          <button data-action="duplicate" data-id="${p.id}" data-icon="duplicate" title="Duplicate"></button>
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
  body.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => enterEditMode(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="duplicate"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const full = await window.waslah.profiles.getSecret(btn.dataset.id);
      if (!full) return;
      const { id, createdAt, updatedAt, ...rest } = full;
      await window.waslah.profiles.save({ ...rest, name: rest.name + ' (copy)' });
      toast(I18N.t('profiles.duplicated'));
      await loadProfiles();
    });
  });
}

let editingProfileId = null;

async function enterEditMode(id) {
  const full = await window.waslah.profiles.getSecret(id);
  if (!full) return;
  editingProfileId = id;
  $('#f_name').value = full.name || '';
  $('#f_host').value = full.host || '';
  $('#f_user').value = full.username || '';
  $('#f_pass').value = full.password || '';
  $('#f_color').value = full.color || '#2DD4BF';

  const portSelect = $('#f_port');
  const knownPorts = ['443', '80', '22'];
  if (knownPorts.includes(String(full.port))) {
    portSelect.value = String(full.port);
    $('#f_port_custom').style.display = 'none';
  } else {
    portSelect.value = 'custom';
    $('#f_port_custom').style.display = 'block';
    $('#f_port_custom').value = full.port;
  }

  await loadSniOptionsInto($('#f_sni'), full.sni || '');

  $('#manualFormTitle').textContent = I18N.t('profiles.saveChanges');
  $('#saveProfileBtn').textContent = I18N.t('profiles.saveChanges');
  $('#cancelEditBtn').style.display = 'inline-block';
  $('.nav-item[data-page="profiles"]').click();
  $('#f_host').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitEditMode() {
  editingProfileId = null;
  $('#manualFormTitle').textContent = I18N.t('profiles.manualAdd');
  $('#saveProfileBtn').textContent = I18N.t('profiles.save');
  $('#cancelEditBtn').style.display = 'none';
  ['f_name', 'f_host', 'f_user', 'f_pass'].forEach((id) => ($(`#${id}`).value = ''));
}
$('#cancelEditBtn').addEventListener('click', exitEditMode);
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
    id: editingProfileId || undefined,
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
  const wasEditing = !!editingProfileId;
  await window.waslah.profiles.save(data);
  toast(wasEditing ? I18N.t('profiles.saveChanges') : I18N.t('toast.profileSaved'));
  exitEditMode();
  await loadProfiles();
});
$('#exportBtn').addEventListener('click', async () => { const r = await window.waslah.profiles.export(); if (r.ok) toast(I18N.t('toast.copied')); });
$('#importBtn').addEventListener('click', async () => { const r = await window.waslah.profiles.import(); if (r.ok) { toast(I18N.t('toast.copied')); await loadProfiles(); } });

$('#exportWaLockedBtn').addEventListener('click', async () => {
  const passphrase = prompt('Set a passphrase to lock this .wa file:');
  if (!passphrase) return;
  const r = await window.waslah.profiles.exportWa(true, passphrase);
  if (r.ok) toast(I18N.t('toast.copied'));
  else toast('✗ ' + r.error);
});
$('#exportWaUnlockedBtn').addEventListener('click', async () => {
  const r = await window.waslah.profiles.exportWa(false, null);
  if (r.ok) toast(I18N.t('toast.copied'));
  else toast('✗ ' + r.error);
});
$('#importWaBtn').addEventListener('click', async () => {
  const passphrase = prompt('Passphrase (leave blank if this .wa file is unlocked):') || null;
  const r = await window.waslah.profiles.importWa(passphrase);
  if (r.ok) { toast(I18N.t('toast.copied')); await loadProfiles(); }
  else if (r.error) toast('✗ ' + r.error);
});

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

$('#sniTestRunBtn').addEventListener('click', async () => {
  const host = $('#sniTestHost').value.trim();
  const port = $('#sniTestPort').value || 443;
  if (!host) return toast(I18N.t('toast.missingFields'));
  const box = $('#sniTestResults');
  const btn = $('#sniTestRunBtn');
  btn.disabled = true;
  box.innerHTML = `<div class="empty-state">${I18N.t('sni.testerRunning')}</div>`;
  try {
    const results = await window.waslah.sni.testAll(host, port);
    box.innerHTML = results.map((r, i) => `
      <div class="sni-test-row ${r.ok ? 'ok' : 'fail'}">
        <span class="sni-test-rank">${r.ok ? i + 1 : '—'}</span>
        <span class="mono" style="flex:1">${r.sni}</span>
        <span class="ms">${r.ok ? r.ms + 'ms' : '✗'}</span>
        ${r.ok ? `<button data-action="use-tested" data-host="${r.sni}">${I18N.t('sni.useAsDefault')}</button>` : ''}
      </div>
    `).join('') || `<div class="empty-state">—</div>`;
    box.querySelectorAll('[data-action="use-tested"]').forEach((b) => {
      b.addEventListener('click', async () => {
        await window.waslah.sni.save({ host: b.dataset.host });
        await window.waslah.settings.update({ defaultSni: b.dataset.host });
        $('#s_defaultsni').value = b.dataset.host;
        toast(I18N.t('toast.sniSaved'));
        await loadSni();
      });
    });
  } catch (err) {
    box.innerHTML = `<div class="empty-state">✗ ${err.message}</div>`;
  } finally {
    btn.disabled = false;
  }
});

function prefillSniTesterFromProfile() {
  const sniTestHost = $('#sniTestHost');
  const sniTestPort = $('#sniTestPort');
  if (sniTestHost && !sniTestHost.value.trim() && profilesCache[0]) {
    sniTestHost.value = profilesCache[0].host;
    sniTestPort.value = profilesCache[0].port;
  }
}

// ================= Hotspot =================
$('#hotspotOpenSettingsBtn').addEventListener('click', () => {
  window.waslah.app.openExternal('ms-settings:network-mobilehotspot');
});
$('#hotspotStartBtn').addEventListener('click', async () => {
  const ssid = $('#hs_ssid').value.trim();
  const pass = $('#hs_pass').value;
  const resEl = $('#hotspotResult');

  if (!ssid) return (resEl.textContent = '✗ ' + I18N.t('hotspot.errNoSsid'));
  if (!pass || pass.length < 8) return (resEl.textContent = '✗ ' + I18N.t('hotspot.errShortPassword'));

  resEl.textContent = '...';
  const r = await window.waslah.hotspot.start(ssid, pass);
  if (r.ok) {
    resEl.textContent = `${r.hostedNetwork}\n${r.ics}`;
  } else {
    resEl.textContent = '✗ ' + r.error;
  }
});
$('#hotspotStopBtn').addEventListener('click', async () => {
  const resEl = $('#hotspotResult');
  const r = await window.waslah.hotspot.stop();
  resEl.textContent = r.ok ? r.result : '✗ ' + r.error;
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
bindTool('#toolDnsBtn', '#toolDnsResult', () => window.waslah.net.dnsLookup($('#toolDnsHost').value.trim()), (d) => {
  const lines = [];
  ['A', 'AAAA', 'CNAME', 'MX', 'TXT'].forEach((k) => {
    if (d[k] && d[k].length) lines.push(`${k}:\n  ${d[k].join('\n  ')}`);
  });
  return lines.length ? lines.join('\n\n') : 'No records found';
});
bindTool('#toolTcpBtn', '#toolTcpResult', () => window.waslah.net.tcpPing($('#toolTcpHost').value.trim(), $('#toolTcpPort').value || 443), (d) => d.ok ? `✓ ${d.ms}ms` : `✗ ${d.error}`);
bindTool('#toolHttpBtn', '#toolHttpResult', () => window.waslah.net.httpPing($('#toolHttpUrl').value.trim()), (d) => d.ok ? `✓ HTTP ${d.status} — ${d.ms}ms` : `✗ ${d.error}`);
bindTool('#toolScanBtn', '#toolScanResult', () => {
  const [start, end] = $('#toolScanRange').value.split('-').map((x) => Number(x.trim()));
  if (!start || !end || end < start) throw new Error('Enter a valid range like 20-100');
  if (end - start + 1 > 1000) throw new Error('Max 1000 ports per scan — narrow the range');
  return window.waslah.net.portScan($('#toolScanHost').value.trim(), start, end);
}, (ports) => ports.length ? `Open: ${ports.join(', ')}` : 'No open ports found');
bindTool('#toolTraceBtn', '#toolTraceResult', () => window.waslah.net.traceroute($('#toolTraceHost').value.trim()), (t) => t);
bindTool('#toolSslBtn', '#toolSslResult', () => window.waslah.net.sslCheck($('#toolSslHost').value.trim()), (c) =>
  `Subject: ${c.subject?.CN}\nIssuer: ${c.issuer?.O || c.issuer?.CN}\nValid: ${c.validFrom} → ${c.validTo}\nProtocol: ${c.protocol}`
);
bindTool('#toolWhoisBtn', '#toolWhoisResult', () => window.waslah.net.whois($('#toolWhoisHost').value.trim()), (t) => t);
bindTool('#toolSpeedBtn', '#toolSpeedResult', () => window.waslah.net.speedTest(), (r) => `⬇ ${r.mbps} Mbps — ${(r.bytes / 1e6).toFixed(1)} MB in ${r.seconds}s${r.partial ? ' (partial)' : ''}`);

$('#backupExportBtn').addEventListener('click', async () => { const r = await window.waslah.backup.export(); if (r.ok) toast(I18N.t('toast.copied')); });
$('#backupImportBtn').addEventListener('click', async () => {
  const r = await window.waslah.backup.import();
  if (r.ok) { toast(I18N.t('toast.copied')); await loadProfiles(); await loadSni(); await loadSettings(); }
});
$('#settingsResetBtn').addEventListener('click', async () => {
  await window.waslah.backup.resetSettings();
  await loadSettings();
  toast(I18N.t('toast.copied'));
});

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
  const interval = currentSettings?.powerSavingMode ? 3000 : 1000;
  uptimeTimer = setInterval(async () => {
    const status = await window.waslah.conn.status();
    const s = Math.floor((status.uptimeMs || 0) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('#statUptime').textContent = `${hh}:${mm}:${ss}`;
    $('#statDown').textContent = formatBytes(status.bytesIn);
    $('#statUp').textContent = formatBytes(status.bytesOut);
  }, interval);
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
    const sniSelectValue = $('#dashboardSniSelect').value;
    const sniOverride = sniSelectValue === '__custom__' ? $('#dashboardSniCustomInput').value.trim() : sniSelectValue;
    try { await window.waslah.conn.connect(selectedProfileId, sniOverride || null); }
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
  $('#s_minimizetray').checked = currentSettings.minimizeToTrayOnClose !== false;
  $('#s_notifications').checked = currentSettings.showNotifications !== false;
  $('#s_powersaving').checked = !!currentSettings.powerSavingMode;
  $('#s_autofailover').checked = !!currentSettings.autoFailoverSni;
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
  await applyLanguage(settings.language || 'en');
  applyIcons();

  await loadProfiles();
  await loadSni();
  await loadProviders();
  await loadSettings();
  renderLogCategoryOptions();
  prefillSniTesterFromProfile();

  const initialLogs = await window.waslah.logs.list({ limit: 5 });
  recentLogEntries = initialLogs;
  renderMiniLogs();

  const status = await window.waslah.conn.status();
  applyState(status);
  $('#appVersion').textContent = await window.waslah.app.getVersion();

  const elevation = await window.waslah.elevation.check();
  applyElevation(elevation);
})();
