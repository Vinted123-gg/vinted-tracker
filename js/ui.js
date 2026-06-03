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
    sales.forEach(function(s) {
      const key = days === 7 ? s.date : (s.date ? s.date.slice(0,7) : null);
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
    if (!accounts.length) { el.innerHTML = '<div class="empty-state"><i class="ti ti-users"></i><p>Aucun compte connecté</p></div>'; return; }
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
    if (!ls || !Object.keys(ls).length) { el.textContent = 'Jamais synchronisé'; return; }
    const dates = Object.values(ls).filter(Boolean).sort().reverse();
    if (dates.length) el.textContent = 'Synchro ' + this.fmtRelative(dates[0]);
  },
