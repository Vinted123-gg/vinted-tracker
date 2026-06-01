const Storage = {
  KEYS: {
    ACCOUNTS: 'vt_accounts',
    SALES: 'vt_sales',
    SETTINGS: 'vt_settings',
    LAST_SYNC: 'vt_last_sync',
  },
  get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  getAccounts() { return this.get(this.KEYS.ACCOUNTS) || []; },
  saveAccounts(accounts) { this.set(this.KEYS.ACCOUNTS, accounts); },
  addAccount(account) { const a = this.getAccounts(); a.push(account); this.saveAccounts(a); },
  removeAccount(id) { this.saveAccounts(this.getAccounts().filter(a => a.id !== id)); },
  getAccount(id) { return this.getAccounts().find(a => a.id === id) || null; },
  updateAccount(id, updates) { this.saveAccounts(this.getAccounts().map(a => a.id === id ? { ...a, ...updates } : a)); },
  getSales() { return this.get(this.KEYS.SALES) || []; },
  saveSales(sales) { this.set(this.KEYS.SALES, sales); },
  addSales(newSales) {
    const existing = this.getSales();
    const existingIds = new Set(existing.map(s => s.gmailMessageId).filter(Boolean));
    const toAdd = newSales.filter(s => !s.gmailMessageId || !existingIds.has(s.gmailMessageId));
    if (toAdd.length > 0) {
      const all = [...existing, ...toAdd].sort((a, b) => b.date.localeCompare(a.date || ''));
      this.saveSales(all);
      return toAdd.length;
    }
    return 0;
  },
  getSalesByAccount(id) { return this.getSales().filter(s => s.accountId === id); },
  deleteSale(id) { this.saveSales(this.getSales().filter(s => s.id !== id)); },
  getSettings() {
    return this.get(this.KEYS.SETTINGS) || { commission: 5, currency: 'EUR', syncFreq: 60 };
  },
  saveSettings(s) { this.set(this.KEYS.SETTINGS, s); },
  getLastSync() { return this.get(this.KEYS.LAST_SYNC); },
  setLastSync(accountId, date) {
    const ls = this.getLastSync() || {};
    ls[accountId] = date;
    this.set(this.KEYS.LAST_SYNC, ls);
  },
  getStats(accountId = null, days = 0) {
    let sales = this.getSales();
    if (accountId) sales = sales.filter(s => s.accountId === accountId);
    if (days > 0) {
      const since = new Date(); since.setDate(since.getDate() - days);
      sales = sales.filter(s => new Date(s.date) >= since);
    }
    const ca = sales.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
    const settings = this.getSettings();
    const net = ca * (1 - settings.commission / 100);
    const avg = sales.length ? ca / sales.length : 0;
    return { count: sales.length, ca, net, avg, sales };
  },
  clearAll() { Object.values(this.KEYS).forEach(k => localStorage.removeItem(k)); },
};
