# 浮沉实验室 · 交接

## ⏯️ 目前做到哪
v3.0（3D 厨房版）完成：五个环节、两个场景（大水缸＋秤、玻璃量杯），本机 Playwright 全流程验收通过（无报错）。2026-10-02 老师说「直接做到完发布上线」。

## 🚦 目前状态
- 上线状态与 Hub 同步结果见本档最后更新与 commit 记录。
- 学校触控一体机的流畅度**仍未实测**；页面会自动降画质（像素比→1、阴影降级）。

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
2026-10-02 · Claude Opus 5.5 · v3.0

历史：2026-07-21 v1.0 → 2026-09-16 v2.0（PhET 风格 2D）→ 2026-10-02 v3.0（3D 厨房、五环节、液体分层）。
