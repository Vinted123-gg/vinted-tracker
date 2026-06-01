const Gmail = {
  TOKEN_KEY_PREFIX: 'vt_token_',

  async authenticate() {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        redirect_uri: window.location.origin + window.location.pathname,
        response_type: 'token',
        scope: CONFIG.GOOGLE_SCOPES,
        prompt: 'select_account',
      });
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      const popup = window.open(authUrl, 'google-auth', 'width=500,height=600');
      const interval = setInterval(() => {
        try {
          if (!popup || popup.closed) { clearInterval(interval); reject(new Error('Fenêtre fermée')); return; }
          const url = popup.location.href;
          if (url.includes('access_token') || url.includes('#')) {
            const hash = popup.location.hash.substring(1);
            const tokenParams = new URLSearchParams(hash);
            const accessToken = tokenParams.get('access_token');
            const expiresIn = parseInt(tokenParams.get('expires_in') || '3600');
            popup.close(); clearInterval(interval);
            if (accessToken) { resolve({ accessToken, expiresAt: Date.now() + expiresIn * 1000 }); }
            else { reject(new Error('Token non trouvé')); }
          }
        } catch (e) {}
      }, 300);
      setTimeout(() => { clearInterval(interval); if (!popup.closed) popup.close(); reject(new Error('Timeout')); }, 120000);
    });
  },

  saveToken(accountId, tokenData) {
    localStorage.setItem(this.TOKEN_KEY_PREFIX + accountId, JSON.stringify({ ...tokenData, savedAt: Date.now() }));
  },

  getToken(accountId) {
    try {
      const t = localStorage.getItem(this.TOKEN_KEY_PREFIX + accountId);
      if (!t) return null;
      const data = JSON.parse(t);
      if (Date.now() > data.expiresAt - 60000) return null;
      return data.accessToken;
    } catch { return null; }
  },

  removeToken(accountId) { localStorage.removeItem(this.TOKEN_KEY_PREFIX + accountId); },

  async getUserProfile(accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Impossible de récupérer le profil');
    return res.json();
  },

  async fetchVintedEmails(accessToken, sinceDate = null) {
    const senderQuery = CONFIG.VINTED_SENDERS.map(s => `from:${s}`).join(' OR ');
    let query = `(${senderQuery})`;
    if (sinceDate) {
      const after = Math.floor(new Date(sinceDate).getTime() / 1000);
      query += ` after:${after}`;
    }
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) throw new Error('Erreur Gmail API');
    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) return [];
    const ids = listData.messages.map(m => m.id);
    const emails = [];
    const batchSize = 5;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const fetched = await Promise.all(
        batch.map(id => fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ).then(r => r.json()))
      );
      emails.push(...fetched);
    }
    return emails;
  },

  extractEmailBody(message) {
    const getBody = (part) => {
      if (part.body && part.body.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      if (part.parts) { for (const p of part.parts) { const b = getBody(p); if (b) return b; } }
      return '';
    };
    return getBody(message.payload || {});
  },

  extractEmailHeaders(message) {
    const headers = message.payload?.headers || [];
    const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    return { subject: get('Subject'), from: get('From'), date: get('Date'), messageId: message.id };
  },
};
