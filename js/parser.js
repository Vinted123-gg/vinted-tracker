const Parser = {
  SALE_SUBJECT_PATTERNS: [
  /ton article s'est vendu/i,
  /s'est vendu/i,
  /vous avez vendu/i,
  /your item has sold/i,
  /nouvelle vente/i,
  /congratulations.*sold/i,
],
  PRICE_PATTERNS: [
  /(\d+[,\.]\d{2})\s*(?:€|â¬|EUR)/,
  /(\d+[,\.]\d{2})/,
],
TITLE_PATTERNS: [
  /a achet.{1,10}\s+(.{3,80}?)\s+\d+[,\.]\d{2}/i,
  /hat gekauft\s+(.{3,80}?)\s+\d+[,\.]\d{2}/i,
  /"([^"]{3,80})"/,
  /article\s*:\s*(.{3,80})/i,
],
  SHIPPING_PATTERNS: [
    /expédition.*?(\d+[.,]\d{2})\s*€/i,
    /livraison.*?(\d+[.,]\d{2})\s*€/i,
    /shipping.*?(\d+[.,]\d{2})/i,
  ],

  isSaleEmail(subject, from) {
  const isVinted = from.toLowerCase().includes('vinted');
  if (!isVinted) return false;
  return this.SALE_SUBJECT_PATTERNS.some(p => p.test(subject));
},

  parsePrice(text) {
    for (const pattern of this.PRICE_PATTERNS) {
      const match = text.match(pattern);
      if (match) return parseFloat(match[1].replace(',', '.'));
    }
    return null;
  },

 parseTitle(text, subject) {
  const cleanText = text
    .replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è').replace(/Ã /g, 'à')
    .replace(/Ã¢/g, 'â').replace(/Ã®/g, 'î').replace(/Ã´/g, 'ô')
    .replace(/Ã»/g, 'û').replace(/Ã«/g, 'ë').replace(/Ã¯/g, 'ï')
    .replace(/Ã§/g, 'ç').replace(/Ã¹/g, 'ù');
  for (const pattern of this.TITLE_PATTERNS) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      const title = match[1].trim().replace(/<[^>]+>/g, '').trim();
      if (title.length > 2 && !title.toLowerCase().includes('vinted')) {
        return title;
      }
    }
  }
  return 'Article vendu';
},

  parseShipping(text) {
    for (const pattern of this.SHIPPING_PATTERNS) {
      const match = text.match(pattern);
      if (match) return parseFloat(match[1].replace(',', '.'));
    }
    return 0;
  },

  parseDate(headerDate) {
  if (headerDate) { const d = new Date(headerDate); if (!isNaN(d)) return d.toISOString(); }
  return new Date().toISOString();
},

  detectStatus(body) {
    const b = body.toLowerCase();
    if (b.includes('livré') || b.includes('delivered')) return 'livré';
    if (b.includes('expédié') || b.includes('shipped')) return 'expédié';
    return 'vendu';
  },

  parseEmail(message, accountId) {
    const headers = Gmail.extractEmailHeaders(message);
    const body = Gmail.extractEmailBody(message);
    const cleanBody = body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&euro;/g, '€')
      .replace(/&#8364;/g, '€')
      .replace(/\s+/g, ' ').trim();

    if (!this.isSaleEmail(headers.subject, headers.from)) return null;

    const price = this.parsePrice(cleanBody) || this.parsePrice(headers.subject);
    if (!price) return null;

    return {
      id: 'sale_' + headers.messageId,
      gmailMessageId: headers.messageId,
      accountId,
      title: this.parseTitle(cleanBody, headers.subject).substring(0, 100),
      price,
      shipping: this.parseShipping(cleanBody),
      date: this.parseDate(headers.date),
      status: this.detectStatus(cleanBody),
      importedAt: new Date().toISOString(),
    };
  },

  parseEmails(messages, accountId) {
    const sales = [];
    for (const msg of messages) {
      try { const sale = this.parseEmail(msg, accountId); if (sale) sales.push(sale); }
      catch (e) { console.warn('Erreur parsing email:', e); }
    }
    return sales;
  },
};
