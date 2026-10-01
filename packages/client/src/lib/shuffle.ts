// Fisher–Yates: all equally probabilistic permutations (sort(() => Math.random() - 0.5) are not —
// The first song on the list is often kept near the top).
export function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
