const App = {
  syncInterval: null,

  async init() {
    const tokenData = Gmail.handleRedirectToken();
    if (tokenData) {
      await this.handleOAuthCallback(tokenData);
      return;
    }
    setTimeout(() => {
      document.getElementById('splash')?.classList.add('hide');
      setTimeout(() => {
        document.getElementById('splash')?.remove();
        this.checkAuth();
      }, 400);
    }, 1200);
    this.bindEvents();
  },

  async handleOAuthCallback(tokenData) {
    document.getElementById('splash')?.classList.add('hide');
    setTimeout(() => document.getElementById('splash')?.remove(), 400);
    try {
      const profile = await Gmail.getUserProfile(tokenData.accessToken);
      const existing = Storage.getAccounts().find(a => a.email === profile.email);
      if (existing) {
        Gmail.saveToken(existing.id, tokenData);
      } else {
        const accounts = Storage.getAccounts();
        const account = {
          id: 'acct_' + Date.now(),
          email: profile.email,
          name: '@' + profile.email.split('@')[0],
          color: CONFIG.ACCOUNT_COLORS[accounts.length % CONFIG.ACCOUNT_COLORS.length],
          connectedAt: new Date().toISOString(),
        };
        Gmail.saveToken(account.id, tokenData);
        Storage.addAccount(account);
      }
      this.showApp();
      setTimeout(() => this.syncAll(), 1000);
    } catch (e) {
      console.error(e);
      this.checkAuth();
    }
  },

  checkAuth() {
    const accounts = Storage.getAccounts();
    if (accounts.length > 0) { this.showApp(); } else { this.showScreen('auth'); }
  },

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`screen-${name}`)?.classList.remove('hidden');
    if (name === 'auth') UI.renderAuthScreen();
  },

  showApp() {
    this.showScreen('app');
    UI.renderDashboard();
    this.startAutoSync();
    const accounts = Storage.getAccounts();
    const sales = Storage.getSales();
    if (accounts.length > 0 && sales.length === 0) {
      setTimeout(() => this.syncAll(), 1500);
    }
  },

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
    document.querySelector(`.nav-item[data-tab="${tabName}"]`)?.classList.add('active');
    if (tabName === 'dashboard') UI.renderDashboard();
    else if (tabName === 'sales') UI.renderSalesTab();
    else if (tabName === 'accounts') UI.renderAccountsTab();
  },

  async connectGoogleAccount() {
    await Gmail.authenticate();
  },

  async removeAccount(accountId) {
    if (!confirm('Déconnecter ce compte ? Les ventes importées seront conservées.')) return;
    Gmail.removeToken(accountId);
    Storage.removeAccount(accountId);
    UI.toast('Compte déconnecté');
    UI.renderAccountsTab();
    UI.renderDashboard();
  },

  async syncAll() {
    const accounts = Storage.getAccounts();
    if (!accounts.length) { UI.toast('Aucun compte connecté'); return; }
    const btnSync = document.getElementById('btnSync');
    if (btnSync) btnSync.querySelector('.ti')?.classList.add('spinning');
    let totalNew = 0;
    for (const account of accounts) { totalNew += await this.syncAccount(account.id, false); }
    if (btnSync) btnSync.querySelector('.ti')?.classList.remove('spinning');
    UI.hideSyncBar();
    if (totalNew > 0) {
      UI.toast(`${totalNew} vente${totalNew > 1 ? 's' : ''} importée${totalNew > 1 ? 's' : ''} !`);
    } else {
      UI.toast('Tout est à jour ✓');
    }
    const activeTab = document.querySelector('.tab-content.active')?.id?.replace('tab-', '');
    if (activeTab) this.switchTab(activeTab);
  },

  async syncAccount(accountId, showFeedback = true) {
    const account = Storage.getAccount(accountId);
    if (!account) return 0;
    let token = Gmail.getToken(accountId);
    if (!token) {
      if (showFeedback) UI.toast('Re-authentification nécessaire...');
      await Gmail.authenticate();
      return 0;
    }
    UI.showSyncBar(`Sync ${account.name}...`);
    try {
      const lastSync = Storage.getLastSync()?.[accountId];
      const messages = await Gmail.fetchVintedEmails(token, lastSync || null);
      const sales = Parser.parseEmails(messages, accountId);
      const added = Storage.addSales(sales);
      Storage.setLastSync(accountId, new Date().toISOString());
      if (showFeedback) {
        UI.hideSyncBar();
        if (added > 0) {
          UI.toast(`${added} vente${added > 1 ? 's' : ''} importée${added > 1 ? 's' : ''} !`);
          const activeTab = document.querySelector('.tab-content.active')?.id?.replace('tab-', '');
          if (activeTab) this.switchTab(activeTab);
        } else {
          UI.toast('Tout est à jour ✓');
        }
      }
      return added;
    } catch (e) {
      console.error('Sync error:', e);
      if (showFeedback) UI.toast('Erreur sync : ' + e.message);
      UI.hideSyncBar();
      return 0;
    }
  },

  startAutoSync() {
    const settings = Storage.getSettings();
    const freq = (settings.syncFreq || 60) * 60 * 1000;
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => this.syncAll(), freq);
  },

  deleteSale(saleId) {
    if (!confirm('Supprimer cette vente ?')) return;
    Storage.deleteSale(saleId);
    UI.renderSalesList();
    UI.renderDashboard();
    UI.toast('Vente supprimée');
  },

  bindEvents() {
    document.getElementById('btnGoogleAuth')?.addEventListener('click', () => this.connectGoogleAccount());
    document.getElementById('btnAddAccount')?.addEventListener('click', () => this.connectGoogleAccount());
    document.getElementById('btnGoToDashboard')?.addEventListener('click', () => this.showApp());
    document.getElementById('btnAddAccountMain')?.addEventListener('click', () => this.connectGoogleAccount());
    document.getElementById('btnSync')?.addEventListener('click', () => this.syncAll());
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    document.getElementById('periodSelect')?.addEventListener('change', () => UI.renderDashboard());
    ['searchInput', 'filterAccount', 'filterMonth', 'filterStatus'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => UI.renderSalesList());
    });
    document.getElementById('btnSettings')?.addEventListener('click', () => {
      document.getElementById('settingsPanel')?.classList.add('open');
      document.getElementById('overlay')?.classList.remove('hidden');
      this.loadSettings();
    });
    document.getElementById('closeSettings')?.addEventListener('click', () => this.closeSettings());
    document.getElementById('overlay')?.addEventListener('click', () => this.closeSettings());
    ['syncFreq', 'currency'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.saveSettings());
    });
    document.getElementById('btnClearData')?.addEventListener('click', () => {
      if (confirm('Effacer TOUTES les données ?')) {
        Storage.clearAll();
        UI.toast('Données effacées');
        setTimeout(() => location.reload(), 1000);
      }
    });
  },

  loadSettings() {
    const s = Storage.getSettings();
    const el = id => document.getElementById(id);
    if (el('syncFreq')) el('syncFreq').value = s.syncFreq || 60;
    if (el('currency')) el('currency').value = s.currency || 'EUR';
  },

  saveSettings() {
    const el = id => document.getElementById(id);
    Storage.saveSettings({
      syncFreq: parseInt(el('syncFreq')?.value || '60'),
      commission: 5,
      currency: el('currency')?.value || 'EUR',
    });
    this.startAutoSync();
    UI.renderDashboard();
  },

  closeSettings() {
    document.getElementById('settingsPanel')?.classList.remove('open');
    document.getElementById('overlay')?.classList.add('hidden');
  },
};

function switchTab(name) { App.switchTab(name); }
document.addEventListener('DOMContentLoaded', () => App.init());
