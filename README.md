# AI 模型排行榜

[![Stack: React 19](https://img.shields.io/badge/Stack-React%2019-149ECA?style=flat-square)](https://react.dev/)
[![Language: TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square)](https://www.typescriptlang.org/)
[![Build: Vite 7](https://img.shields.io/badge/Build-Vite%207-646CFF?style=flat-square)](https://vite.dev/)
[![API: FastAPI](https://img.shields.io/badge/API-FastAPI-009688?style=flat-square)](https://fastapi.tiangolo.com/)
[![Deploy: GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-222222?style=flat-square)](https://joker01-01.github.io/ai-model-leaderboard/)
[![Data: Artificial Analysis](https://img.shields.io/badge/Data-Artificial%20Analysis-008494?style=flat-square)](https://artificialanalysis.ai/)

基于 Artificial Analysis 数据，对比 AI 模型的能力、速度与价格，也可以按需求选择模型。

**[在线体验 →](https://joker01-01.github.io/ai-model-leaderboard/)**

- **模型能力**：综合智能、编程智能、智能体能力。
- **模型速度**：首字延迟与输出速度。
- **模型价格**：输入价格与输出价格。
- **按需求选模型**：由 AA 快照确定性筛选和排序；DeepSeek 可为最终 Top 3 补充基于模型已有知识的未联网说明。

支持桌面和手机浏览。数据来源于 [Artificial Analysis](https://artificialanalysis.ai/)，更新日期见网站页脚。

Advisor 公共表单只显示需求和可选部署地区原生选择器，紫色中文标题下不显示 `MODEL ADVISOR`；`获取推荐` 位于部署地区右侧，空闲时不显示结果占位区。地区默认为 `不指定`，固定选项只表达未核验的用户偏好，不代表地区可用性；后端仍兼容任意 clean string 或 `null`。浏览器请求固定发送 `budget: null`，后端 API 仍兼容经过验证的可选预算对象。

Advisor 不启用 `web_search`，不抓取或展示模型生成的引用 URL，也不会用 DeepSeek 的知识说明过滤或重排 AA 结果、核验硬性要求或部署地区。说明可能过时，所有结果均保持 `aa_only`；DeepSeek 请求仍会发送到远程 API，因此“不联网搜索”不等于完全离线。没有可用模型服务时，Advisor 仍返回确定性的 AA-only 结果。

## 页面预览

### 首页

![首页：模型能力、速度、价格与按需求选模型入口](docs/screenshots/home.jpg)

<details>
<summary>查看全部榜单和选模型页面</summary>

### 综合智能

![综合智能榜](docs/screenshots/intelligence.jpg)

### 编程智能

![编程智能榜](docs/screenshots/coding.jpg)

### 智能体能力

![智能体能力榜](docs/screenshots/agentic.jpg)

### 模型速度

![模型速度榜：首字延迟与输出速度](docs/screenshots/speed.jpg)

### 模型价格

![模型价格榜：输入价格与输出价格](docs/screenshots/price.jpg)

### 按需求选模型

![按需求选模型页面](docs/screenshots/advisor.jpg)

</details>
