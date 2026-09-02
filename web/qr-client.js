export class ClientQrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ClientQrError";
    this.code = code;
  }
}

/** Format WINDEV : "Client" + retour chariot + IDClient. */
export function parseClientQr(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    throw new ClientQrError("unreadable", "QR code illisible.");
  }
  const lines = rawValue.replaceAll("\u0000", "").split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  if (lines[0]?.toLocaleLowerCase("fr") !== "client") {
    throw new ClientQrError("foreign", "Ce QR code n'est pas un QR Client.");
  }
  if (!/^\d+$/.test(lines[1] ?? "")) {
    throw new ClientQrError("invalid-id", "L'identifiant du client est absent ou incorrect.");
  }
  const id = Number(lines[1]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ClientQrError("invalid-id", "L'identifiant du client est incorrect.");
  }
  return { type: "Client", id, rawValue };
}