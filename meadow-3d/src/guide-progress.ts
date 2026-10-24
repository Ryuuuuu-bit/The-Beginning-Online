/** Guide preferences are cosmetic; malformed browser storage must never block play. */
export function readGuideProgress(raw: string | null, count: number) {
 try {
  const value = JSON.parse(raw ?? 'null');
  if (!value || typeof value !== 'object') return null;
  return {step: Number.isInteger(value.step) ? Math.max(0, Math.min(count, value.step)) : 0,
   off: value.off === true, min: value.min === true};
 } catch { return null; }
}
