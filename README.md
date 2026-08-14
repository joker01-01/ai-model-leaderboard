# AI 模型矩阵 · 主流大模型排行榜

> 深空控制台风格的 AI 模型榜单：20 个具体版本、客观能力榜、编辑推荐榜和可解释的模型详情。
> 客观快照截至 2026-08-14；编辑资料也截至 2026-08-14。

## 🌐 在线访问

[joker01-01.github.io/ai-model-leaderboard](https://joker01-01.github.io/ai-model-leaderboard/)

这是一个纯静态 Vite + React 页面，push 到 `main` 后由 GitHub Actions 构建并发布到 GitHub Pages。

[![在线访问](https://img.shields.io/badge/在线访问-GitHub%20Pages-35E0FF?style=flat-square&logo=githubpages&logoColor=white)](https://joker01-01.github.io/ai-model-leaderboard/)
[![Vite 7](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![纯静态](https://img.shields.io/badge/部署-纯静态文件-green?style=flat-square)](https://pages.github.com/)

## 两层榜单

### 客观能力榜

默认入口，回答“公开评测里这个具体版本表现如何”。当前使用六条公开聚合榜信号：

- Artificial Analysis Intelligence Index
- Artificial Analysis Coding Index
- GPQA Diamond
- τ²-Bench Tool Use
- SWE-bench Pro（编程第二信号）
- BrowseComp（Agent 第二信号）

四个能力分类使用固定权重；信号先按各自声明的固定 0–100 量表校准，同一分类有多个信号时取简单平均，再对已有分类重归一化。不会根据当前模型集合动态 min-max 或百分位。缺少对应版本的数据不会填成 0 分，而是显示“待补”、覆盖率和置信度。当前第二信号只覆盖能明确对上具体版本的模型，综合智能和推理·数学仍待继续补充。

### 编辑推荐榜

回答“按不同使用偏好应该怎么选”。它保留六个编辑维度：综合智能、编程、Agent、推理·数学、性价比、开源。

编辑推荐榜支持预设权重和自定义滑块。滑块显示的是归一化后的最终占比，所有权重不会被允许同时为 0。

## 功能特性

- 客观能力榜 / 编辑推荐榜切换
- 客观四维能力摘要、多个 benchmark 快照、模型版本和来源
- 编辑推荐榜六维雷达图与可调权重
- 搜索、国家/地区筛选、只看开源
- 模型详情、编辑摘要、价格/上下文/许可证信息
- 静态快照，不在页面运行时伪装实时同步
- 响应式布局、键盘焦点、减少动态效果支持

## 数据与维护

编辑资料位于 `src/data/models.ts`，客观数据快照位于 `src/data/benchmarks.ts`。

维护客观数据时，每条记录应尽量包含：

- 具体模型版本
- benchmark 或聚合指数名称
- 原始成绩
- 观测日期
- 来源链接和来源层级

如果来源只提供系列名、版本不一致或无法核验，宁可留空，也不要把编辑分数复制到客观榜。聚合榜只能作为当前过渡证据，不能伪装成原始 benchmark 成绩。

```bash
npm install
npm run dev
npm run build
```

## 项目结构

```text
src/
  data/models.ts        # 20 个具体模型版本与编辑资料
  data/benchmarks.ts    # 客观 benchmark 快照、版本与来源
  lib/score.ts          # 客观/编辑维度、权重和综合分
  components/Radar.tsx  # 编辑榜六维雷达图
  App.tsx               # 双榜模式、冠军卡、榜单、详情、页脚
  styles.css            # 深空 HUD 设计系统与响应式布局
.github/workflows/
  deploy.yml            # GitHub Pages 自动部署
```

## 免责声明

客观能力榜使用公开聚合榜快照，不等同于厂商官方成绩，也不代表所有原始 benchmark。编辑推荐榜是编辑评估，不是官方排名。模型版本、价格、上下文和许可证变化很快，使用前应回到原始 benchmark 和厂商官网复核。

## Roadmap

- [ ] 为综合智能、推理·数学补齐第二个可核验信号
- [ ] 用原始 benchmark 记录替换聚合榜快照
- [ ] GitHub Actions 定时抓取并人工审核后发布
- [ ] 模型两两对比
- [ ] 历史榜单时间轴
