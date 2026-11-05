# DSH Bridge（dsh-cockpit）

给 DeepSeek Harness Web 对话界面套上「未来舰桥」外壳。纯客户端 UI 插件，不改任何业务逻辑。

当前版本 **v16.0.1**（2026-11-05），实测对齐 DSH `0.1.0` 系；升级 DSH 后若类名失配，见下文《哈希类名重新对齐》。

> v15.0.0 事故记录：取景框探针（composer dock 内 flex 1 1 100%）把整行挤扁，全局布局错乱，
> 已整体回滚。另发现星点 CSS 括号不配对（rgba 吞掉渐变收尾）——v15.1 起重做并加
> **构建期 CSS 括号平衡自检**（localhost/127.0.0.1 下 console.error 报警）。
> 装饰件改为**一件一装一验**：v15.1.0 = 星野底（仅此一件，纯背景层，零布局风险）。

## 设计原则（v5）

**每个可见数字和颜色都是真的。** v4 的雷达/姿态仪/波形被判定"华而不实"，全部删除；
v5-v5.3 的 token 累计曲线因只能表现"步结束跳变"被 v6 的阶段脉冲取代。
侧柱数据源：`useProjection('sessionStats' | 'tokenUsage' | 'contextPressure' |
'contextBreakdown')` + `useSessionStatus` + `useInput`（草稿/提交相位）+
`useChat`（`legacy.partial` 流式增量、`legacy.runningCalls` 在跑工具）。

## 玻璃悬浮（v15.3）

"文字悬浮在太空上"的实现口径——**不赌层叠**：

- 天空画进 `.wSkVaW_root`（会话区最大底片）**自己的 background**，
  `background-attachment:fixed` 钉在视口。文字永远渲染在自己背景的上方，
  层级天然成立，无需把 overlay 塞到宿主不透明层之间（v15.0 教训不再犯）
- v15.2 的 z-60 前景星层与滚动视差**移除**：天空变成"窗外"——不动，
  舱内（文字/玻璃）随滚动穿过它，悬浮感更强且零每帧重绘（131 层渐变
  逐帧移动 background-position 的成本不可接受）
- 玻璃透明度保守起步：助手气泡 76–78%、用户 62–70%、输入卡 82–88%+blur(14px)
  （blur 只给数量=1 的卡；气泡不做 backdrop-filter，量大）
- 输入座渐变改半透明（实心 0.82 收尾），消息滑到 composer 下不再撞黑墙
- 侧栏**保持舰体不透明**——本次故意不做"整页太空"，留作独立一步

验收判据：滚动顺滑不掉帧；正文在玻璃上可读（不行就回调透明度参数）。

> **v15.3.1 性能修正**：实测滚动轻微卡顿，撤掉两个逐帧昂贵项——
> `background-attachment:fixed`（Chromium 对 fixed 大背景走每帧主线程重绘，
> 131 层渐变下代价巨大；且 root 本身不滚动，去掉后视觉不变）与
> 输入卡的 `backdrop-filter:blur(14px)`（sticky 悬在滚动内容上方，
> 每帧重模糊）。卡片以更高不透明度（.88/.92）补偿失去的毛玻璃感。
> **规矩：滚动路径上禁用 fixed 大背景与 backdrop-filter。**

## 深度性能优化（v16）

进入系统后卡顿的真正根因：**会话根背景上 131 层活 CSS 渐变**。它在任何使
root 失效的事件（流式新增节点、focus/phase 属性变化、resize）时**整幅重新光栅**，
Retina 下代价巨大——v15.3.1 撤掉 fixed/backdrop 只治了滚动，没治这个。

- **星空烘焙成一张位图**：`bakeSkyURL()` 用离屏 canvas 一次性画好（底色渐层、
  三片星云、暗角、seeded 远/中星层、手写近星含光晕），`toDataURL` 后经 CSS 变量
  `--dsh-sky` 交给 root 背景。稳态渲染=1 次纹理上传 + 1 次 blit，与层数无关
- **关键路径外**：`setTimeout(...,120)` 延后烘焙；期间 root 用**单层**
  `linear-gradient` 兜底（无白闪、无活渐变）。烘焙失败也只是退回兜底，不报错
- **root 背景不再含任何活渐变**（实测 `radial-gradient` 仅剩 frame 层 2 处、
  boot 层，均非 root、非逐帧失效）
- **呼吸亮星转静态**：并入位图（省掉一个 7s 无限动画）
- **心跳让位**：`visibilitychange` 下停表，不可见时 0 React 渲染；回前台自动重启
- 气泡透明度回抬（助手 84–86%、用户 72–78%）：既补失去的毛玻璃对比，也减每像素混合

判据：进入系统、滚动长会话、流式输出三种场景都应顺滑；任务管理器里该页 CPU
空闲时应接近 0。若仍有卡顿，下一个嫌疑是流式期 scanErr 每 token 扫 40 节点——
届时改增量缓存。

> **v16.0.1 事故修正**：v16 的 Python 块替换误吞了夹在星表与 PANEL 之间的
> 调色板常量（VIOLET/GREEN/AMBER/ICE/STEEL，仍被引用 45 处）→ factory 期
> ReferenceError → 插件整体降级 no-op，界面样式全丢。已全部补回。
> **新增发布纪律**：`node --check` 之后必须再跑 `node selfcheck.cjs`——
> 它用 mock 模块加载器/mock Cordis 上下文真跑 factory+apply，专抓
> 语法检查抓不到的运行时崩溃（缺常量、引用错名、守卫失衡）。

## 太空景深（v15.2）

页面变成有层次的深空——只动背景层，不碰任何布局流。

- **四层视差**：星云/暗带（0.010）→ 远星 70 颗（0.025）→ 中星 34 颗（0.055）→
  近星+呼吸星（0.095）。滚动对话时各层按系数反向微移（封顶 90px，层底预留
  95px 不露边），transform 直写 DOM、14fps + CSS 缓动，零 React 渲染
- **银河带**：程序星表按对角线密度加权（`band = 12 + x·0.72`），星星沿带聚拢
- **确定性星表**：LCG 固定种子加载时生成一次即冻结——静态纹理，和手写 22 颗
  同一性质，运行期零随机（不伪装任何测量）
- **暗角**：NEB 层自带 60%→100% 渐暗径向，把视线收拢到内容区
- **构建期自检**：CSS 括号/花括号平衡守卫在每次装载都跑（去掉域名条件），
  失衡直接 console.error——星野 15.1.1 修过的括号 bug 从此不会悄悄复发

## 红色真信号（v14）

系统出事时界面不再静默。信号全部取自宿主账本的**权威记录**（读类型确认）：

- `turn-error` 节点：回合级终态错误，含 `message`（净化后错误文本）与 `code`
  （如 `INTERRUPTED`=DSH 停止、`ACCOUNT_SIGNED_OUT`=登出取消）
- `model-retry` 节点：`retryState: scheduled|started|cancelled`——失败步的重试生命周期
- `tool-result.isError`：单次工具调用失败

表现：
- **AGENT 状态灯**：有未恢复的 turn-error 时转红呼吸，文案 `故障`/`已停止`
- **AGENT 故障行**：`失败 ×N · CODE · 重试排队/重试中`，悬停 title 显示错误 message
  （扫描最近 40 个已加载节点，只数真实的）
- **FLOW**：错误落账那一刻相位转红一格（球到 78 位红闪），flow-now 显 `故障`
- **`↺` 未读脉冲**：`SessionStatus.completionUnread` 为真（后台跑完且没看过）时青色呼吸催看

## 单一心跳（v13）

v12 前全插件挂着 **~12 个 setInterval**：每个 URow 一个 70ms 缓动循环（7个）、
FLOW 200ms 采样、各组件 1000ms 时钟。v13 收敛为**工厂级单例心跳**：一个 70ms
interval + `subscribeBeat` 订阅分发，首个订阅者启动、最后一个离开自动停止。
- useClock：由心跳派生，仅跨秒才 re-render
- useEased：全部挂共享心跳（React 18 自动批处理，一次心跳合并所有数字滚动）
- FLOW：采样门槛 ≥195ms 保持 32s 窗口；think/跑/写 三段计时改用**真实 dt 累计**
  （此前假设整 200ms，现在毫秒实测）

## 交互（v12）

- **待你确认 → 真跳转**：有 pendingInteraction 时 AGENT 状态行出现琥珀`跳转`按钮，
  点击 smooth-scroll 到最近的确认卡（宿主真实锚点 `[data-approval-key]`），到达处金色光圈一闪
- **`↺` 回到最新**：常亮小按钮，滚到历史深处时一键回到最新回合（锚点 `[data-turn-tail]`）
- **悬停精确值**：USE/MIX 每行 title 显示逗号精确整数 + 占比；CTX 弧卡 title 显示
  `182,400 / 1,048,576 tok · 17.39%`——显示层永远是约数，真相在悬停里
- 实现走原生 DOM 锚点与 title 属性，不依赖宿主私有 hook，升级耐受

## 效果清单

| 位置 | 内容 | 数据 |
|---|---|---|
| 加载页 | 一次性开机自检（约 3 秒） | 装饰 |
| 全屏 | 四边发丝线 + 工程刻度 + 切角括号 + 深空光晕背景（两团极淡径向渐变，无条纹无扫描线） | 装饰 |
| 顶部胶囊 | BRIDGE // MK-IV · **UPTIME**（页面加载起计时） | UPTIME 真实 |
| 左仪表柱（≥1520px；侧栏折叠后 ≥1330px） | **AGENT**：实时状态灯 + 回合/步数 + 推理vs工具时间分配条 + 首字延迟 + 解码速率（v9 追加：本回合 想/跑/写 微时间条、实测首字延迟滚动计时、在跑工具角标）；**FLOW**：`你⇄我` 双主体光点（球位置=相位机真实归属，0.65s 缓动传球）+ 双踪示波带：上泳道青色=推理流字数增速波形（`partial.blocks` reasoning 增量），下泳道绿色=成文波形，底边细色带=状态基线）+ 回合切换白线与 prompt 预览闪戳（2.6s 淡出，`navigation.items().prompt` 真实文本）+ 秒表与 思/文 字数对 | 全真实（`useInput` / `legacy.partial` 增量 / `legacy.runningCalls` / `useSessionStatus` / `sessionStats.turns` / `navigation` 预览） |
| 右仪表柱（≥1440px） | **CTX**：上下文占用弧 + 真实百分比 + 已用/容量；**MIX**：系统/工具/消息构成堆叠条 + 缓存命中率；**USE**：输出/未缓存入/读缓存/写缓存四桶带比例条 | 全真实 |
| 输入框上方 | ~~VECTOR 航向条 / 播报线~~（v11 已移除：与两侧面板冲突，且信息重复） | — |
| 输入框下方 | MSN 芯片 / TOK 芯片 / 控制台甲板（状态灯、引擎电平、CTX 百分比条、会话 ID、时钟） | 全真实 |
| 对话流 | `◇ TURN nn ◇` 分隔线 | 真实回合号 |
| 空白会话页 | 六边形舰桥徽标 | 装饰 |

输入框、发送按钮、气泡、上下文圆环的 HUD 化覆写保留（v4 同款）。

## 稳定性契约（v4.1 起，事故后加固）

- factory 整体 try/catch：物化失败降级为空插件，不阻塞 harness 启动
- 每个组件包错误边界：单个 HUD 件抛错只让自己消失
- 宿主 hook 全部 typeof 防护
- 所有注册用自有 id（bridge-*）；原装统计药丸用 CSS 隐藏（`.bOPqQW_anchor`）
- 每条注册独立 try/catch

## 生动化（v9）：静态面板接活的手法（全部真数据）

- **AGENT**：`本回合` 微时间条（think/tool/write 三段由 FLOW 同一台 200ms 相位采样机
  累计，纯实测）；`首字` 行优先显示**本回合实测 TTFT**（等待时秒数滚动带 …，
  第一个字落地即定格），无本回合数据时回落历史均值；工具在跑时状态行右侧 `▸N` 角标
- **CTX**：弧的扫过角度用 `useEased` 缓动到位（显示层动画，终值=真值）；运行时
  fill 呼吸发光；右侧 `+N 字` 实时字数流小标（真字数，不做 token 换算）
- **MIX/USE**：每行数字 `useEased` 滚动计数 + 条宽缓动；结算跳变时 `useDelta`
  闪一个 `+1.2k` 幽灵增量，1.6s 淡出
- 缓动/幽灵都是显示层，**没有任何模拟数值**

## 宿主改造（CSS 覆写）

- **输入卡片**：深空仪器玻璃、青色发丝边框、四角 HUD 括号、聚焦发光；卡片内文字变量局部改写，浅色主题下也保持深舱风格
- **发送/停止按钮**：切角平行四边形、青色渐变、发光，禁用态变暗
- **+ 按钮、模型选择器、重试芯片**：同语言切角化
- **消息气泡**：助手=左下切角全息板，用户=右下切角+更亮的青色渐变
- **上下文圆环（ContextMeter）**：描边改青色

⚠️ 宿主覆写的选择器钉在**当前已安装 DSH 构建**的 CSS-module 哈希上
（`uV2eYG_*` 输入条、`Sixlwa_*` 消息、`JObwrW_*` 上下文表、`wSkVaW_*` 会话根/输入座）。
升级 DSH 后哈希变了，覆写会静默失效（回到宿主默认样式），插件其余部分不受影响。
重新对齐方法：在 `dsh-client-ui-conversation/lib/client.js` 里搜
`InputBar_module_css_default`、在 `dsh-client-ui-chat/lib/client.js` 里搜
`MessageItem_module_css_default`，把新哈希替换进 `client.js` 的 HOST 覆写段。

## 文件结构

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单（`dsh.bundle.patch` + `dsh.client`） |
| `cordis.patch.yml` | Loader 补丁：插入 `dsh-cockpit` 行 |
| `index.js` | Host 半边（空 apply，全部渲染在客户端） |
| `client.js` | **全部实现**：调色板 TOKENS、字典 DICT、样式 CSS、组件 |
| `locale/zh.json` `locale/en.json` | 插件标题与描述 |
| `icon.svg` | 插件图标 |

## 调整指南

- **改配色**：`client.js` 顶部 `TOKENS`（必须 `{light, dark}` 成对）+ `AZ/ICE/STEEL/PANEL` 常量
- **改仪表柱宽度/断点**：`.dsh-br-inst` 的 `width` 和 `@media` 断点；左柱水平位置由 JS 实时跟随
  侧栏真实宽度（读 AppFrame 内联 `gridTemplateColumns` 第一轨 +14px 边距，MutationObserver 跟踪
  折叠/拖拽），CSS 里的 `left:296px` 仅是测量失败时的回退值
- **关掉开机动画**：删掉 `bridge-boot` 那段 `ctx.slots.inject`
- **恢复原装 token/活动药丸**：删掉 CSS 里 `.bOPqQW_anchor` 那一行

## 安装 / 卸载

在 DSH 会话里用插件管理器（或从 GitHub 安装）：

```
plugin_manager install_bundle Radicas/dsh-cockpit        # GitHub
plugin_manager install_bundle /绝对路径/dsh-cockpit        # 本地 clone
plugin_manager remove_bundle dsh-cockpit
```

`install_bundle` 会自动把本 bundle 加入 profile 的 `dsh.profile.bundles`，无需手工挂
patch；仓库里的 `cordis.patch.yml` 只是 bundle 层的占位记录，可以不管。

改了代码后需 remove + install 重新生成模块。作用于安装到的 profile 的全部会话，可在 Settings → Plugins 停用。

## 许可

未附 LICENSE 文件，**默认保留所有权利**（可个人使用/阅读，未经许可再分发）。
