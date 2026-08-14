# 模型年鉴 · AI 模型排行榜

科技风（深色 HUD）的 AI 大模型排行榜单页：**Top 20 主流模型 × 六维评分 × 六维雷达图 × 口径可调**。

> ⚠️ 免责声明：本榜分数为**编辑部基于公开信息的评估值（0–100）**，依据 2026-08-14 前公开榜单
> （Artificial Analysis、LMArena 及各厂商官方发布），**非任何机构的官方口径**。
> 价格带 / 上下文 / 许可证为公开信息摘录，请以各厂商官网为准。模型迭代极快，榜单会过期。

## 功能

- **总榜 + 六维分榜**：综合智能 / 编程 / Agent / 推理·数学 / 性价比 / 开源
- **六维雷达图**：冠军牌内嵌雷达图，每行详情展开亦有雷达图（内联 SVG，无图表库依赖）
- **权重决定排名**：综合分 = Σ 维度分 × 权重，提供 5 个预设权重方案 + 自定义滑块；切换权重，榜首可能易主
  （例：默认「综合」方案榜首为 DeepSeek V4 Pro，「纯智力」方案榜首为 Claude Opus 4.8）
- 冠军牌、搜索、国家筛选、只看开源、行展开详情（强项/短板/来源脚注）
- 每个模型的分数附**来源链接**，方法论文案见页脚

## 技术栈

Vite + React 19 + TypeScript，零 UI 框架依赖，手写 CSS 设计系统（深空控制台 / 霓虹青蓝 / 网格背景 / 发光数据）。构建产物为纯静态文件（`base: './'`），
GitHub Pages 任意仓库路径下可直接部署。

## 本地运行

```bash
npm install
npm run dev      # 开发
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
```

## 部署到 GitHub Pages

已配置相对路径构建，两种方式任选：

1. **GitHub Actions（推荐）**：仓库已含 `.github/workflows/deploy.yml`。
   在仓库 Settings → Pages 中把 Source 设为 `GitHub Actions`，push 到 main 分支即自动发布。
2. **手动**：`npm run build` 后把 `dist/` 内容推到 `gh-pages` 分支。

## 数据维护

所有榜单数据在 `src/data/models.ts`：

- 每模型含六维分数、徽章、点评、强项/短板、来源链接（1–3 条）
- 分数为编辑评估值，改动后 `npm run build` 重新部署即可
- 建议每月对照公开榜单更新一次（页脚标有数据截至日期）

## 目录

```
src/
  data/models.ts      # Top 20 模型数据
  lib/score.ts        # 维度、预设口径、综合分计算
  components/Radar.tsx # 六维雷达图（内联 SVG）
  App.tsx               # 组件（报头/冠军牌/权重面板/榜单/详情/页脚）
  styles.css            # 科技风设计系统
```
