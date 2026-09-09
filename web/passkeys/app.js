import { VERSION, bytes, encode, decode, random, hash, same, Challenge, checkClientData, checkAuthenticatorData, validateProfile, verifyAssertion, errorMessage } from './crypto.js?v=20260909-2';

const $ = id => document.getElementById(id);
const DB_KEY = 'stock.passkey-prototype.v1';
const SESSION_KEY = 'stock.passkey-prototype.session.v1';
const rpId = location.hostname;
const origin = location.origin;
const baseUrl = new URL('./', location.href);
baseUrl.hash = ''; baseUrl.search = '';
const screens = new Set(['home', 'activate', 'ready', 'session', 'transfer', 'install', 'diagnostic']);
let database = { profile: null, revoked: false, events: [] };
let storageOK = true;
let view = 'home';
let generation = 0;
let operation = null;
let activation = null;
let deferredInstall = null;
let localAuthenticator = 'Vérification en cours…';
function clearActivation() {
  activation = null;
  $('username').value = ''; $('password').value = ''; $('password').type = 'password';
  $('show-password').textContent = 'Afficher'; $('show-password').setAttribute('aria-pressed', 'false');
  $('demo-username').textContent = ''; $('demo-password').textContent = '';
}
try {
  localStorage.setItem(DB_KEY + '.probe', '1'); localStorage.removeItem(DB_KEY + '.probe');
  sessionStorage.setItem(SESSION_KEY + '.probe', '1'); sessionStorage.removeItem(SESSION_KEY + '.probe');
  const stored = JSON.parse(localStorage.getItem(DB_KEY) || 'null');
  if (stored && Array.isArray(stored.events)) database = { profile: stored.profile || null, revoked: stored.revoked === true, events: stored.events.slice(-40) };
} catch { storageOK = false; }

function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(database)); }
  catch { storageOK = false; throw new Error('Le stockage local est indisponible ou plein. Autorisez les données du site avant de poursuivre.'); }
}
function record(action, result) {
  database.events.push({ date: new Date().toISOString(), action, result });
  database.events = database.events.slice(-40); save();
}
function tell(message, error = false) {
  $('message').textContent = message;
  $('message').classList.toggle('error', error); $('message').hidden = !message;
}
function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch {} }
function session() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (s && database.profile && !database.revoked && s.credentialId === database.profile.credentialId && s.expires > Date.now()) return s;
  } catch {}
  return null;
}
function stopOperation() {
  generation++;
  if (operation) { operation.abort(); operation = null; }
  document.querySelectorAll('[data-busy]').forEach(el => { el.disabled = false; delete el.dataset.busy; });
  $('enroll').disabled = !activation || activation.used;
}
function displayMode() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true ? 'Application installée' : 'Navigation web'; }
function render() {
  $('mode').textContent = displayMode();
  $('back').hidden = view === 'home';
  for (const el of document.querySelectorAll('[data-screen]')) el.hidden = el.dataset.screen !== view;
  const p = database.profile;
  const status = $('profile-status'); status.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = p ? (database.revoked ? 'Profil révoqué dans ce navigateur' : 'Fiche publique prête pour le test') : 'Aucune clé enregistrée dans ce prototype';
  const desc = document.createElement('p');
  desc.textContent = p ? (session() ? 'La session simulée est encore valide.' : 'Vous pouvez tester la connexion avec votre passkey.') : 'Commencez l’activation ou importez une fiche depuis un autre navigateur.';
  status.append(title, desc);
  $('start').hidden = false;
  $('start').textContent = p ? 'Tester une nouvelle activation' : 'Commencer l’activation';
  $('login').textContent = session() ? 'Retrouver la session simulée' : 'Se connecter avec une passkey';
  $('approve').disabled = !!activation;
  $('demo-credentials').hidden = !activation;
  $('demo-username').textContent = activation?.username || '';
  $('demo-password').textContent = activation?.password || '';
  $('replace-notice').hidden = !p;
  $('enroll').disabled = !activation || activation.used || !!operation || !storageOK;
  $('make-transfer').disabled = !p;
  $('copy-transfer').disabled = !$('export-link').value;
  $('session-status').textContent = session() ? `Valide jusqu’à ${new Date(session().expires).toLocaleTimeString('fr-FR')}.` : 'Session expirée ou absente : reconnectez-vous.';
  if (view === 'diagnostic') renderDiagnostic();
}
function go(target, replace = false) {
  if (!screens.has(target)) target = 'home';
  stopOperation();
  if (target === 'session' && !session()) target = 'home';
  if (target === 'ready' && (!database.profile || database.revoked)) target = 'home';
  if (target !== 'activate') clearActivation();
  tell(''); view = target;
  const state = { stockPasskeyPrototype: true, screen: view };
  history[replace ? 'replaceState' : 'pushState'](state, '', '#' + view);
  render();
  document.querySelector(`[data-screen="${view}"] h1`)?.focus({ preventScroll: true });
  scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  stopOperation(); clearActivation(); tell('');
  view = screens.has(history.state?.screen) ? history.state.screen : 'home';
  if (view === 'session' && !session()) view = 'home';
  render();
});
// Native credential UI may temporarily hide a page. Allow it to finish, but never
// commit a result after pagehide/history navigation or an ordinary hidden-page transition.
document.addEventListener('visibilitychange', () => { if (document.hidden && !operation) stopOperation(); });
window.addEventListener('pagehide', () => { stopOperation(); clearActivation(); });
window.addEventListener('pageshow', () => { if (view === 'session' && !session()) go('home', true); else render(); });
window.addEventListener('storage', event => {
  if (event.key === DB_KEY || event.key === null) {
    stopOperation();
    try { database = JSON.parse(localStorage.getItem(DB_KEY)) || { profile: null, revoked: false, events: [] }; } catch { database = { profile: null, revoked: false, events: [] }; }
    if (!database.profile || database.revoked) { clearSession(); go('home', true); } else render();
  }
});
function supported() {
  if (!isSecureContext || !window.PublicKeyCredential || !navigator.credentials || !crypto.subtle) throw new Error('Ce test nécessite HTTPS et un navigateur compatible avec les passkeys. Ouvrez-le dans Chrome ou Safari à jour.');
  if (!storageOK) throw new Error('Le stockage local est bloqué. Autorisez les données du site et rechargez la page.');
}
function begin(button) {
  if (operation) return null;
  supported();
  tell('Confirmez dans la fenêtre du téléphone. Le test peut attendre jusqu’à 90 secondes.');
  const controller = new AbortController(); operation = controller;
  button.disabled = true; button.dataset.busy = 'true';
  return { controller, current: generation, button };
}
function stillCurrent(ctx) { return generation === ctx.current && !ctx.controller.signal.aborted && operation === ctx.controller; }
function finish(ctx) {
  if (operation !== ctx?.controller) return;
  operation = null; ctx.button.disabled = false; delete ctx.button.dataset.busy; render();
}
function fail(action, error, ctx) {
  if (ctx && !stillCurrent(ctx)) return;
  try { record(action, errorMessage(error)); } catch {}
  tell(errorMessage(error), true);
}

$('start').onclick = () => go('activate');
$('back').onclick = () => {
  // Go to the explicit parent; the browser Back button still traverses real entries.
  go('home');
};
document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(button.dataset.go));
$('approve').onclick = () => {
  try {
    supported();
    if (activation) return;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const characters = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => alphabet[b & 31]).join('');
    // Demo only: held in page memory, never persisted/exported. Production validates a password hash on the server.
    activation = { username: 'stock.test', password: characters.match(/.{4}/g).join('-'), expires: Date.now() + 600000, used: false, attempts: 0 };
    record('Approbation', 'Compte fictif approuvé localement. Identifiant et mot de passe temporaires créés.'); render(); $('username').focus();
  } catch (error) { fail('Approbation', error); }
};
$('enroll-form').onsubmit = async event => {
  event.preventDefault(); let ctx;
  try {
    if (operation) return;
    if (!activation || activation.used || activation.expires <= Date.now()) throw new Error('Identifiants temporaires absents, expirés ou déjà utilisés. Revenez à l’accueil pour recommencer.');
    if (activation.attempts >= 5) throw new Error('Cinq essais incorrects. Revenez à l’accueil pour recommencer l’activation simulée.');
    if ($('username').value.trim() !== activation.username || $('password').value !== activation.password) { activation.attempts++; throw new Error('Identifiant ou mot de passe incorrect. Recopiez les identifiants de démonstration affichés, en respectant les majuscules et les tirets.'); }
    ctx = begin($('enroll')); if (!ctx) return;
    const challenge = new Challenge('create'); const userHandle = random();
    // Invoke directly within the submit user gesture, before any async work.
    const credential = await navigator.credentials.create({ signal: ctx.controller.signal, publicKey: {
      challenge: challenge.value, rp: { id: rpId, name: 'Stock — Prototype' },
      user: { id: userHandle, name: activation.username + '-' + encode(userHandle).slice(0, 6), displayName: 'Utilisateur de test — Stock' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 90000, attestation: 'none',
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      extensions: { credProps: true }
    }});
    if (!stillCurrent(ctx)) return;
    if (!credential || credential.type !== 'public-key') throw new Error('Aucune clé créée.');
    const r = credential.response;
    checkClientData(r.clientDataJSON, challenge.consume('create'), 'webauthn.create', origin);
    if (!r.getPublicKey || !r.getAuthenticatorData || r.getPublicKeyAlgorithm() !== -7 || !r.getPublicKey()) throw new Error('La clé a pu être créée, mais ce navigateur ne fournit pas sa clé publique P-256 au prototype. Mettez le navigateur à jour.');
    const authData = bytes(r.getAuthenticatorData());
    const info = await checkAuthenticatorData(authData, rpId);
    if (!(authData[32] & 64) || authData.length < 55) throw new Error('Données de création incomplètes.');
    const idLength = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0);
    if (!same(authData.slice(55, 55 + idLength), bytes(credential.rawId))) throw new Error('Identifiant de clé incohérent.');
    if (credential.getClientExtensionResults().credProps?.rk === false) throw new Error('Le gestionnaire n’a pas créé de clé découvrable.');
    const profile = await validateProfile({ format: 'stock-passkey-public-v1', origin, rpId, credentialId: encode(credential.rawId), userHandle: encode(userHandle), publicKey: encode(r.getPublicKey()) }, origin, rpId);
    if (!stillCurrent(ctx)) return;
    activation.used = true; database.profile = profile; database.revoked = false; clearSession();
    record('Création de passkey', `Réussie (${displayMode()}). Identifiants temporaires consommés. Vérification utilisateur présente. Sauvegarde possible (BE) : ${info.backupEligible ? 'oui' : 'non'} ; sauvegarde déclarée (BS) : ${info.backedUp ? 'oui' : 'non'}.`);
    go('ready', true);
  } catch (error) { fail('Création de passkey', error, ctx); }
  finally { finish(ctx); }
};

$('show-password').onclick = () => {
  const visible = $('password').type === 'password';
  $('password').type = visible ? 'text' : 'password';
  $('show-password').textContent = visible ? 'Masquer' : 'Afficher';
  $('show-password').setAttribute('aria-pressed', String(visible));
};
async function login(button, reuse = false) {
  let ctx;
  try {
    if (reuse && session()) { go('session'); return; }
    if (!database.profile) { go('transfer'); tell('Importez la fiche publique de votre premier essai, ou revenez à l’accueil pour créer une passkey.'); return; }
    if (database.revoked) throw new Error('Profil révoqué localement. Effacez les données du prototype pour recommencer un essai.');
    ctx = begin(button); if (!ctx) return;
    const challenge = new Challenge('get'); const profile = database.profile;
    // Empty allowCredentials exercises discoverable credentials and avoids a username.
    const credential = await navigator.credentials.get({ signal: ctx.controller.signal, publicKey: { challenge: challenge.value, rpId, allowCredentials: [], userVerification: 'required', timeout: 90000 } });
    if (!stillCurrent(ctx)) return;
    const info = await verifyAssertion(credential, profile, challenge.consume('get'), origin, rpId);
    if (!stillCurrent(ctx) || database.profile?.credentialId !== profile.credentialId || database.revoked) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ credentialId: profile.credentialId, expires: Date.now() + 300000 }));
    record('Connexion par passkey', `Signature vérifiée localement (${displayMode()}). Défi, origine, profil et vérification utilisateur corrects. BE=${Number(info.backupEligible)}, BS=${Number(info.backedUp)}.`);
    go('session', true);
  } catch (error) { fail('Connexion par passkey', error, ctx); }
  finally { finish(ctx); }
}
$('login').onclick = () => login($('login'), true);
$('first-login').onclick = () => login($('first-login'));
$('transfer-login').onclick = () => login($('transfer-login'));
$('logout').onclick = () => { clearSession(); record('Session', 'Session simulée fermée.'); go('home', true); };
$('check-session').onclick = () => {
  if (!session()) { clearSession(); go('home', true); tell('La session simulée a expiré. Reconnectez-vous avec votre passkey.'); }
  else { render(); tell('Session locale encore valide. Aucun appel serveur ni accès à HFSQL n’a été effectué.'); }
};
$('revoke').onclick = () => { stopOperation(); database.revoked = true; clearSession(); record('Révocation', 'Profil et session révoqués dans ce stockage seulement.'); go('home', true); tell('Révocation locale effectuée. Les autres navigateurs ne sont pas concernés.'); };

function makeTransfer() {
  if (!database.profile) throw new Error('Créez une clé avant de préparer un transfert.');
  const link = new URL(baseUrl); link.hash = 'fiche=' + encode(new TextEncoder().encode(JSON.stringify(database.profile)));
  $('export-link').value = link.href; render(); return link.href;
}
$('make-transfer').onclick = () => { try { makeTransfer(); tell('Lien prêt. Copiez-le dans l’autre navigateur. Il ne contient que la fiche publique du profil fictif.'); } catch(error) { tell(errorMessage(error), true); } };
$('copy-transfer').onclick = async () => {
  try { await navigator.clipboard.writeText($('export-link').value); tell('Lien de test copié.'); }
  catch { $('export-link').focus(); $('export-link').select(); tell('Copie automatique indisponible. Sélectionnez puis copiez le lien manuellement.'); }
};
function parseTransfer(text) {
  if (text.length > 12000) throw new Error('Fiche trop volumineuse.');
  if (text.trim().startsWith('{')) return JSON.parse(text);
  const url = new URL(text.trim());
  if (url.origin !== origin || url.pathname !== baseUrl.pathname || !url.hash.startsWith('#fiche=')) throw new Error('Utilisez un lien de transfert de ce prototype.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(url.hash.slice(7))));
}
$('import-profile').onclick = async () => {
  let ctx;
  try {
    supported();
    if (operation) return;
    ctx = { controller: new AbortController(), current: generation, button: $('import-profile') }; operation = ctx.controller;
    ctx.button.disabled = true; ctx.button.dataset.busy = 'true';
    const profile = await validateProfile(parseTransfer($('import-data').value), origin, rpId);
    if (!stillCurrent(ctx)) return;
    if (database.revoked && database.profile?.credentialId === profile.credentialId) throw new Error('Ce profil a été révoqué localement. Effacez explicitement les données de test avant un nouvel essai.');
    database.profile = profile; database.revoked = false; clearSession();
    record('Import public', 'Fiche publique chargée. Aucune clé privée transférée.');
    $('import-data').value = ''; tell('Fiche publique chargée. Appuyez maintenant sur « Tester la même passkey ».');
  } catch (error) { fail('Import public', error, ctx); }
  finally { finish(ctx); }
};

function diagnostic() { return {
  version: VERSION, origin, rpId, mode: displayMode(), secure: isSecureContext, webauthn: !!window.PublicKeyCredential,
  authenticator: localAuthenticator, storage: storageOK, profile: !!database.profile, revoked: database.revoked,
  session: !!session(), userAgent: navigator.userAgent, events: database.events,
  limitation: 'Test statique local : aucune sécurité serveur, aucun HFSQL, aucune révocation centralisée. Les clés privées ne sont jamais exportées par ce prototype.'
}; }
function renderDiagnostic() {
  const rows = [['HTTPS / contexte sécurisé', isSecureContext ? 'Oui' : 'Non'], ['API passkeys', window.PublicKeyCredential ? 'Disponible' : 'Absente'], ['Authentificateur local', localAuthenticator], ['Stockage local', storageOK ? 'Disponible' : 'Bloqué'], ['Ouverture', displayMode()], ['Domaine de la clé', rpId], ['Fiche publique', database.profile ? 'Chargée' : 'Absente'], ['Session simulée', session() ? 'Valide' : 'Absente / expirée']];
  $('capabilities').replaceChildren();
  for (const [key, value] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; $('capabilities').append(dt, dd); }
  $('events').replaceChildren();
  const events = database.events.length ? database.events.slice().reverse() : [{ date: new Date().toISOString(), action: 'Prêt', result: 'Aucun essai effectué.' }];
  for (const entry of events) { const li = document.createElement('li'), time = document.createElement('time'), strong = document.createElement('strong'), span = document.createElement('span'); time.dateTime = entry.date; time.textContent = new Date(entry.date).toLocaleString('fr-FR'); strong.textContent = entry.action + ' — '; span.textContent = entry.result; li.append(time, strong, span); $('events').append(li); }
}
$('download-report').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(diagnostic(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'stock-passkeys-compte-rendu.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
};
$('reset').onclick = () => {
  stopOperation(); clearSession(); localStorage.removeItem(DB_KEY); database = { profile: null, revoked: false, events: [] }; activation = null;
  $('export-link').value = ''; $('import-data').value = ''; go('home', true); tell('Données du prototype effacées ici. La passkey reste dans le gestionnaire du téléphone.');
};
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; $('install-button').hidden = false; });
$('install-button').onclick = async () => { if (deferredInstall) { await deferredInstall.prompt(); deferredInstall = null; $('install-button').hidden = true; } };
window.addEventListener('appinstalled', () => { $('install-button').hidden = true; render(); });
$('version').textContent = VERSION; $('domain').textContent = rpId;
const initialFragment = location.hash;
// Remove public transfer data from the address/history immediately, never credentials.
if (initialFragment.startsWith('#fiche=')) {
  $('import-data').value = new URL(initialFragment, baseUrl).href;
  go('transfer', true); tell('Une fiche publique est proposée. Chargez-la pour tester la passkey dans cet environnement.');
} else { go(session() ? 'session' : (screens.has(initialFragment.slice(1)) ? initialFragment.slice(1) : 'home'), true); }
if (!storageOK) tell('Le stockage local est indisponible. Autorisez les données du site pour cet essai.', true);
if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(available => { localAuthenticator = available ? 'Détecté (test réel nécessaire)' : 'Non détecté ; un gestionnaire ou un autre appareil peut fonctionner'; render(); }).catch(() => { localAuthenticator = 'Non déterminé'; render(); });
} else { localAuthenticator = 'Non déterminé'; render(); }
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* Auth remains usable without installation support. */ });
