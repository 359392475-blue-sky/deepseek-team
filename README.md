# DeepSeek 团队版

蓝天的团队协作界面探索，源自 DeepSeek Harness 团战版的独立原型。

当前可运行的是个人对话与飞机游戏的前端原型；“团队”入口展示已选定的团队空间设计稿。成员状态、团队文件与任务交付尚未接通真实后端。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

~~~sh
npm install
npm run dev
~~~

npm run build 生成静态前端，npm run preview 预览构建。此公开快照不包含私人会话、服务凭据、云端站点配置和运行日志。

## 设计方向

个人对话保持私密，经过本人确认的任务、产物与版本进入团队空间。等待 Agent 期间可继续玩轻量飞机游戏。团队云空间目前是视觉预览，后续才接真实协作通道。

## 来源与许可

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 相关本地原型工作，保留上游 MIT 许可和第三方声明。DeepSeek 名称与标识属于其各自权利人；本项目是独立社区探索。
