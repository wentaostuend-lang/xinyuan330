# 本次改动清单（相对你原来的 main(4) 项目）

这个压缩包**只包含改过或新增的文件**，目录结构和原项目一致，直接把这些文件
覆盖/合并进你原项目对应路径即可（新文件直接放进去；已有文件是整份覆盖，
不是 diff 补丁）。

覆盖完之后如果你自己也会跑构建，记得跑一遍：
```
npm run build
```
（对应 `node scripts/build-script-bundles.js` + `node scripts/build-index.js`，
会根据 src/ 下的源文件重新生成 generated/ 和 modules/init-*.js 这些产物文件。
这个包里也直接带上了已经生成好的产物文件，所以不跑 build 也能用，只是如果
你之后自己再改 src/ 里的源文件，别忘了重新 build。）

---

## 一、自由布局 + 自定义小组件（新功能）

- `css/ui/free-home-layout.css`（新文件）
- `css/ui/custom-widget-studio.css`（新文件）
- `modules/ui/free-home-layout.js`（新文件）
- `modules/ui/custom-widget-studio.js`（新文件）
- `docs/自制小组件说明.md`（新文件，说明文档）
- `modules/init-db-schema.js` —— 新增 `db.version(66)`，存放
  `customWidgetPackages` / `customWidgetInstances` 两张表（特意用 66，不是
  main(3) 原来的 63，因为你现在的库 63~65 已经被论坛/情侣空间那几个 Liya
  功能占用了，用 66 是为了不撞车）
- `modules/init-and-state.js` —— 启动时调用 `FreeHomeLayout.init()`
- `src/html/appearance-and-thoughts.html` + 对应生成产物
  `generated/html-fragments/appearance-and-thoughts.js` —— 设置页里加了
  "桌面布局 / 自由布局预设" 那一块 UI
- `src/html/document-head.html` + 对应生成产物
  `generated/html-fragments/document-head.js` —— 引入上面两个新 css/js 文件
- `modules/data/backup/advanced-transfer.js`、
  `modules/data/backup/import-export.js` —— 备份/恢复/选择性导入导出里加了
  "自制小组件" 这个分类，包含 `customWidgetPackages` / `customWidgetInstances`

## 二、教程 App 内容（新功能）

- `tutorial.html`（新文件，教程页面本体）
- `sw.js` —— 离线缓存列表里加了 `tutorial.html`
- `scripts/build-index.js` —— 构建脚本的内嵌资源清单里加了 `tutorial.html`
- `css/ui/home-and-voice.css` —— 教程页背景色从灰改成白，跟内容页匹配

## 三、修复：返回按钮位置偏下 / 从聊天设置返回后页面渲染异常

- `src/js-bundles/event-bindings-a/chat-settings-and-members.jsfrag` +
  生成产物 `modules/init-event-bindingsA.js` —— 从聊天设置"保存并返回"这条
  路径上，判断是不是从设置页回来的，避免重复渲染
- `modules/chat-list.js` —— 通用的 `showScreen()` 里补上：从设置页返回聊天
  界面时要重新渲染（这条路径之前完全没处理，是真正遗漏的一半）
- `modules/clean-chat-detail.js` —— "清屏"详情页返回聊天界面时同样补上重新
  渲染
- `modules/chat/interface-core.js` —— 渲染函数内部加了版本号/当前聊天ID
  的校验，避免过期的异步渲染结果覆盖新内容，也是同一个"渲染异常"问题的一部分

## 四、修复：图标被覆盖

- `modules/init-and-state.js` —— 原来的逻辑是"只要不是最新的默认图标就强制
  覆盖回默认值"，改成只在明确匹配"旧版本官方默认图标"时才迁移一次（带版本号，
  只迁移一次），其余情况（包括你自己设置的图标）不会再被覆盖

## 五、修复：线下预设重复发送 / API 保存失败

- `src/js-bundles/event-bindings-a/wallpaper-and-chat-input.jsfrag` +
  生成产物 —— 重写了"保存 API 设置"这个函数：原来是一堆字段直接改
  `state.apiConfig`，中途任何一步报错都会导致状态和数据库不一致、还只弹一个
  笼统的"保存失败"；现在先在一个临时对象里改完全部字段，最后一次性写库，
  每一步失败都有具体提示，不会出现"看起来保存了其实一半没生效"的情况
- `modules/ai/context-and-uploads.js` —— 这是"线下预设重复发送"的真正根因：
  之前模板变量最多递归展开 5 次，导致线下预设这种本身是"数据"的内容如果碰巧
  含有 `{{xxx}}` 格式的文本，会被当成模板再次展开，可能造成重复/错乱。改成
  只展开一次，预设内容不会再被二次解析

## 六、修复：朋友圈（Qzone）夜间模式下变白

- `css/video-voice-call.css` —— 给 `#qzone-screen` 本身（不只是内部的
  `.qzone-content`）加上夜间模式黑色背景 + `!important`
- `modules/chat-list.js` —— **真正的根因在这**：之前每次打开朋友圈，JS 都会
  强制内联设置 `style.backgroundColor = '#ffffff'`，这行内联样式的优先级比
  任何 CSS 规则都高，夜间模式的黑色背景规则再怎么改都会被它盖掉。删掉这行
  就好了

## 七、修复：MCP 及类似 App 在 iOS 上的安全区适配问题

新增一个 `--screen-top-inset` CSS 变量（在 `css/base.css` 里定义，手机外框/
分离状态栏模式下会置零），然后下面这些文件的头部内边距计算都从写死的数字或
`env(safe-area-inset-top)` 改成用这个变量：

- `css/base.css`
- `css/social/green-river.css`（朋友圈）
- `css/finance/auction.css`（转账/支付类页面）
- `css/mail/mail-app.css`
- `css/mcp/app.css`
- `css/media/music-player.css`
- `css/phone/frame-and-minimal-chat.css`
- `css/chat/content-and-settings.css` —— 顺带修了世界书页面返回键的定位问题
  （用独立的 `.worldbook-back-btn` 布局基线，不再被全局美化 CSS 影响），
  以及新增了 `.free-template-profile` 系列选择器（配合"自由布局"功能，让
  个人主页小组件能复用现有的头像卡片样式）
- `src/html/worldbook-and-presets.html` —— 配合上面 CSS 补的 class 名

## 八、其他

- `update-log.html` / `docs/更新日志.txt` / `update-notification.js` ——
  更新日志页面和开屏"更新了什么"弹窗，加上了这次合并的 9.23 更新内容（联机
  那一条没写进去，因为联机功能没有合并，见下面说明）
- `asset-manifest.json` —— 构建脚本自动生成，收录了新增的文件

## 九、状态栏（Liya 功能）新增：可以被备份了

- `modules/data/backup/import-export.js`、
  `modules/data/backup/advanced-transfer.js` —— 状态栏预设存在独立的
  `LiyaStatusBarDB`（不是主数据库的一部分），之前完整备份/选择性备份都不会
  带上它。现在"一键备份/恢复"和"高级备份"里都加了"状态栏预设"这个分类，
  会单独读取/写入这个独立数据库，跟主库的事务分开处理（因为不同 Dexie 数据库
  没法放进同一个事务）

## 十、状态栏渲染 bug 修复

- `modules/chat/status-bar.js` —— 你上传的"古早Post2by茂茂"这个预设用的是
  "裸正则"格式（没有 `/pattern/flags` 这种斜杠包裹），代码里这种格式之前默认
  只给 `g` 标志、没给 `s`（dotAll）。AI 生成的歌词、日记这类内容很容易带出
  真实换行符，只要 51 个字段里有一个混进换行，整条正则就会匹配失败，状态栏
  直接渲染不出来。现在裸正则格式默认也带上 `s` 标志了（这个改动只会让匹配更
  宽松，不会影响原本就能匹配的预设）。
  **"复古Facebook"评论区显示不出来这个我还没实锤**，机制上跟这个 bug 不是
  一回事（它走的是 `<script>` + 原生 JS 点击事件，不依赖正则/`:has()`），
  最大嫌疑是 API 的 max_tokens 设太低导致输出被截断（评论刚好排在这个模板
  最后面）。建议检查一下这个设置，或者出问题时按 F12 看控制台有没有报错。

---

## 没有动的部分：联机（连接APP）功能

main(4) 现在的联机功能（`modules/online/manager.js` 里的 `OnlineChatManager`）
是完全独立重写的一套东西，跟 main(3) 的 `online-service.js` 方案在数据结构、
存储方式（localStorage vs 服务器持久化账号体系）上完全不兼容，不是"新旧版本"
关系，没法直接打补丁修复。这次没有改动这部分，等你确认要不要整体替换再说。
