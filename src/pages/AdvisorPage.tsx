import { useEffect, useRef } from "react";

export default function AdvisorPage() {
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
        <p className="advisor-kicker">MODEL ADVISOR</p>
        <h1 id="advisor-title" ref={titleRef} tabIndex={-1}>按需求选模型</h1>
        <p>告诉我任务、预算和部署要求，我会从完整榜单中给出可核验的选择。</p>
        <label>
          <span>你的需求</span>
          <textarea disabled placeholder="智能推荐将在下一阶段接入" />
        </label>
        <button type="button" disabled>尚未连接</button>
        <p className="advisor-phase-note">当前页面只展示入口，不会调用旧版技术 Agent 控制台。</p>
      </section>
    </main>
  );
}
