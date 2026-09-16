# 浮沉实验室 · 交接

## ⏯️ 目前做到哪
v2.0 已上线（https://tahun3-dst-density.vercel.app），课堂点子铺已同步版本记录（2.0／2026-09-17）和 4 张新缩图，并已部署、切 alias，线上验证通过。

## 🚦 目前状态
- 四个实验站＋学习报告、自学／老师模式都可用。线上 Playwright 检查 26 项全过，没有报错。
- 等课堂实际使用的反馈。

## ➡️ 下一步
1. 站④神秘方块排序区的方块图示太小（排序格里的立方体图标要放大，空白要收紧）。
2. 拿到三年级科学课本 Unit Ketumpatan 后核对内容，决定要不要补液体分层或加糖。
3. 如果改版上线，照 `../agents.md` 的五步更新 Hub。

## ⚠️ 注意事项
- 物理常数、图片裁切等决定写在 `agents.md`，改之前先读。
- 本机测试：在本目录跑 `python3 -m http.server 8765`，打开 http://localhost:8765。Playwright 可用 `~/.npm/_npx/e41f203b7505f1fb/node_modules` 的 playwright-core。
- scratchpad 里旧的 `verify_items.js` 用旧尺寸公式算期望值，会误报，不要再用。

## 🕐 最后更新
2026-09-17 00:5x · Claude Opus 5 @ mr007s-Macbook-Air · Git：✅ 已推

历史：2026-07-21 v1.0 上架 → 2026-09-16 v2.0 重做（Sonnet 实现、三轮视觉修正）→ 2026-09-17 工具与 Hub 上线。
