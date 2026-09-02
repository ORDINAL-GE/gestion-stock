import assert from "node:assert/strict";
import { ArticleQrError, parseArticleQr } from "../qr-article.js";

for (const id of [9119, 12979, 361]) {
  for (const separator of ["\r", "\n", "\r\n"]) {
    const rawValue = `Article${separator}${id}`;
    assert.deepEqual(parseArticleQr(rawValue), { type: "Article", id, rawValue });
  }
}

assert.throws(() => parseArticleQr("Client\r9119"), (error) => error instanceof ArticleQrError && error.code === "foreign");
assert.throws(() => parseArticleQr("Article\rABC"), (error) => error instanceof ArticleQrError && error.code === "invalid-id");
assert.throws(() => parseArticleQr("Article\r0"), (error) => error instanceof ArticleQrError && error.code === "invalid-id");
assert.throws(() => parseArticleQr(""), (error) => error instanceof ArticleQrError && error.code === "unreadable");
