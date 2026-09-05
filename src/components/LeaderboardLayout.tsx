import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";

import { getAaCreatorTone } from "../lib/modelPresentation";

export interface LeaderboardTab {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
}

export interface CreatorOption {
  readonly id: string | null;
  readonly name: string;
}

interface LeaderboardLayoutProps {
  readonly tone: "ability" | "efficiency";
  readonly titleTone: "ability" | "speed" | "price";
  readonly title: string;
  readonly description?: string;
  readonly tabs?: readonly LeaderboardTab[];
  readonly creatorId: string | null | undefined;
  readonly onCreatorChange: (creatorId: string | null | undefined) => void;
  readonly primaryCreators: readonly CreatorOption[];
  readonly children: ReactNode;
}

export default function LeaderboardLayout({
  tone,
  titleTone,
  title,
  description,
  tabs,
  creatorId,
  onCreatorChange,
  primaryCreators,
  children,
}: LeaderboardLayoutProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = `${title} · AI 模型排行榜`;
    titleRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <div className={`public-page leaderboard-page leaderboard-page--${tone}`}>
      <button
        className="skip-link"
        type="button"
        onClick={() => {
          contentRef.current?.focus({ preventScroll: true });
          contentRef.current?.scrollIntoView?.({ block: "start" });
        }}
      >
        跳到榜单
      </button>
      <header className="leaderboard-masthead">
        <a className="back-link" href="#/" aria-label="返回首页">
          <span aria-hidden="true">←</span>
        </a>
        <div>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className={`leaderboard-title leaderboard-title--${titleTone}`}
          >
            {title}
          </h1>
          {description ? <p>{description}</p> : null}
        </div>
      </header>

      {tabs && tabs.length > 0 ? <MetricTabs tabs={tabs} /> : null}

      <section className="leaderboard-tools" aria-label="筛选榜单">
        <CreatorFilters
          selectedId={creatorId}
          primaryCreators={primaryCreators}
          onChange={onCreatorChange}
        />
      </section>

      <main ref={contentRef} id="leaderboard-content" className="leaderboard-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

function MetricTabs({ tabs }: { readonly tabs: readonly LeaderboardTab[] }) {
  return (
    <nav className="metric-tabs" aria-label="榜单分类">
      {tabs.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={tab.active ? "is-active" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

function CreatorFilters({
  selectedId,
  primaryCreators,
  onChange,
}: {
  readonly selectedId: string | null | undefined;
  readonly primaryCreators: readonly CreatorOption[];
  readonly onChange: (creatorId: string | null | undefined) => void;
}) {
  return (
    <div className="creator-filter" aria-label="开发者筛选">
      <button
        type="button"
        data-creator-tone="all"
        className={selectedId === undefined ? "is-active" : undefined}
        aria-pressed={selectedId === undefined}
        onClick={() => onChange(undefined)}
      >
        全部
      </button>
      {primaryCreators.map((creator) => (
        <button
          key={creator.id ?? "unknown-primary"}
          type="button"
          data-creator-tone={getAaCreatorTone(creator.id)}
          className={selectedId === creator.id ? "is-active" : undefined}
          aria-pressed={selectedId === creator.id}
          onClick={() => onChange(creator.id)}
        >
          {creator.name}
        </button>
      ))}
    </div>
  );
}
