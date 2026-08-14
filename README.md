# AI 模型矩阵 · 主流大模型排行榜

> 深空控制台风格（Dark HUD）的 AI 大模型排行榜单页：**Top 20 主流模型 × 六维评分 × 六维雷达图 × 可调权重排名**。
> 数据截至 **2026-08-14**，分数为编辑评估值并附公开来源，非官方排名。

## 🌐 在线访问

**[joker01-01.github.io/ai-model-leaderboard](https://joker01-01.github.io/ai-model-leaderboard/)**

无需安装任何东西，浏览器打开即看。push 到 main 分支后由 GitHub Actions 自动构建部署。

[![在线访问](https://img.shields.io/badge/在线访问-GitHub%20Pages-35E0FF?style=flat-square&logo=githubpages&logoColor=white)](https://joker01-01.github.io/ai-model-leaderboard/)
[![Vite 7](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)]()
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)]()
[![纯静态](https://img.shields.io/badge/部署-纯静态文件-green?style=flat-square)]()

## 这是什么

一个关于「现在哪个 AI 模型最强」的榜单网站。打开页面你会看到：

- **冠军牌**：当前权重方案下的榜首模型，大号发光分数 + 实时六维雷达图
- **榜单**：Top 20 模型的排名表，含六维速览、价格带、发布时间
- **权重面板**：调滑块改变排名——排名随权重实时重算，榜首可能当场易主
- **详情行**：点开任意模型，看六维雷达图、强项/短板、数据来源链接

### 核心设计：排名由权重决定

综合分 = Σ 维度分 × 权重 ÷ 权重总和。默认「综合」方案里性价比占 14% 权重，所以榜首是 **DeepSeek V4 Pro**；
切到「纯智力」（性价比权重为 0），榜首就变成 **Claude Opus 4.8**。

这不是 bug，是这个站想说的话：**榜单没有唯一答案，取决于你怎么加权**。

## 功能特性

- 🏆 总榜 + 六个分榜：综合智能 / 编程 / Agent / 推理·数学 / 性价比 / 开源
- 🕸️ 六维雷达图：冠军牌与每行详情均有（内联 SVG 手绘，零图表库依赖）
- ⚖️ 5 个预设权重方案 + 自定义滑块，选择记忆在本地（localStorage）
- 🔍 搜索、国家/地区筛选、只看开源
- 📎 每个模型的分数附来源链接（Artificial Analysis / LMArena / Ramp SWE-Bench / 官方发布）
- ✨ 动效：入场编排、全局扫描光带、雷达弹入与扫描光束、切榜重排、悬停微动效
- ♿ 尊重系统「减少动态效果」设置（prefers-reduced-motion）
- 📱 响应式布局，移动端可用

## 技术栈

| 层 | 选型 |
|---|---|
| 构建 | Vite 7 |
| 框架 | React 19 + TypeScript 5.9（严格模式） |
| 样式 | 手写 CSS 设计系统（深空 + 霓虹青蓝 + 网格 + 发光），无 UI 框架 |
| 图表 | 内联 SVG 雷达图，无第三方图表库 |
| 部署 | 纯静态产物（相对路径），GitHub Pages + Actions 自动发布 |

## 快速开始

### 在线（零安装）

打开 https://joker01-01.github.io/ai-model-leaderboard/ 即可。

### 本地开发

\`\`\`bash
git clone https://github.com/joker01-01/ai-model-leaderboard.git
cd ai-model-leaderboard
npm install
npm run dev       # http://localhost:5173
\`\`\`

\`\`\`bash
npm run build     # 构建到 dist/
npm run preview   # 本地预览构建产物
\`\`\`

### 部署

已配置好：\`.github/workflows/deploy.yml\` 会在每次 push 到 \`main\` 时自动构建并发布到 GitHub Pages，无需手动操作。
（首次使用需在仓库 Settings → Pages 中把 Source 设为 **GitHub Actions**，本仓库已设置。）

## 数据说明与免责声明

⚠️ **重要**：榜单上的六维分数（0–100）是**编辑部基于公开信息的评估值**，依据 2026-08-14 前公开榜单
（Artificial Analysis、LMArena、Ramp SWE-Bench 及各厂商官方发布），**不是任何机构的官方数字**。
相对强弱有据可查（每模型附来源脚注），绝对数值请当参考。价格带、上下文、许可证为公开信息摘录，**以各厂商官网为准**。
模型迭代极快，榜单会过期——建议每月更新。

## 维护榜单数据

所有数据在 \`src/data/models.ts\`，改完 push 即自动上线：

1. **改分数**：找到对应模型的 \`dims\`，调整六个数字（0–100）
2. **新增模型**：按现有条目结构复制一份，填好 \`id / name / maker / dims / badges / blurb / strengths / weaknesses / sources\`
3. **更新日期**：改文件底部 \`DATA_DATE\`（页脚和报头会同步显示）
4. \`npm run build\` 本地验证 → \`git push\` 自动部署

一个模型条目长这样：

\`\`\`ts
{
  id: "deepseek-v4-pro",
  name: "DeepSeek V4 Pro",
  maker: "深度求索", makerEn: "DeepSeek", country: "中国", flag: "🇨🇳",
  release: "2026-08-13", ctx: "1M", priceTier: "低",
  open: false, license: "闭源 API（V4 基座开源）",
  badges: ["GA 2026-08-13", "百万上下文"],
  blurb: "一句话点评……",
  strengths: ["…"], weaknesses: ["…"],
  dims: { intelligence: 90, coding: 94, agent: 90, reasoning: 92, value: 95, openness: 25 },
  sources: [{ label: "DeepSeek 官方发布", url: "https://…" }],
}
\`\`\`

## 项目结构

\`\`\`
src/
  data/models.ts        # Top 20 模型数据（唯一需要日常维护的文件）
  lib/score.ts          # 六维定义、预设权重方案、综合分计算
  components/Radar.tsx  # 六维雷达图（内联 SVG）
  App.tsx               # 报头 / 冠军牌 / 权重面板 / 榜单 / 详情 / 页脚
  styles.css            # 科技风设计系统与动效
  main.tsx              # 入口
.github/workflows/
  deploy.yml            # GitHub Pages 自动部署
\`\`\`

## FAQ

**为什么分数不是官方数据？** 公开榜单（AA / LMArena 等）没有统一标准且不开放 API，直接抄具体数字容易失真。
本项目的做法是：相对排名对齐公开报道，绝对分数给编辑评估值，并附来源链接供核实。

**为什么默认榜首不是 Claude Opus 4.8？** 默认方案给了性价比 14% 权重，DeepSeek V4 Pro 借此登顶；
把性价比权重拉到 0（「纯智力」方案），榜首就是 Opus 4.8。调几个滑块就能理解这件事。

**能自动抓取最新榜单吗？** 目前是手工维护数据。自动抓取聚合榜单是 Roadmap 里的下一步。

## Roadmap

- [ ] 定时抓取 Artificial Analysis / LMArena 公开数据，自动更新分数
- [ ] 模型对比页（两两 PK）
- [ ] 更多维度（多模态 / 长上下文 / 安全）
- [ ] 历史榜单时间轴
