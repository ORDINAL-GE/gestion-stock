import assert from "node:assert/strict";
import { StockQrError, applyScanToReservation, parseStockQr } from "../qr-stock.js";

for (const [type, ids] of [["Article", [9119, 12979, 361]], ["Client", [244048, 264026]]]) {
  for (const id of ids) {
    for (const separator of ["\r", "\n", "\r\n"]) {
      const rawValue = `${type}${separator}${id}`;
      assert.deepEqual(parseStockQr(rawValue), { type, id, rawValue });
    }
  }
}

let reservation = { article: null, client: null };
reservation = applyScanToReservation(reservation, parseStockQr("Article\r9119"));
assert.equal(reservation.article.id, 9119);
assert.equal(reservation.client, null);
reservation = applyScanToReservation(reservation, parseStockQr("Client\r244048"));
assert.equal(reservation.article.id, 9119);
assert.equal(reservation.client.id, 244048);
reservation = applyScanToReservation(reservation, parseStockQr("Article\r361"));
assert.equal(reservation.article.id, 361);
assert.equal(reservation.client.id, 244048);

assert.throws(() => parseStockQr("Fournisseur\r9119"), (error) => error instanceof StockQrError && error.code === "foreign");
assert.throws(() => parseStockQr("Article\rABC"), (error) => error instanceof StockQrError && error.code === "invalid-id");
assert.throws(() => parseStockQr("Client\r0"), (error) => error instanceof StockQrError && error.code === "invalid-id");
assert.throws(() => parseStockQr(""), (error) => error instanceof StockQrError && error.code === "unreadable");
