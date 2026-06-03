const Storage = {
  SUPABASE_HEADERS: {
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
  },

  async request(method, table, data = null, filter = '') {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}${filter}`;
    const opts = {
      method,
      headers: { ...this.SUPABASE_HEADERS, 'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '' },
    };
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(url, opts);
    if (!res.ok) { console.error('Supabase error:', await res.text()); return null; }
    if (method === 'GET') return res.json();
    return true;
  },

  // ACCOUNTS
  async getAccounts() {
    const data = await this.request('GET', 'accounts');
    return data || [];
  },

  async addAccount(account) {
    return this.request('POST', 'accounts', {
      id: account.id,
      email: account.email,
      name: account.name,
      color: account.color,
      connected_at: account.connectedAt,
    });
  },

  async removeAccount(accountId) {
    return this.request('DELETE', 'accounts', null, `?id=eq.${accountId}`);
  },

  async getAccount(accountId) {
    const data = await this.request('GET', 'accounts', null, `?id=eq.${accountId}`);
    return data?.[0] || null;
  },

  // SALES
  async getSales() {
    const data = await this.request('GET', 'sales', null, '?order=date.desc');
    return data || [];
  },

  async addSales(newSales) {
    if (!newSales.length) return 0;
    const rows = newSales.map(s => ({
      id: s.id,
      gmail_message_id: s.gmailMessageId,
      account_id: s.accountId,
      title: s.title,
      price: s.price,
      shipping: s.shipping || 0,
      date: s.date,
      status: s.status || 'vendu',
    }));
    const res = await this.request('POST', 'sales', rows);
    return res ? newSales.length : 0;
  },

  async deleteSale(saleId) {
    return this.request('DELETE', 'sales', null, `?id=eq.${saleId}`);
  },

  // SETTINGS (localStorage uniquement)
  getSettings() {
    try {
      const v = localStorage.getItem('vt_settings');
      return v ? JSON.parse(v) : { commission: 5, currency: 'EUR', syncFreq: 60 };
    } catch { return { commission: 5, currency: 'EUR', syncFreq: 60 }; }
  },
  saveSettings(s) {
    localStorage.setItem('vt_settings', JSON.stringify(s));
  },

  // TOKENS (localStorage)
  saveToken(accountId, tokenData) {
    localStorage.setItem('vt_token_' + accountId, JSON.stringify({ ...tokenData, savedAt: Date.now() }));
  },
  getToken(accountId) {
    try {
      const t = localStorage.getItem('vt_token_' + accountId);
      if (!t) return null;
      const data = JSON.parse(t);
      if (Date.now() > data.expiresAt - 60000) return null;
      return data.accessToken;
    } catch { return null; }
  },
  removeToken(accountId) {
    localStorage.removeItem('vt_token_' + accountId);
  },

  // SYNC
  async getLastSync() {
    const data = await this.request('GET', 'sync_log');
    const result = {};
    (data || []).forEach(row => { result[row.account_id] = row.last_sync; });
    return result;
  },

  async setLastSync(accountId, date) {
    return this.request('POST', 'sync_log', { account_id: accountId, last_sync: date });
  },

  // STATS
  async getStats(accountId = null, days = 0) {
    let sales = await this.getSales();
    if (accountId) sales = sales.filter(s => s.account_id === accountId);
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

  clearAll() {
    localStorage.clear();
  },
};
