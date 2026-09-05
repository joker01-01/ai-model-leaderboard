import type { AaPublicModel } from "../lib/aaPublicSnapshot";
import CreatorIcon from "./CreatorIcon";

interface ModelIdentityProps {
  readonly model: AaPublicModel;
  readonly displayName: string;
}

export default function ModelIdentity({ model, displayName }: ModelIdentityProps) {
  return (
    <span className="model-identity" data-source-id={model.sourceId}>
      <span className="model-identity__name" title={displayName}>{displayName}</span>
      <CreatorIcon creatorId={model.creatorId} creatorName={model.creatorName} />
    </span>
  );
}
