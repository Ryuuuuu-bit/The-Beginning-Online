function stamp(image: HTMLImageElement) {
 const canvas = document.createElement('canvas'), ratio = 512 / Math.max(image.width, image.height);
 canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
 const c = canvas.getContext('2d')!;
 c.imageSmoothingQuality = 'high'; c.drawImage(image, 0, 0, canvas.width, canvas.height);
 return canvas;
}

/** Cache both art layers and contact light once; no live blur or texture rebuilding. */
export function prepareWarpPortal(column: HTMLImageElement, floor: HTMLImageElement) {
 const contact = document.createElement('canvas'); contact.width = 128; contact.height = 64;
 const ground = contact.getContext('2d')!;
 for (const [x, color] of [[32, '#102b3860'], [96, '#67d9ff38']] as const) {
  const fade = ground.createRadialGradient(x, 32, 2, x, 32, 32);
  fade.addColorStop(0, color); fade.addColorStop(1, '#00000000');
  ground.fillStyle = fade; ground.fillRect(x - 32, 0, 64, 64);
 }
 return { column: stamp(column), floor: stamp(floor), contact };
}

export function drawWarpPortal(c: CanvasRenderingContext2D, art: ReturnType<typeof prepareWarpPortal>, x: number, y: number, scale: number, time: number, reducedMotion: boolean, high: boolean, layer: 'ground' | 'light') {
 const clock = reducedMotion ? 0 : time, width = 5.4 * scale;
 c.save();
 if (layer === 'ground') {
  c.globalAlpha = .65;
  c.drawImage(art.contact, 0, 0, 64, 64, x - width * .5, y - width * .355, width, width * .71);
  c.globalAlpha = .55;
  c.drawImage(art.contact, 64, 0, 64, 64, x - width * .6, y - width * .426, width * 1.2, width * .852);
  // A face-on seal projected onto the same ground plane as movement and gate collision.
  c.globalAlpha = .60; c.translate(x, y); c.scale(1, Math.SQRT1_2); c.rotate(clock * .04);
  c.drawImage(art.floor, -width / 2, -width / 2, width, width);
 } else {
  const height = 5.2 * scale, columnWidth = height * art.column.width / art.column.height;
  c.globalAlpha = .68 + Math.sin(clock * 1.4) * .03;
  c.drawImage(art.column, x - columnWidth / 2, y - height * .96, columnWidth, height);
  c.fillStyle = high ? '#ffe6b5' : '#e5f8ff';
  for (let i = 0; i < 8; i++) {
   const rise = (clock * .16 + i / 8) % 1, offset = Math.sin(i * 2.4 + clock * .45) * 1.3;
   c.globalAlpha = Math.sin(rise * Math.PI) * .48;
   const px = x + offset * scale, py = y - rise * 4.2 * scale, size = Math.max(1, scale * .035);
   c.fillRect(px - size * 2, py, size * 5, size);
   c.fillRect(px, py - size * 2, size, size * 5);
  }
 }
 c.restore();
}
