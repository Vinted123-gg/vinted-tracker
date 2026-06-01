const Gmail = {
  TOKEN_KEY_PREFIX: 'vt_token_',

  async authenticate() {
    const params = new URLSearchParams({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      redirect_uri: window.location.origin + window.location.pathname,
      response_type: 'token',
      scope: CONFIG.GOOGLE_SCOPES,
      prompt: 'select_account',
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    window.location.href = authUrl;
    return new Promise(() => {});
  },

  handleRedirectToken() {
  const hash = window.location.hash.substring(1);
  if (!hash.includes('access_token')) return false;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const expiresIn = parseInt(params.get('expires_in') || '3600');
  if (!accessToken) return false;
  history.replaceState(null, '', window.location.pathname);
  return { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
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
    let query = `(${senderQuery}) (subject:"vendu" OR subject:"sold" OR subject:"s'est vendu" OR subject:"article s'est vendu")`;
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
    for (let i = 0; i < ids.length; i += 5) {
      const batch = ids.slice(i, i + 5);
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
