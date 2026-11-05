/**
 * Bridge HUD — Client half (v5, real-telemetry redesign).
 *
 * Side clusters now carry ONLY real AI data (fake radar/attitude/waveform
 * from v4 were removed as "dressed-up but empty"):
 *  LEFT (session-bound, fixed column):
 *   - AGENT: live run/input/standby LED, real time split LLM vs tools,
 *     real TTFT and decode tokens/s
 *   - FLOW: live phase timeline — every 200ms the true pipeline state
 *     (typing / submit flight / reasoning / generating / tool run /
 *     awaiting-user / idle) is sampled from live stores and drawn as a
 *     scrolling pulse strip with an IN▸AGENT▸OUT pipeline glyph
 *  RIGHT (session-bound, fixed column):
 *   - CONTEXT: arc gauge of the real context-pressure percentage
 *   - MIX: real context composition (system/tools/messages) + cache hit
 *   - USAGE: four real token buckets with proportional bars
 * Plus: subtle depth wash for the whole background, chamfered frame,
 * HUD chips/deck under the composer, host composer/bubble restyle.
 *
 * Robustness contract (unchanged since the v4.0.0 incident):
 *  - factory wrapped in try/catch: materialization failure degrades to a
 *    no-op plugin, never blocks harness boot;
 *  - every registered component wrapped in an error boundary;
 *  - every host hook prop typeof-guarded before use;
 *  - all slot registrations use fresh bridge-* ids; shipped cells are only
 *    hidden via CSS, never taken over.
 *
 * Host restyle selectors are pinned to the CSS-module hashes of the
 * currently installed DSH build (uV2eYG_/Sixlwa_/JObwrW_/bOPqQW_); after a
 * DSH upgrade they stop matching and the host defaults return.
 */
window.__ModuleLoader__.load({
  id: 'dsh-cockpit',
  factory(require) {
    try {
    const React = require('react');
    const h = React.createElement;
    const F = React.Fragment;
    const { useEffect, useRef, useState } = React;

    const NS = 'bridge';
    const SOURCE = 'dsh-cockpit';
    const BOOT_TS = Date.now();

    // ---------------------------------------------------------------- palette
    const AZ = '#57d8ff';
    const AZ_DIM = 'rgba(87,216,255,.30)';
    const AZ_FAINT = 'rgba(87,216,255,.14)';
    const VIOLET = '#8b7cf6';
    const GREEN = '#4ade80';
    const AMBER = '#ffc46b';
    const ICE = '#dff2ff';
    const STEEL = 'rgba(148,183,208,.72)';

    /* Near-star table: hand-written fixed coords [x%, y%, bright]. Baked into
       the sky bitmap once at load (see bakeSkyURL) — a texture, never a
       runtime measurement. Seeded far/mid tiers use a frozen LCG below. */
    const STARS_T = [
      [17, 8, 1], [42, 14, 0], [71, 6, 0], [88, 19, 1], [9, 27, 0], [63, 23, 0],
      [34, 31, 1], [80, 34, 0], [25, 44, 0], [55, 49, 1], [5, 55, 0], [72, 57, 0],
      [94, 52, 0], [40, 63, 0], [12, 71, 1], [60, 76, 0], [85, 73, 0], [28, 83, 0],
      [48, 88, 1], [77, 90, 0], [6, 95, 0], [92, 86, 0],
    ];

    /** Bake the whole sky into ONE bitmap (base wash, three nebulae, vignette,
     *  seeded far/mid tiers, hand near-stars) and hand it to CSS via
     *  --dsh-sky. Rationale: 131 live gradient layers re-raster across a Retina
     *  viewport and dominate paint; a frozen image is one texture upload and
     *  a single blit. Runs once per page, off the critical path. */
    function bakeSkyURL() {
      const cv = document.createElement('canvas');
      const W = (cv.width = 2048);
      const H = (cv.height = 1152);
      const g = cv.getContext('2d');
      if (g == null) return '';
      const S = W / 1440;
      const base = g.createLinearGradient(0, H, 0, 0);
      base.addColorStop(0, '#050b16');
      base.addColorStop(1, '#03060c');
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      const nebs = [
        [0.22, 0.24, 0.38, 0.26, '56,130,246', 0.09],
        [0.68, 0.62, 0.3, 0.22, '87,216,255', 0.075],
        [0.44, 0.4, 0.46, 0.3, '120,160,255', 0.055],
      ];
      for (let i = 0; i < nebs.length; i++) {
        const q = nebs[i];
        const rx = (q[2] * W) / 2;
        const ry = (q[3] * H) / 2;
        g.save();
        g.translate(q[0] * W, q[1] * H);
        g.scale(1, ry / rx);
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        rg.addColorStop(0, 'rgba(' + q[4] + ',' + q[5] + ')');
        rg.addColorStop(1, 'rgba(' + q[4] + ',0)');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(0, 0, rx, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      const vg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.72);
      vg.addColorStop(0, 'rgba(2,4,8,0)');
      vg.addColorStop(0.6, 'rgba(2,4,8,0)');
      vg.addColorStop(1, 'rgba(2,4,8,.5)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
      const tier = function (n, seed, aLo, aHi, r, bias) {
        let s = seed >>> 0;
        const rnd = function () {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          return s / 4294967296;
        };
        g.fillStyle = '#dff2ff';
        for (let i = 0; i < n; i++) {
          const px = rnd() * 100;
          let py = rnd() * 100;
          const band = 12 + px * 0.72;
          if (Math.abs(py - band) > 26 && rnd() < bias) py = Math.min(99, Math.max(1, band + (rnd() - 0.5) * 20));
          g.globalAlpha = aLo + rnd() * (aHi - aLo);
          g.beginPath();
          g.arc((px / 100) * W, (py / 100) * H, r * S, 0, Math.PI * 2);
          g.fill();
        }
      };
      tier(70, 0x5f3a91, 0.1, 0.22, 0.5, 0.55);
      tier(34, 0x2b7e14, 0.26, 0.45, 0.8, 0.6);
      for (let i = 0; i < STARS_T.length; i++) {
        const p = STARS_T[i];
        const x = (p[0] / 100) * W;
        const y = (p[1] / 100) * H;
        if (p[2]) {
          const rg = g.createRadialGradient(x, y, 0, x, y, 4.5 * S);
          rg.addColorStop(0, 'rgba(223,242,255,.9)');
          rg.addColorStop(0.35, 'rgba(223,242,255,.35)');
          rg.addColorStop(1, 'rgba(223,242,255,0)');
          g.globalAlpha = 1;
          g.fillStyle = rg;
          g.beginPath();
          g.arc(x, y, 4.5 * S, 0, Math.PI * 2);
          g.fill();
        } else {
          g.globalAlpha = 0.5;
          g.fillStyle = '#dff2ff';
          g.beginPath();
          g.arc(x, y, 0.75 * S, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      return cv.toDataURL('image/png');
    }

    const PANEL = 'linear-gradient(180deg,rgba(9,19,32,.82),rgba(5,11,20,.9))';
    const HAIR = '1px solid rgba(87,216,255,.26)';

    const TOKENS = {
      '--dsw-alias-bg-base': { light: '#edf2f8', dark: '#050912' },
      '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#081120' },
      '--dsw-alias-bg-layer-2': { light: '#e2ebf3', dark: '#0c1828' },
      '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#0a1524' },
      '--dsw-alias-border-l1': { light: '#c4d4e3', dark: '#16283d' },
      '--dsw-alias-border-l2': { light: '#8db0ca', dark: '#24445f' },
      '--dsw-alias-brand-primary': { light: '#0284c7', dark: '#38bdf8' },
      '--dsw-alias-label-primary': { light: '#0b2237', dark: '#e6f4ff' },
      '--dsw-alias-label-secondary': { light: '#4a6680', dark: '#8fa9c2' },
      '--dsw-specific-sidebar-fill': { light: '#e7eef6', dark: '#04080f' },
    };

    const DICT = {
      zh: {
        run: '运行',
        standby: '待机',
        input: '待输入',
        goto: '跳转',
        latest: '回到最新',
        fault: '故障',
        halted: '已停止',
        failN: '失败',
        retryWait: '重试排队',
        retryGo: '重试中',
        session: '会话',
        local: '舰桥时',
        vector: '航向',
        link: '链路',
        az: '方位',
        turn: '回合',
        sys: '系统',
        engine: '引擎',
        bridge: '舰桥',
        uptime: '在线',
        mission: '任务',
        speed: '速率',
        cps: '字/秒',
        heur: '估算',
        tokens: '令牌',
        out: '输出',
        cache: '缓存',
        ctx: '上下文',
        agent: '代理',
        llm: '推理',
        tool: '工具',
        ttft: '首字',
        flow: '吞吐',
        rate: '流速',
        total: '累计',
        compose: '构成',
        usage: '用量',
        system: '系统段',
        tools: '工具',
        msgs: '消息',
        hit: '命中',
        read: '读缓存',
        write: '写缓存',
        in: '未缓存入',
        idle: '待机',
        type: '打字中',
        sub: '提交链路',
        think: '推理中',
        out: '生成中',
        tool: '工具执行',
        ask: '等待确认',
        fail: '故障',
        waitYou: '待你确认',
        exec: '执行',
        gen: '生成中',
        draft: '草稿',
        ready: '就绪',
        stepK: '步',
        elapsed: '已',
        inNode: '输入',
        agentNode: '推理',
        outNode: '输出',
        turns: '总回合',
        you: '你',
        me: '我',
        written: '已写',
        charUnit: '字',
        rea: '思',
        txt: '文',
        ltThink: '想',
        ltTool: '跑',
        ltWrite: '写',
      },
      en: {
        run: 'RUN',
        standby: 'STBY',
        input: 'INPUT',
        goto: 'GO',
        latest: 'LATEST',
        fault: 'FAULT',
        halted: 'STOPPED',
        failN: 'FAIL',
        retryWait: 'RETRY Q',
        retryGo: 'RETRYING',
        session: 'SES',
        local: 'BRIDGE',
        vector: 'VECTOR',
        link: 'LINK',
        az: 'AZ',
        turn: 'TURN',
        sys: 'SYS',
        engine: 'ENG',
        bridge: 'BRIDGE',
        uptime: 'UPTIME',
        mission: 'MSN',
        speed: 'SPD',
        cps: 'ch/s',
        heur: 'estimated',
        tokens: 'TOK',
        out: 'OUT',
        cache: 'CACHE',
        ctx: 'CTX',
        agent: 'AGENT',
        llm: 'LLM',
        tool: 'TOOL',
        ttft: 'TTFT',
        flow: 'FLOW',
        rate: 'RATE',
        total: 'TOTAL',
        compose: 'MIX',
        usage: 'USE',
        system: 'SYS',
        tools: 'TOOLS',
        msgs: 'MSG',
        hit: 'HIT',
        read: 'CACHE-R',
        write: 'CACHE-W',
        in: 'IN-UNC',
        idle: 'IDLE',
        type: 'TYPING',
        sub: 'SUBMIT',
        think: 'THINKING',
        out: 'GENERATING',
        tool: 'TOOLS',
        ask: 'AWAITING',
        fail: 'FAULT',
        waitYou: 'NEEDS YOU',
        exec: 'EXEC',
        gen: 'GENERATING',
        draft: 'DRAFT',
        ready: 'READY',
        stepK: 'STEP',
        elapsed: 'UP',
        inNode: 'IN',
        agentNode: 'AGENT',
        outNode: 'OUT',
        turns: 'TURNS',
        you: 'YOU',
        me: 'ME',
        written: 'WRITTEN',
        charUnit: 'ch',
        rea: 'RSN',
        txt: 'TXT',
        ltThink: 'THINK',
        ltTool: 'TOOL',
        ltWrite: 'WRITE',
      },
    };

    const BOOT_LINES = [
      '> CORE MK-IV ............. ONLINE',
      '> NEURAL LINK ............ SYNCED',
      '> GRID TELEMETRY ......... 98.6%',
      '> HUD CALIBRATION ........ DONE',
    ];

    // ------------------------------------------------------------------ styles
    const CSS = [
      '@keyframes dsh-br-spin{to{transform:rotate(360deg)}}',
      '@keyframes dsh-br-pulse{0%,100%{opacity:.35}50%{opacity:1}}',
      '@keyframes dsh-br-eq{0%,100%{transform:scaleY(.16)}50%{transform:scaleY(1)}}',
      '@keyframes dsh-br-caret{0%,55%{opacity:1}56%,100%{opacity:0}}',
      '@keyframes dsh-br-breathe{0%,100%{opacity:.55}50%{opacity:1}}',
      '@keyframes dsh-br-draw{from{stroke-dashoffset:220}to{stroke-dashoffset:0}}',
      '@keyframes dsh-br-fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes dsh-br-bootout{to{opacity:0;visibility:hidden}}',
      '@keyframes dsh-br-ruler{from{background-position:0 0}to{background-position:-26px 0}}',

      /* --- frame (root decoration) ------------------------------------- */
      '.dsh-br-frame{position:fixed;inset:0;z-index:60;pointer-events:none;overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-br-depth{position:absolute;inset:0;background:radial-gradient(58% 44% at 14% 6%,rgba(56,189,248,.022),transparent 70%),radial-gradient(50% 42% at 88% 94%,rgba(87,216,255,.02),transparent 70%)}',
      /* The conversation root IS the sky: layered starfields painted into its
         own background with fixed attachment — text and bubbles always render
         above their own background (no stacking gamble), the view outside the
         window stays put while the cabin scrolls. */
      '.wSkVaW_root.wSkVaW_root{background-color:#04070d;background-image:var(--dsh-sky,linear-gradient(0deg,#050b16,#03060c));background-size:cover;background-position:center;background-repeat:no-repeat}',
      '.wSkVaW_root[data-phase=active] .wSkVaW_composerSeat.wSkVaW_composerSeat{background:linear-gradient(180deg,rgba(4,8,15,0) 0px,rgba(4,8,15,.82) 44px)}',
      '.dsh-br-edge{position:absolute;pointer-events:none}',
      '.dsh-br-edge[data-edge="top"],.dsh-br-edge[data-edge="bottom"]{left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 2%,' + AZ_DIM + ' 18%,' + AZ + ' 50%,' + AZ_DIM + ' 82%,transparent 98%);opacity:.7}',
      '.dsh-br-edge[data-edge="top"]{top:6px}',
      '.dsh-br-edge[data-edge="bottom"]{bottom:6px}',
      '.dsh-br-edge[data-edge="left"],.dsh-br-edge[data-edge="right"]{top:0;bottom:0;width:1px;background:linear-gradient(180deg,transparent 2%,' + AZ_DIM + ' 18%,' + AZ + ' 50%,' + AZ_DIM + ' 82%,transparent 98%);opacity:.55}',
      '.dsh-br-edge[data-edge="left"]{left:6px}',
      '.dsh-br-edge[data-edge="right"]{right:6px}',
      '.dsh-br-ticks{position:absolute;left:14%;right:14%;height:5px;background:repeating-linear-gradient(90deg,' + AZ_FAINT + ' 0 1px,transparent 1px 26px);opacity:.9}',
      '.dsh-br-ticks[data-at="top"]{top:7px}',
      '.dsh-br-ticks[data-at="bottom"]{bottom:7px}',

      '.dsh-br-corner{position:absolute;width:52px;height:52px}',
      '.dsh-br-corner b{position:absolute;display:block;background:linear-gradient(90deg,' + AZ + ',rgba(87,216,255,.08));opacity:.85}',
      '.dsh-br-corner b.h{left:0;top:0;width:34px;height:1.5px}',
      '.dsh-br-corner b.v{left:0;top:0;width:1.5px;height:34px;background:linear-gradient(180deg,' + AZ + ',rgba(87,216,255,.08))}',
      '.dsh-br-corner i{position:absolute;left:11px;top:11px;width:3px;height:3px;border-radius:50%;background:' + AZ + ';box-shadow:0 0 6px rgba(87,216,255,.9);animation:dsh-br-breathe 3.2s ease-in-out infinite}',

      '.dsh-br-pill{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:3px 16px;font-size:8px;line-height:1;letter-spacing:.26em;text-transform:uppercase;color:' + STEEL + ';background:rgba(8,17,30,.72);border:1px solid rgba(87,216,255,.22);clip-path:polygon(9px 0,calc(100% - 9px) 0,100% 50%,calc(100% - 9px) 100%,9px 100%,0 50%);white-space:nowrap}',
      '.dsh-br-pill b{color:' + ICE + ';font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsh-br-pill-dot{width:4px;height:4px;border-radius:50%;background:' + GREEN + ';box-shadow:0 0 6px rgba(74,222,128,.9);animation:dsh-br-pulse 2.4s ease-in-out infinite}',
      '@media (max-width:900px){.dsh-br-pill{display:none}}',

      /* --- fixed side instrument columns (session-scoped data) ---------- */
      '.dsh-br-inst{position:fixed;top:92px;bottom:200px;z-index:60;display:flex;flex-direction:column;gap:9px;pointer-events:none;user-select:none;-webkit-user-select:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;transition:left .25s ease}',
      '.dsh-br-inst[data-side="left"]{left:296px;width:184px;display:none}',
      '.dsh-br-inst[data-side="right"]{right:16px;width:212px;display:none}',
      '@media (min-width:1520px){.dsh-br-inst[data-side="left"]{display:flex}}',
      '@media (min-width:1330px){[data-sidebar-collapsed] .dsh-br-inst[data-side="left"]{display:flex}}',
      '@media (min-width:1440px){.dsh-br-inst[data-side="right"]{display:flex}}',

      '.dsh-br-panel{position:relative;padding:9px 10px 8px;background:' + PANEL + ';border:' + HAIR + ';clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 0 24px rgba(56,189,248,.04);display:flex;flex-direction:column;min-height:0}',
      '.dsh-br-panel[data-grow="1"]{flex:1 1 auto}',
      '.dsh-br-panel-head{display:flex;justify-content:space-between;align-items:center;font-size:7.5px;letter-spacing:.24em;text-transform:uppercase;color:' + STEEL + ';margin-bottom:6px;flex:none}',
      '.dsh-br-panel-head b{color:' + AZ + ';font-weight:600;font-variant-numeric:tabular-nums}',

      /* agent status + split */
      '.dsh-br-live{display:flex;align-items:center;gap:8px;margin-bottom:7px}',
      '.dsh-br-live-led{flex:none;width:8px;height:8px;border-radius:50%;background:#5b7086;box-shadow:0 0 8px rgba(91,112,134,.8)}',
      '.dsh-br-live-led[data-live="run"]{background:' + GREEN + ';box-shadow:0 0 10px rgba(74,222,128,.95);animation:dsh-br-pulse 1.2s ease-in-out infinite}',
      '.dsh-br-live-led[data-live="input"]{background:' + AMBER + ';box-shadow:0 0 10px rgba(255,196,107,.95);animation:dsh-br-pulse .8s ease-in-out infinite}',
      '.dsh-br-live-led[data-live="fault"],.dsh-br-live-led[data-live="halted"]{background:#ff6b6b;box-shadow:0 0 10px rgba(255,107,107,.95);animation:dsh-br-pulse .7s ease-in-out infinite}',
      '.dsh-br-live-state[data-live="fault"],.dsh-br-live-state[data-live="halted"]{color:#ff9d9d}',
      '.dsh-br-failrow{color:#ff9d9d;cursor:help}',
      '.dsh-br-failrow b{color:#ffbaba;font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsh-br-jump[data-k="latest"][data-unread="true"]{animation:dsh-br-pulse .9s ease-in-out infinite;border-color:rgba(87,216,255,.9);background:rgba(87,216,255,.22);color:#dff2ff}',
      '.dsh-br-live-state{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:' + STEEL + '}',
      '.dsh-br-live-state[data-live="run"]{color:#8ce8b0}',
      '.dsh-br-live-state[data-live="input"]{color:#ffd79a}',
      '.dsh-br-live-count{margin-left:auto;font-size:9px;color:' + ICE + ';font-variant-numeric:tabular-nums}',
      '.dsh-br-split{display:flex;gap:1px;height:8px;overflow:hidden}',
      '.dsh-br-split i{display:block;height:100%;transition:width .8s ease}',
      '.dsh-br-split i[data-k="llm"]{background:linear-gradient(90deg,rgba(87,216,255,.5),' + AZ + ')}',
      '.dsh-br-split i[data-k="tool"]{background:linear-gradient(90deg,rgba(139,124,246,.5),' + VIOLET + ')}',
      '.dsh-br-split i[data-k="rest"]{background:rgba(87,216,255,.08)}',
      '.dsh-br-srow{display:flex;gap:8px;margin-top:6px;font-size:7.5px;letter-spacing:.16em;text-transform:uppercase;color:' + STEEL + '}',
      '.dsh-br-srow b{color:' + ICE + ';font-weight:500;font-variant-numeric:tabular-nums;margin-left:3px}',
      '.dsh-br-key{display:inline-block;width:6px;height:6px;margin-right:4px;vertical-align:1px}',
      '.dsh-br-key[data-k="llm"]{background:' + AZ + '}',
      '.dsh-br-key[data-k="tool"]{background:' + VIOLET + '}',

      /* flow pulse: two-subject ball + waveform strip + turn flash */
      '.dsh-br-ball-row{display:flex;align-items:center;gap:6px;margin-bottom:7px;font-size:7px;letter-spacing:.2em;text-transform:uppercase;flex:none}',
      '.dsh-br-ball-name{flex:none;color:rgba(148,183,208,.55);transition:color .3s,text-shadow .3s}',
      '.dsh-br-ball-name[data-lit="1"]{color:#dff2ff;text-shadow:0 0 8px rgba(87,216,255,.7)}',
      '.dsh-br-ball-track{position:relative;flex:1 1 auto;height:1px;background:linear-gradient(90deg,rgba(87,216,255,.28),rgba(87,216,255,.10))}',
      '.dsh-br-ball{position:absolute;top:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:' + AZ + ';box-shadow:0 0 12px rgba(87,216,255,.85);transition:left .65s cubic-bezier(.25,.7,.25,1),background .35s,box-shadow .35s}',
      '.dsh-br-ball[data-p="idle"]{background:#5b7086;box-shadow:0 0 6px rgba(91,112,134,.5);animation:dsh-br-breathe 3.2s ease-in-out infinite}',
      '.dsh-br-ball[data-p="think"]{animation:dsh-br-breathe 1.5s ease-in-out infinite}',
      '.dsh-br-ball[data-p="out"]{background:' + GREEN + ';box-shadow:0 0 12px rgba(74,222,128,.9)}',
      '.dsh-br-ball[data-p="tool"]{background:' + VIOLET + ';box-shadow:0 0 12px rgba(139,124,246,.9)}',
      '.dsh-br-ball[data-p="ask"]{background:' + AMBER + ';box-shadow:0 0 12px rgba(255,196,107,.9)}',
      '.dsh-br-ball[data-p="type"],.dsh-br-ball[data-p="sub"]{background:#bfe6ff;box-shadow:0 0 10px rgba(191,230,255,.8)}',
      '.dsh-br-flow-now{margin-left:2px;font-weight:600;letter-spacing:.16em;font-variant-numeric:tabular-nums;flex:none}',
      '.dsh-br-flow-now[data-p="think"]{color:' + AZ + '}',
      '.dsh-br-flow-now[data-p="out"]{color:#8ce8b0}',
      '.dsh-br-flow-now[data-p="tool"]{color:#b3a5ff}',
      '.dsh-br-flow-now[data-p="ask"]{color:#ffd79a}',
      '.dsh-br-flow-now[data-p="type"],.dsh-br-flow-now[data-p="sub"]{color:#cfe9ff}',
      '.dsh-br-flow-now[data-p="idle"]{color:rgba(148,183,208,.5)}',
      '.dsh-br-flow-now[data-p="fail"]{color:#ff9d9d}',
      '.dsh-br-strip-wrap{position:relative;flex:1 1 auto;min-height:44px;display:flex}',
      '.dsh-br-strip{width:100%;height:100%;display:block}',
      '.dsh-br-strip .dsh-br-strip-head{animation:dsh-br-pulse 1s ease-in-out infinite}',
      '.dsh-br-flash{position:absolute;top:-3px;font-size:6.5px;letter-spacing:.1em;color:#cfe9ff;white-space:nowrap;pointer-events:none;max-width:120px;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 8px rgba(87,216,255,.85);font-style:italic}',
      '.dsh-br-lane{position:absolute;left:2px;font-size:5.5px;letter-spacing:.24em;opacity:.55;z-index:1;pointer-events:none}',

      /* liveliness: eased numbers, delta ghosts, live-turn micro bar */
      '.dsh-br-ghost{position:absolute;right:0;top:-7px;font-size:6.5px;font-style:normal;color:#8ce8b0;pointer-events:none;text-shadow:0 0 6px rgba(74,222,128,.5)}',
      '.dsh-br-urow{position:relative}',
      '.dsh-br-liveturn{display:flex;align-items:center;gap:6px;margin-top:7px}',
      '.dsh-br-ltbar{flex:1 1 auto;height:5px;display:flex;gap:1px;background:rgba(87,216,255,.06);overflow:hidden}',
      '.dsh-br-ltbar i{display:block;height:100%;transition:width .3s ease}',
      '.dsh-br-ltbar i[data-k="think"]{background:' + AZ + '}',
      '.dsh-br-ltbar i[data-k="tool"]{background:' + VIOLET + '}',
      '.dsh-br-ltbar i[data-k="write"]{background:' + GREEN + '}',
      '.dsh-br-lttxt{flex:none;font-size:7.5px;letter-spacing:.08em;color:rgba(148,183,208,.75);font-variant-numeric:tabular-nums}',
      '.dsh-br-tools{margin-top:7px;display:flex;flex-direction:column;gap:2px;flex:0 0 auto;overflow:hidden;max-height:64px}',
      '.dsh-br-tools-head{font-size:7px;letter-spacing:.18em;text-transform:uppercase;color:rgba(148,183,208,.55);margin-bottom:2px}',
      '.dsh-br-tools-head b{color:#b3a5ff;font-weight:500;margin-left:4px;font-variant-numeric:tabular-nums}',
      '.dsh-br-trow{display:flex;align-items:center;gap:5px;font-size:7.5px;letter-spacing:.06em;color:rgba(148,183,208,.9)}',
      '.dsh-br-tdot{flex:none;width:3px;height:3px;background:' + VIOLET + '}',
      '.dsh-br-tname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-br-tdur{flex:none;color:#b3a5ff;font-variant-numeric:tabular-nums}',
      '.dsh-br-trow[data-err="true"] .dsh-br-tname,.dsh-br-trow[data-err="true"] .dsh-br-tdur{color:#ff9d9d}',
      '.dsh-br-trow[data-err="true"] .dsh-br-tdot{background:#ff6b6b}',
      '.dsh-br-trow[data-live="true"] .dsh-br-tname,.dsh-br-trow[data-live="true"] .dsh-br-tdur{color:' + AZ + '}',
      '.dsh-br-trow[data-live="true"] .dsh-br-tdot{background:' + AZ + ';animation:dsh-br-pulse 1.1s ease-in-out infinite}',
      '.dsh-br-spark{display:flex;align-items:flex-end;gap:1px;height:12px;margin-top:5px}',
      '.dsh-br-spark i{flex:1 1 auto;min-width:0;background:linear-gradient(180deg,' + AZ + ',rgba(87,216,255,.22));opacity:.8}',
      '.dsh-br-ltcalls{flex:none;font-size:7.5px;color:#b3a5ff;font-variant-numeric:tabular-nums}',
      '.dsh-br-arc[data-live="run"] .dsh-br-arc-fill{animation:dsh-br-breathe 1.6s ease-in-out infinite}',
      '.dsh-br-arc-delta{font-size:7.5px;color:#8ce8b0;letter-spacing:.1em;font-variant-numeric:tabular-nums}',

      /* interaction: real jump buttons + hover precision tooltips */
      '.dsh-br-panel{pointer-events:auto}',
      '.dsh-br-jump{flex:none;cursor:pointer;font:inherit;font-size:7.5px;letter-spacing:.16em;padding:2px 7px;border:1px solid rgba(255,196,107,.45);background:rgba(255,196,107,.08);color:#ffd79a;transition:background .18s ease,border-color .18s ease}',
      '.dsh-br-jump:hover{background:rgba(255,196,107,.22);border-color:rgba(255,196,107,.9)}',
      '.dsh-br-jump[data-k="latest"]{border-color:rgba(87,216,255,.32);background:rgba(87,216,255,.06);color:#9fe4ff}',
      '.dsh-br-jump[data-k="latest"]:hover{background:rgba(87,216,255,.16);border-color:rgba(87,216,255,.7)}',
      '.dsh-br-urow{cursor:help}',
      '.dsh-br-arc{cursor:help}',
      '[data-approval-key].dsh-br-flash,[data-turn-tail].dsh-br-flash{animation:dsh-br-flashring 1.6s ease}',
      '@keyframes dsh-br-flashring{0%,55%{box-shadow:0 0 0 1px rgba(255,196,107,.75),0 0 22px rgba(255,196,107,.3)}100%{box-shadow:none}}',
      '.dsh-br-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:8px;letter-spacing:.3em;color:rgba(148,183,208,.4)}',

      /* arc gauge */
      '.dsh-br-arc{display:flex;align-items:center;gap:10px}',
      '.dsh-br-arc svg{flex:none;width:104px;height:66px}',
      '.dsh-br-arc-track{fill:none;stroke:rgba(87,216,255,.14);stroke-width:7;stroke-linecap:round}',
      '.dsh-br-arc-fill{fill:none;stroke:' + AZ + ';stroke-width:7;stroke-linecap:round;transition:stroke-dasharray .8s ease;filter:drop-shadow(0 0 5px rgba(87,216,255,.55))}',
      '.dsh-br-arc-fill[data-hot="true"]{stroke:' + AMBER + ';filter:drop-shadow(0 0 6px rgba(255,196,107,.6))}',
      '.dsh-br-arc-seg{fill:none;stroke-width:7;stroke-linecap:butt;transition:stroke-dasharray .8s ease,stroke-dashoffset .8s ease}',
      '.dsh-br-arc-seg[data-k="sys"]{stroke:#6d8ba3;filter:drop-shadow(0 0 4px rgba(109,139,163,.4))}',
      '.dsh-br-arc-seg[data-k="tools"]{stroke:' + VIOLET + ';filter:drop-shadow(0 0 4px rgba(139,124,246,.45))}',
      '.dsh-br-arc-seg[data-k="msg"]{stroke:' + AZ + ';filter:drop-shadow(0 0 5px rgba(87,216,255,.5))}',
      '.dsh-br-arc-hit{fill:none;stroke:transparent;stroke-width:18;stroke-linecap:butt;pointer-events:stroke;cursor:help}',
      '.dsh-br-arc-sub[data-hover="true"]{letter-spacing:.1em}',
      '.dsh-br-arc-pct{font-size:20px;color:' + ICE + ';font-variant-numeric:tabular-nums;letter-spacing:.04em}',
      '.dsh-br-arc-pct[data-hot="true"]{color:#ffd79a}',
      '.dsh-br-arc-sub{font-size:8px;letter-spacing:.18em;color:' + STEEL + ';margin-top:3px;font-variant-numeric:tabular-nums}',

      /* stacked composition + rows */
      '.dsh-br-stack{display:flex;gap:1px;height:8px;overflow:hidden;margin-bottom:7px}',
      '.dsh-br-stack i{display:block;height:100%;transition:width .8s ease}',
      '.dsh-br-stack i[data-k="sys"]{background:#6d8ba3}',
      '.dsh-br-stack i[data-k="tools"]{background:' + VIOLET + '}',
      '.dsh-br-stack i[data-k="msg"]{background:' + AZ + '}',
      '.dsh-br-urow{display:flex;align-items:center;gap:7px;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:' + STEEL + ';padding:2.5px 0}',
      '.dsh-br-urow-key{flex:none;width:6px;height:6px;border-radius:1px}',
      '.dsh-br-urow-name{flex:none;width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-br-urow-track{flex:1 1 auto;height:3px;background:rgba(87,216,255,.07);overflow:hidden}',
      '.dsh-br-urow-track i{display:block;height:100%;transition:width .8s ease}',
      '.dsh-br-urow-val{flex:none;color:' + ICE + ';font-variant-numeric:tabular-nums;min-width:34px;text-align:right}',
      '.dsh-br-caret-mini{color:' + AZ + ';animation:dsh-br-caret 1.1s steps(1) infinite}',

      /* --- telemetry chips (dock) ---------------------------------------- */
      '.dsh-br-chip{display:inline-flex;align-items:center;gap:7px;height:22px;padding:0 11px;font-size:8.5px;line-height:1;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;color:' + STEEL + ';background:' + PANEL + ';border:1px solid rgba(87,216,255,.24);clip-path:polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%);pointer-events:none;user-select:none;-webkit-user-select:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-br-chip b{color:' + ICE + ';font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsh-br-chip-dot{flex:none;width:4px;height:4px;border-radius:50%;background:' + AZ + ';box-shadow:0 0 6px rgba(87,216,255,.85);animation:dsh-br-pulse 2.6s ease-in-out infinite}',

      /* --- composer strips ------------------------------------------------ */
      '.dsh-br-vector{display:flex;align-items:center;gap:10px;width:100%;height:22px;margin:0 0 5px;padding:0 14px;font-size:8px;line-height:1;letter-spacing:.24em;text-transform:uppercase;color:' + STEEL + ';background:' + PANEL + ';border:1px solid rgba(87,216,255,.2);border-left:2px solid rgba(87,216,255,.65);clip-path:polygon(0 0,calc(100% - 7px) 0,100% 50%,calc(100% - 7px) 100%,0 100%);pointer-events:none;user-select:none;-webkit-user-select:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-br-vector-ruler{position:relative;flex:1 1 auto;height:100%;overflow:hidden;background:repeating-linear-gradient(90deg,rgba(87,216,255,.3) 0 1px,transparent 1px 26px);animation:dsh-br-ruler 2.6s linear infinite;-webkit-mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}',
      '.dsh-br-vector-read{color:' + ICE + ';font-variant-numeric:tabular-nums}',
      '.dsh-br-vector-led{flex:none;width:5px;height:5px;border-radius:50%;background:' + AZ + ';box-shadow:0 0 7px rgba(87,216,255,.9);animation:dsh-br-pulse 2.2s ease-in-out infinite}',
      '.dsh-br-vector-msg{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + ICE + ';font-size:8.5px;letter-spacing:.14em}',
      '.dsh-br-vector-msg b{font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsh-br-vector-right{flex:none;color:#8fa9c2;font-variant-numeric:tabular-nums}',
      '.dsh-br-vector[data-p="ask"] .dsh-br-vector-msg{color:#ffd79a}',
      '.dsh-br-vector[data-p="exec"] .dsh-br-vector-msg{color:#b3a5ff}',
      '.dsh-br-vector[data-p="out"] .dsh-br-vector-msg{color:#8ce8b0}',
      '.dsh-br-vector[data-p="idle"] .dsh-br-vector-msg{color:rgba(148,183,208,.55)}',
      '.dsh-br-vector[data-p="ask"] .dsh-br-vector-led{background:' + AMBER + ';box-shadow:0 0 7px rgba(255,196,107,.9);animation:dsh-br-pulse .8s ease-in-out infinite}',
      '.dsh-br-vector[data-p="exec"] .dsh-br-vector-led{background:' + VIOLET + ';box-shadow:0 0 7px rgba(139,124,246,.9)}',
      '.dsh-br-vector[data-p="out"] .dsh-br-vector-led{background:' + GREEN + ';box-shadow:0 0 7px rgba(74,222,128,.9)}',
      '.dsh-br-vector[data-p="think"] .dsh-br-vector-led{animation:dsh-br-pulse 1.4s ease-in-out infinite}',
      '.dsh-br-vector[data-p="idle"] .dsh-br-vector-led{background:#5b7086;box-shadow:none;animation:dsh-br-breathe 3.2s ease-in-out infinite}',
      '.dsh-br-vector[data-p="idle"] .dsh-br-vector-ruler{animation-play-state:paused;opacity:.3}',

      '.dsh-br-deck{display:flex;align-items:center;gap:9px;flex:1 1 340px;min-width:0;margin:3px 0 0;padding:6px 13px 5px;font-size:9px;line-height:1;letter-spacing:.18em;text-transform:uppercase;color:' + STEEL + ';background:' + PANEL + ';border:1px solid rgba(87,216,255,.2);border-top:1px solid rgba(87,216,255,.4);clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 100%,0 100%);box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:none;user-select:none;-webkit-user-select:none;overflow:hidden;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-br-led{flex:none;width:6px;height:6px;border-radius:50%;background:#5b7086;box-shadow:0 0 7px rgba(91,112,134,.85)}',
      '.dsh-br-led[data-live="run"]{background:' + GREEN + ';box-shadow:0 0 8px rgba(74,222,128,.9);animation:dsh-br-pulse 1.4s ease-in-out infinite}',
      '.dsh-br-led[data-live="input"]{background:' + AMBER + ';box-shadow:0 0 8px rgba(255,196,107,.9);animation:dsh-br-pulse .9s ease-in-out infinite}',
      '.dsh-br-state[data-live="run"]{color:#8ce8b0}',
      '.dsh-br-state[data-live="input"]{color:#ffd79a}',
      '.dsh-br-state[data-live="standby"]{color:' + STEEL + '}',
      '.dsh-br-sep{flex:none;width:1px;height:9px;background:rgba(87,216,255,.22)}',
      '.dsh-br-eng{display:inline-flex;flex:none;align-items:flex-end;gap:2px;height:9px}',
      '.dsh-br-eng i{display:block;width:2px;height:9px;background:linear-gradient(180deg,' + AZ + ',rgba(87,216,255,.25));transform-origin:bottom;animation:dsh-br-eq 1.2s ease-in-out infinite}',
      '.dsh-br-eng[data-idle="true"] i{animation:none;transform:scaleY(.22);opacity:.4}',
      '.dsh-br-ctx{display:flex;align-items:center;gap:7px;min-width:0;flex:1 1 auto}',
      '.dsh-br-ctx-track{position:relative;flex:1 1 60px;min-width:36px;height:6px;background:rgba(87,216,255,.08);border:1px solid rgba(87,216,255,.2);overflow:hidden}',
      '.dsh-br-ctx-fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,rgba(87,216,255,.5),' + AZ + ');transition:width .6s ease}',
      '.dsh-br-ctx-fill[data-hot="true"]{background:linear-gradient(90deg,rgba(255,196,107,.55),' + AMBER + ')}',
      '.dsh-br-ctx-read{flex:none;color:' + ICE + ';font-variant-numeric:tabular-nums}',
      '.dsh-br-ctx-read[data-hot="true"]{color:#ffd79a}',
      '.dsh-br-fill{flex:1 1 auto;min-width:8px}',
      '.dsh-br-clock{font-variant-numeric:tabular-nums;color:' + ICE + '}',
      '.dsh-br-ses{overflow:hidden;text-overflow:ellipsis}',

      /* --- turn divider --------------------------------------------------- */
      '.dsh-br-turn{display:flex;align-items:center;gap:10px;width:100%;padding:2px 0 6px;pointer-events:none;user-select:none;-webkit-user-select:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-br-turn-line{flex:1 1 auto;height:1px;background:linear-gradient(90deg,transparent,rgba(87,216,255,.4),rgba(87,216,255,.08))}',
      '.dsh-br-turn-line[data-flip="1"]{transform:scaleX(-1)}',
      '.dsh-br-turn-label{flex:none;font-size:8px;letter-spacing:.32em;text-transform:uppercase;color:' + AZ + ';text-shadow:0 0 8px rgba(87,216,255,.55);font-variant-numeric:tabular-nums}',

      /* --- hero emblem ---------------------------------------------------- */
      '.dsh-br-emblem{display:block;pointer-events:none;filter:drop-shadow(0 0 10px rgba(56,189,248,.25))}',
      '.dsh-br-emblem-ring{transform-box:fill-box;transform-origin:center;animation:dsh-br-spin 16s linear infinite}',
      '.dsh-br-emblem-ring2{transform-box:fill-box;transform-origin:center;animation:dsh-br-spin 10s linear infinite reverse}',

      /* --- boot sequence --------------------------------------------------- */
      '.dsh-br-boot{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(120% 100% at 50% 40%,#081426 0%,#040810 60%,#020408 100%);pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dsh-br-boot[data-phase="out"]{animation:dsh-br-bootout .55s ease forwards}',
      '.dsh-br-boot-ring{width:84px;height:84px}',
      '.dsh-br-boot-ring circle{fill:none;stroke:' + AZ + ';stroke-width:1.4;stroke-dasharray:220;animation:dsh-br-draw 1.1s ease-out forwards}',
      '.dsh-br-boot-ring circle.inner{stroke:' + ICE + ';stroke-width:.9;opacity:.65;animation-delay:.25s}',
      '.dsh-br-boot-lines{display:flex;flex-direction:column;gap:5px;font-size:10px;letter-spacing:.14em;color:' + STEEL + '}',
      '.dsh-br-boot-lines span{animation:dsh-br-fadein .3s ease both}',
      '.dsh-br-boot-bar{width:280px;height:2px;background:rgba(87,216,255,.12);overflow:hidden}',
      '.dsh-br-boot-bar i{display:block;height:100%;background:linear-gradient(90deg,rgba(87,216,255,.4),' + AZ + ');transform-origin:left;animation:dsh-br-load 1.4s ease-in-out infinite}',
      '.dsh-br-boot-title{font-size:15px;letter-spacing:.62em;text-indent:.62em;text-transform:uppercase;color:' + ICE + ';text-shadow:0 0 14px rgba(87,216,255,.65);animation:dsh-br-fadein .45s ease both}',

      /* ================================================================== */
      /* host restyle — pinned to this DSH build's CSS-module hashes;       */
      /* doubled class raises specificity over the host sheet.              */
      /* ================================================================== */
      '.uV2eYG_card.uV2eYG_card{--dsw-alias-label-primary:#e6f4ff;--dsw-alias-label-secondary:#a5c0d6;--dsw-alias-label-tertiary:#8fa9c2;--dsw-alias-label-caption:#7e97ae;border-radius:8px;border:1px solid rgba(87,216,255,.30);background:linear-gradient(180deg,rgba(10,21,36,.88),rgba(6,12,22,.92));box-shadow:0 12px 40px rgba(0,0,0,.45),0 0 26px rgba(56,189,248,.08),inset 0 1px 0 rgba(140,216,255,.10);transition:border-color .18s,box-shadow .18s}',
      '.uV2eYG_card.uV2eYG_card:focus-within{border-color:rgba(87,216,255,.65);box-shadow:0 12px 44px rgba(0,0,0,.5),0 0 34px rgba(56,189,248,.16),inset 0 1px 0 rgba(140,216,255,.14)}',
      '.uV2eYG_card.uV2eYG_card:before{content:"";position:absolute;inset:0;border-radius:8px;pointer-events:none;opacity:.6;background:linear-gradient(' + AZ + ',' + AZ + ') left 7px top 7px/9px 1px no-repeat,linear-gradient(' + AZ + ',' + AZ + ') left 7px top 7px/1px 9px no-repeat,linear-gradient(' + AZ + ',' + AZ + ') right 7px top 7px/9px 1px no-repeat,linear-gradient(' + AZ + ',' + AZ + ') right 7px top 7px/1px 9px no-repeat,linear-gradient(' + AZ + ',' + AZ + ') left 7px bottom 7px/9px 1px no-repeat,linear-gradient(' + AZ + ',' + AZ + ') left 7px bottom 7px/1px 9px no-repeat,linear-gradient(' + AZ + ',' + AZ + ') right 7px bottom 7px/9px 1px no-repeat,linear-gradient(' + AZ + ',' + AZ + ') right 7px bottom 7px/1px 9px no-repeat}',
      '.uV2eYG_input.uV2eYG_input{caret-color:' + AZ + '}',
      '.uV2eYG_placeholder.uV2eYG_placeholder{color:#7e97ae}',
      '.uV2eYG_primary.uV2eYG_primary{width:36px;height:36px;border-radius:5px;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);background:linear-gradient(135deg,#7ce4ff,#2f9fd8);color:#04121e;box-shadow:0 0 16px rgba(87,216,255,.45),inset 0 1px 0 rgba(255,255,255,.35);transform:translateY(-2px);transition:box-shadow .15s,filter .15s}',
      '.uV2eYG_primary.uV2eYG_primary:hover:not(:disabled){background:linear-gradient(135deg,#9aecff,#41b4ea);box-shadow:0 0 24px rgba(87,216,255,.7),inset 0 1px 0 rgba(255,255,255,.45)}',
      '.uV2eYG_primary.uV2eYG_primary:active:not(:disabled){filter:brightness(.88)}',
      '.uV2eYG_primary.uV2eYG_primary:disabled{background:linear-gradient(135deg,rgba(87,216,255,.20),rgba(47,159,216,.14));color:rgba(4,18,30,.55);box-shadow:none;opacity:.65}',
      '.uV2eYG_add.uV2eYG_add{border-radius:5px;background:rgba(87,216,255,.07);border:1px solid rgba(87,216,255,.30);color:' + AZ + ';box-shadow:inset 0 0 10px rgba(56,189,248,.06)}',
      '.uV2eYG_add.uV2eYG_add:hover:not(:disabled){background:rgba(87,216,255,.16)}',
      '.uV2eYG_select.uV2eYG_select{color:#a5c0d6;border-radius:4px;border:1px solid transparent}',
      '.uV2eYG_select.uV2eYG_select:hover:not(:disabled){background:rgba(87,216,255,.10);border-color:rgba(87,216,255,.25)}',
      '.uV2eYG_pending.uV2eYG_pending{background:' + AZ + '}',
      '.uV2eYG_dock.uV2eYG_dock{flex-wrap:wrap;row-gap:6px}',
      '.uV2eYG_retry.uV2eYG_retry{border-radius:4px;border-color:rgba(87,216,255,.4);color:#a5c0d6}',
      '.Sixlwa_bubble.Sixlwa_bubble{border-radius:8px 8px 8px 2px;border:1px solid rgba(87,216,255,.16);background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-specific-bubble) 84%,rgba(87,216,255,.10)),color-mix(in srgb,var(--dsw-specific-bubble) 86%,transparent));box-shadow:0 2px 12px rgba(0,0,0,.16)}',
      '.Sixlwa_userStack .Sixlwa_bubble{border-radius:8px 8px 2px 8px;border-color:rgba(87,216,255,.42);background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-specific-bubble) 72%,rgba(87,216,255,.26)),color-mix(in srgb,var(--dsw-specific-bubble) 78%,rgba(87,216,255,.14)));box-shadow:0 2px 14px rgba(2,10,20,.28),inset 0 0 18px rgba(56,189,248,.05)}',
      '.JObwrW_fill.JObwrW_fill{stroke:' + AZ + '}',
      '.JObwrW_track.JObwrW_track{stroke:rgba(87,216,255,.18)}',
      '.JObwrW_trigger.JObwrW_trigger{color:#8fa9c2}',
      '.JObwrW_trigger.JObwrW_trigger:hover{background:rgba(87,216,255,.10);color:' + AZ + '}',
      '.bOPqQW_anchor.bOPqQW_anchor{display:none}',
    ].join('\n');

    // Build-time guard: an unbalanced paren/brace in any rule can break that
    // declaration and cascade to the following ones. Checked here rather than
    // tied to a hostname so it covers every page (and any dev host).
    let bal = 0;
    let brace = 0;
    for (let i = 0; i < CSS.length; i++) {
      const ch = CSS.charAt(i);
      if (ch === '(') bal++;
      else if (ch === ')') { bal--; if (bal < 0) break; }
      else if (ch === '{') brace++;
      else if (ch === '}') brace--;
    }
    if (bal !== 0 || brace !== 0) {
      // eslint-disable-next-line no-console
      console.error('[dsh-cockpit] CSS balance error — paren=' + bal + ' brace=' + brace);
    }

    const TIME = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const CORNERS = [
      { style: { top: 6, left: 6 }, transform: 'none' },
      { style: { top: 6, right: 6 }, transform: 'scaleX(-1)' },
      { style: { bottom: 6, left: 6 }, transform: 'scaleY(-1)' },
      { style: { bottom: 6, right: 6 }, transform: 'scale(-1, -1)' },
    ];

    /** Shared heartbeat: ONE 70ms interval for the whole plugin, fanned out
     *  to subscribers. Starts lazily on first subscriber, stops when the last
     *  leaves. Replaces per-component 70/200/1000ms timers (v13). */
    let beatTimer = null;
    const beatListeners = new Set();
    function startBeat() {
      if (beatTimer != null || typeof document === 'undefined' || document.hidden) return;
      beatTimer = setInterval(() => {
        const now = Date.now();
        for (const f of Array.from(beatListeners)) {
          try { f(now); } catch (err) {}
        }
      }, 70);
    }
    function subscribeBeat(fn) {
      beatListeners.add(fn);
      startBeat();
      return () => {
        beatListeners.delete(fn);
        if (beatListeners.size === 0 && beatTimer != null) {
          clearInterval(beatTimer);
          beatTimer = null;
        }
      };
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (beatTimer != null) {
            clearInterval(beatTimer);
            beatTimer = null;
          }
        } else if (beatListeners.size > 0) {
          startBeat();
        }
      });
    }

    /** Scroll the newest DOM node matching `sel` into view. Real host anchors:
     *  [data-turn-tail] (per turn), [data-approval-key] (confirm cards). */
    function jumpTo(sel) {
      try {
        const list = document.querySelectorAll(sel);
        if (list.length === 0) return;
        const el = list[list.length - 1];
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('dsh-br-flash');
        setTimeout(() => {
          try { el.classList.remove('dsh-br-flash'); } catch (err) {}
        }, 1700);
      } catch (err) {}
    }

    /** Compact token figure: 999, 12.4k, 3.1M. */
    function fmt(n) {
      if (!Number.isFinite(n)) return '--';
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
      return String(Math.round(n));
    }

    function fmtS(ms) {
      if (!Number.isFinite(ms)) return '--';
      if (ms < 1000) return Math.round(ms) + 'ms';
      if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
      return Math.floor(ms / 60000) + 'm' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0') + 's';
    }

    function fmtUp(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return hh + ':' + mm + ':' + ss;
    }

    /** Sum streamed text of one block kind inside the live partial assistant. */
    function sumBlocks(blocks, kind) {
      let n = 0;
      if (blocks != null) {
        for (const b of blocks) {
          if (b != null && b.kind === kind && typeof b.text === 'string') n += b.text.length;
        }
      }
      return n;
    }

    /** Containment wall: a throwing HUD piece blanks itself, never the app. */
    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    }

    function safe(C) {
      return function Guarded(props) {
        return h(Boundary, null, h(C, props));
      };
    }

    return {
      inject: ['slots', 'theme', 'locale'],
      apply(ctx) {
        function useLocaleRevision() {
          const [, bump] = useState(0);
          useEffect(() => ctx.locale.subscribe(() => bump((n) => n + 1)), []);
        }

        function useClock() {
          const [now, setNow] = useState(() => Date.now());
          useEffect(
            () =>
              subscribeBeat((t) => {
                setNow((prev) => (Math.floor(t / 1000) !== Math.floor(prev / 1000) ? t : prev));
              }),
            [],
          );
          return now;
        }

        function Styles() {
          return h('style', null, CSS);
        }

        // ---- one-shot boot sequence ---------------------------------------
        function BootSequence() {
          const [step, setStep] = useState(0);
          useEffect(() => {
            const reduce =
              typeof window.matchMedia === 'function' &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduce) {
              setStep(99);
              return undefined;
            }
            const timers = [];
            const total = BOOT_LINES.length;
            for (let i = 0; i <= total; i++) {
              timers.push(setTimeout(() => setStep(i + 1), 340 * (i + 1)));
            }
            timers.push(setTimeout(() => setStep(total + 2), 340 * (total + 1) + 950));
            timers.push(setTimeout(() => setStep(99), 340 * (total + 1) + 1550));
            return () => timers.forEach(clearTimeout);
          }, []);
          if (step >= 99) return null;
          const done = step >= BOOT_LINES.length + 1;
          return h(
            F,
            null,
            h(Styles),
            h(
              'div',
              {
                className: 'dsh-br-boot',
                'data-phase': step === BOOT_LINES.length + 1 ? 'out' : 'in',
                'aria-hidden': 'true',
              },
              h(
                'svg',
                { className: 'dsh-br-boot-ring', viewBox: '0 0 84 84' },
                h('circle', { cx: 42, cy: 42, r: 35 }),
                h('circle', { className: 'inner', cx: 42, cy: 42, r: 26 }),
              ),
              h(
                'div',
                { className: 'dsh-br-boot-lines' },
                ...BOOT_LINES.slice(0, Math.max(0, step - 1)).map((line, i) =>
                  h('span', { key: i }, line),
                ),
              ),
              h('div', { className: 'dsh-br-boot-bar' }, h('i')),
              done ? h('div', { className: 'dsh-br-boot-title' }, 'SYSTEM ONLINE') : null,
            ),
          );
        }

        // ---- frame: depth wash + edges + corners + uptime pill -------------
        function BridgeFrame() {
          useLocaleRevision();
          const now = useClock();
          const t = ctx.locale.bind(NS);
          return h(
            F,
            null,
            h(Styles),
            h(
              'div',
              { className: 'dsh-br-frame', 'aria-hidden': 'true' },
              h('i', { className: 'dsh-br-depth' }),
              h('i', { className: 'dsh-br-edge', 'data-edge': 'top' }),
              h('i', { className: 'dsh-br-edge', 'data-edge': 'bottom' }),
              h('i', { className: 'dsh-br-edge', 'data-edge': 'left' }),
              h('i', { className: 'dsh-br-edge', 'data-edge': 'right' }),
              h('i', { className: 'dsh-br-ticks', 'data-at': 'top' }),
              h('i', { className: 'dsh-br-ticks', 'data-at': 'bottom' }),
              ...CORNERS.map((corner, index) =>
                h(
                  'div',
                  {
                    key: index,
                    className: 'dsh-br-corner',
                    style: { ...corner.style, transform: corner.transform },
                  },
                  h('b', { className: 'h' }),
                  h('b', { className: 'v' }),
                  h('i', { style: { animationDelay: (index * 0.4).toFixed(1) + 's' } }),
                ),
              ),
              h(
                'div',
                { className: 'dsh-br-pill' },
                h('i', { className: 'dsh-br-pill-dot' }),
                h('span', null, t('bridge') + ' // MK-IV'),
                h('span', null, t('uptime') + ' ', h('b', null, fmtUp(now - BOOT_TS))),
              ),
            ),
          );
        }

        // ---- side instrument columns: ALL real telemetry -------------------
        function SideInstruments(props) {
          useLocaleRevision();
          const t = ctx.locale.bind(NS);
          const sessionId = props.sessionId;

          const proj = (key) => {
            try {
              return typeof props.useProjection === 'function' ? props.useProjection(key) : undefined;
            } catch (err) {
              return undefined;
            }
          };
          const stats = proj('sessionStats');
          const usage = proj('tokenUsage');
          const pressure = proj('contextPressure');
          const mix = proj('contextBreakdown');
          const status =
            typeof props.useSessionStatus === 'function'
              ? props.useSessionStatus((snapshot) =>
                  sessionId == null ? undefined : snapshot.get(sessionId),
                )
              : undefined;
          const waiting = status != null && status.pendingInteraction != null;
          const running = status != null && status.running === true;
          const totalTokens =
            usage == null
              ? 0
              : usage.uncachedInputTokens +
                usage.outputTokens +
                usage.cacheReadTokens +
                usage.cacheWriteTokens;
          // ---- live phase signals (all real stores, re-render on change) ----
          const pick = (fn, sel, def) => {
            try {
              if (typeof fn !== 'function') return def == null ? 0 : def;
              const v = fn(sel);
              return v == null ? (def == null ? 0 : def) : v;
            } catch (err) {
              return def == null ? 0 : def;
            }
          };
          const draftLen = pick(props.useInput, (s) => (s != null && typeof s.draft === 'string' ? s.draft.length : 0));
          const subFlight = pick(props.useInput, (s) => (s != null && (s.phase === 'claimed' || s.phase === 'submitting') ? 1 : 0));
          const pTextLen = pick(props.useChat, (s) => sumBlocks(s != null && s.legacy != null ? s.legacy.partial == null ? null : s.legacy.partial.blocks : null, 'text'));
          const pReaLen = pick(props.useChat, (s) => sumBlocks(s != null && s.legacy != null ? s.legacy.partial == null ? null : s.legacy.partial.blocks : null, 'reasoning'));
          const liveCalls = pick(props.useChat, (s) => (s != null && s.legacy != null && s.legacy.runningCalls != null ? s.legacy.runningCalls.length : 0));
          // Bounded preview of the newest turn's prompt (real navigation index).
          const promptNow = pick(props.useChat, (s) => {
            const it = s != null && s.navigation != null ? s.navigation.items() : null;
            if (it == null || it.length === 0) return '';
            const last = it[it.length - 1];
            const txt = String(last == null || last.prompt == null ? '' : last.prompt).replace(/\s+/g, ' ').trim();
            return txt.length > 14 ? txt.slice(0, 14) + '\u2026' : txt;
          }, '');

          // Failure ledger: scan the last 40 loaded nodes for real red signals —
          // turn-error notices, model-retry lifecycle, failed tool results.
          const errSig = pick(props.useChat, (s) => {
            if (s == null || s.legacy == null || s.order == null || s.legacy.nodes == null) return '0|0|||';
            const ord = s.order;
            const store = s.legacy.nodes;
            const from = Math.max(0, ord.length - 40);
            let turnErr = 0;
            let toolErr = 0;
            let retry = '';
            let code = '';
            let msg = '';
            for (let i = ord.length - 1; i >= from; i--) {
              let raw = null;
              try { raw = store.get(ord[i]); } catch (err) {}
              const d = raw == null ? null : raw.kind != null ? raw : raw.data != null ? raw.data : null;
              if (d == null || typeof d.kind !== 'string') continue;
              if (d.kind === 'turn-error') {
                if (turnErr === 0) {
                  code = String(d.code == null ? '' : d.code);
                  msg = String(d.message == null ? '' : d.message).slice(0, 60);
                }
                turnErr += 1;
              } else if (d.kind === 'tool-result' && d.isError === true) toolErr += 1;
              else if (d.kind === 'model-retry' && retry === '') retry = String(d.retryState == null ? '' : d.retryState);
            }
            return turnErr + '|' + toolErr + '|' + retry + '|' + code + '|' + msg;
          }, '0|0|||');

          // Tool ledger: real per-call durations. Settled calls pair the result's
          // own `time` with the call head's `callTime`; in-flight calls are timed
          // from their start `time`. Packed as a string so it re-renders only on
          // real change.
          const toolSig = pick(props.useChat, (s) => {
            if (s == null || s.legacy == null) return '';
            const rows = [];
            const safe = (v) => String(v == null ? '' : v).replace(/[|;]/g, '/');
            const rc = s.legacy.runningCalls;
            if (rc != null && rc.length > 0) {
              for (let i = rc.length - 1; i >= 0 && rows.length < 3; i--) {
                const call = rc[i];
                if (call == null) continue;
                rows.push('L|' + (safe(call.name) || '?') + '|' + (Number(call.time) || 0) + '|0');
              }
            }
            if (s.order != null && s.legacy.nodes != null) {
              const ord = s.order;
              const store = s.legacy.nodes;
              const from = Math.max(0, ord.length - 30);
              for (let i = ord.length - 1; i >= from; i--) {
                let raw = null;
                try { raw = store.get(ord[i]); } catch (err) {}
                const d = raw == null ? null : raw.kind != null ? raw : raw.data != null ? raw.data : null;
                if (d == null || d.kind !== 'tool-result') continue;
                const from_ = Number(d.callTime);
                const dur = Number.isFinite(from_) && from_ > 0 ? Math.max(0, (Number(d.time) || 0) - from_) : -1;
                const nm = safe(d.name) || (d.call != null ? safe(d.call.name) : '') || '?';
                rows.push('D|' + nm + '|' + dur + '|' + (d.isError === true ? '1' : '0'));
                if (rows.length >= 6) break;
              }
            }
            return rows.join(';');
          }, '');
          const errParts = String(errSig).split('|');
          const turnErrN = Number(errParts[0]) || 0;
          const toolErrN = Number(errParts[1]) || 0;
          const retryK = errParts[2] == null ? '' : errParts[2];
          const errCode = errParts[3] == null ? '' : errParts[3];
          const errMsg = errParts[4] == null ? '' : errParts[4];
          const halt = turnErrN > 0 && errCode === 'INTERRUPTED';
          const fault = turnErrN > 0 && !halt;
          const errN = turnErrN + toolErrN;
          const unread = status != null && status.completionUnread === true;
          const live = waiting ? 'input' : running ? 'run' : halt ? 'halted' : fault ? 'fault' : 'standby';

          const sigRef = useRef(null);
          sigRef.current = {
            draftLen: draftLen,
            subFlight: subFlight,
            pTextLen: pTextLen,
            pReaLen: pReaLen,
            liveCalls: liveCalls,
            waiting: waiting,
            running: running,
            turns: stats == null ? 0 : stats.turns,
            sessionId: sessionId,
            promptNow: promptNow,
            errN: errN,
          };
          const [pulse, setPulse] = useState([]);
          const [hoverSeg, setHoverSeg] = useState(null);
          const metaRef = useRef({
            prevText: 0,
            prevRea: 0,
            wasRun: false,
            runStart: 0,
            runElapsed: 0,
            lastTurns: 0,
            seenSess: null,
            turnChars: 0,
            turnRea: 0,
            thinkMs: 0,
            toolMs: 0,
            outMs: 0,
            firstTextT: null,
            prevErr: 0,
            chHist: [],
            tick: 0,
            flashTick: null,
            flashT0: 0,
            flashText: '',
          });
          useEffect(() => {
            let lastSample = 0;
            return subscribeBeat((beatNow) => {
              const dt = lastSample === 0 ? 200 : beatNow - lastSample;
              if (lastSample !== 0 && dt < 195) return; // keep the ~200ms series cadence (160 samples = 32s)
              lastSample = beatNow;
              const s = sigRef.current;
              const m = metaRef.current;
              m.tick += 1;
              if (m.seenSess == null) m.seenSess = s.sessionId;
              if (s.sessionId !== m.seenSess) {
                // session switch: restart the series from a clean slate
                m.seenSess = s.sessionId;
                m.prevText = 0;
                m.prevRea = 0;
                m.wasRun = false;
                m.runElapsed = 0;
                m.turnChars = 0;
                m.turnRea = 0;
                m.thinkMs = 0;
                m.toolMs = 0;
                m.outMs = 0;
                m.firstTextT = null;
                m.prevErr = 0;
                m.chHist = [];
                m.flashTick = null;
                setPulse([]);
                return;
              }
              const chDelta = Math.max(0, s.pTextLen - m.prevText);
              const reaDelta = Math.max(0, s.pReaLen - m.prevRea);
              m.prevText = s.pTextLen;
              m.prevRea = s.pReaLen;
              let phase = 'idle';
              if (s.waiting) phase = 'ask';
              else if (s.running) phase = s.liveCalls > 0 ? 'tool' : chDelta > 0 ? 'out' : 'think';
              if (phase === 'idle' && s.subFlight) phase = 'sub';
              else if (phase === 'idle' && s.draftLen > 0) phase = 'type';
              if (s.running && s.errN > m.prevErr) phase = 'fail';
              m.prevErr = s.errN;
              if (s.running && !m.wasRun) {
                m.wasRun = true;
                m.runStart = Date.now();
                m.turnChars = 0;
                m.turnRea = 0;
                m.thinkMs = 0;
                m.toolMs = 0;
                m.outMs = 0;
                m.firstTextT = null;
                m.chHist = [];
              } else if (!s.running && m.wasRun) {
                m.wasRun = false;
                m.runElapsed = (Date.now() - m.runStart) / 1000;
              }
              if (s.running) {
                m.turnChars += chDelta;
                m.turnRea += reaDelta;
                if (phase === 'think') m.thinkMs += dt;
                else if (phase === 'tool' || phase === 'fail') m.toolMs += dt;
                else if (phase === 'out') m.outMs += dt;
                if (m.firstTextT == null && chDelta > 0) m.firstTextT = Date.now();
              }
              // Rolling 5s window of REAL char deltas with their REAL bucket
              // durations — the only honest instantaneous output measure here
              // (tokenUsage only settles at step end, so it would sawtooth).
              m.chHist.push({ d: phase === 'out' ? chDelta : 0, t: dt });
              if (m.chHist.length > 25) m.chHist.shift();
              if (m.lastTurns === 0 && s.turns > 0) m.lastTurns = s.turns;
              const flash = s.turns !== m.lastTurns;
              m.lastTurns = s.turns;
              if (flash) {
                m.flashTick = m.tick;
                m.flashT0 = Date.now();
                m.flashText = s.promptNow;
              } else if (m.flashTick != null && m.flashText === '' && s.promptNow !== '') {
                m.flashText = s.promptNow; // preview may land one tick after the switch
              }
              setPulse((prev) => {
                const next = prev.length >= 160 ? prev.slice(1) : prev.slice();
                next.push({ p: phase, f: flash ? 1 : 0, d: chDelta, r: reaDelta });
                return next;
              });
            });
          }, []);
          const curPhase = pulse.length > 0 ? pulse[pulse.length - 1].p : 'idle';
          const meta = metaRef.current;
          const flowSecs = meta.wasRun ? (Date.now() - meta.runStart) / 1000 : meta.runElapsed;

          // Follow the live sidebar width: the AppFrame keeps its exact grid
          // tracks in the inline `gridTemplateColumns` style, and React
          // rewrites that attribute on every collapse toggle or drag resize.
          const leftRef = useRef(null);
          const [sidebarPx, setSidebarPx] = useState(null);
          useEffect(() => {
            let frame = null;
            let node = leftRef.current;
            while (node != null && frame == null) {
              if (node.style != null && node.style.gridTemplateColumns != null && node.style.gridTemplateColumns !== '') {
                frame = node;
              }
              node = node.parentElement;
            }
            if (frame == null) return undefined;
            const read = () => {
              const px = parseFloat((frame.style.gridTemplateColumns || '').split(' ')[0]);
              setSidebarPx(Number.isFinite(px) ? px : null);
            };
            read();
            const observer = new MutationObserver(read);
            observer.observe(frame, { attributes: true, attributeFilter: ['style'] });
            return () => observer.disconnect();
          }, []);

          // LEFT — AGENT panel ------------------------------------------------
          const llmMs = stats == null ? 0 : stats.llmMs;
          const toolMs = stats == null ? 0 : stats.toolMs;
          const wallMs = llmMs + toolMs;
          const llmPct = wallMs > 0 ? (llmMs / wallMs) * 100 : 0;
          const toolPct = wallMs > 0 ? (toolMs / wallMs) * 100 : 0;
          const ttftAvg = stats != null && stats.ttftSteps > 0 ? stats.ttftMs / stats.ttftSteps : null;
          const decode =
            stats != null && stats.decodeMs > 0 ? stats.decodeTokens / (stats.decodeMs / 1000) : null;

          // Tool ledger rows (see toolSig): 'L' = in flight, 'D' = settled.
          const toolRows = String(toolSig)
            .split(';')
            .filter((row) => row !== '')
            .slice(0, 4)
            .map((row) => {
              const p = row.split('|');
              return { live: p[0] === 'L', name: p[1] === '' ? '?' : p[1], v: Number(p[2]) || 0, err: p[3] === '1' };
            });

          // Instantaneous output rate: REAL chars emitted over the REAL elapsed
          // span of the rolling window. Deliberately characters, not tokens —
          // provider token counts only settle at step end.
          const chHist = Array.isArray(meta.chHist) ? meta.chHist : [];
          let chSum = 0;
          let chSpan = 0;
          for (let i = 0; i < chHist.length; i++) {
            chSum += chHist[i].d;
            chSpan += chHist[i].t;
          }
          const cpsNow = chHist.length >= 3 && chSpan > 0 ? chSum / (chSpan / 1000) : null;
          const cpsLive = running && cpsNow != null ? cpsNow : null;
          const sparkVals = chHist.slice(-16).map((b) => b.d);
          let sparkMax = 1;
          for (let i = 0; i < sparkVals.length; i++) if (sparkVals[i] > sparkMax) sparkMax = sparkVals[i];

          const ttftMeasured = meta.firstTextT != null ? (meta.firstTextT - meta.runStart) / 1000 : null;
          const ttftWaiting = meta.wasRun && meta.firstTextT == null ? (Date.now() - meta.runStart) / 1000 : null;
          const ltTotal = meta.thinkMs + meta.toolMs + meta.outMs;
          const liveTurnRow = ltTotal > 300 ? h(
            'div',
            { className: 'dsh-br-liveturn' },
            h(
              'span',
              { className: 'dsh-br-ltbar' },
              h('i', { 'data-k': 'think', style: { width: ((meta.thinkMs / ltTotal) * 100).toFixed(1) + '%' } }),
              h('i', { 'data-k': 'tool', style: { width: ((meta.toolMs / ltTotal) * 100).toFixed(1) + '%' } }),
              h('i', { 'data-k': 'write', style: { width: ((meta.outMs / ltTotal) * 100).toFixed(1) + '%' } }),
            ),
            h(
              'span',
              { className: 'dsh-br-lttxt' },
              t('ltThink') + (meta.thinkMs / 1000).toFixed(1) +
              ' \u00B7 ' + t('ltTool') + (meta.toolMs / 1000).toFixed(1) +
              ' \u00B7 ' + t('ltWrite') + (meta.outMs / 1000).toFixed(1),
            ),
          ) : null;

          const failRow = errN > 0 || retryK !== '' ? h(
            'div',
            { className: 'dsh-br-srow dsh-br-failrow', title: errMsg === '' ? t('failN') + ' \u00D7' + errN : errMsg },
            h(
              'span',
              null,
              t('failN'),
              ' ',
              h('b', null, '\u00D7' + errN),
              errCode !== '' ? ' \u00B7 ' + errCode : '',
              retryK === 'scheduled'
                ? ' \u00B7 ' + t('retryWait')
                : retryK === 'started'
                  ? ' \u00B7 ' + t('retryGo')
                  : '',
            ),
          ) : null;

          const toolLedger = toolRows.length > 0 ? h(
            'div',
            { className: 'dsh-br-tools' },
            h('div', { className: 'dsh-br-tools-head' }, t('tools'), h('b', null, String(toolRows.length))),
            ...toolRows.map((row, index) =>
              h(
                'div',
                {
                  key: index,
                  className: 'dsh-br-trow',
                  'data-live': row.live ? 'true' : 'false',
                  'data-err': row.err ? 'true' : 'false',
                  title: row.name,
                },
                h('i', { className: 'dsh-br-tdot' }),
                h('span', { className: 'dsh-br-tname' }, row.name),
                h('span', { className: 'dsh-br-tdur' }, row.live ? (row.v > 0 ? fmtS(Date.now() - row.v) : '\u2014') : row.v < 0 ? '\u2014' : fmtS(row.v)),
              ),
            ),
          ) : null;

          const agentPanel = h(
            'div',
            { className: 'dsh-br-panel' },
            h('div', { className: 'dsh-br-panel-head' }, t('agent'), h('b', null, 'MK-IV')),
            h(
              'div',
              { className: 'dsh-br-live' },
              h('i', { className: 'dsh-br-live-led', 'data-live': live }),
              h('span', { className: 'dsh-br-live-state', 'data-live': live }, t(live)),
              h(
                'span',
                { className: 'dsh-br-live-count' },
                stats == null ? '\u2014' : 'T' + stats.turns + ' \u00B7 S' + stats.steps,
              ),
              liveCalls > 0 ? h('span', { className: 'dsh-br-ltcalls' }, '\u25B8' + liveCalls) : null,
              waiting ? h('button', { type: 'button', className: 'dsh-br-jump', onClick: () => jumpTo('[data-approval-key]') }, t('goto')) : null,
              h('button', { type: 'button', className: 'dsh-br-jump', 'data-k': 'latest', 'data-unread': unread ? 'true' : 'false', title: t('latest'), onClick: () => jumpTo('[data-turn-tail]') }, '\u21BA'),
            ),
            failRow,
            toolLedger,
            h(
              'div',
              { className: 'dsh-br-split' },
              h('i', { 'data-k': 'llm', style: { width: llmPct + '%' } }),
              h('i', { 'data-k': 'tool', style: { width: toolPct + '%' } }),
              h('i', { 'data-k': 'rest', style: { flex: wallMs > 0 ? '0 0 auto' : '1 1 auto' } }),
            ),
            h(
              'div',
              { className: 'dsh-br-srow' },
              h('span', null, h('i', { className: 'dsh-br-key', 'data-k': 'llm' }), t('llm'), h('b', null, fmtS(llmMs))),
              h('span', null, h('i', { className: 'dsh-br-key', 'data-k': 'tool' }), t('tool'), h('b', null, fmtS(toolMs))),
            ),
            h(
              'div',
              { className: 'dsh-br-srow', style: { marginTop: 3 } },
              h(
                'span',
                null,
                t('ttft'),
                h(
                  'b',
                  null,
                  ttftWaiting != null
                    ? ttftWaiting.toFixed(1) + 's\u2026'
                    : ttftMeasured != null
                      ? ttftMeasured.toFixed(1) + 's'
                      : ttftAvg == null
                        ? '\u2014'
                        : fmtS(ttftAvg),
                ),
              ),
              h('span', null, t('speed'), h('b', null, decode == null ? '\u2014' : decode.toFixed(1) + ' t/s')),
            ),
            h(
              'div',
              { className: 'dsh-br-srow', style: { marginTop: 3 } },
              h(
                'span',
                null,
                t('out'),
                h(
                  'b',
                  null,
                  cpsLive == null ? '\u2014' : cpsLive.toFixed(1) + ' ' + t('cps'),
                ),
              ),
            ),
            h(
              'div',
              { className: 'dsh-br-spark', 'aria-hidden': 'true' },
              ...sparkVals.map((v, index) =>
                h('i', {
                  key: index,
                  style: { height: Math.max(8, Math.round((v / sparkMax) * 100)) + '%' },
                }),
              ),
            ),
            liveTurnRow,
          );

          // LEFT — FLOW panel: ball between 你/我 + waveform strip + flash --
          const PHASE_COLOR = {
            idle: '#12233a',
            type: '#bfe6ff',
            sub: ICE,
            think: AZ,
            out: GREEN,
            tool: VIOLET,
            ask: AMBER,
            fail: '#ff6b6b',
          };
          const BALL_POS = { idle: 50, type: 12, sub: 34, think: 66, tool: 78, out: 90, ask: 18, fail: 78 };
          const youLit = curPhase === 'type' || curPhase === 'sub' || curPhase === 'ask';
          const meLit = curPhase === 'think' || curPhase === 'out' || curPhase === 'tool';
          let strip = null;
          let flashEl = null;
          if (pulse.length >= 2) {
            const cells = [
              h('rect', { key: 'bg', x: 0, y: 0, width: 100, height: 28, fill: '#0a1524' }),
              h('rect', { key: 'g1', x: 0, y: 4.35, width: 100, height: 0.3, fill: 'rgba(87,216,255,.10)' }),
              h('rect', { key: 'g2', x: 0, y: 14.35, width: 100, height: 0.3, fill: 'rgba(74,222,128,.10)' }),
            ];
            let i = 0;
            while (i < pulse.length) {
              let j = i;
              while (j < pulse.length && pulse[j].p === pulse[i].p) j++;
              const color = PHASE_COLOR[pulse[i].p] != null ? PHASE_COLOR[pulse[i].p] : PHASE_COLOR.idle;
              cells.push(
                h('rect', {
                  key: 'b' + i,
                  x: ((i / 160) * 100).toFixed(2),
                  y: 24.5,
                  width: (((j - i) / 160) * 100).toFixed(2),
                  height: 3.5,
                  fill: color,
                  opacity: pulse[i].p === 'idle' ? '0.45' : '0.85',
                }),
              );
              i = j;
            }
            for (let k = 0; k < pulse.length; k++) {
              const x = ((k / 160) * 100).toFixed(2);
              if (pulse[k].r > 0) {
                const amp = Math.min(8, 1 + pulse[k].r * 0.2);
                cells.push(
                  h('rect', { key: 'r' + k, x: x, y: (4.5 - amp / 2).toFixed(2), width: '0.7', height: amp.toFixed(2), fill: AZ, opacity: '0.9' }),
                );
              }
              if (pulse[k].d > 0) {
                const amp = Math.min(8, 1 + pulse[k].d * 0.2);
                cells.push(
                  h('rect', { key: 't' + k, x: x, y: (14.5 - amp / 2).toFixed(2), width: '0.7', height: amp.toFixed(2), fill: GREEN, opacity: '0.95' }),
                );
              }
              if (pulse[k].f === 1) {
                cells.push(
                  h('rect', { key: 'f' + k, x: x, y: 0, width: 0.75, height: 24.5, fill: ICE, opacity: '0.95' }),
                );
              }
            }
            const head = pulse.length - 1;
            cells.push(
              h('rect', {
                className: 'dsh-br-strip-head',
                key: 'head',
                x: Math.max(0, (head / 160) * 100 - 0.5).toFixed(2),
                y: 0,
                width: 1,
                height: 24.5,
                fill: '#ffffff',
                opacity: '0.85',
              }),
            );
            strip = h('svg', { className: 'dsh-br-strip', viewBox: '0 0 100 28', preserveAspectRatio: 'none' }, cells);
            if (meta.flashTick != null) {
              const age = Date.now() - meta.flashT0;
              const idx = pulse.length - 1 - (meta.tick - meta.flashTick);
              if (age < 2600 && idx >= 0 && idx < pulse.length && meta.flashText !== '') {
                flashEl = h(
                  'span',
                  {
                    className: 'dsh-br-flash',
                    style: {
                      left: Math.min(74, Math.max(1, (idx / 160) * 100)) + '%',
                      opacity: (1 - age / 2600).toFixed(2),
                    },
                  },
                  meta.flashText,
                );
              }
            }
          }
          const flowPanel = h(
            'div',
            { className: 'dsh-br-panel', 'data-grow': '1' },
            h('div', { className: 'dsh-br-panel-head' }, t('flow'), h('b', null, totalTokens === 0 ? '\u2014' : fmt(totalTokens))),
            h(
              'div',
              { className: 'dsh-br-ball-row' },
              h('span', { className: 'dsh-br-ball-name', 'data-lit': youLit ? '1' : '0' }, t('you')),
              h(
                'span',
                { className: 'dsh-br-ball-track' },
                h('i', {
                  className: 'dsh-br-ball',
                  'data-p': curPhase,
                  style: { left: (BALL_POS[curPhase] != null ? BALL_POS[curPhase] : 50) + '%' },
                }),
              ),
              h('span', { className: 'dsh-br-ball-name', 'data-lit': meLit ? '1' : '0' }, t('me')),
              h('span', { className: 'dsh-br-flow-now', 'data-p': curPhase }, t(curPhase)),
            ),
            h(
              'div',
              { className: 'dsh-br-strip-wrap' },
              h('span', { className: 'dsh-br-lane', style: { top: '11%', color: AZ } }, t('rea')),
              h('span', { className: 'dsh-br-lane', style: { top: '47%', color: GREEN } }, t('txt')),
              strip != null
                ? h(F, null, strip, flashEl)
                : h('div', { className: 'dsh-br-empty' }, 'WARMING UP'),
            ),
            h(
              'div',
              { className: 'dsh-br-srow', style: { marginTop: 6 } },
              h('span', null, t('turn'), h('b', null, flowSecs.toFixed(1) + 's')),
              meta.turnRea > 0
                ? h(
                    'span',
                    { style: { marginLeft: 'auto' } },
                    t('rea'),
                    h('b', null, String(meta.turnRea)),
                    '\u00B7',
                    t('txt'),
                    h('b', null, String(meta.turnChars)),
                  )
                : h('span', { style: { marginLeft: 'auto' } }, t('written'), h('b', null, meta.turnChars + ' ' + t('charUnit'))),
            ),
          );

          // RIGHT — CONTEXT arc (eased sweep + live breathing + char flow) --
          // Composition folded in from contextBreakdown so the arc itself shows
          // WHAT is filling the window, not just how much. These three figures
          // are host heuristics over the visible surface (per the projection's
          // own contract), so segment tooltips say so.
          const sysT = mix == null ? 0 : mix.systemTokens;
          const toolsT = mix == null ? 0 : mix.toolsTokens;
          const msgT = mix == null ? 0 : mix.messageTokens;
          const mixTotal = Math.max(1, sysT + toolsT + msgT);
          const segs =
            mix == null
              ? null
              : [
                  { k: 'sys', name: t('system'), v: sysT },
                  { k: 'tools', name: t('tools'), v: toolsT },
                  { k: 'msg', name: t('msgs'), v: msgT },
                ];
          const projected =
            pressure == null ? null : pressure.projectedTokens != null ? pressure.projectedTokens : pressure.pressureTokens;
          const cap = pressure == null ? null : pressure.contextWindow;
          const easedProj = useEased(projected == null ? 0 : projected);
          const pct = projected != null && cap ? Math.min(100, (easedProj / cap) * 100) : null;
          const hot = pct != null && pct >= 85;
          const ARC = 131.9; // pi * r(42) half-circle length
          const arcTip = projected == null || cap == null || cap <= 0
            ? '\u2014'
            : Number(projected).toLocaleString('en-US') + ' / ' + Number(cap).toLocaleString('en-US') + ' tok \u00B7 ' + Math.min(100, (projected / cap) * 100).toFixed(2) + '%';
          const ARC_D = 'M8 58 A44 44 0 0 1 96 58';
          const hovered = hoverSeg == null || segs == null
            ? null
            : segs.filter((seg) => seg.k === hoverSeg)[0] || null;
          const hoverText = hovered == null
            ? null
            : hovered.name + ' ' + hovered.v.toLocaleString('en-US') + ' \u00B7 ' +
              ((hovered.v / mixTotal) * 100).toFixed(1) + '% \u00B7 ' + t('heur');
          const hoverColor = hovered == null ? null : hovered.k === 'sys' ? '#8ba9c0' : hovered.k === 'tools' ? '#b3a5ff' : AZ;

          let arcSegEls = null;
          if (pct != null && segs != null) {
            const used = (pct / 100) * ARC;
            const vis = [];
            const hits = [];
            let at = 0;
            for (let i = 0; i < segs.length; i++) {
              const seg = segs[i];
              const raw = (seg.v / mixTotal) * used;
              const len = raw > 0.9 ? raw - 0.7 : raw;
              const start = at;
              at += raw;
              const dash = Math.max(0, len).toFixed(1) + ' ' + ARC;
              const off = (-start).toFixed(1);
              vis.push(
                h('path', {
                  key: seg.k,
                  className: 'dsh-br-arc-seg',
                  'data-k': seg.k,
                  d: ARC_D,
                  strokeDasharray: dash,
                  strokeDashoffset: off,
                }),
              );
              // Transparent, deliberately wide band on top: a 7px dash arc is a
              // miserable hover target, so hit-testing gets its own 18px stroke.
              hits.push(
                h('path', {
                  key: 'h-' + seg.k,
                  className: 'dsh-br-arc-hit',
                  'data-k': seg.k,
                  d: ARC_D,
                  strokeDasharray: dash,
                  strokeDashoffset: off,
                  onMouseEnter: () => setHoverSeg(seg.k),
                  onMouseLeave: () => setHoverSeg(null),
                }),
              );
            }
            arcSegEls = vis.concat(hits);
          }

          const ctxPanel = h(
            'div',
            { className: 'dsh-br-panel' },
            h('div', { className: 'dsh-br-panel-head', title: arcTip }, t('ctx'), h('b', null, cap ? fmt(cap) : '\u2014')),
            h(
              'div',
              { className: 'dsh-br-arc', 'data-live': live },
              h(
                'svg',
                { viewBox: '0 0 104 66' },
                h('path', { className: 'dsh-br-arc-track', d: 'M8 58 A44 44 0 0 1 96 58' }),
                arcSegEls == null
                  ? h('path', {
                      className: 'dsh-br-arc-fill',
                      'data-hot': hot ? 'true' : 'false',
                      d: ARC_D,
                      strokeDasharray: pct == null ? '0 ' + ARC : ((pct / 100) * ARC).toFixed(1) + ' ' + ARC,
                    })
                  : h(F, null, ...arcSegEls),
              ),
              h(
                'div',
                null,
                h('div', { className: 'dsh-br-arc-pct', 'data-hot': hot ? 'true' : 'false' }, pct == null ? '--' : pct.toFixed(1) + '%'),
                h(
                  'div',
                  {
                    className: 'dsh-br-arc-sub',
                    'data-hover': hoverText == null ? 'false' : 'true',
                    style: hoverColor == null ? undefined : { color: hoverColor },
                  },
                  hoverText != null
                    ? hoverText
                    : projected == null
                      ? 'no sample yet'
                      : fmt(easedProj) + ' tok',
                ),
                live === 'run' && meta.turnChars + meta.turnRea > 0
                  ? h('div', { className: 'dsh-br-arc-delta' }, '+' + (meta.turnChars + meta.turnRea) + ' ' + t('charUnit'))
                  : null,
              ),
            ),
          );

          // RIGHT — MIX composition ---------------------------------------------
          const promptSide =
            usage == null ? 0 : usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
          const hitPct = usage != null && promptSide > 0 ? Math.round((usage.cacheReadTokens / promptSide) * 100) : null;
          const mixPanel = h(
            'div',
            { className: 'dsh-br-panel', 'data-grow': '1' },
            h('div', { className: 'dsh-br-panel-head' }, t('compose'), h('b', null, mix == null ? '\u2014' : fmt(mixTotal))),
            h(
              'div',
              { className: 'dsh-br-stack' },
              h('i', { 'data-k': 'sys', style: { width: ((sysT / mixTotal) * 100).toFixed(1) + '%' } }),
              h('i', { 'data-k': 'tools', style: { width: ((toolsT / mixTotal) * 100).toFixed(1) + '%' } }),
              h('i', { 'data-k': 'msg', style: { width: ((msgT / mixTotal) * 100).toFixed(1) + '%' } }),
            ),
            h(URow, { key: 'ms', name: t('system'), color: '#6d8ba3', value: sysT, max: mixTotal }),
            h(URow, { key: 'mt', name: t('tools'), color: VIOLET, value: toolsT, max: mixTotal }),
            h(URow, { key: 'mm', name: t('msgs'), color: AZ, value: msgT, max: mixTotal }),
            h(
              'div',
              { className: 'dsh-br-srow', style: { marginTop: 6 } },
              h('span', null, t('cache'), h('i', { className: 'dsh-br-key', 'data-k': 'llm' })),
              h('span', { style: { marginLeft: 'auto' } }, t('hit'), h('b', null, hitPct == null ? '\u2014' : hitPct + '%')),
            ),
          );

          // RIGHT — USAGE buckets -----------------------------------------------
          const usePanel = usage == null ? null : h(
            'div',
            { className: 'dsh-br-panel' },
            h('div', { className: 'dsh-br-panel-head' }, t('usage'), h('b', null, fmt(totalTokens))),
            h(URow, { key: 'uo', name: t('out'), color: AZ, value: usage.outputTokens, max: Math.max(1, totalTokens) }),
            h(URow, { key: 'ui', name: t('in'), color: '#6d8ba3', value: usage.uncachedInputTokens, max: Math.max(1, totalTokens) }),
            h(URow, { key: 'ur', name: t('read'), color: GREEN, value: usage.cacheReadTokens, max: Math.max(1, totalTokens) }),
            h(URow, { key: 'uw', name: t('write'), color: VIOLET, value: usage.cacheWriteTokens, max: Math.max(1, totalTokens) }),
          );

          return h(
            F,
            null,
            h(
              'div',
              {
                className: 'dsh-br-inst',
                'data-side': 'left',
                ref: leftRef,
                style: sidebarPx == null ? undefined : { left: Math.round(sidebarPx) + 14 + 'px' },
              },
              agentPanel,
              flowPanel,
            ),
            h('div', { className: 'dsh-br-inst', 'data-side': 'right' }, ctxPanel, mixPanel, usePanel),
          );
        }

        /** Ease a displayed number toward its true target (display-only). */
        function useEased(v) {
          const [disp, setDisp] = useState(Number.isFinite(v) ? v : 0);
          const st = useRef({ cur: 0, tgt: Number.isFinite(v) ? v : 0 });
          st.current.tgt = Number.isFinite(v) ? v : 0;
          useEffect(
            () =>
              subscribeBeat(() => {
                setDisp((prev) => {
                  const tgt = st.current.tgt;
                  const gap = tgt - prev;
                  const eps = Math.max(1, Math.abs(tgt)) * 0.008;
                  if (Math.abs(gap) <= eps) return tgt;
                  return prev + gap * 0.3;
                });
              }),
            [],
          );
          return disp;
        }

        /** Last change of a settled value, as a fading +Δ ghost. */
        function useDelta(v) {
          const st = useRef({ prev: v, d: 0, at: 0 });
          if (st.current.prev !== v) {
            st.current.d = v - st.current.prev;
            st.current.at = Date.now();
            st.current.prev = v;
          }
          const age = st.current.at > 0 ? Date.now() - st.current.at : Infinity;
          return age < 1600 && st.current.d !== 0 ? { d: st.current.d, o: 1 - age / 1600 } : null;
        }

        /** One usage/mix row: eased bar + eased count + delta ghost. */
        function URow(props) {
          const ev = useEased(props.value);
          const g = useDelta(props.value);
          const exact = Number.isFinite(props.value) ? props.value.toLocaleString('en-US') : '--';
          const share = props.max > 0 && Number.isFinite(props.value) ? ((props.value / props.max) * 100).toFixed(1) + '%' : '';
          const tip = props.name + ' ' + exact + ' tok' + (share ? ' · ' + share : '');
          return h(
            'div',
            { className: 'dsh-br-urow', title: tip },
            h('i', { className: 'dsh-br-urow-key', style: { background: props.color } }),
            h('span', { className: 'dsh-br-urow-name' }, props.name),
            h(
              'span',
              { className: 'dsh-br-urow-track' },
              h('i', {
                style: { width: Math.min(100, Math.max(0, (ev / props.max) * 100)).toFixed(1) + '%', background: props.color },
              }),
            ),
            h('span', { className: 'dsh-br-urow-val' }, fmt(ev)),
            g == null ? null : h('em', { className: 'dsh-br-ghost', style: { opacity: g.o.toFixed(2) } }, (g.d > 0 ? '+' : '') + fmt(g.d)),
          );
        }


        // ---- mission chip: real turns / steps / decode speed ------------------
        function MissionChip(props) {
          useLocaleRevision();
          const t = ctx.locale.bind(NS);
          const stats =
            typeof props.useProjection === 'function' ? props.useProjection('sessionStats') : undefined;
          if (stats == null || (stats.turns === 0 && stats.steps === 0)) return null;
          const speed =
            stats.decodeMs > 0 ? (stats.decodeTokens / (stats.decodeMs / 1000)).toFixed(1) : '--';
          return h(
            'div',
            { className: 'dsh-br-chip', 'aria-hidden': 'true' },
            h('i', { className: 'dsh-br-chip-dot' }),
            h('span', null, t('mission')),
            h('b', null, 'T' + stats.turns + ' \u00B7 S' + stats.steps),
            h('i', { className: 'dsh-br-sep' }),
            h('span', null, t('speed')),
            h('b', null, speed + ' t/s'),
          );
        }

        // ---- token chip: real whole-log totals and cache hit --------------------
        function TokenChip(props) {
          useLocaleRevision();
          const t = ctx.locale.bind(NS);
          const usage =
            typeof props.useProjection === 'function' ? props.useProjection('tokenUsage') : undefined;
          if (usage == null) return null;
          const total =
            usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
          const promptSide = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
          const hit = promptSide > 0 ? Math.round((usage.cacheReadTokens / promptSide) * 100) : null;
          return h(
            'div',
            { className: 'dsh-br-chip', 'aria-hidden': 'true' },
            h('i', { className: 'dsh-br-chip-dot', style: { animationDelay: '.8s' } }),
            h('span', null, t('tokens')),
            h('b', null, fmt(total)),
            h('i', { className: 'dsh-br-sep' }),
            h('span', null, t('out')),
            h('b', null, fmt(usage.outputTokens)),
            hit == null
              ? null
              : h(F, null, h('i', { className: 'dsh-br-sep' }), h('span', null, t('cache')), h('b', null, hit + '%')),
          );
        }

        // ---- console deck: status, engine, real context gauge, clock --------------
        function ConsoleDeck(props) {
          useLocaleRevision();
          const now = useClock();
          const t = ctx.locale.bind(NS);
          const sessionId = props.sessionId;
          const status =
            typeof props.useSessionStatus === 'function'
              ? props.useSessionStatus((snapshot) =>
                  sessionId == null ? undefined : snapshot.get(sessionId),
                )
              : undefined;
          const pressure =
            typeof props.useProjection === 'function' ? props.useProjection('contextPressure') : undefined;
          const waiting = status != null && status.pendingInteraction != null;
          const running = status != null && status.running === true;
          const live = waiting ? 'input' : running ? 'run' : 'standby';
          const projected =
            pressure == null ? undefined : pressure.projectedTokens != null ? pressure.projectedTokens : pressure.pressureTokens;
          const cap = pressure == null ? undefined : pressure.contextWindow;
          const pct =
            projected != null && cap ? Math.min(100, (projected / cap) * 100) : null;
          const hot = pct != null && pct >= 85;
          const short =
            String(sessionId == null ? '' : sessionId)
              .replace(/[^0-9a-z]/gi, '')
              .slice(-6)
              .toUpperCase() || '------';
          const time = TIME.format(new Date(now));
          const bars = [0, 1, 2, 3, 4, 5].map((i) =>
            h('i', { key: i, style: { animationDelay: (i * 0.1).toFixed(2) + 's' } }),
          );
          return h(
            'div',
            { className: 'dsh-br-deck', 'aria-hidden': 'true' },
            h('i', { className: 'dsh-br-led', 'data-live': live }),
            h('span', { className: 'dsh-br-state', 'data-live': live }, t(live)),
            h('i', { className: 'dsh-br-sep' }),
            h('span', null, t('engine')),
            h('span', { className: 'dsh-br-eng', 'data-idle': live === 'standby' ? 'true' : 'false' }, bars),
            h('i', { className: 'dsh-br-sep' }),
            h(
              'span',
              { className: 'dsh-br-ctx' },
              h('span', null, t('ctx')),
              h(
                'span',
                { className: 'dsh-br-ctx-track' },
                h('i', {
                  className: 'dsh-br-ctx-fill',
                  'data-hot': hot ? 'true' : 'false',
                  style: { width: pct == null ? '0%' : pct.toFixed(1) + '%' },
                }),
              ),
              h(
                'span',
                { className: 'dsh-br-ctx-read', 'data-hot': hot ? 'true' : 'false' },
                pct == null ? '--' : pct.toFixed(1) + '% ' + fmt(projected) + (cap ? '/' + fmt(cap) : ''),
              ),
            ),
            h('span', { className: 'dsh-br-fill' }),
            h('span', { className: 'dsh-br-ses' }, t('session') + ' ' + short),
            h('i', { className: 'dsh-br-sep' }),
            h('span', { className: 'dsh-br-clock' }, t('local') + ' ' + time),
          );
        }

        // ---- turn divider ------------------------------------------------------------
        function TurnDivider(props) {
          useLocaleRevision();
          const t = ctx.locale.bind(NS);
          const turn = props.turn;
          const number =
            turn != null && typeof turn.turn === 'number'
              ? turn.turn
              : typeof props.seq === 'number'
                ? props.seq
                : undefined;
          const label = number === undefined ? t('turn') : t('turn') + ' ' + String(number).padStart(2, '0');
          return h(
            'div',
            { className: 'dsh-br-turn', 'aria-hidden': 'true' },
            h('i', { className: 'dsh-br-turn-line' }),
            h('span', { className: 'dsh-br-turn-label' }, '\u25C7 ' + label + ' \u25C7'),
            h('i', { className: 'dsh-br-turn-line', 'data-flip': '1' }),
          );
        }

        // ---- hero emblem --------------------------------------------------------------
        function HeroEmblem(props) {
          const size = typeof props.size === 'number' ? props.size : 48;
          return h(
            'svg',
            {
              className: 'dsh-br-emblem',
              width: size,
              height: size,
              viewBox: '0 0 64 64',
              role: 'img',
              'aria-label': 'DSH bridge',
              style: { display: 'block', pointerEvents: 'none' },
            },
            h('path', {
              d: 'M32 5 55 18.5v27L32 59 9 45.5v-27Z',
              fill: 'none',
              stroke: 'rgba(87,216,255,.5)',
              strokeWidth: 1,
            }),
            h(
              'g',
              { className: 'dsh-br-emblem-ring' },
              h('circle', {
                cx: 32,
                cy: 32,
                r: 22,
                fill: 'none',
                stroke: 'rgba(87,216,255,.65)',
                strokeWidth: 1,
                strokeDasharray: '4 8',
              }),
            ),
            h(
              'g',
              { className: 'dsh-br-emblem-ring2' },
              h('circle', {
                cx: 32,
                cy: 32,
                r: 15,
                fill: 'none',
                stroke: 'rgba(223,242,255,.4)',
                strokeWidth: 0.8,
                strokeDasharray: '18 6 3 6',
              }),
            ),
            h('path', {
              d: 'M32 12v6M32 46v6M12 32h6M46 32h6',
              stroke: 'rgba(87,216,255,.8)',
              strokeWidth: 1.2,
              strokeLinecap: 'round',
            }),
            h('circle', { cx: 32, cy: 32, r: 2.2, fill: '#dff2ff' }),
          );
        }

        // ---- registration: each step isolated so one failure cannot cascade ----
        const attempt = (label, fn) => {
          try {
            fn();
          } catch (err) {
            try {
              console.warn('[dsh-cockpit] ' + label + ' skipped:', err);
            } catch (_) {
              /* console unavailable — stay silent */
            }
          }
        };

        attempt('palette', () =>
          ctx.effect(() => ctx.theme.overrideTokens(SOURCE, TOKENS), 'dsh-cockpit: palette layer'),
        );
        attempt('locale', () =>
          ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-cockpit: dictionaries'),
        );
        attempt('frame', () =>
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register({ name: 'shell.overlay', id: 'bridge-frame', order: -20 }, safe(BridgeFrame)),
          ),
        );
        attempt('boot', () =>
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register({ name: 'shell.overlay', id: 'bridge-boot', order: 60 }, safe(BootSequence)),
          ),
        );
        attempt('side instruments', () =>
          ctx.slots.inject('conversation.composer.dock', () =>
            ctx.slots.register(
              { name: 'conversation.composer.dock', id: 'bridge-instruments', order: 2 },
              safe(SideInstruments),
            ),
          ),
        );
        attempt('mission chip', () =>
          ctx.slots.inject('conversation.composer.dock', () =>
            ctx.slots.register(
              { name: 'conversation.composer.dock', id: 'bridge-mission', order: 0 },
              safe(MissionChip),
            ),
          ),
        );
        attempt('token chip', () =>
          ctx.slots.inject('conversation.composer.dock', () =>
            ctx.slots.register(
              { name: 'conversation.composer.dock', id: 'bridge-token', order: 1 },
              safe(TokenChip),
            ),
          ),
        );
        attempt('console deck', () =>
          ctx.slots.inject('conversation.composer.dock', () =>
            ctx.slots.register(
              { name: 'conversation.composer.dock', id: 'bridge-console', order: 5 },
              safe(ConsoleDeck),
            ),
          ),
        );
        attempt('turn divider', () =>
          ctx.slots.inject('conversation.chat.turnTail', () =>
            ctx.slots.register(
              { name: 'conversation.chat.turnTail', id: 'bridge-turn', order: 5 },
              safe(TurnDivider),
            ),
          ),
        );
        attempt('hero emblem', () =>
          ctx.slots.inject('conversation.hero.brand.mark', () =>
            ctx.slots.register({ name: 'conversation.hero.brand.mark' }, safe(HeroEmblem)),
          ),
        );

        // Bake the frozen sky bitmap once, off the critical path, and hand it
        // to CSS (--dsh-sky). The root rule already paints a cheap solid base
        // so there is no flash and no live-gradient jank if this never lands.
        try {
          if (typeof setTimeout === 'function' && typeof document !== 'undefined') {
            setTimeout(function () {
              try {
                const url = bakeSkyURL();
                if (url !== '') document.documentElement.style.setProperty('--dsh-sky', 'url("' + url + '")');
              } catch (err) {}
            }, 120);
          }
        } catch (err) {}
      },
    };
    } catch (err) {
      // Materialization failed: degrade to a no-op plugin so the harness
      // always boots. One console warning is the only trace.
      try {
        console.warn('[dsh-cockpit] client module failed to materialize:', err);
      } catch (_) {
        /* stay silent */
      }
      return { apply() {} };
    }
  },
});
