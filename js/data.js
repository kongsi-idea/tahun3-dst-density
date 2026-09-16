/* 浮沉实验室 v2.0 — 数据层
 * 物体、天平配对、题库、图标全部集中在这里，sim.js / app.js 只读取，不写死数字。
 */
(function (global) {
  "use strict";

  var DL = global.DL || (global.DL = {});

  // ------------------------------------------------------------------
  // 物体图片的「实际画面内容」不透明像素外框（像素坐标，量测自
  // assets/objects/*.png，素材四周留白不等，l/t/r/b 是内容框、size 是
  // 原图边长）。渲染时用它当 SVG 内层 viewBox，把图片当成一层「贴纸」
  // 精确裁到内容框、再撑满物理箱体 hPx——这样看得见的画面边界才会跟
  // 物理浮沉的箱体边界重合（v2.1 修正 item 1：泡沫块/木块曾经看起来浮在
  // 水面上方、完全没碰到水，就是画布四周留白被当成物体的一部分，等于
  // 把物体「架高」了一截；改用 nested <svg> 硬裁到内容框就不会再有这段
  // 看不见但占位的留白）。
  // ------------------------------------------------------------------
  var IMG_META = {
    apple: { l: 53, t: 25, r: 458, b: 487, size: 512 },
    candle: { l: 42, t: 25, r: 470, b: 487, size: 512 },
    cap: { l: 25, t: 60, r: 487, b: 452, size: 512 },
    egg: { l: 76, t: 25, r: 436, b: 487, size: 512 },
    eraser: { l: 25, t: 107, r: 487, b: 405, size: 512 },
    foam: { l: 25, t: 65, r: 487, b: 446, size: 512 },
    ice: { l: 39, t: 25, r: 473, b: 487, size: 512 },
    key: { l: 25, t: 95, r: 487, b: 417, size: 512 },
    marble: { l: 25, t: 27, r: 487, b: 485, size: 512 },
    nail: { l: 25, t: 111, r: 487, b: 400, size: 512 },
    stone: { l: 25, t: 94, r: 487, b: 418, size: 512 },
    wood: { l: 25, t: 98, r: 487, b: 414, size: 512 }
  };
  DL.IMG_META = IMG_META;

  // ------------------------------------------------------------------
  // 物体（密度参考值 g/cm³，体积 cm³）。质量 = 密度 × 体积，四舍五入到整数克。
  // ------------------------------------------------------------------
  var OBJECTS = {
    foam:   { id: "foam",   name: "泡沫块",   density: 0.05, volume: 60,   size: 1.00 },
    wood:   { id: "wood",   name: "木块",     density: 0.60, volume: 60,   size: 1.00 },
    apple:  { id: "apple",  name: "苹果",     density: 0.80, volume: 200,  size: 1.25 },
    candle: { id: "candle", name: "蜡烛",     density: 0.90, volume: 40,   size: 0.90 },
    cap:    { id: "cap",    name: "塑料瓶盖", density: 0.90, volume: 8,    size: 0.60 },
    ice:    { id: "ice",    name: "冰块",     density: 0.92, volume: 30,   size: 0.80 },
    egg:    { id: "egg",    name: "鸡蛋",     density: 1.07, volume: 55,   size: 0.85 },
    eraser: { id: "eraser", name: "橡皮擦",   density: 1.50, volume: 10,   size: 0.65 },
    marble: { id: "marble", name: "玻璃弹珠", density: 2.50, volume: 5,    size: 0.50 },
    stone:  { id: "stone",  name: "石头",     density: 2.60, volume: 40,   size: 0.85 },
    nail:   { id: "nail",   name: "铁钉",     density: 7.80, volume: 1.2,  size: 0.70 },
    key:    { id: "key",    name: "钥匙",     density: 8.50, volume: 3,    size: 0.70 },

    // 站②专用体积变体（同材料，不同大小），沿用同一张图片
    "wood-big":    { id: "wood-big",    name: "大木块", density: 0.60, volume: 1000, size: 2.00, image: "wood" },
    "wood-small":  { id: "wood-small",  name: "小木块", density: 0.60, volume: 8,    size: 0.50, image: "wood" },
    "stone-big":   { id: "stone-big",   name: "大石头", density: 2.60, volume: 300,  size: 1.60, image: "stone" },
    "stone-small": { id: "stone-small", name: "小石头", density: 2.60, volume: 4,    size: 0.45, image: "stone" },

    // 站④神秘方块（灰色几何方块，不用真实照片）
    mystery_x: { id: "mystery_x", name: "方块 X", density: 0.80, volume: 60, size: 1.00, mystery: "X" },
    mystery_y: { id: "mystery_y", name: "方块 Y", density: 1.10, volume: 60, size: 1.00, mystery: "Y" },
    mystery_z: { id: "mystery_z", name: "方块 Z", density: 1.40, volume: 60, size: 1.00, mystery: "Z" }
  };

  function mass(obj) {
    return Math.round(obj.density * obj.volume);
  }

  // 站①：预测与分类，12 个主物体
  var STATION1_IDS = ["foam", "wood", "apple", "candle", "cap", "ice", "egg", "eraser", "marble", "stone", "nail", "key"];

  // 站②：三组固定对比
  var STATION2_GROUPS = [
    {
      key: "wood-nail",
      title: "大木块 vs 小铁钉",
      a: "wood-big",
      b: "nail",
      note: "重的不一定沉——大木块比小铁钉重很多倍，却是木块浮、铁钉沉。决定浮沉的不是有多重。"
    },
    {
      key: "wood-wood",
      title: "大木块 vs 小木块",
      a: "wood-big",
      b: "wood-small",
      note: "同一种材料，不管做成大块还是小块，密度都一样，所以两块木头都浮。"
    },
    {
      key: "stone-stone",
      title: "大石头 vs 小石头",
      a: "stone-big",
      b: "stone-small",
      note: "同一种材料，大的小的结果一样——两块石头都沉，因为石头的密度本来就比水大。"
    }
  ];

  // 站④原材料清单（供做木筏挑选，沿用站①12 个物体）
  var RAFT_MATERIALS = STATION1_IDS;

  // ------------------------------------------------------------------
  // 题库
  // ------------------------------------------------------------------
  var QUESTIONS = {
    station1: {
      prompt: "会浮的物体，有什么共同点？",
      options: [
        { key: "A", text: "它们都比较轻" },
        { key: "B", text: "它们的体积都比较小" },
        { key: "C", text: "它们的材料密度比水小" }
      ],
      correct: "C",
      explain: {
        A: "苹果比一颗铁钉重很多，苹果却会浮起来——所以「轻」不是关键。",
        B: "大木块的体积比橡皮擦大很多，大木块还是会浮——所以「大小」不是关键。",
        C: "对！只要材料的密度比水小，不管轻重、大小，都会浮起来。"
      }
    },
    station2: {
      prompt: "一个物体会浮还是会沉，主要由什么决定？",
      options: [
        { key: "A", text: "物体有多重" },
        { key: "B", text: "物体有多大" },
        { key: "C", text: "物体的密度和液体的密度比较" }
      ],
      correct: "C",
      explain: {
        A: "大木块比小铁钉重很多，但木块浮、铁钉沉——「重量」不能单独决定浮沉。",
        B: "大石头和小石头大小差很多，两个都沉——「大小」不能单独决定浮沉。",
        C: "对！物体密度比液体小就浮，比液体大就沉。"
      }
    },
    station3: {
      prompt: "怎样可以让清水的密度变大？",
      options: [
        { key: "A", text: "加更多清水" },
        { key: "B", text: "加盐" },
        { key: "C", text: "把水倒进更大的容器" }
      ],
      correct: "B",
      explain: {
        A: "加更多清水只是水变多了，密度不会改变。",
        B: "对！盐溶解在水里，同样体积的液体变重了，密度就变大了。",
        C: "换一个更大的容器，水的密度不会因此改变。"
      }
    },
    vest: {
      prompt: "救生衣里面为什么要装泡沫材料？",
      options: [
        { key: "A", text: "因为泡沫很漂亮" },
        { key: "B", text: "因为泡沫的密度比水小很多，能帮人浮起来" },
        { key: "C", text: "因为泡沫很重" }
      ],
      correct: "B",
      explain: {
        A: "外观不是救生衣的功能重点。",
        B: "对！泡沫密度远比水小，能提供足够的浮力帮助人浮起来。",
        C: "泡沫其实很轻，不是靠重量帮忙的。"
      }
    },
    sea: {
      prompt: "为什么人在海水里比在河水里容易浮起来？",
      options: [
        { key: "A", text: "海水比较冷" },
        { key: "B", text: "海水里有盐，密度比河水大" },
        { key: "C", text: "海里的浪比较大" }
      ],
      correct: "B",
      explain: {
        A: "水温不是决定浮沉的关键。",
        B: "对！海水含盐，密度比河水大，人（密度接近水）更容易被托起来。",
        C: "浪大小和浮沉的原理无关。"
      }
    }
  };

  // ------------------------------------------------------------------
  // 20px 线性 SVG 图标（1.75 描边，圆角端点），不使用 emoji / ▲▼ 字符
  // ------------------------------------------------------------------
  function icon(paths, viewBox) {
    return (
      '<svg viewBox="' + (viewBox || "0 0 24 24") + '" width="20" height="20" fill="none" ' +
      'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths + "</svg>"
    );
  }

  var ICONS = {
    float: function () { return icon('<path d="M12 19V6"/><path d="M6 12l6-6 6 6"/>'); },
    sink: function () { return icon('<path d="M12 5v13"/><path d="M18 12l-6 6-6-6"/>'); },
    check: function () { return icon('<path d="M20 6 9.5 17 4 11.5"/>'); },
    cross: function () { return icon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>'); },
    droplet: function () { return icon('<path d="M12 3s6.5 7 6.5 11.5A6.5 6.5 0 0 1 5.5 14.5C5.5 10 12 3 12 3Z"/>'); },
    flask: function () { return icon('<path d="M9 2v6.3L4.3 18a2 2 0 0 0 1.8 3h11.8a2 2 0 0 0 1.8-3L15 8.3V2"/><path d="M8.5 2h7"/><path d="M7.5 15h9"/>'); },
    eye: function () { return icon('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'); },
    eyeOff: function () { return icon('<path d="M3 3l18 18"/><path d="M10.6 5.7A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17.6 17.6 0 0 1-3.4 4.2M6.6 6.8A17.4 17.4 0 0 0 2 12s3.6 6.5 10 6.5c1.4 0 2.7-.3 3.8-.8"/><path d="M9.9 10a2.6 2.6 0 0 0 3.7 3.6"/>'); },
    refresh: function () { return icon('<path d="M21 12a9 9 0 1 1-2.7-6.4"/><path d="M21 4v6h-6"/>'); },
    printer: function () { return icon('<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1"/><path d="M6 17v4h12v-4"/>'); },
    hand: function () { return icon('<path d="M9 11.5V6a1.8 1.8 0 1 1 3.6 0v5"/><path d="M12.6 11V4.5a1.8 1.8 0 1 1 3.6 0V11"/><path d="M16.2 11.3V8a1.8 1.8 0 1 1 3.6 0v6.2A7 7 0 0 1 12.9 21H11a7 7 0 0 1-5.8-3.1L3 13.6a1.7 1.7 0 0 1 2.8-1.9L7.6 14"/>'); },
    spoon: function () { return icon('<ellipse cx="9" cy="7" rx="4.2" ry="5"/><path d="M12.2 10.5 19 17.3a2 2 0 0 1-2.8 2.8L9.4 13.3"/>'); },
    grad: function () { return icon('<path d="M2 9.5 12 5l10 4.5-10 4.5Z"/><path d="M6 11.8v4c0 1.3 2.7 2.7 6 2.7s6-1.4 6-2.7v-4"/><path d="M22 9.5V15"/>'); },
    scale: function () { return icon('<path d="M12 3v18"/><path d="M5 8h14"/><path d="M5 8 2.5 14a2.5 2.5 0 0 0 5 0Z"/><path d="M19 8l-2.5 6a2.5 2.5 0 0 0 5 0Z"/><path d="M8 21h8"/>'); },
    beaker: function () { return icon('<path d="M9 3v6.5L4.5 18a1.8 1.8 0 0 0 1.6 2.6h11.8A1.8 1.8 0 0 0 19.5 18L15 9.5V3"/><path d="M8 3h8"/>'); },
    chevronRight: function () { return icon('<path d="M9 6l6 6-6 6"/>'); },
    chevronLeft: function () { return icon('<path d="M15 6l-6 6 6 6"/>'); },
    warn: function () { return icon('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'); },
    lightbulb: function () { return icon('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>'); }
  };

  DL.OBJECTS = OBJECTS;
  DL.mass = mass;
  DL.STATION1_IDS = STATION1_IDS;
  DL.STATION2_GROUPS = STATION2_GROUPS;
  DL.RAFT_MATERIALS = RAFT_MATERIALS;
  DL.QUESTIONS = QUESTIONS;
  DL.ICONS = ICONS;
  DL.WATER_BASE = 1.00;
  DL.SALT_STEP = 0.02;
  DL.SALT_MAX = 8;
})(window);
