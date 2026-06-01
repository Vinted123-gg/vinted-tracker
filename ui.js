// ============================================================
// UI — Rendu de l'interface
// ============================================================

let chartInstance = null;
let activeChartFilter = 'all';

const UI = {

  // ── Utilitaires ───────────────────────────────────────────

  fmt(amount, currency = null) {
    const settings = Storage.getSettings();
    const cur = currency || settings.currency || 'EUR';
    const symbols = { EUR: '€', GBP: '£', CHF: 'CHF ' };
    const sym = symbols[cur] || cur + ' ';
    return sym + (Math.round(amount * 100) / 100).toFixed(2);
  },

  fmtDate(isoDate) {
    if (!isoDate) return '—';
    return new Date(isoDate).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  },

  fmtRelative(isoDate) {
    if (!isoDate) return '';
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'à l\'instant';
    if (mins < 60) return `il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `il y a ${days}j`;
  },

  initials(email) {
    return email ? email.substring(0, 2).toUpperCase() : '??';
  },

  toast(msg, duration = 3000) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  },

  // ── Dashboard ─────────────────────────────────────────────

  renderDashboard() {
    const days = parseInt(document.getElementById('periodSelect')?.value || '30');
    const stats = Storage.getStats(null, days);
    const settings = Storage.getSettings();

    // Metrics
    const metricsEl = document.getElementById('metricsGrid');
    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">CA total</div>
          <div class="metric-value teal">${this.fmt(stats.ca)}</div>
          <div class="metric-sub">${stats.count} vente${stats.count > 1 ? 's' : ''}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Net estimé</div>
          <div class="metric-value">${this.fmt(stats.net)}</div>
          <div class="metric-sub">après ${settings.commission}% commission</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Panier moyen</div>
          <div class="metric-value">${this.fmt(stats.avg)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Frais envoi</div>
          <div class="metric-value">${this.fmt(stats.sales.reduce((s, v) => s + (parseFloat(v.shipping) || 0), 0))}</div>
        </div>
      `;
    }

    // Chart filter pills
    this.renderChartFilter();

    // Chart
    this.renderChart(days);

    // Account breakdown
    this.renderAccountBreakdown(days);

    // Recent sales
    this.renderRecentSales();

    // Last sync
    this.updateLastSyncLabel();
  },

  renderChartFilter() {
    const el = document.getElementById('chartFilter');
    if (!el) return;
    const accounts = Storage.getAccounts();
    let html = `<span class="filter-pill ${activeChartFilter === 'all' ? 'active' : ''}" style="${activeChartFilter === 'all' ? 'background:#009EE0' : ''}" data-id="all">Tous</span>`;
    accounts.forEach(a => {
      const isActive = activeChartFilter === a.id;
      html += `<span class="filter-pill ${isActive ? 'active' : ''}" style="${isActive ? 'background:' + a.color : 'color:' + a.color + ';border-color:' + a.color + '33'}" data-id="${a.id}">${a.name.replace('@', '')}</span>`;
    });
    el.innerHTML = html;
    el.querySelectorAll('.filter-pill').forEach(p => p.addEventListener('click', () => {
      activeChartFilter = p.dataset.id;
      this.renderChartFilter();
      const days = parseInt(document.getElementById('periodSelect')?.value || '30');
      this.renderChart(days);
    }));
  },

  renderChart(days) {
    let sales = Storage.getSales();
    if (activeChartFilter !== 'all') sales = sales.filter(s => s.accountId === activeChartFilter);
    if (days > 0) {
      const since = new Date(); since.setDate(since.getDate() - days);
      sales = sales.filter(s => new Date(s.date) >= since);
    }

    // Grouper par mois
    const byMonth = {};
    sales.forEach(s => {
      const m = s.date?.slice(0, 7);
      if (m) byMonth[m] = (byMonth[m] || 0) + (parseFloat(s.price) || 0);
    });

    const labels = Object.keys(byMonth).sort();
    const data = labels.map(l => Math.round(byMonth[l] * 100) / 100);

    const ctx = document.getElementById('revenueChart')?.getContext('2d');
    if (!ctx) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

    const account = activeChartFilter !== 'all' ? Storage.getAccount(activeChartFilter) : null;
    const color = account ? account.color : '#009EE0';

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.map(l => {
          const [y, m] = l.split('-');
          return new Date(y, m - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        }),
        datasets: [{
          label: 'CA (€)', data,
          backgroundColor: color + 'CC',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: { callback: v => v + '€', font: { size: 11 } },
            grid: { color: 'rgba(128,128,128,0.1)' }
          },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  },

  renderAccountBreakdown(days) {
    const el = document.getElementById('accountBreakdown');
    if (!el) return;
    const accounts = Storage.getAccounts();
    if (!accounts.length) { el.innerHTML = '<div class="empty-state"><p>Aucun compte connecté</p></div>'; return; }

    let html = '';
    accounts.forEach(a => {
      const stats = Storage.getStats(a.id, days);
      html += `
        <div class="breakdown-item">
          <div class="breakdown-dot" style="background:${a.color}"></div>
          <div class="breakdown-name">${a.name}</div>
          <div class="breakdown-stats">
            <div class="breakdown-ca">${this.fmt(stats.ca)}</div>
            <div class="breakdown-count">${stats.count} vente${stats.count > 1 ? 's' : ''}</div>
          </div>
        </div>`;
    });
    el.innerHTML = html;
  },

  renderRecentSales() {
    const el = document.getElementById('recentSalesList');
    if (!el) return;
    const sales = Storage.getSales().slice(0, 8);
    if (!sales.length) {
      el.innerHTML = '<div class="empty-state"><i class="ti ti-package"></i><p>Aucune vente. Synchronisez vos emails !</p></div>';
      return;
    }
    el.innerHTML = sales.map(s => this.saleItemHTML(s)).join('');
  },

  updateLastSyncLabel() {
    const el = document.getElementById('lastSyncLabel');
    if (!el) return;
    const ls = Storage.getLastSync();
    if (!ls || !Object.keys(ls).length) { el.textContent = 'Jamais synchronisé'; return; }
    const dates = Object.values(ls).filter(Boolean).sort().reverse();
    if (dates.length) el.textContent = 'Synchro ' + this.fmtRelative(dates[0]);
  },

  // ── Sales tab ─────────────────────────────────────────────

  renderSalesTab() {
    this.renderSalesFilters();
    this.renderSalesList();
  },

  renderSalesFilters() {
    const fAcct = document.getElementById('filterAccount');
    const fMonth = document.getElementById('filterMonth');
    if (!fAcct || !fMonth) return;

    const accounts = Storage.getAccounts();
    const curAcct = fAcct.value;
    fAcct.innerHTML = '<option value="">Tous les comptes</option>' +
      accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    fAcct.value = curAcct;

    const sales = Storage.getSales();
    const months = [...new Set(sales.map(s => s.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
    const curMonth = fMonth.value;
    fMonth.innerHTML = '<option value="">Tous les mois</option>' +
      months.map(m => {
        const [y, mo] = m.split('-');
        return `<option value="${m}">${new Date(y, mo - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`;
      }).join('');
    fMonth.value = curMonth;
  },

  renderSalesList() {
    const el = document.getElementById('salesList');
    const countEl = document.getElementById('salesCount');
    if (!el) return;

    const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const fAcct = document.getElementById('filterAccount')?.value || '';
    const fMonth = document.getElementById('filterMonth')?.value || '';
    const fStatus = document.getElementById('filterStatus')?.value || '';

    let sales = Storage.getSales().filter(s => {
      if (search && !s.title?.toLowerCase().includes(search)) return false;
      if (fAcct && s.accountId !== fAcct) return false;
      if (fMonth && s.date?.slice(0, 7) !== fMonth) return false;
      if (fStatus && s.status !== fStatus) return false;
      return true;
    });

    if (countEl) countEl.textContent = sales.length;

    if (!sales.length) {
      el.innerHTML = '<div class="empty-state"><i class="ti ti-receipt-off"></i><p>Aucune vente trouvée</p></div>';
      return;
    }

    el.innerHTML = '<div class="card">' + sales.map(s => this.saleItemHTML(s, true)).join('') + '</div>';
  },

  saleItemHTML(sale, withDelete = false) {
    const account = Storage.getAccount(sale.accountId);
    const color = account?.color || '#888';
    const deleteBtn = withDelete
      ? `<button class="btn-link" style="color:#ef4444;font-size:13px" onclick="App.deleteSale('${sale.id}')"><i class="ti ti-trash"></i></button>`
      : '';
    return `
      <div class="sale-item">
        <div class="sale-dot" style="background:${color}"></div>
        <div class="sale-info">
          <div class="sale-title">${sale.title || 'Article'}</div>
          <div class="sale-meta">${this.fmtDate(sale.date)} · ${account?.name || '—'}</div>
        </div>
        <div class="sale-right">
          <div class="sale-price">${this.fmt(parseFloat(sale.price) || 0)}</div>
          <div class="sale-status ${sale.status || 'vendu'}">${sale.status || 'vendu'}</div>
        </div>
        ${deleteBtn}
      </div>`;
  },

  // ── Accounts tab ──────────────────────────────────────────

  renderAccountsTab() {
    const el = document.getElementById('accountsGrid');
    if (!el) return;
    const accounts = Storage.getAccounts();
    if (!accounts.length) {
      el.innerHTML = '<div class="empty-state"><i class="ti ti-user-off"></i><p>Aucun compte connecté</p></div>';
      return;
    }
    el.innerHTML = '<div class="accounts-grid">' +
      accounts.map(a => this.accountCardHTML(a)).join('') +
      '</div>';
  },

  accountCardHTML(account) {
    const stats = Storage.getStats(account.id, 0);
    const lastSync = Storage.getLastSync()?.[account.id];
    return `
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-avatar" style="background:${account.color}">${this.initials(account.email)}</div>
          <div>
            <div class="account-card-name">${account.name}</div>
            <div class="account-card-email">${account.email}</div>
          </div>
        </div>
        <div class="account-card-stats">
          <div class="acct-stat">
            <div class="acct-stat-val" style="color:${account.color}">${stats.count}</div>
            <div class="acct-stat-label">Ventes</div>
          </div>
          <div class="acct-stat">
            <div class="acct-stat-val">${this.fmt(stats.ca)}</div>
            <div class="acct-stat-label">CA</div>
          </div>
          <div class="acct-stat">
            <div class="acct-stat-val">${this.fmt(stats.net)}</div>
            <div class="acct-stat-label">Net</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-bottom:10px">
          ${lastSync ? 'Dernière sync : ' + this.fmtRelative(lastSync) : 'Jamais synchronisé'}
        </div>
        <div class="account-card-actions">
          <button class="btn-sm primary" onclick="App.syncAccount('${account.id}')">
            <i class="ti ti-refresh"></i> Sync maintenant
          </button>
          <button class="btn-sm danger" onclick="App.removeAccount('${account.id}')">
            <i class="ti ti-unlink"></i> Déconnecter
          </button>
        </div>
      </div>`;
  },

  // ── Auth screen ───────────────────────────────────────────

  renderAuthScreen() {
    const accounts = Storage.getAccounts();
    const connectedEl = document.getElementById('connectedAccounts');
    const itemsEl = document.getElementById('accountItems');
    if (!connectedEl || !itemsEl) return;

    if (accounts.length > 0) {
      connectedEl.classList.remove('hidden');
      itemsEl.innerHTML = accounts.map(a => `
        <div class="account-item">
          <div class="account-avatar" style="background:${a.color}">${this.initials(a.email)}</div>
          <div class="account-info">
            <div class="account-name">${a.name}</div>
            <div class="account-email">${a.email}</div>
          </div>
          <div class="account-status ok"><i class="ti ti-check"></i></div>
        </div>`).join('');
    } else {
      connectedEl.classList.add('hidden');
    }
  },

  // ── Sync bar ──────────────────────────────────────────────

  showSyncBar(msg = 'Synchronisation en cours...') {
    document.getElementById('syncBar')?.classList.remove('hidden');
    const msgEl = document.getElementById('syncMsg');
    if (msgEl) msgEl.textContent = msg;
  },

  hideSyncBar() {
    document.getElementById('syncBar')?.classList.add('hidden');
  },
};
