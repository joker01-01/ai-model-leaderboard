import { useMemo } from "react";

import type { CreatorOption } from "./components/LeaderboardLayout";
import { AA_PUBLIC_SNAPSHOT } from "./data/generated/aaPublicSnapshot";
import { useHashRoute } from "./lib/hashRoute";
import {
  AA_FEATURED_CREATORS,
  buildAaModelPresentationIndex,
} from "./lib/modelPresentation";
import { parseAaPublicSnapshot } from "./lib/aaPublicSnapshot";
import AbilityPage from "./pages/AbilityPage";
import AdvisorPage from "./pages/AdvisorPage";
import EfficiencyPage from "./pages/EfficiencyPage";
import HomePage from "./pages/HomePage";

const PUBLIC_SNAPSHOT = parseAaPublicSnapshot(AA_PUBLIC_SNAPSHOT);
const PRESENTATIONS = buildAaModelPresentationIndex(PUBLIC_SNAPSHOT.models);
const DISPLAY_NAMES = new Map(
  Array.from(PRESENTATIONS, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
);
const PRIMARY_CREATORS: readonly CreatorOption[] = Object.freeze(
  AA_FEATURED_CREATORS.map((creator) => Object.freeze({ id: creator.creatorId, name: creator.label })),
);

export default function App() {
  const route = useHashRoute();
  const sharedProps = useMemo(() => ({
    snapshot: PUBLIC_SNAPSHOT,
    presentations: PRESENTATIONS,
    displayNames: DISPLAY_NAMES,
  }), []);

  return (
    <div className="public-app">
      {route.page === "home" && (
        <HomePage snapshot={PUBLIC_SNAPSHOT} displayNames={DISPLAY_NAMES} />
      )}
      {route.page === "ability" && (
        <AbilityPage
          {...sharedProps}
          metric={route.metric}
          primaryCreators={PRIMARY_CREATORS}
        />
      )}
      {route.page === "efficiency" && (
        <EfficiencyPage
          {...sharedProps}
          metric={route.metric}
          primaryCreators={PRIMARY_CREATORS}
        />
      )}
      {route.page === "advisor" && <AdvisorPage />}
    </div>
  );
}
