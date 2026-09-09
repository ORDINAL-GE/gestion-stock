import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, random, hash, join, derToRaw, Challenge, validateProfile, verifyAssertion, checkClientData, checkAuthenticatorData } from '../../web/passkeys/crypto.js';
const origin = 'https://example.test', rpId = 'example.test';
function rawToDer(raw) {
  const parts = [raw.slice(0, 32), raw.slice(32)].map(value => {
    let p = value; while (p.length > 1 && p[0] === 0) p = p.slice(1);
    if (p[0] & 128) p = join(new Uint8Array([0]), p);
    return join(new Uint8Array([2, p.length]), p);
  });
  const inner = join(...parts); return join(new Uint8Array([48, inner.length]), inner);
}
async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const challenge = random(), id = random(), handle = random();
  const profile = { format: 'stock-passkey-public-v1', origin, rpId, credentialId: encode(id), userHandle: encode(handle), publicKey: encode(await crypto.subtle.exportKey('spki', pair.publicKey)) };
  const auth = new Uint8Array(37); auth.set(await hash(new TextEncoder().encode(rpId))); auth[32] = 5;
  const client = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: encode(challenge), origin, crossOrigin: false }));
  const rawSig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, join(auth, await hash(client))));
  const credential = { type: 'public-key', rawId: id, response: { userHandle: handle, clientDataJSON: client, authenticatorData: auth, signature: rawToDer(rawSig) } };
  return { credential, profile, challenge };
}
test('base64url round-trip rejects invalid and noncanonical encodings', () => {
  const a = random(); assert.deepEqual(decode(encode(a)), a);
  for (const s of ['a', 'a=', '++==', 'AB']) assert.throws(() => decode(s));
});
test('DER round-trip and malformed encodings', () => {
  for (let i = 0; i < 20; i++) { const a = crypto.getRandomValues(new Uint8Array(64)); assert.deepEqual(derToRaw(rawToDer(a)), a); }
  for (const a of [[], [48, 6, 2, 1, 128, 2, 1, 1], [48, 7, 2, 2, 0, 1, 2, 1, 1]]) assert.throws(() => derToRaw(a));
});
test('challenge cannot be reused, confused across ceremonies or expired', () => {
  const c = new Challenge('get', 100); c.consume('get', 200); assert.throws(() => c.consume('get', 300));
  assert.throws(() => new Challenge('get', 0).consume('create', 1));
  assert.throws(() => new Challenge('get', 0).consume('get', 90000));
});
test('valid assertion is cryptographically verified', async () => {
  const f = await fixture(); assert.deepEqual(await validateProfile(f.profile, origin, rpId), f.profile);
  assert.equal((await verifyAssertion(f.credential, f.profile, f.challenge, origin, rpId)).counter, 0);
});
test('wrong challenge, origin, RP, credential ID and user handle rejected', async () => {
  const f = await fixture();
  await assert.rejects(() => verifyAssertion(f.credential, f.profile, random(), origin, rpId));
  await assert.rejects(() => verifyAssertion(f.credential, f.profile, f.challenge, 'https://other.test', rpId));
  await assert.rejects(() => verifyAssertion(f.credential, f.profile, f.challenge, origin, 'other.test'));
  await assert.rejects(() => verifyAssertion({ ...f.credential, rawId: random() }, f.profile, f.challenge, origin, rpId));
  await assert.rejects(() => verifyAssertion({ ...f.credential, response: { ...f.credential.response, userHandle: random() } }, f.profile, f.challenge, origin, rpId));
  await assert.rejects(() => verifyAssertion({ ...f.credential, response: { ...f.credential.response, userHandle: null } }, f.profile, f.challenge, origin, rpId));
});
test('missing user presence/verification and altered signature rejected', async () => {
  for (const flags of [0, 1, 4, 21]) {
    const f = await fixture(); f.credential.response.authenticatorData[32] = flags;
    await assert.rejects(() => verifyAssertion(f.credential, f.profile, f.challenge, origin, rpId));
  }
  const f = await fixture(); const sig = f.credential.response.signature; sig[sig.length - 1] ^= 1;
  await assert.rejects(() => verifyAssertion(f.credential, f.profile, f.challenge, origin, rpId));
});
test('public import is origin-bound and discards arbitrary fields', async () => {
  const f = await fixture();
  assert.deepEqual(await validateProfile({ ...f.profile, admin: true, privateKey: 'never' }, origin, rpId), f.profile);
  await assert.rejects(() => validateProfile({ ...f.profile, origin: 'https://other.test' }, origin, rpId));
  await assert.rejects(() => validateProfile({ ...f.profile, publicKey: encode(random()) }, origin, rpId));
});
test('cross-origin assertion and truncated authenticator data rejected', async () => {
  const c = random();
  assert.throws(() => checkClientData(new TextEncoder().encode(JSON.stringify({ type:'webauthn.get', challenge:encode(c), origin, crossOrigin:true })), c, 'webauthn.get', origin));
  await assert.rejects(() => checkAuthenticatorData(new Uint8Array(36), rpId));
});
