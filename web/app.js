import { ArticleQrError, parseArticleQr } from "./qr-article.js";
const el = Object.fromEntries([["cameraPanel","#camera-panel"],["reader","#reader"],["idle","#idle-state"],["overlay","#scan-overlay"],["result","#result-panel"],["resultIcon","#result-icon"],["resultEyebrow","#result-eyebrow"],["articleId","#article-id"],["resultMessage","#result-message"],["articleDetails","#article-details"],["start","#start-button"],["photo","#photo-button"],["photoInput","#photo-input"],["scanAgain","#scan-again-button"],["close","#close-button"],["torch","#torch-button"],["status","#status"]].map(([key,selector])=>[key,document.querySelector(selector)]));
let scanner, scannerRunning=false, handlingResult=false, torchEnabled=false;
const announce=(message)=>{el.status.textContent=message;};
function getScanner(){
  if(!window.Html5Qrcode) throw new Error("Le module de lecture QR n'a pas pu être chargé.");
  scanner??=new window.Html5Qrcode("reader",{formatsToSupport:[window.Html5QrcodeSupportedFormats.QR_CODE],verbose:false});
  return scanner;
}
async function stopScanner(){
  if(!scanner||!scannerRunning)return;
  try{await scanner.stop();}catch{/* Caméra peut-être déjà arrêtée. */}
  scannerRunning=false;el.overlay.hidden=true;el.torch.hidden=true;torchEnabled=false;el.torch.setAttribute("aria-pressed","false");
}
function qrBoxSize(width,height){const size=Math.floor(Math.min(width,height)*.68);return{width:size,height:size};}
async function startScanner(){
  handlingResult=false;el.start.disabled=true;announce("Ouverture de la caméra.");
  try{
    const qrScanner=getScanner();el.idle.hidden=true;el.overlay.hidden=false;el.reader.setAttribute("aria-hidden","false");
    await qrScanner.start({facingMode:"environment"},{fps:10,qrbox:qrBoxSize,aspectRatio:3/4,disableFlip:false},handleDecodedValue,()=>{});
    scannerRunning=true;announce("Caméra ouverte. Placez le QR Article dans le cadre.");
    try{el.torch.hidden=scanner.getRunningTrackCapabilities()?.torch!==true;}catch{el.torch.hidden=true;}
  }catch(error){
    scannerRunning=false;el.idle.hidden=false;el.overlay.hidden=true;el.reader.setAttribute("aria-hidden","true");
    const denied=error?.name==="NotAllowedError"||/permission|autorisation/i.test(String(error));
    const message=denied?"Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur, ou choisissez une photo.":"Impossible d'ouvrir la caméra. Vérifiez que la page utilise HTTPS, ou choisissez une photo.";
    el.idle.querySelector("p").textContent=message;announce(message);
  }finally{el.start.disabled=false;}
}
async function handleDecodedValue(decodedText){
  if(handlingResult)return;handlingResult=true;await stopScanner();
  try{const articleQr=parseArticleQr(decodedText);navigator.vibrate?.(120);await showArticleResult(articleQr);}
  catch(error){navigator.vibrate?.([70,50,70]);showErrorResult(error,decodedText);}
}
async function lookupArticle(id){
  const template=window.STOCK_CONFIG?.articleLookupUrl;if(!template)return null;
  const response=await fetch(template.replace("{id}",encodeURIComponent(String(id))),{headers:{Accept:"application/json"}});
  if(response.status===404)throw new ArticleQrError("not-found","Cet article n'est plus en stock.");
  if(!response.ok)throw new Error("Le service Article est momentanément indisponible.");
  return response.json();
}
async function showArticleResult(articleQr){
  el.cameraPanel.hidden=true;el.result.hidden=false;el.resultIcon.classList.remove("error");el.resultIcon.textContent="✓";el.resultEyebrow.textContent="QR Article reconnu";el.articleId.textContent=`Article N° ${articleQr.id}`;el.resultMessage.textContent="Le type et l'identifiant du QR ont été lus avec succès.";el.articleDetails.hidden=true;el.articleDetails.replaceChildren();announce(`QR Article ${articleQr.id} reconnu.`);
  try{const article=await lookupArticle(articleQr.id);if(article)renderArticleDetails(article);}catch(error){showErrorResult(error);}
}
function renderArticleDetails(article){
  const fields=[["Matière",article.matiere??article.matière],["Finition",article.finition],["Dimensions",article.dimensions],["Fournisseur",article.fournisseur],["Facture",article.facture]].filter(([,value])=>value!==undefined&&value!==null&&value!=="");
  if(!fields.length)return;const fragment=document.createDocumentFragment();
  for(const[label,value]of fields){const row=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=String(value);row.append(dt,dd);fragment.append(row);}
  el.articleDetails.append(fragment);el.articleDetails.hidden=false;el.resultMessage.textContent="Article retrouvé dans le stock.";
}
function showErrorResult(error,rawValue=""){
  const message=error instanceof Error?error.message:"QR code illisible.";el.cameraPanel.hidden=true;el.result.hidden=false;el.resultIcon.classList.add("error");el.resultIcon.textContent="!";el.resultEyebrow.textContent="Lecture refusée";el.articleId.textContent="QR non valide";el.resultMessage.textContent=rawValue?`${message}\n\nContenu lu : ${JSON.stringify(rawValue)}`:message;el.articleDetails.hidden=true;el.articleDetails.replaceChildren();announce(message);
}
async function scanPhoto(file){
  if(!file)return;el.photo.disabled=true;announce("Analyse de la photo.");
  try{await stopScanner();await handleDecodedValue(await getScanner().scanFile(file,true));}
  catch(error){showErrorResult(error instanceof ArticleQrError?error:new ArticleQrError("unreadable","Aucun QR code lisible n'a été trouvé dans cette photo."));}
  finally{el.photo.disabled=false;el.photoInput.value="";}
}
async function resetScanner(){await stopScanner();handlingResult=false;el.result.hidden=true;el.cameraPanel.hidden=false;el.idle.hidden=false;el.reader.setAttribute("aria-hidden","true");announce("Prêt à scanner un QR Article.");}
el.start.addEventListener("click",startScanner);el.photo.addEventListener("click",()=>el.photoInput.click());el.photoInput.addEventListener("change",()=>scanPhoto(el.photoInput.files?.[0]));el.scanAgain.addEventListener("click",resetScanner);
el.close.addEventListener("click",async()=>{await stopScanner();history.length>1?history.back():resetScanner();});
el.torch.addEventListener("click",async()=>{try{torchEnabled=!torchEnabled;await scanner.applyVideoConstraints({advanced:[{torch:torchEnabled}]});el.torch.setAttribute("aria-pressed",String(torchEnabled));el.torch.textContent=torchEnabled?"Torche allumée":"Torche";}catch{torchEnabled=false;el.torch.hidden=true;}});
document.addEventListener("visibilitychange",()=>{if(document.hidden)stopScanner();});window.addEventListener("pagehide",stopScanner);announce("Prêt à scanner un QR Article.");
