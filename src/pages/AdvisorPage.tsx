import { useEffect, useRef } from "react";

import AdvisorForm from "../features/advisor/AdvisorForm";

interface AdvisorPageProps {
  readonly apiOrigin: string | null;
  readonly displayNames: ReadonlyMap<string, string>;
}

export default function AdvisorPage({ apiOrigin, displayNames }: AdvisorPageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = "按需求选模型 · AI 模型排行榜";
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="public-page advisor-page">
      <a className="back-link" href="#/" aria-label="返回首页">
        <span aria-hidden="true">←</span>
      </a>
      <section className="advisor-shell" aria-labelledby="advisor-title">
        <header className="advisor-page-head">
          <p className="advisor-kicker">MODEL ADVISOR</p>
          <h1 id="advisor-title" ref={titleRef} tabIndex={-1}>按需求选模型</h1>
          <p>写下任务、预算和部署要求，从完整 AA 榜单中得到一次性、可核验的选择。</p>
        </header>
        <AdvisorForm apiOrigin={apiOrigin} displayNames={displayNames} />
      </section>
    </main>
  );
}
