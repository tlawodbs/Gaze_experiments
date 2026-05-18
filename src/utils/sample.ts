// Reservoir-free sampling without replacement. Uses Math.random (no fixed seed).
export function sampleWithoutReplacement<T>(items: T[], n: number): T[] {
  const arr = items.slice();
  const take = Math.min(n, arr.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, take);
}
