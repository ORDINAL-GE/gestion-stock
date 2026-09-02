export class StockQrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StockQrError";
    this.code = code;
  }
}

/** Format WINDEV : type (Article ou Client) + retour chariot + identifiant. */
export function parseStockQr(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new StockQrError("unreadable", "QR code illisible.");
  }

  const lines = rawValue
    .replaceAll("\u0000", "")
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedType = lines[0]?.toLocaleLowerCase("fr");
  const type = normalizedType === "article" ? "Article" : normalizedType === "client" ? "Client" : null;

  if (!type) {
    throw new StockQrError("foreign", "Ce QR code n'est ni un QR Article ni un QR Client.");
  }
  if (!/^\d+$/.test(lines[1] ?? "")) {
    throw new StockQrError("invalid-id", `L'identifiant ${type} est absent ou incorrect.`);
  }

  const id = Number(lines[1]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new StockQrError("invalid-id", `L'identifiant ${type} est incorrect.`);
  }
  return { type, id, rawValue };
}

export function applyScanToReservation(reservation, scan) {
  const next = { article: reservation.article, client: reservation.client };
  next[scan.type.toLocaleLowerCase("fr")] = scan;
  return next;
}
