import assert from "node:assert/strict";
import { ClientQrError, parseClientQr } from "../qr-client.js";
for (const raw of ["Client\r244048", "Client\n244048", "Client\r\n244048"]) {
  assert.deepEqual(parseClientQr(raw), { type: "Client", id: 244048, rawValue: raw });
}
assert.throws(() => parseClientQr("Article\r244048"), (e) => e instanceof ClientQrError && e.code === "foreign");
assert.throws(() => parseClientQr("Client\rABC"), (e) => e instanceof ClientQrError && e.code === "invalid-id");
assert.throws(() => parseClientQr(""), (e) => e instanceof ClientQrError && e.code === "unreadable");