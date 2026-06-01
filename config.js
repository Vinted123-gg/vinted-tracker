// ============================================================
// CONFIGURATION — À remplir avec vos clés Google Cloud
// Suivez le guide SETUP.md pour obtenir ces valeurs
// ============================================================

const CONFIG = {
  // Votre Client ID Google Cloud (OAuth 2.0)
  // Format: XXXXXXXXXXXX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
  GOOGLE_CLIENT_ID: 'VOTRE_CLIENT_ID_ICI',

  // Scopes Gmail nécessaires (lecture seule)
  GOOGLE_SCOPES: 'https://www.googleapis.com/auth/gmail.readonly',

  // Expéditeurs emails Vinted reconnus
  VINTED_SENDERS: [
    'no-reply@vinted.fr',
    'noreply@vinted.fr',
    'no-reply@vinted.be',
    'no-reply@vinted.lu',
    'transaction@vinted.fr'
  ],

  // Commission Vinted par défaut (%)
  DEFAULT_COMMISSION: 5,

  // Couleurs disponibles pour les comptes
  ACCOUNT_COLORS: [
    '#009EE0', // Bleu Vinted
    '#1D9E75', // Vert
    '#D85A30', // Corail
    '#7F77DD', // Violet
    '#D4537E', // Rose
    '#BA7517', // Amber
    '#185FA5', // Bleu foncé
    '#3B6D11', // Vert foncé
  ],
};
