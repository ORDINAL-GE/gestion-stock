// Browser-only feasibility harness. These checks are NOT a server trust boundary.
export const VERSION = '20260909-3';
export const bytes = value => value instanceof Uint8Array ? value : new Uint8Array(value);
export function encode(value) {
  return btoa(String.fromCharCode(...bytes(value))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8192 || value.length % 4 === 1) throw new Error('Données publiques invalides.');
  const result = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (encode(result) !== value) throw new Error('Encodage non canonique.');
  return result;
}
export const random = () => crypto.getRandomValues(new Uint8Array(32));
export const hash = value => crypto.subtle.digest('SHA-256', value).then(bytes);
export function join(a, b) { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; }
export function same(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

// WebAuthn ES256 uses DER; WebCrypto verify uses fixed-width IEEE P1363.
export function derToRaw(value) {
  const d = bytes(value);
  if (d.length < 8 || d.length > 72 || d[0] !== 0x30 || d[1] !== d.length - 2) throw new Error('Signature DER invalide.');
  let pos = 2;
  const parts = [];
  for (let i = 0; i < 2; i++) {
    if (d[pos++] !== 2) throw new Error('Entier DER attendu.');
    const len = d[pos++];
    if (!len || len > 33 || pos + len > d.length) throw new Error('Taille DER invalide.');
    let part = d.slice(pos, pos + len); pos += len;
    if (part[0] & 0x80) throw new Error('Entier DER négatif.');
    if (part.length > 1 && part[0] === 0) {
      if (!(part[1] & 0x80)) throw new Error('Entier DER non minimal.');
      part = part.slice(1);
    }
    if (part.length > 32) throw new Error('Signature hors P-256.');
    const padded = new Uint8Array(32); padded.set(part, 32 - part.length); parts.push(padded);
  }
  if (pos !== d.length) throw new Error('Octets DER supplémentaires.');
  return join(...parts);
}

export function checkClientData(value, challenge, type, origin) {
  const client = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value));
  if (client.type !== type || client.challenge !== encode(challenge) || client.origin !== origin || client.crossOrigin === true) {
    throw new Error('Le défi ou l’origine ne correspond pas à cette opération.');
  }
}
export async function checkAuthenticatorData(value, rpId) {
  const data = bytes(value);
  if (data.length < 37) throw new Error('Réponse du téléphone incomplète.');
  if (!same(data.slice(0, 32), await hash(new TextEncoder().encode(rpId)))) throw new Error('Domaine de la clé incorrect.');
  if (!(data[32] & 1) || !(data[32] & 4)) throw new Error('La présence et la vérification de l’utilisateur sont requises.');
  if ((data[32] & 16) && !(data[32] & 8)) throw new Error('Indicateurs de sauvegarde incohérents.');
  return { counter: new DataView(data.buffer, data.byteOffset + 33, 4).getUint32(0), backupEligible: !!(data[32] & 8), backedUp: !!(data[32] & 16) };
}
export async function validateProfile(input, origin, rpId) {
  if (!input || input.format !== 'stock-passkey-public-v1' || input.origin !== origin || input.rpId !== rpId) throw new Error('Cette fiche ne correspond pas à l’adresse de ce prototype.');
  const id = decode(input.credentialId), user = decode(input.userHandle), pub = decode(input.publicKey);
  if (id.length < 1 || id.length > 1023 || user.length !== 32 || pub.length > 256) throw new Error('Dimensions de la fiche invalides.');
  await crypto.subtle.importKey('spki', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return { format: input.format, origin, rpId, credentialId: encode(id), userHandle: encode(user), publicKey: encode(pub) };
}
export async function verifyAssertion(credential, profile, challenge, origin, rpId) {
  if (!credential || credential.type !== 'public-key' || encode(credential.rawId) !== profile.credentialId) throw new Error('La clé choisie ne correspond pas à la fiche publique chargée.');
  const r = credential.response;
  checkClientData(r.clientDataJSON, challenge, 'webauthn.get', origin);
  if (!r.userHandle || encode(r.userHandle) !== profile.userHandle) throw new Error('Le profil renvoyé par la clé ne correspond pas.');
  const info = await checkAuthenticatorData(r.authenticatorData, rpId);
  const key = await crypto.subtle.importKey('spki', decode(profile.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const message = join(bytes(r.authenticatorData), await hash(r.clientDataJSON));
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(r.signature), message)) throw new Error('La signature ne correspond pas à la clé publique.');
  return info;
}
export class Challenge {
  constructor(type, now = Date.now()) { this.value = random(); this.type = type; this.expires = now + 90000; this.used = false; }
  consume(type, now = Date.now()) {
    if (this.used || this.type !== type || now >= this.expires) throw new Error('Défi expiré ou déjà utilisé. Relancez le test.');
    this.used = true; return this.value;
  }
}
export function errorMessage(error) {
  const messages = {
    NotAllowedError: 'Confirmation annulée, délai dépassé ou aucune clé disponible. Vérifiez le verrouillage et le gestionnaire de clés du téléphone, puis réessayez.',
    InvalidStateError: 'Cette clé existe déjà. Revenez à l’accueil pour vous connecter.',
    NotSupportedError: 'Ce téléphone ou gestionnaire ne prend pas en charge la clé P-256 découvrable demandée. Essayez un navigateur à jour.',
    SecurityError: 'Le navigateur refuse cette origine. Ouvrez le lien HTTPS directement dans Chrome ou Safari.',
    AbortError: 'Opération interrompue. Vous pouvez relancer le test.',
    ConstraintError: 'Le gestionnaire choisi ne peut pas créer cette clé avec vérification utilisateur obligatoire.'
  };
  return messages[error?.name] || error?.message || 'Le test a échoué. Consultez le diagnostic.';
}
