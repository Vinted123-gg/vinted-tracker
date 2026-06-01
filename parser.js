// ============================================================
// PARSER — Extraction des données de vente depuis les emails Vinted
// ============================================================

const Parser = {

  // Patterns de détection d'une vente (sujet de l'email)
  SALE_SUBJECT_PATTERNS: [
    /vous avez vendu/i,
    /your item has sold/i,
    /félicitations.*vendu/i,
    /nouvelle vente/i,
    /votre article a été vendu/i,
    /congratulations.*sold/i,
    /je hebt.*verkocht/i,    // NL
    /hast.*verkauft/i,       // DE
  ],

  // Patterns de prix
  PRICE_PATTERNS: [
    /(\d+[.,]\d{2})\s*€/,
    /€\s*(\d+[.,]\d{2})/,
    /prix.*?(\d+[.,]\d{2})/i,
    /montant.*?(\d+[.,]\d{2})/i,
    /total.*?(\d+[.,]\d{2})/i,
    /price.*?(\d+[.,]\d{2})/i,
    /(\d+[.,]\d{2})\s*EUR/i,
  ],

  // Patterns pour le titre de l'article
  TITLE_PATTERNS: [
    /"([^"]{3,80})"/,
    /article\s*:\s*([^\n\r<]{3,80})/i,
    /item\s*:\s*([^\n\r<]{3,80})/i,
    /vous avez vendu\s+([^\n\r<]{3,80})/i,
    /sold\s*:\s*([^\n\r<]{3,80})/i,
  ],

  // Patterns pour les frais d'expédition
  SHIPPING_PATTERNS: [
    /expédition.*?(\d+[.,]\d{2})\s*€/i,
    /livraison.*?(\d+[.,]\d{2})\s*€/i,
    /shipping.*?(\d+[.,]\d{2})/i,
    /frais de port.*?(\d+[.,]\d{2})/i,
  ],

  isSaleEmail(subject, from) {
    // Vérif expéditeur
    const isVinted = CONFIG.VINTED_SENDERS.some(s =>
      from.toLowerCase().includes(s.toLowerCase())
    );
    if (!isVinted) return false;

    // Vérif sujet
    return this.SALE_SUBJECT_PATTERNS.some(p => p.test(subject));
  },

  parsePrice(text) {
    for (const pattern of this.PRICE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }
    return null;
  },

  parseTitle(text, subject) {
    // Essai depuis le corps
    for (const pattern of this.TITLE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().replace(/<[^>]+>/g, '').trim();
      }
    }
    // Fallback: extraire du sujet
    const cleanSubject = subject
      .replace(/vous avez vendu\s*/i, '')
      .replace(/your item has sold/i, '')
      .replace(/félicitations[,:]*\s*/i, '')
      .trim();
    return cleanSubject || 'Article vendu';
  },

  parseShipping(text) {
    for (const pattern of this.SHIPPING_PATTERNS) {
      const match = text.match(pattern);
      if (match) return parseFloat(match[1].replace(',', '.'));
    }
    return 0;
  },

  parseDate(headerDate, body) {
    // Date de l'email (header)
    if (headerDate) {
      const d = new Date(headerDate);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
    // Fallback aujourd'hui
    return new Date().toISOString().slice(0, 10);
  },

  detectStatus(body) {
    const b = body.toLowerCase();
    if (b.includes('livré') || b.includes('delivered') || b.includes('réceptionné')) return 'livré';
    if (b.includes('expédié') || b.includes('shipped') || b.includes('envoyé')) return 'expédié';
    return 'vendu';
  },

  // ── Parser principal ───────────────────────────────────────

  parseEmail(message, accountId) {
    const headers = Gmail.extractEmailHeaders(message);
    const body = Gmail.extractEmailBody(message);

    // Nettoyage HTML basique
    const cleanBody = body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&euro;/g, '€')
      .replace(/&#8364;/g, '€')
      .replace(/\s+/g, ' ')
      .trim();

    if (!this.isSaleEmail(headers.subject, headers.from)) return null;

    const price = this.parsePrice(cleanBody) || this.parsePrice(headers.subject);
    const title = this.parseTitle(cleanBody, headers.subject);
    const shipping = this.parseShipping(cleanBody);
    const date = this.parseDate(headers.date, cleanBody);
    const status = this.detectStatus(cleanBody);

    if (!price) return null; // On ignore les emails sans prix détectable

    return {
      id: 'sale_' + headers.messageId,
      gmailMessageId: headers.messageId,
      accountId,
      title: title.substring(0, 100),
      price,
      shipping,
      date,
      status,
      importedAt: new Date().toISOString(),
    };
  },

  // ── Parse un lot d'emails ──────────────────────────────────

  parseEmails(messages, accountId) {
    const sales = [];
    for (const msg of messages) {
      try {
        const sale = this.parseEmail(msg, accountId);
        if (sale) sales.push(sale);
      } catch (e) {
        console.warn('Erreur parsing email:', e);
      }
    }
    return sales;
  },
};
