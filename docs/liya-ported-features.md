# 从 Liya 移植到本项目的功能

移植原则：Liya 里的独立功能模块整体搬入，和本项目原有代码有交叉的地方（提示词、发送流程、设置读写、后台活动等）逐处合并，没有整体覆盖任何原有文件。

| # | 功能 | 主要文件 |
|---|------|----------|
| 1 | 聊天设置里用 URL 设置头像 | `event-bindings-b/memory-and-api-history.jsfrag`、`chat-settings-main.html` |
| 2 | 表情包智能匹配 v7（不限 5 个） | `modules/chat/smart-sticker-v7.js` |
| 3 | 世界书界面选择角色挂载 | `modules/worldbook/char-picker.js` |
| 4 | 角色主动回复（阈值 + 逐日大纲） | `modules/chat/proactive-reply.js`、`message-lifecycle.js`、`response-actions.js` |
| 5 | 顶栏固定（键盘弹出时不跟着位移） | `modules/ui/keyboard-fix.js` |
| 6 | 桌宠 | `modules/ui/desktop-pet.js` |
| 7 | 屏蔽词（全局 / 本聊天） | `modules/chat/banned-words.js`、提示词与输出过滤挂钩 |
| 8 | AI 提取聊天关键词提醒 | `modules/chat/reminder-manager.js` |
| 9 | 查岗（KK 查岗，看角色的房子） | `modules/apps/kk-checkin.js`、`css/apps/kk-checkin.css` |
| 10 | 发送语言翻译 | `modules/chat/send-translate.js`、发送流程挂钩、点击气泡看原文 |
| 11 | 状态栏 | `modules/chat/status-bar.js`、`status-bar-manager.js` |
| 12 | 勿扰时间段 | `background-activity.js`（`isChatInDoNotDisturb`）、聊天设置、悬浮球 |
| 13 | 后台活动随机间隔 | `background-activity.js`、API 设置、聊天设置 |
| 14 | 清空本地上传的头像 | `modules/data/liya-cleanup-extras.js` |
| 15 | 清空相册图片 | 同上 |
| 16 | 深入分析聊天记录构成 | 同上 |
| 17 | 备份压缩方式 | `modules/data/backup/export-handlers.js`（ZIP DEFLATE、紧凑 JSON） |
| 18 | 小剧场 App | `modules/apps/theater-app.js` |
| 19 | 论坛 App | `modules/social/forum.js`、`css/social/forum.css`、数据库 v63/v64 |
| 20 | 约会大作战 | **未启用**（只保留数据库 v65 的表） |
| 21 | 群头衔 / 管理员 / 群主 / 头衔颜色 | `modules/chat/group-titles.js`、`css/chat/group-titles.css` |
| 22 | 悬浮球批量设置 | `modules/floating-ball.js` |
| 23 | 网页全屏 + 防误触 | `js/fullscreen-guard.js`、`manifest.json`（display: fullscreen） |

## 在 Liya 里本来就没接完、这次补上的
- 勿扰时间段：Liya 只有界面，这次补了保存/读取和后台拦截。
- 发送翻译的“点击气泡看原文”：Liya 从未给气泡写入原文属性。
- 论坛自主发帖的聊天开关和全局开关：Liya 没有绑定代码。
- 聊天里转发的论坛帖子卡片：Liya 没有渲染代码，这次补了渲染和点击打开详情。

## 数据库
新增 v63（论坛）、v64（头像池/提问箱/关注/屏蔽）、v65（约会大作战表）。全新安装会自动带三个默认论坛板块。
已经在同一浏览器里用过 Liya（数据库版本 65）的话，建议用“备份导出 → 导入”迁移，不要直接沿用旧库。

## 改动 JS 时的注意
`modules/init-features.js`、`init-event-bindingsA/B.js`、`modules/ai/trigger-response.js` 是生成文件，改 `src/js-bundles/` 下的 `.jsfrag` 后运行 `npm run build`。
