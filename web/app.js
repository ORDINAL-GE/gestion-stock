import { StockQrError, applyScanToReservation, parseStockQr } from "./qr-stock.js";

const el = Object.fromEntries([
  ["menu", "#menu-screen"], ["reserve", "#reserve-screen"], ["camera", "#camera-screen"],
  ["reserveButton", "#reserve-button"], ["reserveOk", "#reserve-ok-button"], ["scan", "#scan-button"],
  ["articleSlot", "#article-slot"], ["articleValue", "#article-value"],
  ["clientSlot", "#client-slot"], ["clientValue", "#client-value"], ["notice", "#scan-notice"],
  ["reader", "#reader"], ["overlay", "#scan-overlay"], ["fallback", "#camera-fallback"],
  ["cameraMessage", "#camera-message"], ["cameraBack", "#camera-back-button"], ["retry", "#retry-button"],
  ["photo", "#photo-button"], ["cameraPhoto", "#camera-photo-button"], ["photoInput", "#photo-input"],
  ["torch", "#torch-button"], ["status", "#status"]
].map(([key, selector]) => [key, document.querySelector(selector)]));

let reservation = { article: null, client: null };
let scanner;
let scannerRunning = false;
let handlingResult = false;
let torchEnabled = false;

const announce = (message) => { el.status.textContent = message; };

function showScreen(screen) {
  el.menu.hidden = screen !== "menu";
  el.reserve.hidden = screen !== "reserve";
  el.camera.hidden = screen !== "camera";
}

function renderReservation() {
  const fields = [
    ["article", el.articleSlot, el.articleValue, "Article non scanné"],
    ["client", el.clientSlot, el.clientValue, "Client non scanné"]
  ];
  for (const [type, slot, value, emptyText] of fields) {
    const scan = reservation[type];
    slot.classList.toggle("filled", Boolean(scan));
    value.classList.toggle("empty", !scan);
    value.textContent = scan ? `${scan.type} N° ${scan.id}` : emptyText;
  }
}

function showReserve(message = "", isError = false) {
  showScreen("reserve");
  renderReservation();
  el.notice.hidden = !message;
  el.notice.textContent = message;
  el.notice.classList.toggle("error", isError);
  if (message) announce(message);
}

function getScanner() {
  if (!window.Html5Qrcode) throw new Error("Le module de lecture QR n'a pas pu être chargé.");
  scanner ??= new window.Html5Qrcode("reader", {
    formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false
  });
  return scanner;
}

async function stopScanner() {
  if (scanner && scannerRunning) {
    try { await scanner.stop(); } catch { /* La caméra peut déjà être arrêtée. */ }
  }
  scannerRunning = false;
  el.overlay.hidden = true;
  el.torch.hidden = true;
  torchEnabled = false;
  el.torch.setAttribute("aria-pressed", "false");
  el.torch.textContent = "Torche";
}

function qrBoxSize(width, height) {
  const size = Math.floor(Math.min(width, height) * 0.68);
  return { width: size, height: size };
}

async function openCamera() {
  if (scannerRunning) await stopScanner();
  handlingResult = false;
  showScreen("camera");
  el.fallback.hidden = true;
  el.overlay.hidden = false;
  el.cameraPhoto.hidden = false;
  el.reader.setAttribute("aria-hidden", "false");
  announce("Ouverture de la caméra. Scannez un QR Article ou Client.");

  try {
    const qrScanner = getScanner();
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: qrBoxSize, aspectRatio: 3 / 4, disableFlip: false },
      handleDecodedValue,
      () => {}
    );
    scannerRunning = true;
    try { el.torch.hidden = scanner.getRunningTrackCapabilities()?.torch !== true; }
    catch { el.torch.hidden = true; }
  } catch (error) {
    scannerRunning = false;
    el.overlay.hidden = true;
    el.cameraPhoto.hidden = true;
    el.reader.setAttribute("aria-hidden", "true");
    el.fallback.hidden = false;
    const denied = error?.name === "NotAllowedError" || /permission|autorisation/i.test(String(error));
    el.cameraMessage.textContent = denied
      ? "Accès à la caméra refusé. Autorisez-la dans les réglages, ou choisissez une photo."
      : "Impossible d'ouvrir la caméra. Réessayez ou choisissez une photo.";
    announce(el.cameraMessage.textContent);
  }
}

async function handleDecodedValue(decodedText) {
  if (handlingResult) return;
  handlingResult = true;
  await stopScanner();
  try {
    const scan = parseStockQr(decodedText);
    reservation = applyScanToReservation(reservation, scan);
    navigator.vibrate?.(120);
    showReserve(`${scan.type} N° ${scan.id} reconnu.`);
  } catch (error) {
    navigator.vibrate?.([70, 50, 70]);
    const message = error instanceof Error ? error.message : "QR code illisible.";
    showReserve(message, true);
  }
}

async function scanPhoto(file) {
  if (!file) return;
  el.photo.disabled = true;
  el.cameraPhoto.disabled = true;
  announce("Analyse de la photo.");
  try {
    await stopScanner();
    const decodedText = await getScanner().scanFile(file, true);
    await handleDecodedValue(decodedText);
  } catch (error) {
    const message = error instanceof StockQrError
      ? error.message
      : "Aucun QR code lisible n'a été trouvé dans cette photo.";
    showReserve(message, true);
  } finally {
    el.photo.disabled = false;
    el.cameraPhoto.disabled = false;
    el.photoInput.value = "";
  }
}

el.reserveButton.addEventListener("click", () => {
  reservation = { article: null, client: null };
  renderReservation();
  openCamera();
});
el.reserveOk.addEventListener("click", async () => {
  await stopScanner();
  showScreen("menu");
  announce("Menu.");
});
el.scan.addEventListener("click", openCamera);
el.cameraBack.addEventListener("click", async () => {
  await stopScanner();
  showReserve();
});
el.retry.addEventListener("click", openCamera);
el.photo.addEventListener("click", () => el.photoInput.click());
el.cameraPhoto.addEventListener("click", () => el.photoInput.click());
el.photoInput.addEventListener("change", () => scanPhoto(el.photoInput.files?.[0]));
el.torch.addEventListener("click", async () => {
  try {
    torchEnabled = !torchEnabled;
    await scanner.applyVideoConstraints({ advanced: [{ torch: torchEnabled }] });
    el.torch.setAttribute("aria-pressed", String(torchEnabled));
    el.torch.textContent = torchEnabled ? "Torche allumée" : "Torche";
  } catch {
    torchEnabled = false;
    el.torch.hidden = true;
  }
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stopScanner(); });
window.addEventListener("pagehide", stopScanner);

renderReservation();
showScreen("menu");
announce("Menu. La fonction Réserver est disponible.");
