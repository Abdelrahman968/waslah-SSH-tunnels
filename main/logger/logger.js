'use strict';

const { EventEmitter } = require('events');

const MAX_ENTRIES = 1500;

const CATEGORY_MAP = {
  manager: 'manager',
  ssh: 'ssh',
  tls: 'tls',
  socks: 'socks',
  vpn: 'vpn',
  tun2socks: 'tun2socks',
  killswitch: 'killswitch',
};

function detectCategory(line) {
  const match = line.match(/^\[([a-z0-9]+)\]/i);
  if (match && CATEGORY_MAP[match[1].toLowerCase()]) return CATEGORY_MAP[match[1].toLowerCase()];
  return 'general';
}

function detectStatus(line) {
  const l = line.toLowerCase();
  if (/(fatal|error|خطأ|فشل|access is denied|denied)/i.test(line)) return 'error';
  if (/(warn|warning|تحذير)/i.test(l)) return 'warning';
  if (/(نجح|متصل بنجاح|شغال على مستوى النظام|ready|success)/i.test(line)) return 'success';
  return 'info';
}

/**
 * Central structured logger. Every raw log line coming from the connection
 * stack gets normalized into { id, ts, category, status, message } and kept
 * in a bounded ring buffer, so the UI can search/filter/export without
 * re-parsing raw strings every time.
 */
class AppLogger extends EventEmitter {
  constructor() {
    super();
    this.entries = [];
    this.enabled = true;
    this.nextId = 1;
    this._lastSignature = null;
    this._repeatCount = 0;
    this._lastFlush = 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Collapses noisy, rapidly-repeating identical log lines (the classic
   * case being repeated UDP forwarding errors from tun2socks/xray) into a
   * single "repeated Nx" summary instead of flooding the log — one entry
   * per occurrence would make the log unreadable and waste memory/IPC
   * bandwidth during a sustained issue.
   */
  push(rawLine) {
    if (!this.enabled) return;

    const signature = rawLine.replace(/\d+/g, '#').slice(0, 120);
    const now = Date.now();

    if (signature === this._lastSignature) {
      this._repeatCount++;
      // Only surface a fresh entry every 10 repeats or every 15s, whichever
      // comes first — enough to show the problem is ongoing without
      // spamming.
      if (this._repeatCount % 10 !== 0 && now - this._lastFlush < 15000) {
        return undefined;
      }
      const entry = this._makeEntry(`${rawLine}  (repeated ${this._repeatCount}x)`);
      this._lastFlush = now;
      return entry;
    }

    this._lastSignature = signature;
    this._repeatCount = 1;
    this._lastFlush = now;
    return this._makeEntry(rawLine);
  }

  _makeEntry(rawLine) {
    const entry = {
      id: this.nextId++,
      ts: Date.now(),
      category: detectCategory(rawLine),
      status: detectStatus(rawLine),
      message: rawLine,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.emit('entry', entry);
    return entry;
  }

  list({ search = '', category = 'all', status = 'all', limit = null } = {}) {
    let rows = this.entries;
    if (category !== 'all') rows = rows.filter((e) => e.category === category);
    if (status !== 'all') rows = rows.filter((e) => e.status === status);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((e) => e.message.toLowerCase().includes(q));
    }
    if (limit) rows = rows.slice(-limit);
    return rows;
  }

  clear() {
    this.entries = [];
    this.emit('cleared');
  }

  exportText() {
    return this.entries
      .map((e) => `[${new Date(e.ts).toISOString()}] [${e.category}] [${e.status}] ${e.message}`)
      .join('\n');
  }
}

module.exports = { AppLogger };
