# 📱 Vinted Tracker — Guide d'installation

## Vue d'ensemble

Cette app lit automatiquement vos emails Vinted via Gmail API pour importer vos ventes. Voici les 3 étapes pour la mettre en ligne.

---

## Étape 1 — Créer votre projet Google Cloud (10 min)

### 1.1 — Créer le projet
1. Allez sur https://console.cloud.google.com
2. Cliquez **"Nouveau projet"**
3. Nom : `Vinted Tracker` → **Créer**

### 1.2 — Activer Gmail API
1. Menu → **APIs et services** → **Bibliothèque**
2. Cherchez **Gmail API** → **Activer**

### 1.3 — Configurer l'écran de consentement OAuth
1. Menu → **APIs et services** → **Écran de consentement OAuth**
2. Type : **Externe** → Créer
3. Remplissez :
   - Nom de l'application : `Vinted Tracker`
   - Email d'assistance : votre email
   - Email du développeur : votre email
4. **Enregistrer et continuer** (les autres étapes peuvent être passées)
5. Sur la page "Utilisateurs test", **ajoutez vos adresses Gmail** (tous vos comptes Vinted)

### 1.4 — Créer les identifiants OAuth
1. Menu → **APIs et services** → **Identifiants**
2. **Créer des identifiants** → **ID client OAuth 2.0**
3. Type : **Application Web**
4. Nom : `Vinted Tracker Web`
5. **Origines JavaScript autorisées** : ajoutez votre future URL GitHub Pages
   - Format : `https://VOTRE_USERNAME.github.io`
6. **Cliquez Créer**
7. **Copiez le Client ID** (format: `XXXXX.apps.googleusercontent.com`)

### 1.5 — Mettre le Client ID dans l'app
Ouvrez `js/config.js` et remplacez :
```javascript
GOOGLE_CLIENT_ID: 'VOTRE_CLIENT_ID_ICI',
```
par votre vrai Client ID.

---

## Étape 2 — Créer les icônes (2 min)

Créez 2 images PNG dans le dossier `icons/` :
- `icon-192.png` (192×192 pixels)
- `icon-512.png` (512×512 pixels)

Vous pouvez utiliser https://favicon.io ou tout éditeur d'image.
Fond bleu `#009EE0` avec l'emoji 🏷️ suffit.

---

## Étape 3 — Déployer sur GitHub Pages (5 min)

### 3.1 — Créer un repository GitHub
1. Allez sur https://github.com/new
2. Nom : `vinted-tracker`
3. **Public** (obligatoire pour GitHub Pages gratuit)
4. Créer

### 3.2 — Uploader les fichiers
1. Dans votre nouveau repo, cliquez **"uploading an existing file"**
2. Glissez-déposez TOUS les fichiers du dossier `vinted-tracker/`
   (en conservant la structure des dossiers)
3. **Commit changes**

### 3.3 — Activer GitHub Pages
1. Dans votre repo → **Settings** → **Pages**
2. Source : **Deploy from a branch**
3. Branch : **main** → **/ (root)**
4. **Save**
5. Votre URL sera : `https://VOTRE_USERNAME.github.io/vinted-tracker`

### 3.4 — Mettre à jour les origines autorisées Google
Retournez dans Google Cloud Console → Identifiants → votre Client ID :
- Ajoutez `https://VOTRE_USERNAME.github.io` dans les origines autorisées
- Ajoutez `https://VOTRE_USERNAME.github.io/vinted-tracker/index.html` dans les URIs de redirection autorisés

---

## Étape 4 — Ajouter l'app sur votre iPhone

1. Ouvrez Safari (pas Chrome !) sur votre iPhone
2. Allez sur `https://VOTRE_USERNAME.github.io/vinted-tracker`
3. Appuyez sur **Partager** (icône carrée avec flèche)
4. **"Sur l'écran d'accueil"**
5. **Ajouter** ✓

L'app apparaît maintenant comme une vraie app sur votre iPhone !

---

## Utilisation

1. **Connecter un compte** : bouton "Continuer avec Google" → choisissez votre Gmail
2. **Sync automatique** : l'app vérifie vos emails toutes les heures
3. **Sync manuelle** : bouton 🔄 en haut à droite
4. **Ajouter d'autres comptes** : onglet Comptes → Ajouter

---

## Résolution de problèmes

**"Erreur 400 redirect_uri_mismatch"**
→ Vérifiez que l'URL dans Google Cloud correspond exactement à votre URL GitHub Pages

**"Access blocked: app not verified"**
→ Normal en mode test. Cliquez "Paramètres avancés" → "Accéder à Vinted Tracker"

**Aucune vente importée**
→ Vérifiez que vos emails Vinted viennent bien de `no-reply@vinted.fr`
→ Regardez dans vos spams

**Le token expire**
→ L'app vous demandera de vous re-authentifier automatiquement

---

## Support

Si vous avez des questions, revenez sur Claude avec votre problème !
