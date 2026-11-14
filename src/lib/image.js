// Фото сжимается на телефоне до загрузки: основное до 1400 px и превью до 480 px, jpeg.
const draw = (bmp, max) => {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.82));
};
export async function makeVariants(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bmp = await createImageBitmap(file); }
  const main = await draw(bmp, 1400), thumb = await draw(bmp, 480);
  if (bmp.close) bmp.close();
  return main && thumb ? { main, thumb } : null;
}

// Квадратная аватарка: обрезаем по центру и уменьшаем до size×size, jpeg
export async function squareJpeg(file, size = 512) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { try { bmp = await createImageBitmap(file); } catch { return null; } }
  const s = Math.min(bmp.width, bmp.height), out = Math.min(size, s);
  const c = document.createElement('canvas'); c.width = out; c.height = out;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, out, out);
  if (bmp.close) bmp.close();
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.85));
}
