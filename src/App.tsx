import { useEffect, useMemo, useState } from "react";

import type { CreatorOption } from "./components/LeaderboardLayout";
import { AA_PUBLIC_SNAPSHOT } from "./data/generated/aaPublicSnapshot";
import { normalizeAdvisorApiOrigin } from "./features/advisor/api";
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
const ADVISOR_API_ORIGIN = normalizeAdvisorApiOrigin(import.meta.env.VITE_AGENT_API_URL);
const PRESENTATIONS = buildAaModelPresentationIndex(PUBLIC_SNAPSHOT.models);
const DISPLAY_NAMES = new Map(
  Array.from(PRESENTATIONS, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
);
const PRIMARY_CREATORS: readonly CreatorOption[] = Object.freeze(
  AA_FEATURED_CREATORS.map((creator) => Object.freeze({ id: creator.creatorId, name: creator.label })),
);

export default function App() {
  const route = useHashRoute();
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [availableWidth, setAvailableWidth] = useState(() => (
    document.documentElement.clientWidth || window.innerWidth
  ));
  useEffect(() => {
    const updateWidth = () => {
      setViewportWidth(window.innerWidth);
      setAvailableWidth(document.documentElement.clientWidth || window.innerWidth);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateWidth);
    observer?.observe(document.documentElement);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);
  const mobileScale = viewportWidth <= 620 ? availableWidth / 760 : null;
  const sharedProps = useMemo(() => ({
    snapshot: PUBLIC_SNAPSHOT,
    presentations: PRESENTATIONS,
    displayNames: DISPLAY_NAMES,
  }), []);

  return (
    <div
      className="public-app"
      style={mobileScale === null ? undefined : { width: 760, zoom: mobileScale }}
    >
      {route.page === "home" && (
        <HomePage
          snapshot={PUBLIC_SNAPSHOT}
          displayNames={DISPLAY_NAMES}
          previewLimit={viewportWidth <= 620 ? 3 : 5}
        />
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
      {route.page === "advisor" && (
        <AdvisorPage apiOrigin={ADVISOR_API_ORIGIN} displayNames={DISPLAY_NAMES} />
      )}
    </div>
  );
}
