function stamp(image: HTMLImageElement) {
 const canvas = document.createElement('canvas'), ratio = 512 / Math.max(image.width, image.height);
 canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
 const c = canvas.getContext('2d')!;
 c.imageSmoothingQuality = 'high'; c.drawImage(image, 0, 0, canvas.width, canvas.height);
 return canvas;
}

/** Cache floor art and contact light once; no live blur or texture rebuilding. */
export function prepareWarpPortal(floor: HTMLImageElement) {
 const contact = document.createElement('canvas'); contact.width = 128; contact.height = 64;
 const ground = contact.getContext('2d')!;
 for (const [x, color] of [[32, '#102b3860'], [96, '#67d9ff38']] as const) {
  const fade = ground.createRadialGradient(x, 32, 2, x, 32, 32);
  fade.addColorStop(0, color); fade.addColorStop(1, '#00000000');
  ground.fillStyle = fade; ground.fillRect(x - 32, 0, 64, 64);
 }
 return { floor: stamp(floor), contact };
}

export function drawWarpPortal(c: CanvasRenderingContext2D, art: ReturnType<typeof prepareWarpPortal>, x: number, y: number, scale: number, time: number, reducedMotion: boolean, high: boolean, layer: 'ground' | 'light') {
 const clock = reducedMotion ? 0 : time, width = 4.8 * scale;
 const pulse = .5 + .5 * Math.sin(time * (reducedMotion ? .6 : 1.8));
 c.save();
 if (layer === 'ground') {
  c.globalCompositeOperation='screen';c.globalAlpha=.42+pulse*.1;
  c.drawImage(art.contact, 64, 0, 64, 64, x - width * .65, y - width * .32, width * 1.3, width * .64);
  // A face-on seal projected onto the same ground plane as movement and gate collision.
  c.globalAlpha = .48; c.translate(x, y); c.scale(1, Math.SQRT1_2); c.rotate(clock * .65);
  c.drawImage(art.floor, -width / 2, -width / 2, width, width);
  c.strokeStyle=high?'#ffdaa2':'#b7f4ed';c.fillStyle=high?'#fff0c9':'#edffff';
  // Unequal trails and bright heads make motion legible over the repeating rune art.
  for(let i=0;i<3;i++){
   const a=i*2.1-clock*1.8,r=width*(.43+i*.035);
   c.lineWidth=Math.max(2,scale*.08);c.globalAlpha=.8;
   c.beginPath();c.arc(0,0,r,a,a+.45+i*.2);c.stroke();
   c.globalAlpha=1;c.beginPath();c.arc(Math.cos(a)*r,Math.sin(a)*r,Math.max(2.5,scale*.1),0,Math.PI*2);c.fill();
  }
  c.lineWidth=Math.max(1,scale*.018);c.globalAlpha=.35;c.beginPath();c.arc(0,0,width*.52,0,Math.PI*2);c.stroke();
 } else {
  // Low wisps leave the destination and approaching player unobscured.
  c.globalCompositeOperation='screen';
  c.fillStyle = high ? '#ffe6b5' : '#e5f8ff';
  for (let i = 0; i < (reducedMotion?4:10); i++) {
   const rise = (clock * .4 + i / 10) % 1, angle=i*2.4+clock*.8;
   c.globalAlpha = Math.sin(rise * Math.PI) * (.4+pulse*.2);
   const px = x + Math.cos(angle)*1.5*scale, py = y+Math.sin(angle)*.55*scale-rise*1.3*scale, size = Math.max(1.5, scale * .055);
   c.beginPath();c.ellipse(px,py,size,size*2,0,0,Math.PI*2);c.fill();
  }
 }
 c.restore();
}
