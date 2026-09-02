export class ArticleQrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ArticleQrError";
    this.code = code;
  }
}

/** Format WINDEV : "Article" + retour chariot + IDArticle. */
export function parseArticleQr(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new ArticleQrError("unreadable", "QR code illisible.");
  }
  const lines = rawValue.replaceAll("\u0000", "").split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  if (lines[0]?.toLocaleLowerCase("fr") !== "article") {
    throw new ArticleQrError("foreign", "Ce QR code n'est pas un QR Article.");
  }
  if (!/^\d+$/.test(lines[1] ?? "")) {
    throw new ArticleQrError("invalid-id", "L'identifiant de l'article est absent ou incorrect.");
  }
  const id = Number(lines[1]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ArticleQrError("invalid-id", "L'identifiant de l'article est incorrect.");
  }
  return { type: "Article", id, rawValue };
}
