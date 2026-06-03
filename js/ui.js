let chartInstance = null;
let activeChartFilter = 'all';

const UI = {
  fmt(amount) {
    const s = Storage.getSettings();
    const syms = { EUR: '€', GBP: '£', CHF: 'CHF ' };
    const sym = syms[s.currency || 'EUR'] || '€';
    return sym + (Math.round(amount * 100) / 100).toFixed(2);
  },
  fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  fmtRelative(d) {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'à l\'instant';
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h}h`;
    return `il y a ${Math.floor(h / 24)}j`;
  },
  initials(email) { return email ? email.substring(0, 2).toUpperCase() : '??'; },
  toast(msg, dur = 3000) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), dur);
  },

  async renderDashboard() {
    const days = parseInt(document.getElementById('periodSelect')?.value || '30');
    const stats = await Storage.getStats(null, days);
    const heroEl = document.getElementById('heroCA');
    if (heroEl) {
      heroEl.innerHTML = `
        <div class="hero-label">Chiffre d'affaires</div>
        <div class="hero-val">${this.fmt(stats.ca)}</div>
        <div class="hero-sub">
          <span class="hero-count"><i class="ti ti-tag" style="font-size:10px"></i> ${stats.count} vente${stats.count !== 1 ? 's' : ''}</span>
          <span style="font-size:11px;color:var(--text-3)">${days > 0 ? 'sur ' + days + ' jours' : 'au total'}</span>
        </div>`;
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
    let html = `<span class="filter-pill ${activeChartFilter === 'all' ? 'active' : ''}" style="${activeChartFilter === 'all' ? 'background:#008060' : ''}" data-id="all">Tous</span>`;
    accounts.forEach(a => {
      const active = activeChartFilter === a.id;
      html += `<span class="filter-pill ${active ? 'active' : ''}" style="${active ? 'background:' + a.color : 'border-color:' + a.color + '55;color:' + a.color}" data-id="${a.id}">${a.name.replace('@','')}</span>`;
    });
    el.innerHTML = html;
    el.querySelectorAll('.filter-pill').forEach(p => p.addEventListener('click', async () => {
      activeChartFilter = p.dataset.id;
      await this.renderChartFilter();
      const days = parseInt(document.getElementById('periodSelect')?.value || '30');
      await this.renderChart(days);
    }));
  },

  async renderChart(days) {
    let sales = await Storage.getSales();
    if (activeChartFilter !== 'all') sales = sales.filter(s => s.account_id === activeChartFilter);
    if (days > 0) {
      const since = new Date(); since.setDate(since.getDate() - days);
      sales = sales.filter(s => new Date(s.date) >= since);
    }
    const byMonth = {};
    sales.forEach(s => {
      const key = days === 7 ? s.date : s.date?.slice(0,7);
      if (key) byMonth[key] = (byMonth[key]||0) + (parseFloat(s.price)||0);
    });
    const labels = Object.keys(byMonth).sort();
    const data = labels.map(l => Math.round(byMonth[l]*100)/100);
    const ctx = document.getElementById('revenueChart')?.getContext('2d');
    if (!ctx) return;
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    const accounts = await Storage.getAccounts();
    const account = activeChartFilter !== 'all' ? accounts.find(a => a.id === activeChartFilter) : null;
    const color = account ? account.color : '#008060';
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(l => {
          if (days === 7) return new Date(l).toLocaleDateString('fr-FR', {weekday:'short', day:'numeric'});
          if (days <= 30) return new Date(l).toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
          const [y,m] = l.split('-');
          return new Date(y,m-1).toLocaleDateString('fr-FR',{month:'short',year:'2-digit'});
        }),
        datasets: [{ label: 'CA', data, borderColor: color, backgroundColor: color + '12', borderWidth: 2.5, fill: true, tension: 0.4, pointBackgroundColor: color, pointRadius: 4, pointHoverRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#202223', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.6)', padding: 10, cornerRadius: 8, callbacks: { label: ctx => ' ' + this.fmt(ctx.parsed.y) } } },
        scales: {
          y: { ticks: { callback: v => this.fmt(v), font:{size:11}, color:'#9ba3ab' }, grid:{color:'#e1e3e5'}, border:{display:false} },
          x: { ticks: { font:{size:11}, color:'#9ba3ab' }, grid:{display:false}, border:{display:false} }
        }
      }
    });
  },

  async renderAccountBreakdown(days) {
    const el = document.getElementById('accountBreakdown');
    if (!el) return;
    const accounts = await Storage.getAccounts();
    if (!accounts.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-users"></i><p>Aucun compte connecté</p></div>'; return; }
    const allStats = await Promise.all(accounts.map(async a => ({ a, stats: await Storage.getStats(a.id, days) })));
    const maxCA = Math.max(...allStats.map(x => x.stats.ca), 1);
    el.innerHTML = allStats.map(({ a, stats }) => `
      <div class="breakdown-item">
        <div class="breakdown-bar-wrap">
          <div class="breakdown-name"><span style="width:8px;height:8px;border-radius:50%;background:${a.color};display:inline-block"></span>${a.name}</div>
          <div class="breakdown-bar-bg"><div class="breakdown-bar" style="width:${Math.round(stats.ca/maxCA*100)}%;background:${a.color}"></div></div>
        </div>
        <div class="breakdown-stats">
          <div class="breakdown-ca">${this.fmt(stats.ca)}</div>
          <div class="breakdown-count">${stats.count} vente${stats.count!==1?'s':''}</div>
        </div>
      </div>`).join('');
  },

  async renderRecentSales() {
    const el = document.getElementById('recentSalesList');
    if (!el) return;
    const allSales = await Storage.getSales();
    const sales = allSales.slice(0, 6);
    if (!sales.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-package"></i><p>Aucune vente.<br>Synchronisez vos emails !</p></div>'; return; }
    const accounts = await Storage.getAccounts();
    el.innerHTML = sales.map(s => this.saleItemHTML(s, accounts)).join('');
  },

  async updateLastSyncLabel() {
    const el = document.getElementById('lastSyncLabel');
    if (!el) return;
    const ls = await Storage.getLastSync();
    if (!ls || !Object.keys(ls).length) { el.textContent = 'Jamais synchronisé'; return; }
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
    fA.innerHTML = '<option value="">Tous les comptes</option>' + accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    fA.value = curA;
    const sales = await Storage.getSales();
    const months = [...new Set(sales.map(s => s.date?.slice(0,7)).filter(Boolean))].sort().reverse();
    const curM = fM.value;
    fM.innerHTML = '<option value="">Tous les mois</option>' + months.map(m => {
      const [y,mo] = m.split('-');
      return `<option value="${m}">${new Date(y,mo-1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</option>`;
    }).join('');
    fM.value = curM;
  },

  async renderSalesList() {
    const el = document.getElementById('salesList');
    const cEl = document.getElementById('salesCount');
    if (!el) return;
    const search = (document.getElementById('searchInput')?.value||'').toLowerCase();
    const fA = document.getElementById('filterAccount')?.value||'';
    const fM = document.getElementById('filterMonth')?.value||'';
    const fS = document.getElementById('filterStatus')?.value||'';
    const accounts = await Storage.getAccounts();
    let sales = await Storage.getSales();
    sales = sales.filter(s => {
      if (search && !s.title?.toLowerCase().includes(search)) return false;
      if (fA && s.account_id !== fA) return false;
      if (fM && s.date?.slice(0,7) !== fM) return false;
      if (fS && s.status !== fS) return false;
      return true;
    });
    if (cEl) cEl.textContent = sales.length;
    if (!sales.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-receipt-off"></i><p>Aucune vente trouvée</p></div>'; return; }
    el.innerHTML = '<div class="card">' + sales.map(s => this.saleItemHTML(s, accounts, true)).join('') + '</div>';
  },

  saleItemHTML(sale, accounts, withDelete = false) {
    const account = accounts?.find(a => a.id === sale.account_id);
    const color = account?.color || '#888';
    const icons = ['ti-shirt','ti-shoe','ti-handbag','ti-jacket','ti-hat','ti-sunglasses','ti-pants','ti-tie'];
    const icon = icons[Math.abs((sale.title?.charCodeAt(0)||0)) % icons.length];
    const statusClass = sale.status === 'livré' ? 'badge-livré' : sale.status === 'expédié' ? 'badge-expédié' : 'badge-vendu';
    const del = withDelete ? `<button style="border:none;background:none;color:var(--text-3);font-size:16px;cursor:pointer;padding:4px" onclick="App.deleteSale('${sale.id}')"><i class="ti ti-trash"></i></button>` : '';
    return `
      <div class="sale-item">
        <div class="sale-thumb" style="background:${color}12"><i class="ti ${icon}" style="color:${color};font-size:16px"></i></div>
        <div class="sale-info">
          <div class="sale-title">${sale.title || 'Article vendu'}</div>
          <div class="sale-meta">${this.fmtDate(sale.date)} · <span style="color:${color}">${account?.name || '—'}</span></div>
        </div>
        <div class="sale-right">
          <div class="sale-price">${this.fmt(parseFloat(sale.price)||0)}</div>
          <span class="sale-status-badge ${statusClass}">${sale.status||'vendu'}</span>
        </div>
        ${del}
      </div>`;
  },

  async renderAccountsTab() {
    const el = document.getElementById('accountsGrid');
    if (!el) return;
    const accounts = await Storage.getAccounts();
    if (!accounts.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-user-off"></i><p>Aucun compte connecté</p></div>'; return; }
    const cards = await Promise.all(accounts.map(a => this.accountCardHTML(a)));
    el.innerHTML = '<div class="accounts-grid">' + cards.join('') + '</div>';
  },

  async accountCardHTML(account) {
    const stats = await Storage.getStats(account.id, 0);
    const lastSyncData = await Storage.getLastSync();
    const lastSync = lastSyncData?.[account.id];
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
          <div class="acct-stat"><div class="acct-stat-val" style="color:${account.color}">${stats.count}</div><div class="acct-stat-label">Ventes</div></div>
          <div class="acct-stat"><div class="acct-stat-val">${this.fmt(stats.ca)}</div><div class="acct-stat-label">CA total</div></div>
          <div class="acct-stat"><div class="acct-stat-val">${this.fmt(stats.ca * 0.95)}</div><div class="acct-stat-label">Net</div></div>
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-bottom:12px">${lastSync ? 'Dernière sync : ' + this.fmtRelative(lastSync) : 'Jamais synchronisé'}</div>
        <div class="account-card-actions">
          <button class="btn-sm primary" onclick="App.syncAccount('${account.id}', true)"><i class="ti ti-refresh"></i> Synchroniser</button>
          <button class="btn-sm danger" onclick="App.removeAccount('${account.id}')"><i class="ti ti-unlink"></i> Déconnecter</button>
        </div>
      </div>`;
  },

  showSyncBar(msg = 'Synchronisation...') {
    document.getElementById('syncBar')?.classList.remove('hidden');
    const m = document.getElementById('syncMsg'); if (m) m.textContent = msg;
  },
  hideSyncBar() { document.getElementById('syncBar')?.classList.add('hidden'); },
};
