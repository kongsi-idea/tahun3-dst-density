# 浮沉实验室 · 交接

## ⏯️ 目前做到哪
v3.0（3D 厨房版）已上线 https://tahun3-dst-density.vercel.app（工具 commit c7da6d9）。线上用 Playwright 真实点击跑完五个环节，无报错。Hub 已同步：app.js v3.0＋changelog、4 张新缩图（v3-*）、覆盖表、tools-status（Hub 8ead72a、teaching-tools 9824ad9），线上 app.js 已确认是 v3.0。v2 旧缩图搬到 `~/Documents/待删除/kongsi-idea-thumbs-tahun3-v2/`。

## 🚦 目前状态
- 可用。学校触控一体机的流畅度**仍未实测**；页面会自动降画质（像素比→1、阴影降级）。
- 工具的 `vercel --prod` 没被 guard 挡（已知漏洞），老师当次明确要求上线。
- 回滚：工具 `git revert c7da6d9` 后重新部署；Hub `git revert 8ead72a` 后重新部署。

## ➡️ 下一步
1. 老师在课堂／一体机上实际试用，收集反馈（手机直立时画面偏小，课堂主力是横屏）。
2. 第④环节：葡萄若掉在小番茄上会显示「停在…中间」（物体叠放），可再优化文字判定。
3. 「我的发现」卡的下载在 claude.ai 预览里会被挡，正式网址可用。

## ⚠️ 注意事项
- 只改 `proto/lab-v3.html`，再生成 `index.html`：
  `{ printf '<!doctype html>\n<html lang="zh-CN">\n<head>…</head>\n<body>\n'; cat proto/lab-v3.html; printf '\n</body>\n</html>\n'; } > index.html`（head 内容照现有 index.html 前 8 行）。
- 验收脚本思路：`window.__fc`（enterMod / step / S / snaps）可直接驱动；物理关键结果见 agents.md。
- 本机测试：`python3 -m http.server 8765`，开 http://localhost:8765。

## 🕐 最后更新
2026-10-02 · Claude Opus 5.5 @ mr007s-Macbook-Air · v3.0 · Git：✅ 已推

历史：2026-07-21 v1.0 → 2026-09-16 v2.0（PhET 风格 2D）→ 2026-10-02 v3.0（3D 厨房、五环节、液体分层）。
