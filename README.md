# DSH Bridge（dsh-cockpit）

给 DeepSeek Harness Web 对话界面套上「未来舰桥」外壳。纯客户端 UI 插件，不改任何业务逻辑。

当前定版 **v12.0.0**（2026-11-05），实测对齐 DSH `0.1.0` 系；升级 DSH 后若类名失配，见下文《哈希类名重新对齐》。

## 设计原则（v5）

**每个可见数字和颜色都是真的。** v4 的雷达/姿态仪/波形被判定"华而不实"，全部删除；
v5-v5.3 的 token 累计曲线因只能表现"步结束跳变"被 v6 的阶段脉冲取代。
侧柱数据源：`useProjection('sessionStats' | 'tokenUsage' | 'contextPressure' |
'contextBreakdown')` + `useSessionStatus` + `useInput`（草稿/提交相位）+
`useChat`（`legacy.partial` 流式增量、`legacy.runningCalls` 在跑工具）。

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
（`uV2eYG_*` 输入条、`Sixlwa_*` 消息、`JObwrW_*` 上下文表）。
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
