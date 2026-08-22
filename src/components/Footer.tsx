import { BENCHMARK_DATE } from "../data/benchmarks";

/* ---------- 页脚 ---------- */
export function Footer() {
  return (
    <footer className="footer">
      <h3 className="footer-title">排行榜说明</h3>
      <ol className="method"><li>公开评测榜只按同版本的 Artificial Analysis Intelligence Index 排名；没有该指数的模型会进入“待补公开成绩”区，不显示名次或主榜分数。</li><li>编辑推荐榜的综合智能、编程、推理和工具使用来自同版本公开数据；性价比与开源按固定规则计算，再由你拖动权重决定推荐顺序。</li><li>没有同版本 AA 智能指数的模型不会用手工分数替代，会进入“待补编辑基础分”区。</li><li>Arena 是用户盲测对战参考，当前只在模型详情展示，不参与主榜名次或基础分，避免把不同量纲硬混在一起。</li><li>数据每天自动同步一次，通过构建校验后自动合并发布；价格、上下文和许可证仍请以模型官网为准。</li></ol>
      <div className="source-links"><span>公开数据来源：</span><a href="https://artificialanalysis.ai/data-api/docs" target="_blank" rel="noopener noreferrer">综合智能 / 编程</a><a href="https://artificialanalysis.ai/" target="_blank" rel="noopener noreferrer">推理</a><a href="https://benchlm.ai/benchmarks/swe-bench-pro" target="_blank" rel="noopener noreferrer">SWE-bench Pro</a><a href="https://benchlm.ai/benchmarks/browsecomp" target="_blank" rel="noopener noreferrer">BrowseComp</a><a href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset" target="_blank" rel="noopener noreferrer">Arena 用户对战</a></div>
      <p className="colophon">AI 模型排行榜 · AA 主榜 {BENCHMARK_DATE} · Arena 仅作参考 · 每日自动同步发布</p>
    </footer>
  );
}
