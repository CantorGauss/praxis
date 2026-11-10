// Conversion d'un portrait en PNG, pour y glisser une carte de personnage.
// Les portraits intégrés sont des JPEG, les images importées peuvent être
// n'importe quel format reconnu : une carte, elle, est toujours un PNG.
// Dépend du DOM (canvas) : réservé à l'interface.

import { isPng } from "./characterCard";

/** Côté le plus long d'une carte exportée : assez pour un portrait, pas plus. */
const MAX_CARD_SIZE = 1024;

function mimeOf(bytes: Uint8Array): string {
  if (isPng(bytes)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  return "image/webp";
}

/** URL data: d'une image. La CSP autorise data: pour les images, pas blob:. */
export function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return `data:${mimeOf(bytes)};base64,${btoa(binary)}`;
}

/** Charge une image (URL de même origine ou data:) et la réencode en PNG. */
export async function imageToPng(src: string): Promise<Uint8Array> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(
    1,
    MAX_CARD_SIZE / Math.max(img.naturalWidth, img.naturalHeight, 1),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("PNG encoding failed.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** PNG prêt à recevoir une carte : tel quel s'il en est déjà un, réencodé sinon. */
export async function asPng(bytes: Uint8Array): Promise<Uint8Array> {
  return isPng(bytes) ? bytes : imageToPng(bytesToDataUrl(bytes));
}
