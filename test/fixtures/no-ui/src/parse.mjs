/** A pure function. No interface renders it. */
export function parseRange(text) {
  const [low, high] = String(text).split("-").map(Number);
  return { low, high };
}
