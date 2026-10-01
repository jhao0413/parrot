# 🦜 Parrot 翻译

一个刻意保持简单的浏览器翻译扩展（Chrome / Edge，Manifest V3）。灵感来自 [read-frog](https://github.com/mengxi-ream/read-frog)，但砍掉了 80% 的复杂度，只保留核心翻译能力，架构干净、可逐步增强。

## 功能

- **划词翻译**：选中文字后在选区旁显示翻译图标，点击弹窗显示译文（样式走 shadow root，与页面隔离），支持单词词典、发音、复制、"译此段"
- **全文翻译**：双语对照（译文插入原文下方）或仅译文两种模式；懒翻译（进入视口附近才翻译）；`Alt+Shift+T` 快捷键或 popup 开关
- **悬停段落翻译**：鼠标停在段落内按 `Shift` 即翻译该段（复用全文翻译管线，可在设置页开关）
- **翻译工作台**：独立页面，粘贴/输入文本自动翻译（防抖 500ms，长文自动分块）
- **发音**：有道 TTS（免签名，`dict.youdao.com/dictvoice`），英/美音、中文；在扩展上下文播放（Chrome 用 offscreen document），不受网页 CSP 限制

## 翻译服务（可插拔）

| 服务 | 类型 | 需要 Key |
|---|---|---|
| Google 翻译（默认） | 免费网页接口 | ❌ 开箱即用 |
| 微软翻译 | 免费网页接口（Edge 内置同款） | ❌ |
| OpenAI 兼容 | LLM（baseUrl 可配，兼容 DeepSeek 等） | ✅ |
| Gemini | LLM | ✅ |
| 有道智云 | 官方 API，含词典查询 | ✅ |
| 百度翻译 | 官方 API | ✅ |

所有翻译请求统一经 background service worker 执行（绕 CORS、缓存去重、并发限速）。翻译缓存按 `provider+语言对+文本hash` 存 storage.local，二次开关全文翻译秒出。

## 开发

```bash
npm install
npm run dev        # Chrome 开发模式（热重载），按提示在 chrome://extensions 加载
npm run compile    # 类型检查
npm run build      # 生产构建 → .output/chrome-mv3
npm run zip        # 打包 zip
```

## 架构

```
src/
├── entrypoints/          # WXT 入口：background / content / popup / options / workbench / offscreen（发音播放）
├── messaging/protocol.ts # 全部消息类型（双端契约，zod 校验）
├── translate/            # 纯逻辑：provider 接口 + 5 个实现 + 批量编排 + 缓存
├── storage/settings.ts   # zod 设置 schema（读时迁移，无迁移脚本）
├── tts/player.ts         # 有道 TTS（交给 background 取音频，在 offscreen / background 播放）
├── content/
│   ├── selection/        # 划词弹窗（shadow root + 自带样式）
│   └── page/             # 全文翻译管线：walker → extractor → lazy → injector → controller
└── ui/                   # 共享 React 组件
```

v1 刻意不做：SPA 增量翻译（MutationObserver）、虚拟段落切分、防重翻风暴、YouTube 字幕、输入框翻译、配置同步。管线按"可重复执行"设计（off→on 全量重跑），后续可逐步增强。

## 隐私

- 翻译文本仅发送至你配置的翻译服务
- API Key 保存在本地 browser.storage，不上传任何服务器
- 无 analytics、无远程代码
