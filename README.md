# AI 模型排行榜

> 主榜只看同版本公开成绩；编辑推荐榜再按你的使用偏好选择。数据每天同步，审核后发布。

[在线查看排行榜](https://joker01-01.github.io/ai-model-leaderboard/)

[![在线网页](https://img.shields.io/badge/在线网页-GitHub%20Pages-35E0FF?style=flat-square&logo=githubpages&logoColor=white)](https://joker01-01.github.io/ai-model-leaderboard/)
[![Vite 7](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![静态部署](https://img.shields.io/badge/部署-纯静态-green?style=flat-square)](https://pages.github.com/)

`main` 分支更新后，GitHub Actions 会自动发布到 GitHub Pages。

主榜使用 Artificial Analysis 的同版本 Intelligence Index；Arena 只在模型详情中展示用户盲测对战参考，不参与名次。每天北京时间 01:20 会生成数据审核 PR，确认无误后合并发布。

## 这个榜单看什么

榜单收录 20 个具体模型版本，分成两个入口：

- **公开评测榜**：按公开、可核验的同版本 Artificial Analysis Intelligence Index 排名，回答“这个版本在统一主指数里表现怎么样”。
- **编辑推荐榜**：根据不同使用偏好调整权重，回答“我该选哪个模型”。

页面会按已合并的最新官方快照显示数据日期、可排名数量和覆盖率。没有同版本智能指数的模型会保留在榜单底部的“待补公开成绩”区，不会用其他版本、系列名称或编辑分数替代，更不会强行给出名次；每次同步的完整匹配情况见 `data/sync-report.json`。

## 公开评测榜

公开评测榜的主榜只使用同版本 **Artificial Analysis Intelligence Index**。编程、推理·数学和工具使用等公开成绩会在模型详情中展示，用来解释能力侧重点，但不会再次混入主榜分数。

详情页按四类能力展示公开成绩：

- 综合智能
- 编程
- 推理·数学
- 工具使用

数据来自 Artificial Analysis Intelligence / Coding Index、GPQA Diamond、τ²-Bench Tool Use、SWE-bench Pro 与 BrowseComp 等公开页面。主榜不再把这些不同口径、且可能存在评测重叠的指标混合成一个总分；不会用当前上榜模型的相对位置做动态归一化。

每条公开成绩都要求能够对应到**具体模型版本**。没有同版本智能指数、无法确认版本或只写模型系列的记录，会显示为“待补”，而不是补 0 分或拿相近版本代替。

## 编辑推荐榜

编辑推荐榜保留六个维度：综合智能、编程、工具使用、推理·数学、性价比和开源。你可以直接使用预设，也可以调整权重，比较不同偏好下的排序变化。

它是帮助选择模型的编辑判断，不冒充公开 benchmark 排名；模型详情会同时展示版本、厂商、标签、资料来源与可用的公开数据覆盖情况。

## 功能

- 公开评测榜与编辑推荐榜切换
- 具体版本的成绩、覆盖率、来源与数据状态
- 无同版本成绩模型的独立待补区
- 可调整的编辑偏好与六维能力图
- 搜索、地区和开源筛选
- 模型详情、上下文、价格、许可证与来源链接
- 黑白毛玻璃界面，适配电脑和手机

## 数据原则

数据文件位于：

- `src/data/models.ts`：模型资料与编辑推荐维度
- `src/data/benchmarks.ts`：公开评测快照、模型版本与来源
- `src/data/generated/aaSnapshot.ts`：Artificial Analysis 官方 API 自动快照（首次同步前为空）
- `src/data/generated/arenaSnapshot.ts`：Arena 官方数据集的用户对战参考（不参与主榜）
- `data/sync-report.json`：每次同步的精确匹配、缺失和歧义报告

维护公开数据时，请遵循以下规则：

1. 先确认模型的具体版本，再录入成绩。
2. 每条成绩保留 benchmark、观测日期和可访问的来源链接。
3. 主榜只使用同版本 Artificial Analysis Intelligence Index；其他 benchmark 只作明细，不混合加权。
4. 不能确认版本一致时，宁可留在“待补公开成绩”区。
5. 不把编辑分数、不同版本成绩或未核验的媒体说法混进公开榜。

## 自动同步与人工审核

`.github/workflows/sync-data.yml` 每天北京时间 01:20 拉取两份官方数据，并创建或更新一个数据审核 PR；它**不会直接发布到网站**。只有人工检查 `data/sync-report.json` 后合并，`main` 分支才会触发 GitHub Pages 部署。

- Artificial Analysis：使用官方 Data API 的免费 LLM 入口，需要将密钥保存为仓库 Actions Secret `AA_API_KEY`，绝不写入前端或仓库文件。
- Arena：读取官方 Hugging Face `lmarena-ai/leaderboard-dataset` 的 `latest` 快照，无需密钥。它反映盲测用户偏好，详情中只作参考，绝不改变公开评测榜名次。
- 映射：脚本只接受精确的 AA slug 或 Arena 模型名。名称相似、版本不明或匹配多个条目的模型一律不更新，并写入报告等待补充映射。

本地手动更新：

```bash
# PowerShell
$env:AA_API_KEY = "你的 Artificial Analysis API key" # 可选；不填时只同步 Arena
npm run sync:data
npm run build
```

## 本地运行

```bash
npm install
npm run dev
npm run build
```

## 项目结构

```text
src/
  data/models.ts        # 20 个模型版本与编辑资料
  data/benchmarks.ts    # 同版本公开成绩与来源
  lib/score.ts          # 公开榜和编辑榜的评分规则
  components/Radar.tsx  # 编辑榜六维图
  App.tsx               # 榜单、筛选、详情与交互
  styles.css            # 黑白界面与响应式样式
.github/workflows/
  deploy.yml            # GitHub Pages 自动部署
  sync-data.yml         # 每日同步并创建审核 PR
scripts/
  sync-data.mjs         # 官方数据拉取、严格映射与报告生成
```

## 免责声明

公开评测榜是可追溯的公开快照，不等同于厂商官方结论，也不能覆盖所有 benchmark。编辑推荐榜是编辑判断。模型版本、价格、上下文和许可证变化很快，实际使用前请回到模型厂商和原始评测页面复核。
