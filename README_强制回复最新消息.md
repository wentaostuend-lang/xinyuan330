# 只包含"强制回复最新消息"这一个功能

这个包**只有这一个功能的改动**，聊天记录卡片、状态栏渲染修复都没有包含在内
（是从一份临时撤掉了那两个功能的副本里重新编译出来的，干净的）。

覆盖方式和之前一样：目录结构跟仓库一致，直接把这 7 个文件按路径覆盖到你仓库
对应位置就行。

## 涉及的文件

- `src/html/chat-interface.html` —— 新增了按钮的源文件
- `generated/html-fragments/chat-interface.js` —— 上面那个文件对应的构建产物
- `src/js-bundles/event-bindings-b/mail-and-final-bindings.jsfrag` —— 按钮的点击事件绑定（源文件）
- `modules/init-event-bindingsB.js` —— 上面绑定逻辑对应的构建产物
- `modules/ai/response-actions.js` —— 按钮点击后执行的函数 `handleForceReplyLatest`
- `src/js-bundles/trigger-response/memory-and-social-context.jsfrag` —— 组装 prompt 时插入强制指令的逻辑（源文件）
- `modules/ai/trigger-response.js` —— 上面这段逻辑对应的构建产物

## 功能说明

聊天界面工具栏里，"重新生成回复"和"推进剧情"两个按钮中间，新增一个按钮
（图标是箭头指向一条横线）。

点击后：
1. 找到"上一条 AI 回复"的时间点
2. 把这个时间点**之后**你发的所有消息（可能不止一条）都收集起来
3. 正常触发一次 AI 回复，但会在这一轮的系统提示词末尾强行加一条指令：
   "本轮只回应这几条新消息，之前已经回复过的旧消息不要再重新处理"
4. 这个指令是**一次性**的，用完立刻清空，不会影响之后的正常对话
