'use strict';

const { EventEmitter } = require('events');

const MAX_ENTRIES = 3000;

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
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  push(rawLine) {
    if (!this.enabled) return;
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
