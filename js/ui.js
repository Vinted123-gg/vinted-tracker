let chartInstance = null;
let activeChartFilter = 'all';

const UI = {
  fmt(amount) {
    const s = Storage.getSettings();
    const syms = { EUR: '\u20ac', GBP: '\u00a3', CHF: 'CHF ' };
    const sym = syms[s.currency || 'EUR'] || '\u20ac';
    return sym + (Math.round(amount * 100) / 100).toFixed(2);
  },
  fmtDate(d) {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  fmtRelative(d) {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "a l'instant";
    if (m < 60) return "il y a " + m + " min";
    const h = Math.floor(m / 60);
    if (h < 24) return "il y a " + h + "h";
    return "il y a " + Math.floor(h / 24) + "j";
  },
  initials(email) { return email ? email.substring(0, 2).toUpperCase() : '??'; },
  toast(msg, dur) {
    dur = dur || 3000;
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, dur);
  },

  async renderDashboard() {
    const days = parseInt(document.getElementById('periodSelect') ? document.getElementById('periodSelect').value : '30');
    const stats = await Storage.getStats(null, days);
    const heroEl = document.getElementById('heroCA');
    if (heroEl) {
      heroEl.innerHTML = '<div class="hero-label">Chiffre d\'affaires</div>' +
        '<div class="hero-val">' + this.fmt(stats.ca) + '</div>' +
        '<div class="hero-sub">' +
        '<span class="hero-count"><i class="ti ti-tag" style="font-size:10px"></i> ' + stats.count + ' vente' + (stats.count !== 1 ? 's' : '') + '</span>' +
        '<span style="font-size:11px;color:var(--text-3)">' + (days > 0 ? 'sur ' + days + ' jours' : 'au total') + '</span>' +
        '</div>';
    }
    await this.renderChartFilter();
    await this.renderChart(days);
    await this.renderAccountBreakdown(days);
    await this.renderRecentSales();
    await this.updateLastSyncLabel();
  },

  async renderChartFilter() {
    const el = document.getElementById('chartFilter');
    if (!el) return;
    const accounts = await Storage.getAccounts();
    let html = '<span class="filter-pill ' + (activeChartFilter === 'all' ? 'active' : '') + '" style="' + (activeChartFilter === 'all' ? 'background:#008060' : '') + '" data-id="all">Tous</span>';
    accounts.forEach(function(a) {
      const active = activeChartFilter === a.id;
      html += '<span class="filter-pill ' + (active ? 'active' : '') + '" style="' + (active ? 'background:' + a.color : 'border-color:' + a.color + '55;color:' + a.color) + '" data-id="' + a.id + '">' + a.name.replace('@','') + '</span>';
    });
    el.innerHTML = html;
    const self = this;
    el.querySelectorAll('.filter-pill').forEach(function(p) {
      p.addEventListener('click', async function() {
        activeChartFilter = p.dataset.id;
        await self.renderChartFilter();
        const days = parseInt(document.getElementById('periodSelect') ? document.getElementById('periodSelect').value : '30');
        await self.renderChart(days);
      });
    });
  },

  async renderChart(days) {
    const allSales = await Storage.getSales();
    let sales = allSales;
    if (activeChartFilter !== 'all') sales = sales.filter(function(s) { return s.account_id === activeChartFilter; });
    if (days > 0) {
      const since = new Date(); since.setDate(since.getDate() - days);
      sales = sales.filter(function(s) { return new Date(s.date) >= since; });
    }
    const byMonth = {};
if (days === 1) {
  for (var h = 0; h < 24; h++) {
    byMonth[String(h).padStart(2,'0') + 'h'] = 0;
  }
} else if (days === 7) {
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    byMonth[key] = 0;
  }
}
sales.forEach(function(s) {
  const key = days === 1 ? (s.date ? String(new Date(s.date).getHours()).padStart(2,'0') + 'h' : null) : days === 7 ? (s.date ? s.date.slice(0,10) : null) : (s.date ? s.date.slice(0,7) : null);
  if (key) byMonth[key] = (byMonth[key]||0) + (parseFloat(s.price)||0);
});
    const labels = Object.keys(byMonth).sort();
    const data = labels.map(function(l) { return Math.round(byMonth[l]*100)/100; });
    const ctx = document.getElementById('revenueChart') ? document.getElementById('revenueChart').getContext('2d') : null;
    if (!ctx) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    const accounts = await Storage.getAccounts();
    const account = activeChartFilter !== 'all' ? accounts.find(function(a) { return a.id === activeChartFilter; }) : null;
    const color = account ? account.color : '#008060';
    const self = this;
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(function(l) {
          if (days === 1) return l;
          if (days === 7) return new Date(l).toLocaleDateString('fr-FR', {weekday:'short', day:'numeric'});
          if (days <= 30) return new Date(l).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
          const parts = l.split('-');
          return new Date(parts[0], parts[1]-1).toLocaleDateString('fr-FR', {month:'short', year:'2-digit'});
        }),
        datasets: [{ label: 'CA', data: data, borderColor: color, backgroundColor: color + '12', borderWidth: 2.5, fill: true, tension: 0.4, pointBackgroundColor: color, pointRadius: 4, pointHoverRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#202223', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.6)', padding: 10, cornerRadius: 8,
            callbacks: { label: function(ctx) { return ' ' + self.fmt(ctx.parsed.y); } }
          }
        },
        scales: {
          y: { ticks: { callback: function(v) { return self.fmt(v); }, font:{size:11}, color:'#9ba3ab' }, grid:{color:'#e1e3e5'}, border:{display:false} },
          x: { ticks: { font:{size:11}, color:'#9ba3ab' }, grid:{display:false}, border:{display:false} }
        }
      }
    });
  },

  async renderAccountBreakdown(days) {
    const el = document.getElementById('accountBreakdown');
    if (!el) return;
    const accounts = await Storage.getAccounts();
    if (!accounts.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-users"></i><p>Aucun compte connect\u00e9</p></div>'; return; }
    const self = this;
    const allStats = await Promise.all(accounts.map(async function(a) { return { a: a, stats: await Storage.getStats(a.id, days) }; }));
    const maxCA = Math.max.apply(null, allStats.map(function(x) { return x.stats.ca; }).concat([1]));
    el.innerHTML = allStats.map(function(item) {
      const a = item.a, stats = item.stats;
      return '<div class="breakdown-item">' +
        '<div class="breakdown-bar-wrap">' +
        '<div class="breakdown-name"><span style="width:8px;height:8px;border-radius:50%;background:' + a.color + ';display:inline-block"></span>' + a.name + '</div>' +
        '<div class="breakdown-bar-bg"><div class="breakdown-bar" style="width:' + Math.round(stats.ca/maxCA*100) + '%;background:' + a.color + '"></div></div>' +
        '</div>' +
        '<div class="breakdown-stats">' +
        '<div class="breakdown-ca">' + self.fmt(stats.ca) + '</div>' +
        '<div class="breakdown-count">' + stats.count + ' vente' + (stats.count!==1?'s':'') + '</div>' +
        '</div></div>';
    }).join('');
  },

  async renderRecentSales() {
    const el = document.getElementById('recentSalesList');
    if (!el) return;
    const allSales = await Storage.getSales();
    const sales = allSales.slice(0, 6);
    if (!sales.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-package"></i><p>Aucune vente.<br>Synchronisez vos emails !</p></div>'; return; }
    const accounts = await Storage.getAccounts();
    const self = this;
    el.innerHTML = sales.map(function(s) { return self.saleItemHTML(s, accounts, false); }).join('');
  },

  async updateLastSyncLabel() {
    const el = document.getElementById('lastSyncLabel');
    if (!el) return;
    const ls = await Storage.getLastSync();
    if (!ls || !Object.keys(ls).length) { el.textContent = 'Jamais synchronis\u00e9'; return; }
    const dates = Object.values(ls).filter(Boolean).sort().reverse();
    if (dates.length) el.textContent = 'Synchro ' + this.fmtRelative(dates[0]);
  },

  async renderSalesTab() { await this.renderSalesFilters(); await this.renderSalesList(); },

  async renderSalesFilters() {
    const fA = document.getElementById('filterAccount');
    const fM = document.getElementById('filterMonth');
    if (!fA || !fM) return;
    const accounts = await Storage.getAccounts();
    const curA = fA.value;
    fA.innerHTML = '<option value="">Tous les comptes</option>' + accounts.map(function(a) { return '<option value="' + a.id + '">' + a.name + '</option>'; }).join('');
    fA.value = curA;
    const sales = await Storage.getSales();
    const months = Array.from(new Set(sales.map(function(s) { return s.date ? s.date.slice(0,7) : null; }).filter(Boolean))).sort().reverse();
    const curM = fM.value;
    fM.innerHTML = '<option value="">Tous les mois</option>' + months.map(function(m) {
      const parts = m.split('-');
      return '<option value="' + m + '">' + new Date(parts[0], parts[1]-1).toLocaleDateString('fr-FR', {month:'long', year:'numeric'}) + '</option>';
    }).join('');
    fM.value = curM;
  },

  async renderSalesList() {
    const el = document.getElementById('salesList');
    const cEl = document.getElementById('salesCount');
    if (!el) return;
    const search = (document.getElementById('searchInput') ? document.getElementById('searchInput').value : '').toLowerCase();
    const fA = document.getElementById('filterAccount') ? document.getElementById('filterAccount').value : '';
    const fM = document.getElementById('filterMonth') ? document.getElementById('filterMonth').value : '';
    const fS = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';
    const accounts = await Storage.getAccounts();
    let sales = await Storage.getSales();
    sales = sales.filter(function(s) {
      if (search && !(s.title || '').toLowerCase().includes(search)) return false;
      if (fA && s.account_id !== fA) return false;
      if (fM && (s.date || '').slice(0,7) !== fM) return false;
      if (fS && s.status !== fS) return false;
      return true;
    });
    if (cEl) cEl.textContent = sales.length;
    if (!sales.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-receipt-off"></i><p>Aucune vente trouv\u00e9e</p></div>'; return; }
    const self = this;
    el.innerHTML = '<div class="card">' + sales.map(function(s) { return self.saleItemHTML(s, accounts, true); }).join('') + '</div>';
  },

  saleItemHTML(sale, accounts, withDelete) {
    const account = accounts ? accounts.find(function(a) { return a.id === sale.account_id; }) : null;
    const color = account ? account.color : '#888';
    const icons = ['ti-shirt','ti-shoe','ti-handbag','ti-jacket','ti-hat','ti-sunglasses','ti-pants','ti-tie'];
    const icon = icons[Math.abs((sale.title ? sale.title.charCodeAt(0) : 0)) % icons.length];
    const statusClass = sale.status === 'livr\u00e9' ? 'badge-livr\u00e9' : sale.status === 'exp\u00e9di\u00e9' ? 'badge-exp\u00e9di\u00e9' : 'badge-vendu';
    const del = withDelete ? '<button style="border:none;background:none;color:var(--text-3);font-size:16px;cursor:pointer;padding:4px" onclick="App.deleteSale(\'' + sale.id + '\')"><i class="ti ti-trash"></i></button>' : '';
    return '<div class="sale-item">' +
      '<div class="sale-thumb" style="background:' + color + '12"><i class="ti ' + icon + '" style="color:' + color + ';font-size:16px"></i></div>' +
      '<div class="sale-info">' +
      '<div class="sale-title">' + (sale.title || 'Article vendu') + '</div>' +
      '<div class="sale-meta">' + this.fmtDate(sale.date) + ' \u00b7 <span style="color:' + color + '">' + (account ? account.name : '--') + '</span></div>' +
      '</div>' +
      '<div class="sale-right">' +
      '<div class="sale-price">' + this.fmt(parseFloat(sale.price)||0) + '</div>' +
      '<span class="sale-status-badge ' + statusClass + '">' + (sale.status||'vendu') + '</span>' +
      '</div>' + del + '</div>';
  },

  async renderAccountsTab() {
    const el = document.getElementById('accountsGrid');
    if (!el) return;
    const accounts = await Storage.getAccounts();
    if (!accounts.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-user-off"></i><p>Aucun compte connect\u00e9</p></div>'; return; }
    const self = this;
    const cards = await Promise.all(accounts.map(function(a) { return self.accountCardHTML(a); }));
    el.innerHTML = '<div class="accounts-grid">' + cards.join('') + '</div>';
  },

  async accountCardHTML(account) {
    const stats = await Storage.getStats(account.id, 0);
    const lastSyncData = await Storage.getLastSync();
    const lastSync = lastSyncData ? lastSyncData[account.id] : null;
    return '<div class="account-card">' +
      '<div class="account-card-header">' +
      '<div class="account-card-avatar" style="background:' + account.color + '">' + this.initials(account.email) + '</div>' +
      '<div><div class="account-card-name">' + account.name + '</div><div class="account-card-email">' + account.email + '</div></div>' +
      '</div>' +
      '<div class="account-card-stats">' +
      '<div class="acct-stat"><div class="acct-stat-val" style="color:' + account.color + '">' + stats.count + '</div><div class="acct-stat-label">Ventes</div></div>' +
      '<div class="acct-stat"><div class="acct-stat-val">' + this.fmt(stats.ca) + '</div><div class="acct-stat-label">CA total</div></div>' +
      '<div class="acct-stat"><div class="acct-stat-val">' + this.fmt(stats.ca * 0.95) + '</div><div class="acct-stat-label">Net</div></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-3);margin-bottom:12px">' + (lastSync ? 'Derni\u00e8re sync : ' + this.fmtRelative(lastSync) : 'Jamais synchronis\u00e9') + '</div>' +
      '<div class="account-card-actions">' +
      '<button class="btn-sm primary" onclick="App.syncAccount(\'' + account.id + '\', true)"><i class="ti ti-refresh"></i> Synchroniser</button>' +
      '<button class="btn-sm danger" onclick="App.removeAccount(\'' + account.id + '\')"><i class="ti ti-unlink"></i> D\u00e9connecter</button>' +
      '</div></div>';
  },

  showSyncBar(msg) {
    msg = msg || 'Synchronisation...';
    const el = document.getElementById('syncBar');
    if (el) el.classList.remove('hidden');
    const m = document.getElementById('syncMsg');
    if (m) m.textContent = msg;
  },
  hideSyncBar() {
    const el = document.getElementById('syncBar');
    if (el) el.classList.add('hidden');
  },
};
