// ============================================================
// APP — Logique principale, init, sync, événements
// ============================================================

const App = {
  syncInterval: null,

  // ── Init ──────────────────────────────────────────────────

  async init() {
    // Masquer le splash après 1.2s
    setTimeout(() => {
      document.getElementById('splash')?.classList.add('hide');
      setTimeout(() => {
        document.getElementById('splash')?.remove();
        this.checkAuth();
      }, 400);
    }, 1200);

    this.bindEvents();
  },

  checkAuth() {
    const accounts = Storage.getAccounts();
    if (accounts.length > 0) {
      this.showApp();
    } else {
      this.showScreen('auth');
    }
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
  },

  // ── Navigation ────────────────────────────────────────────

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
    document.querySelector(`.nav-item[data-tab="${tabName}"]`)?.classList.add('active');

    if (tabName === 'dashboard') UI.renderDashboard();
    else if (tabName === 'sales') UI.renderSalesTab();
    else if (tabName === 'accounts') UI.renderAccountsTab();
  },

  // ── Auth / Compte ─────────────────────────────────────────

  async connectGoogleAccount() {
    if (CONFIG.GOOGLE_CLIENT_ID === 'VOTRE_CLIENT_ID_ICI') {
      UI.toast('⚠️ Configurez votre Client ID Google dans js/config.js');
      alert('Vous devez d\'abord configurer votre Client ID Google.\n\nConsultez le fichier SETUP.md pour les instructions.');
      return;
    }

    try {
      UI.toast('Ouverture de Google...');
      const { accessToken, expiresAt } = await Gmail.authenticate();
      const profile = await Gmail.getUserProfile(accessToken);

      // Vérifier si ce compte existe déjà
      const existing = Storage.getAccounts().find(a => a.email === profile.email);
      if (existing) {
        Gmail.saveToken(existing.id, { accessToken, expiresAt });
        UI.toast('Compte déjà connecté, token rafraîchi ✓');
        return;
      }

      const accounts = Storage.getAccounts();
      const colorIndex = accounts.length % CONFIG.ACCOUNT_COLORS.length;
      const account = {
        id: 'acct_' + Date.now(),
        email: profile.email,
        name: '@' + profile.email.split('@')[0],
        color: CONFIG.ACCOUNT_COLORS[colorIndex],
        connectedAt: new Date().toISOString(),
      };

      Gmail.saveToken(account.id, { accessToken, expiresAt });
      Storage.addAccount(account);

      UI.toast('Compte connecté ! Import en cours...');
      UI.renderAuthScreen();

      // Sync immédiate
      await this.syncAccount(account.id);

    } catch (e) {
      console.error(e);
      UI.toast('Erreur : ' + e.message);
    }
  },

  async removeAccount(accountId) {
    if (!confirm('Déconnecter ce compte ? Les ventes importées seront conservées.')) return;
    Gmail.removeToken(accountId);
    Storage.removeAccount(accountId);
    UI.toast('Compte déconnecté');
    UI.renderAccountsTab();
    UI.renderDashboard();
  },

  // ── Synchronisation ───────────────────────────────────────

  async syncAll() {
    const accounts = Storage.getAccounts();
    if (!accounts.length) {
      UI.toast('Aucun compte connecté');
      return;
    }
    const btnSync = document.getElementById('btnSync');
    if (btnSync) btnSync.querySelector('.ti')?.classList.add('spinning');

    let totalNew = 0;
    for (const account of accounts) {
      totalNew += await this.syncAccount(account.id, false);
    }

    if (btnSync) btnSync.querySelector('.ti')?.classList.remove('spinning');
    UI.hideSyncBar();

    if (totalNew > 0) {
      UI.toast(`${totalNew} nouvelle${totalNew > 1 ? 's' : ''} vente${totalNew > 1 ? 's' : ''} importée${totalNew > 1 ? 's' : ''} !`);
    } else {
      UI.toast('Tout est à jour ✓');
    }

    // Refresh UI
    const activeTab = document.querySelector('.tab-content.active')?.id?.replace('tab-', '');
    if (activeTab) this.switchTab(activeTab);
  },

  async syncAccount(accountId, showFeedback = true) {
    const account = Storage.getAccount(accountId);
    if (!account) return 0;

    let token = Gmail.getToken(accountId);
    if (!token) {
      // Token expiré, re-authentifier
      if (showFeedback) UI.toast('Re-authentification nécessaire...');
      try {
        const { accessToken, expiresAt } = await Gmail.authenticate();
        Gmail.saveToken(accountId, { accessToken, expiresAt });
        token = accessToken;
      } catch (e) {
        if (showFeedback) UI.toast('Authentification annulée');
        return 0;
      }
    }

    UI.showSyncBar(`Sync ${account.name}...`);

    try {
      // Date de la dernière sync pour éviter de tout re-lire
      const lastSync = Storage.getLastSync()?.[accountId];
      const sinceDate = lastSync || null;

      const messages = await Gmail.fetchVintedEmails(token, sinceDate);
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

    // Sync au démarrage si > 30 min depuis la dernière
    const ls = Storage.getLastSync();
    if (ls) {
      const dates = Object.values(ls).filter(Boolean).sort().reverse();
      if (dates.length) {
        const elapsed = Date.now() - new Date(dates[0]).getTime();
        if (elapsed > 30 * 60 * 1000) this.syncAll();
      }
    } else {
      // Première fois, sync immédiate
      setTimeout(() => this.syncAll(), 2000);
    }
  },

  // ── Sales ─────────────────────────────────────────────────

  deleteSale(saleId) {
    if (!confirm('Supprimer cette vente ?')) return;
    Storage.deleteSale(saleId);
    UI.renderSalesList();
    UI.renderDashboard();
    UI.toast('Vente supprimée');
  },

  // ── Events ────────────────────────────────────────────────

  bindEvents() {
    // Google Auth
    document.getElementById('btnGoogleAuth')?.addEventListener('click', () => this.connectGoogleAccount());
    document.getElementById('btnAddAccount')?.addEventListener('click', () => this.connectGoogleAccount());
    document.getElementById('btnGoToDashboard')?.addEventListener('click', () => this.showApp());
    document.getElementById('btnAddAccountMain')?.addEventListener('click', () => this.connectGoogleAccount());

    // Sync
    document.getElementById('btnSync')?.addEventListener('click', () => this.syncAll());

    // Nav tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Period select
    document.getElementById('periodSelect')?.addEventListener('change', () => UI.renderDashboard());

    // Sales filters
    ['searchInput', 'filterAccount', 'filterMonth', 'filterStatus'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => UI.renderSalesList());
    });

    // Settings panel
    document.getElementById('btnSettings')?.addEventListener('click', () => {
      document.getElementById('settingsPanel')?.classList.add('open');
      document.getElementById('overlay')?.classList.remove('hidden');
      this.loadSettings();
    });
    document.getElementById('closeSettings')?.addEventListener('click', () => this.closeSettings());
    document.getElementById('overlay')?.addEventListener('click', () => this.closeSettings());

    // Settings changes
    ['syncFreq', 'commissionRate', 'currency'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.saveSettings());
    });

    // Clear data
    document.getElementById('btnClearData')?.addEventListener('click', () => {
      if (confirm('Effacer TOUTES les données (comptes, ventes, paramètres) ?')) {
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
    if (el('commissionRate')) el('commissionRate').value = s.commission || 5;
    if (el('currency')) el('currency').value = s.currency || 'EUR';
  },

  saveSettings() {
    const el = id => document.getElementById(id);
    Storage.saveSettings({
      syncFreq: parseInt(el('syncFreq')?.value || '60'),
      commission: parseFloat(el('commissionRate')?.value || '5'),
      currency: el('currency')?.value || 'EUR',
    });
    this.startAutoSync(); // Restart avec nouvelle fréquence
    UI.renderDashboard();
  },

  closeSettings() {
    document.getElementById('settingsPanel')?.classList.remove('open');
    document.getElementById('overlay')?.classList.add('hidden');
  },
};

// Fonction globale pour la navigation depuis les templates HTML
function switchTab(name) { App.switchTab(name); }

// Démarrage
document.addEventListener('DOMContentLoaded', () => App.init());
