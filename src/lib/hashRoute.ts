import { useEffect, useState } from "react";

import type { AaAbilityMetric } from "./aaRankings";

export type EfficiencyMetric = "speed" | "price";

export type AppRoute =
  | Readonly<{ page: "home" }>
  | Readonly<{ page: "ability"; metric: AaAbilityMetric }>
  | Readonly<{ page: "efficiency"; metric: EfficiencyMetric }>
  | Readonly<{ page: "advisor" }>;

export const HOME_ROUTE: AppRoute = Object.freeze({ page: "home" });

const ROUTES = Object.freeze({
  "#/": HOME_ROUTE,
  "#/ability/intelligence": Object.freeze({ page: "ability", metric: "intelligence" } as const),
  "#/ability/coding": Object.freeze({ page: "ability", metric: "coding" } as const),
  "#/ability/agentic": Object.freeze({ page: "ability", metric: "agentic" } as const),
  "#/efficiency/speed": Object.freeze({ page: "efficiency", metric: "speed" } as const),
  "#/efficiency/price": Object.freeze({ page: "efficiency", metric: "price" } as const),
  "#/advisor": Object.freeze({ page: "advisor" } as const),
});

type KnownHref = keyof typeof ROUTES;

export function parseHashRoute(hash: string): AppRoute {
  if (hash === "" || hash === "#") return HOME_ROUTE;
  return Object.hasOwn(ROUTES, hash) ? ROUTES[hash as KnownHref] : HOME_ROUTE;
}

export function routeHref(route: AppRoute): KnownHref {
  if (route.page === "home") return "#/";
  if (route.page === "advisor") return "#/advisor";
  return route.page === "ability"
    ? `#/ability/${route.metric}`
    : `#/efficiency/${route.metric}`;
}

function currentRoute(): AppRoute {
  return typeof window === "undefined" ? HOME_ROUTE : parseHashRoute(window.location.hash);
}

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const updateRoute = () => {
      setRoute(currentRoute());
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    updateRoute();
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  return route;
}
