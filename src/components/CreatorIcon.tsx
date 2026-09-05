interface CreatorIconProps {
  readonly creatorId: string | null;
  readonly creatorName: string | null;
}

function creatorInitial(creatorName: string | null): string {
  const normalizedName = creatorName?.trim();
  if (!normalizedName) return "?";
  const firstCharacter = Array.from(normalizedName)[0] ?? "?";
  return Array.from(firstCharacter.toLocaleUpperCase("en-US"))[0] ?? "?";
}

export default function CreatorIcon({ creatorId, creatorName }: CreatorIconProps) {
  const accessibleName = creatorName?.trim() || "未知开发者";

  return (
    <span
      className="creator-icon"
      data-creator-id={creatorId ?? undefined}
      role="img"
      aria-label={`${accessibleName} 标志`}
    >
      <span aria-hidden="true">{creatorInitial(creatorName)}</span>
    </span>
  );
}
