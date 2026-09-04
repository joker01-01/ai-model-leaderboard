export const AA_LEADERBOARD_LIMIT = 20;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value) {
    throw new Error(`${path} must be a non-empty trimmed string`);
  }
  return value;
}

function nullableString(value, path) {
  if (value === null || value === undefined) return null;
  return requiredString(value, path);
}

function releaseDate(value, path) {
  if (value === null) return null;
  const date = requiredString(value, path);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(parsed.valueOf())
    || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${path} must be an ISO date or null`);
  }
  return date;
}

function requiredDate(value, path) {
  const date = releaseDate(value, path);
  if (date === null) throw new Error(`${path} must be an ISO date`);
  return date;
}

/**
 * Builds the source-driven public leaderboard without projecting AA rows into
 * the curated model catalog. Distinct AA source IDs remain distinct entries,
 * including reasoning or effort configurations from the same model family.
 */
export function buildAaLeaderboard(rows, observedAt, limit = AA_LEADERBOARD_LIMIT) {
  if (!Array.isArray(rows)) throw new Error("AA rows must be an array");
  requiredDate(observedAt, "AA leaderboard observedAt");
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("AA leaderboard limit must be a positive integer");

  const entries = [];
  const sourceIds = new Set();

  for (const [index, row] of rows.entries()) {
    const intelligence = row?.evaluations?.artificial_analysis_intelligence_index;
    if (intelligence === null || intelligence === undefined) continue;
    if (typeof intelligence !== "number" || !Number.isFinite(intelligence)) {
      throw new Error(`AA row ${index}.evaluations.artificial_analysis_intelligence_index must be finite or null`);
    }

    const path = `AA row ${index}`;
    const sourceId = requiredString(row.id, `${path}.id`);
    if (sourceIds.has(sourceId)) throw new Error(`AA leaderboard contains duplicate source ID ${JSON.stringify(sourceId)}`);
    sourceIds.add(sourceId);

    entries.push({
      sourceId,
      sourceSlug: requiredString(row.slug, `${path}.slug`),
      modelVersion: requiredString(row.name, `${path}.name`),
      creatorId: nullableString(row.model_creator?.id, `${path}.model_creator.id`),
      creatorName: nullableString(row.model_creator?.name, `${path}.model_creator.name`),
      releaseDate: releaseDate(row.release_date ?? null, `${path}.release_date`),
      value: intelligence,
      observedAt,
    });
  }

  if (entries.length < limit) {
    throw new Error(`AA returned only ${entries.length} ranked models; ${limit} are required`);
  }

  return entries
    .sort((left, right) => (
      right.value - left.value
      || compareStrings(left.modelVersion, right.modelVersion)
      || compareStrings(left.sourceId, right.sourceId)
    ))
    .slice(0, limit);
}
