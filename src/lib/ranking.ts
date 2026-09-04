/** Competition ranking for values already ordered from best to worst: 1, 1, 3. */
export function competitionRanks(values: readonly number[]): number[] {
  let currentRank = 0;
  return values.map((value, index) => {
    if (index === 0 || value !== values[index - 1]) currentRank = index + 1;
    return currentRank;
  });
}
