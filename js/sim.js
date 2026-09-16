/* 浮沉实验室 v2.0 — 水槽物理与渲染（sim.js）
 * DL.Physics：纯函数物理核心（不碰 DOM，可被脚本直接调用做单元验证）。
 * DL.Tank   ：SVG 烧杯渲染 + 交互（拖拽 / 点选放入、加盐、结算事件）。
 */
(function (global) {
  "use strict";

  var DL = global.DL || (global.DL = {});
  var SVG_NS = "http://www.w3.org/2000/svg";

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ------------------------------------------------------------------
  // 物理核心（半物理简化模型，专为课堂教具设计，非严谨流体力学）
  //
  // 状态 state = { pos, v }：
  //   pos：物体中心相对「水面」的位移（正值向下），单位与渲染坐标一致。
  //   f = clamp((pos + h/2) / h, 0, 1)：浸入比例。
  //   浮体（liquidDensity > objDensity）：a = g(1 - liquidDensity·f/objDensity) - k·v，
  //     k 依物体自身临界阻尼动态计算，确保 2.5 秒内稳定、不回弹。
  //   沉底物体：确定会沉之后，改用固定的下沉加速度模型，让密度差很小的物体
  //     （如刚好压过临界点前的鸡蛋、神秘方块 Y）也能在合理时间内沉到缸底——
  //     这是教学取舍：浮沉「结果」由密度比较决定，下沉速度不需要精确编码密度差。
  // ------------------------------------------------------------------
  var Physics = {
    GCONST: 1700,
    ZETA: 1.05,
    DESCENT_ACCEL: 2000,
    K_DESCENT: 14,
    VMAX: 260,
    BASE_H: 64,

    submergedFraction: function (pos, hPx) {
      return clamp((pos + hPx / 2) / hPx, 0, 1);
    },

    // 纯函数：推进一帧，返回 { f, a, floats }
    step: function (state, dt, objDensity, liquidDensity, hPx, waterDepthPx) {
      var willFloat = liquidDensity > objDensity;
      var a;
      if (!willFloat) {
        a = this.DESCENT_ACCEL - this.K_DESCENT * state.v;
      } else {
        // 用「未夹紧」的虚拟浸入比例（可以 >1，例如物体本来沉在缸底、加盐后
        // 液体密度才刚超过物体）来算回复力：这是控制论常见手法（PD 控制器），
        // 让回复力随「离平衡点多远」等比放大，物体离平衡点越远，被拉回的力
        // 越大——不管一开始沉得多深，都能在同样的临界阻尼时间常数内平顺就位，
        // 不会像用夹紧后的比例那样，密度差很小时几乎不动。
        var rawF = (state.pos + hPx / 2) / hPx;
        var driving = this.GCONST * (1 - (liquidDensity * rawF) / objDensity);
        var omega0 = Math.sqrt(Math.max(0.0001, (this.GCONST * liquidDensity) / (objDensity * hPx)));
        var k = this.ZETA * 2 * omega0;
        a = driving - k * state.v;
      }
      a = clamp(a, -3 * this.GCONST, 3 * this.GCONST);
      state.v += a * dt;
      state.v = clamp(state.v, -this.VMAX, this.VMAX);
      state.pos += state.v * dt;

      var tankFloorPx = waterDepthPx - hPx / 2;
      if (state.pos < -hPx / 2) {
        state.pos = -hPx / 2;
        if (state.v < 0) state.v = 0;
      }
      if (state.pos > tankFloorPx) {
        state.pos = tankFloorPx;
        state.v = 0;
      }
      var newF = this.submergedFraction(state.pos, hPx);
      return { f: newF, a: a, floats: willFloat, atBottom: state.pos >= tankFloorPx - 0.01 };
    },

    isStable: function (v) { return Math.abs(v) < 0.8; },

    hPxForSize: function (size) { return clamp(this.BASE_H * size, 28, 140); }
  };

  // ------------------------------------------------------------------
  // Tank：SVG 渲染 + 交互
  // ------------------------------------------------------------------
  var BEAKER = {
    vbW: 300, vbH: 440,
    left: 34, right: 266,
    rimY: 60, floorY: 404,
    baseWaterTopY: 150
  };
  // 内槽玻璃描边比 BEAKER.floorY 内缩多少（跟 _glassPath(6) 的 inset 参数一致）。
  var GLASS_FLOOR_INSET = 6;

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
      }
    }
    return el;
  }

  function Tank(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.onSettled = this.opts.onSettled || function () {};
    this.onPlaced = this.opts.onPlaced || function () {};
    this.onChange = this.opts.onChange || function () {};
    this.maxObjects = this.opts.maxObjects || 6;
    this.saltSpoons = 0;
    this.liquidDensity = DL.WATER_BASE;
    this.showData = false;
    this.objects = [];
    this._uidSeq = 1;
    this._raf = null;
    this._lastT = null;
    this.reducedMotion = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this._loop = this._loop.bind(this);
    this._build();
    this._startLoop();
  }

  Tank.prototype._build = function () {
    this.host.classList.add("tank-host");
    this.host.innerHTML = "";

    var svg = svgEl("svg", {
      viewBox: "0 0 " + BEAKER.vbW + " " + BEAKER.vbH,
      preserveAspectRatio: "xMidYMax meet",
      class: "tank-svg",
      role: "img",
      "aria-label": "实验水槽"
    });

    var defs = svgEl("defs");
    var waterGrad = svgEl("linearGradient", { id: "waterGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
    waterGrad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "var(--water-top)" }));
    waterGrad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "var(--water-deep)" }));
    defs.appendChild(waterGrad);

    // 盐水：维持清水同一蓝色家族，只是更深更饱和一点点——不能带一丝绿/灰
    // （曾经用过偏绿灰的配色，看起来像脏水，v2.0 修正）。
    var saltGrad = svgEl("linearGradient", { id: "waterGradSalt", x1: "0", y1: "0", x2: "0", y2: "1" });
    saltGrad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#9BD3EA" }));
    saltGrad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#1D7CA6" }));
    defs.appendChild(saltGrad);

    var glassHi = svgEl("linearGradient", { id: "glassHi", x1: "0", y1: "0", x2: "1", y2: "0" });
    glassHi.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#FFFFFF", "stop-opacity": "0.85" }));
    glassHi.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#FFFFFF", "stop-opacity": "0" }));
    defs.appendChild(glassHi);
    svg.appendChild(defs);

    // 桌面阴影
    var deskShadow = svgEl("ellipse", {
      cx: (BEAKER.left + BEAKER.right) / 2, cy: BEAKER.floorY + 14,
      rx: (BEAKER.right - BEAKER.left) / 2 + 14, ry: 8,
      fill: "rgba(16,24,40,0.10)"
    });
    svg.appendChild(deskShadow);

    // 水体
    this.waterTopY = BEAKER.baseWaterTopY;
    var waterClipId = "waterClip" + Math.floor(Math.random() * 100000);
    var clip = svgEl("clipPath", { id: waterClipId });
    this._clipRect = svgEl("rect", {
      x: BEAKER.left, y: this.waterTopY,
      width: BEAKER.right - BEAKER.left, height: BEAKER.floorY - this.waterTopY,
      rx: 4
    });
    clip.appendChild(this._clipRect);
    defs.appendChild(clip);

    this.waterGroup = svgEl("g", { "clip-path": "url(#" + waterClipId + ")" });
    this.waterRect = svgEl("rect", {
      x: BEAKER.left, y: this.waterTopY,
      width: BEAKER.right - BEAKER.left, height: BEAKER.floorY - this.waterTopY,
      fill: "url(#waterGrad)"
    });
    this.waterGroup.appendChild(this.waterRect);

    this.waterSurfaceLine = svgEl("path", {
      class: "water-surface-line",
      stroke: "rgba(255,255,255,0.65)", "stroke-width": "2", fill: "none"
    });
    this.waterGroup.appendChild(this.waterSurfaceLine);
    svg.appendChild(this.waterGroup);

    // 涟漪层
    this.rippleLayer = svgEl("g", { class: "ripple-layer" });
    svg.appendChild(this.rippleLayer);

    // 物体层
    this.objectLayer = svgEl("g", { class: "object-layer" });
    svg.appendChild(this.objectLayer);

    // 前置水层：半透明叠在物体之上，只在水面以下（同一个 clip）显示——
    // 制造「泡在水里」的深度感，不然物体整个画在水的前面，浮体看起来像
    // 摆在水面上而不是有 60% 沉在水里（v2 规格 §3.5 / B 项）。
    this.waterFrontGroup = svgEl("g", { "clip-path": "url(#" + waterClipId + ")" });
    this.waterFrontRect = svgEl("rect", {
      class: "water-front-rect",
      x: BEAKER.left, y: this.waterTopY,
      width: BEAKER.right - BEAKER.left, height: BEAKER.floorY - this.waterTopY,
      fill: "url(#waterGrad)"
    });
    this.waterFrontGroup.appendChild(this.waterFrontRect);
    this.waterFrontSurfaceLine = svgEl("path", {
      stroke: "rgba(255,255,255,0.85)", "stroke-width": "1.5", fill: "none"
    });
    this.waterFrontGroup.appendChild(this.waterFrontSurfaceLine);
    svg.appendChild(this.waterFrontGroup);

    // 玻璃壁（双线 + 内高光），最后画在水体之上让边缘干净
    var glassOuter = svgEl("path", {
      d: this._glassPath(2),
      fill: "none", stroke: "var(--line-strong)", "stroke-width": "2"
    });
    var glassInner = svgEl("path", {
      d: this._glassPath(6),
      fill: "none", stroke: "var(--line)", "stroke-width": "1"
    });
    var glassGloss = svgEl("rect", {
      x: BEAKER.left + 6, y: BEAKER.rimY + 6, width: 16, height: BEAKER.floorY - BEAKER.rimY - 20,
      fill: "url(#glassHi)", opacity: "0.5"
    });
    svg.appendChild(glassOuter);
    svg.appendChild(glassGloss);
    svg.appendChild(glassInner);

    // 刻度（每格代表 100/500mL，纯装饰但保持一致）——画在水体、物体和玻璃
    // 描边「之后」（最上层），不然会被水色或物体挡住看不见；每个长刻度
    // 数字都加一块半透明底色，就算物体正好经过刻度区也还看得清楚
    // （v2.1 修正 item 4）。
    var ticksG = svgEl("g", { class: "tank-ticks" });
    var totalMl = 1000;
    var pxPerMl = (BEAKER.floorY - BEAKER.rimY) / totalMl;
    for (var ml = 100; ml <= totalMl; ml += 100) {
      var ty = BEAKER.floorY - ml * pxPerMl;
      var isLong = ml % 200 === 0;
      var tick = svgEl("line", {
        x1: BEAKER.right - (isLong ? 14 : 8), y1: ty,
        x2: BEAKER.right, y2: ty,
        stroke: "var(--line-strong)", "stroke-width": "1"
      });
      ticksG.appendChild(tick);
      if (isLong) {
        var label = svgEl("text", {
          x: BEAKER.right + 5, y: ty + 3,
          "text-anchor": "start", class: "tick-label"
        });
        label.textContent = ml;
        ticksG.appendChild(label);
      }
    }
    svg.appendChild(ticksG);

    // 液体密度读数器：紧凑仪表卡片，贴在水槽内右上角（v2 规格 C 项）。
    var gW = 92, gH = 30, gX = BEAKER.right - gW - 6, gY = 10;
    this.gaugeBox = { x: gX, y: gY, w: gW, h: gH };
    var gaugeG = svgEl("g", { class: "liquid-gauge" });
    var gaugeBg = svgEl("rect", {
      x: gX, y: gY, width: gW, height: gH, rx: 6,
      fill: "var(--surface)", stroke: "var(--line)", "stroke-width": "1"
    });
    gaugeG.appendChild(gaugeBg);
    this.gaugeLabel = svgEl("text", { x: gX + 7, y: gY + 10, class: "gauge-label" });
    this.gaugeLabel.textContent = "液体";
    gaugeG.appendChild(this.gaugeLabel);
    this.gaugeValue = svgEl("text", { x: gX + 7, y: gY + 21, class: "gauge-value" });
    this.gaugeValue.textContent = "清水";
    gaugeG.appendChild(this.gaugeValue);
    this.gaugeDensity = svgEl("text", { x: gX + gW - 6, y: gY + 10, "text-anchor": "end", class: "gauge-density" });
    gaugeG.appendChild(this.gaugeDensity);
    // 8 格盐度计
    this.saltSegs = [];
    var segCount = 8, segGap = 1.5, segW = (gW - 14 - segGap * (segCount - 1)) / segCount;
    for (var si = 0; si < segCount; si++) {
      var seg = svgEl("rect", {
        class: "salt-seg",
        x: gX + 7 + si * (segW + segGap), y: gY + gH - 7, width: segW, height: 3, rx: 1
      });
      gaugeG.appendChild(seg);
      this.saltSegs.push(seg);
    }
    svg.appendChild(gaugeG);

    this.svg = svg;
    this.host.appendChild(svg);

    // HTML 覆盖层：空状态提示 + 预测浮层锚点（由 app.js 填内容）
    var overlay = document.createElement("div");
    overlay.className = "tank-overlay-layer";
    this.overlayLayer = overlay;
    this.host.appendChild(overlay);

    this.emptyHint = document.createElement("div");
    this.emptyHint.className = "tank-empty-hint";
    this.emptyHint.innerHTML =
      '<span class="empty-hint-icon">' + DL.ICONS.hand() + "</span>" +
      "<span>把左边的物体拖进水槽，或点选物体后按「放入水槽」</span>";
    overlay.appendChild(this.emptyHint);

    this._updateGauge();
    this._updateWaterMode();
  };

  Tank.prototype._glassPath = function (inset) {
    var l = BEAKER.left + inset, r = BEAKER.right - inset, top = BEAKER.rimY, bot = BEAKER.floorY - inset;
    var radius = 10;
    return (
      "M " + l + " " + top +
      " L " + l + " " + (bot - radius) +
      " Q " + l + " " + bot + " " + (l + radius) + " " + bot +
      " L " + (r - radius) + " " + bot +
      " Q " + r + " " + bot + " " + r + " " + (bot - radius) +
      " L " + r + " " + top
    );
  };

  Tank.prototype._updateGauge = function () {
    var d = this.liquidDensity;
    this.gaugeValue.textContent = this.saltSpoons > 0 ? "盐水 · " + this.saltSpoons + " 勺" : "清水";
    this.gaugeDensity.textContent = this.showData ? d.toFixed(2) : "";
    this.saltSegs.forEach(function (seg, i) {
      seg.classList.toggle("is-filled", i < this.saltSpoons);
    }, this);
  };

  Tank.prototype._updateWaterMode = function () {
    var fill = this.saltSpoons > 0 ? "url(#waterGradSalt)" : "url(#waterGrad)";
    this.waterRect.setAttribute("fill", fill);
    this.waterFrontRect.setAttribute("fill", fill);
  };

  Tank.prototype.setShowData = function (show) {
    this.showData = !!show;
    this._updateGauge();
    this.objects.forEach(this._refreshTagText.bind(this));
  };

  Tank.prototype.setSaltSpoons = function (n) {
    n = clamp(Math.round(n), 0, DL.SALT_MAX);
    this.saltSpoons = n;
    this.liquidDensity = +(DL.WATER_BASE + n * DL.SALT_STEP).toFixed(2);
    this._updateGauge();
    this._updateWaterMode();
    // 让水中物体依新密度重新运动（不瞬移），并恢复到「物理」阶段
    this.objects.forEach(function (o) {
      if (o.phase === "settled") {
        o.phase = "physics";
        o.stableFrames = 0;
      }
    });
    this.onChange();
  };

  Tank.prototype.addSalt = function () { this.setSaltSpoons(this.saltSpoons + 1); };
  Tank.prototype.resetToFreshWater = function () { this.setSaltSpoons(0); };

  Tank.prototype.count = function () { return this.objects.length; };

  Tank.prototype._interiorWidth = function () { return BEAKER.right - BEAKER.left; };

  // ------------------------------------------------------------------
  // 放入物体：先悬空，等待预测；dropX 为可选的水平放置位置（拖拽用）
  // ------------------------------------------------------------------
  Tank.prototype.addObject = function (defId, dropX) {
    if (this.objects.length >= this.maxObjects) return null;
    var def = DL.OBJECTS[defId];
    if (!def) return null;

    // 物体的「视觉尺寸」S = 画面内容的最长边（不是高度）。宽扁的物体（木块、
    // 铁钉、钥匙）高度按内容宽高比缩小，wPx 等于实际画面宽度——这样物体不会
    // 穿出玻璃壁，碰撞间距也是真实的（v2.2）。
    var S = DL.Physics.hPxForSize(def.size) * 0.82;
    var meta0 = DL.IMG_META[def.image || defId];
    var aspect = meta0 ? (meta0.r - meta0.l) / (meta0.b - meta0.t) : 1;
    var hPx = aspect > 1 ? S / aspect : S;
    var wPx = aspect > 1 ? S : S * aspect;
    var x = typeof dropX === "number" ? dropX : (BEAKER.left + this._interiorWidth() * (0.3 + 0.4 * Math.random()));
    x = clamp(x, BEAKER.left + wPx / 2 + 4, BEAKER.right - wPx / 2 - 4);

    var uid = "o" + this._uidSeq++;
    var o = {
      uid: uid, defId: defId, def: def, hPx: hPx, wPx: wPx,
      x: x, pos: -hPx / 2 - 70, v: 0,
      phase: "hover", guess: null, settledAt: null, stableFrames: 0,
      dropStart: null
    };
    this._resolveOverlaps(o);
    o.group = this._buildObjectGroup(o);
    this.objects.push(o);
    this.objectLayer.appendChild(o.group);
    this.emptyHint.style.display = "none";
    this.onPlaced({ uid: uid, defId: defId });
    this.onChange();
    return uid;
  };

  Tank.prototype._resolveOverlaps = function (newObj) {
    var all = this.objects.concat([newObj]);
    for (var iter = 0; iter < 4; iter++) {
      for (var i = 0; i < all.length; i++) {
        for (var j = i + 1; j < all.length; j++) {
          var a = all[i], b = all[j];
          var minDist = (a.wPx + b.wPx) / 2 + 6;
          var dx = b.x - a.x;
          if (Math.abs(dx) < minDist) {
            var push = (minDist - Math.abs(dx)) / 2;
            var sign = dx >= 0 ? 1 : -1;
            if (a !== newObj) a.x -= sign * push; else b.x += sign * push;
            if (b !== newObj) b.x += sign * push; else a.x -= sign * push;
          }
        }
      }
    }
    all.forEach(function (o) {
      o.x = clamp(o.x, BEAKER.left + o.wPx / 2 + 4, BEAKER.right - o.wPx / 2 - 4);
    });
  };

  Tank.prototype.beginPredict = function (uid) {
    var o = this._find(uid);
    if (!o) return;
    o.phase = "predicting";
    if (o.group) o.group.classList.add("is-predicting");
  };

  Tank.prototype.confirmDrop = function (uid, guess) {
    var o = this._find(uid);
    if (!o) return;
    o.guess = guess || null;
    if (o.group) o.group.classList.remove("is-predicting");

    if (this.reducedMotion) {
      o.pos = -o.hPx / 2;
      o.phase = "physics";
      this._settleInstant(o);
      return;
    }

    o.phase = "dropping";
    o.dropStart = performance.now();
    o.dropFromY = this.waterTopY + o.pos;
    o.dropToY = this.waterTopY + (-o.hPx / 2);
  };

  Tank.prototype._settleInstant = function (o) {
    var floats = this.liquidDensity > o.def.density;
    if (floats) {
      var f = clamp(o.def.density / this.liquidDensity, 0, 1);
      o.pos = f * o.hPx - o.hPx / 2;
    } else {
      // 沉底：跟 _loop 里的 tankFloorPx 算法一致，停在内槽底，不是浸到跟
      // 物体高度一样深就停（reducedMotion 才会走这条即时结算路径）。
      var waterDepthPx = BEAKER.floorY - this.waterTopY;
      var restDepthPx = waterDepthPx - GLASS_FLOOR_INSET;
      o.pos = restDepthPx - o.hPx / 2;
    }
    o.v = 0;
    o.phase = "settled";
    o.settledAt = performance.now();
    this._renderObject(o);
    this._fireSettled(o, floats);
  };

  Tank.prototype._fireSettled = function (o, floats) {
    var mass = DL.mass(o.def);
    this.onSettled({
      uid: o.uid, defId: o.defId, floats: floats,
      guess: o.guess,
      correct: o.guess ? ((o.guess === "float") === floats) : null,
      liquidDensity: this.liquidDensity,
      density: o.def.density, mass: mass, name: o.def.name
    });
  };

  Tank.prototype.removeObject = function (uid) {
    var idx = -1;
    for (var i = 0; i < this.objects.length; i++) if (this.objects[i].uid === uid) { idx = i; break; }
    if (idx === -1) return;
    var o = this.objects[idx];
    if (o.group && o.group.parentNode) o.group.parentNode.removeChild(o.group);
    this.objects.splice(idx, 1);
    if (this.objects.length === 0) this.emptyHint.style.display = "flex";
    this.onChange();
  };

  Tank.prototype.clearAll = function () {
    var self = this;
    this.objects.slice().forEach(function (o) { self.removeObject(o.uid); });
  };

  Tank.prototype._find = function (uid) {
    for (var i = 0; i < this.objects.length; i++) if (this.objects[i].uid === uid) return this.objects[i];
    return null;
  };

  Tank.prototype.clientXToLocalX = function (clientX) {
    var pt = this.svg.createSVGPoint();
    pt.x = clientX; pt.y = 0;
    var ctm = this.svg.getScreenCTM();
    if (!ctm) return (BEAKER.left + BEAKER.right) / 2;
    var loc = pt.matrixTransform(ctm.inverse());
    return clamp(loc.x, BEAKER.left, BEAKER.right);
  };

  Tank.prototype.isPointInside = function (clientX, clientY) {
    var rect = this.svg.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  Tank.prototype.getObjectScreenPosition = function (uid) {
    var o = this._find(uid);
    if (!o) return null;
    var pt = this.svg.createSVGPoint();
    pt.x = o.x; pt.y = this.waterTopY + o.pos;
    var ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    var screen = pt.matrixTransform(ctm);
    var hostRect = this.host.getBoundingClientRect();
    return { x: screen.x - hostRect.left, y: screen.y - hostRect.top };
  };

  // ------------------------------------------------------------------
  // 物体图形构建（含图片 fallback）
  // ------------------------------------------------------------------
  Tank.prototype._buildObjectGroup = function (o) {
    var g = svgEl("g", { class: "tank-object" });
    var h = o.hPx, w = o.wPx;

    if (o.def.mystery) {
      var rect = svgEl("rect", {
        x: -w / 2, y: -h / 2, width: w, height: h, rx: 8,
        fill: "#B9C2CC", stroke: "#7D8894", "stroke-width": "1.5"
      });
      g.appendChild(rect);
      var shine = svgEl("rect", { x: -w / 2 + 4, y: -h / 2 + 4, width: w * 0.3, height: h - 8, rx: 4, fill: "rgba(255,255,255,0.35)" });
      g.appendChild(shine);
      var letter = svgEl("text", { x: 0, y: 6, "text-anchor": "middle", class: "mystery-letter" });
      letter.textContent = o.def.mystery;
      g.appendChild(letter);
    } else {
      var fallback = svgEl("g", { class: "obj-fallback" });
      var fb = svgEl("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 10, fill: "#C7CED6" });
      var fbText = svgEl("text", { x: 0, y: 5, "text-anchor": "middle", class: "obj-fallback-text" });
      fbText.textContent = o.def.name.charAt(0);
      fallback.appendChild(fb);
      fallback.appendChild(fbText);
      g.appendChild(fallback);

      var imgId = o.def.image || o.defId;
      var meta = DL.IMG_META[imgId];
      var img, imgHost;
      if (meta) {
        // 素材四周留白不等（见 DL.IMG_META 注释）。用内层 <svg> 当裁切视
        // 窗——viewBox 直接取素材的不透明内容框（像素坐标），外层 x/y/
        // width/height 精确等于「物理箱高 h + 内容本身的宽高比」，不掺
        // wPx（wPx 是给碰撞间距用的占位宽度，两者故意脱钩，见 addObject
        // 注释）。这样「看得见的画面」量出来的外框就是物理箱体本身，不
        // 会再多一圈量不到浸水里、也看不见画面的留白（v2.1 修正 item 1）。
        var cw = meta.r - meta.l, ch = meta.b - meta.t;
        var renderW = h * (cw / ch);
        imgHost = svgEl("svg", {
          class: "obj-image-host",
          x: -renderW / 2, y: -h / 2, width: renderW, height: h,
          viewBox: meta.l + " " + meta.t + " " + cw + " " + ch,
          preserveAspectRatio: "xMidYMid meet"
        });
        img = svgEl("image", { x: 0, y: 0, width: meta.size, height: meta.size });
        imgHost.appendChild(img);
        g.appendChild(imgHost);
      } else {
        img = svgEl("image", { class: "obj-image-host", x: -w / 2, y: -h / 2, width: w, height: h, preserveAspectRatio: "xMidYMid meet" });
        imgHost = img;
        g.appendChild(imgHost);
      }
      img.setAttributeNS("http://www.w3.org/1999/xlink", "href", "assets/objects/" + imgId + ".png");
      img.setAttribute("href", "assets/objects/" + imgId + ".png");
      imgHost.style.opacity = "0";
      img.addEventListener("load", function () {
        fallback.style.display = "none";
        imgHost.style.opacity = "1";
      });
      img.addEventListener("error", function () {
        imgHost.style.display = "none";
      });
    }

    // 标签：小胶囊 + 浮/沉箭头图标 + 名称，贴在物体旁但要能被拉回玻璃内侧
    // （水平方向）并在互相靠近时垂直错开（见 _layoutTags），避免压字或出界。
    // y 坐标不写死——沉底物体的标签要贴在物体「上方」而不是下方（下方会
    // 落到内槽玻璃底线之外），实际位置在 _refreshTagText 里按浮/沉决定。
    var tag = svgEl("g", { class: "obj-tag", style: "display:none" });
    var tagH = 16;
    var tagBg = svgEl("rect", { x: -34, y: h / 2 + 5, width: 68, height: tagH, rx: 8, class: "obj-tag-bg" });
    var tagIcon = svgEl("path", { class: "obj-tag-icon" });
    var tagText = svgEl("text", { x: 0, y: h / 2 + 5 + tagH / 2 + 2.6, "text-anchor": "middle", class: "obj-tag-text" });
    tag.appendChild(tagBg);
    tag.appendChild(tagIcon);
    tag.appendChild(tagText);
    g.appendChild(tag);
    o.tagEl = tag;
    o.tagTextEl = tagText;
    o.tagBgEl = tagBg;
    o.tagIconEl = tagIcon;
    o.tagH = tagH;
    o._tagW = 68;
    o._tagDx = 0;
    o._tagDy = 0;
    o._tagSign = 1;
    o._tagAnchorY = h / 2 + 5;

    return g;
  };

  Tank.prototype._refreshTagText = function (o) {
    if (!o.tagTextEl || o.phase === "hover" || o.phase === "predicting" || o.phase === "dropping") return;
    var floats = this.liquidDensity > o.def.density || o.def.density < this.liquidDensity;
    var label = o.def.name + (floats ? " · 浮" : " · 沉");
    if (this.showData) label += "  " + o.def.density.toFixed(2);
    o.tagTextEl.textContent = label;
    var width = Math.max(54, label.length * 8.4 + 14);
    o._tagW = width;
    o.tagBgEl.setAttribute("width", width);
    o.tagBgEl.setAttribute("x", -width / 2);

    // 浮体标签贴物体下方；沉底物体标签贴物体上方——沉到槽底之后如果还贴
    // 下方，标签会落到内槽玻璃底线之外的桌面阴影区（v2.1 修正 item 2）。
    var gap = 5;
    o._tagSign = floats ? 1 : -1;
    var tagTopY = floats ? (o.hPx / 2 + gap) : (-o.hPx / 2 - gap - o.tagH);
    o._tagAnchorY = tagTopY;
    o.tagBgEl.setAttribute("y", tagTopY);
    var centerY = tagTopY + o.tagH / 2;
    // 箭头图标放在胶囊左侧，文字随之整体右移一点，图标+颜色+文字三重编码浮/沉
    var iconCx = -width / 2 + 10, iconCy = centerY;
    tagIconD(o.tagIconEl, iconCx, iconCy, floats);
    o.tagTextEl.setAttribute("x", 5);
    o.tagTextEl.setAttribute("y", centerY + 2.6);
    o.tagEl.classList.toggle("tag-float", floats);
    o.tagEl.classList.toggle("tag-sink", !floats);
    o.tagEl.style.display = "block";

    // 水平方向夹在玻璃内侧，避免胶囊伸出壁外
    var absLeft = o.x - width / 2, absRight = o.x + width / 2;
    var dx = 0;
    if (absLeft < BEAKER.left + 4) dx = (BEAKER.left + 4) - absLeft;
    else if (absRight > BEAKER.right - 4) dx = (BEAKER.right - 4) - absRight;
    o._tagDx = dx;
  };

  // 跟实验记录表同一款线条箭头（细描边 + 开口 V 字），不用实心三角形
  // （v2.1 修正 item 3：三角形跟其他地方的浮/沉图标语言不一致）。
  function tagIconD(pathEl, cx, cy, floats) {
    var r = 4, cw = 2.3;
    var d = floats
      ? "M " + cx + " " + (cy + r) + " L " + cx + " " + (cy - r) +
        " M " + (cx - cw) + " " + (cy - r + cw) + " L " + cx + " " + (cy - r) + " L " + (cx + cw) + " " + (cy - r + cw)
      : "M " + cx + " " + (cy - r) + " L " + cx + " " + (cy + r) +
        " M " + (cx - cw) + " " + (cy + r - cw) + " L " + cx + " " + (cy + r) + " L " + (cx + cw) + " " + (cy + r - cw);
    pathEl.setAttribute("d", d);
  }

  // ------------------------------------------------------------------
  // 涟漪
  // ------------------------------------------------------------------
  Tank.prototype._spawnRipple = function (x, y) {
    if (this.reducedMotion) return;
    var ripple = svgEl("ellipse", {
      cx: x, cy: y, rx: 2, ry: 1, class: "ripple-el"
    });
    this.rippleLayer.appendChild(ripple);
    setTimeout(function () {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 620);
  };

  // ------------------------------------------------------------------
  // 主循环
  // ------------------------------------------------------------------
  Tank.prototype._startLoop = function () {
    this._raf = requestAnimationFrame(this._loop);
  };

  Tank.prototype.destroy = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  Tank.prototype._loop = function (t) {
    if (this._lastT === null) this._lastT = t;
    var dt = Math.min((t - this._lastT) / 1000, 1 / 30);
    this._lastT = t;

    var waterDepthPx = BEAKER.floorY - this.waterTopY;
    // 物体下沉停靠的「内槽底」比玻璃壁描边的槽底再高一点（跟 _glassPath(6)
    // 的内缩量对齐），不然沉底物体的画面会有一截压在玻璃描边下面/穿出槽底。
    var restDepthPx = waterDepthPx - GLASS_FLOOR_INSET;
    var submergedVolumeRatio = 0;
    var totalVolCap = 4000;

    for (var i = 0; i < this.objects.length; i++) {
      var o = this.objects[i];
      if (o.phase === "dropping") {
        var elapsed = t - o.dropStart;
        var dur = 340;
        var p = clamp(elapsed / dur, 0, 1);
        var ease = 1 - Math.pow(1 - p, 3);
        var y = o.dropFromY + (o.dropToY - o.dropFromY) * ease;
        o.pos = y - this.waterTopY;
        if (p >= 1) {
          o.phase = "physics";
          o.pos = -o.hPx / 2;
          o.v = 0;
          this._spawnRipple(o.x, this.waterTopY);
        }
      } else if (o.phase === "physics") {
        var res = DL.Physics.step(o, dt, o.def.density, this.liquidDensity, o.hPx, restDepthPx);
        if (DL.Physics.isStable(o.v)) {
          o.stableFrames++;
          if (o.stableFrames >= 6) {
            o.phase = "settled";
            o.settledAt = t;
            this._fireSettled(o, res.floats);
          }
        } else {
          o.stableFrames = 0;
        }
        var f = DL.Physics.submergedFraction(o.pos, o.hPx);
        submergedVolumeRatio += Math.min(1, f) * o.def.volume;
      } else if (o.phase === "settled") {
        var f2 = DL.Physics.submergedFraction(o.pos, o.hPx);
        submergedVolumeRatio += Math.min(1, f2) * o.def.volume;
      }
      this._renderObject(o, t);
    }

    // 水位随浸入体积微微上升（视觉比例，非精确换算）
    var targetOffset = this.reducedMotion ? 0 : Math.min(24, (submergedVolumeRatio / totalVolCap) * 260);
    this._applyWaterLevel(BEAKER.baseWaterTopY - targetOffset);

    this._layoutTags();

    this._raf = requestAnimationFrame(this._loop);
  };

  // 标签防重叠：横向已在 _refreshTagText 夹回玻璃内侧（_tagDx），这里补
  // 纵向——按 x 排序后，胶囊范围与前面已排好的重叠就往「自己那一侧」
  // （浮体往下、沉底物体往上）错开一层，再整体夹回内槽玻璃范围内
  // （v2.1 修正 item 2：不能让任何标签的推挤结果跑出玻璃内侧区域）。
  Tank.prototype._layoutTags = function () {
    var self = this;
    var visible = this.objects.filter(function (o) {
      return o.tagEl && (o.phase === "physics" || o.phase === "settled");
    });
    visible.forEach(function (o) { o._tagDy = 0; });
    visible.sort(function (a, b) { return a.x - b.x; });
    var step = 15;
    for (var i = 1; i < visible.length; i++) {
      var b = visible[i];
      var bLeft = b.x + b._tagDx - b._tagW / 2, bRight = bLeft + b._tagW;
      var by = this.waterTopY + b.pos + b._tagAnchorY + b._tagDy;
      for (var j = 0; j < i; j++) {
        var a = visible[j];
        var aLeft = a.x + a._tagDx - a._tagW / 2, aRight = aLeft + a._tagW;
        var ay = this.waterTopY + a.pos + a._tagAnchorY + a._tagDy;
        if (bRight > aLeft && bLeft < aRight && Math.abs(ay - by) < step) {
          b._tagDy = a._tagDy + step * b._tagSign;
          by = this.waterTopY + b.pos + b._tagAnchorY + b._tagDy;
        }
      }
    }
    var minY = BEAKER.rimY + 4, maxY = BEAKER.floorY - GLASS_FLOOR_INSET - 4;
    visible.forEach(function (o) {
      var topY = self.waterTopY + o.pos + o._tagAnchorY + o._tagDy;
      var bottomY = topY + o.tagH;
      if (topY < minY) o._tagDy += (minY - topY);
      else if (bottomY > maxY) o._tagDy -= (bottomY - maxY);
      o.tagEl.setAttribute("transform", "translate(" + o._tagDx.toFixed(1) + "," + o._tagDy.toFixed(1) + ")");
    });
  };

  Tank.prototype._applyWaterLevel = function (newTopY) {
    if (Math.abs(newTopY - this.waterTopY) < 0.05) return;
    this.waterTopY = newTopY;
    this.waterRect.setAttribute("y", this.waterTopY);
    this.waterRect.setAttribute("height", BEAKER.floorY - this.waterTopY);
    this.waterFrontRect.setAttribute("y", this.waterTopY);
    this.waterFrontRect.setAttribute("height", BEAKER.floorY - this.waterTopY);
    this._clipRect.setAttribute("y", this.waterTopY);
    this._clipRect.setAttribute("height", BEAKER.floorY - this.waterTopY);
    var midX = (BEAKER.left + BEAKER.right) / 2;
    var surfaceD = "M " + BEAKER.left + " " + this.waterTopY +
      " Q " + midX + " " + (this.waterTopY - 2) + " " + BEAKER.right + " " + this.waterTopY;
    this.waterSurfaceLine.setAttribute("d", surfaceD);
    this.waterFrontSurfaceLine.setAttribute("d", surfaceD);
  };

  Tank.prototype._renderObject = function (o, t) {
    var y = this.waterTopY + o.pos;
    if (o.phase === "settled" && !this.reducedMotion && this.liquidDensity > o.def.density) {
      var elapsed = (t - o.settledAt) / 1000;
      y += Math.sin((elapsed / 2.8) * Math.PI * 2) * 2;
    }
    o.group.setAttribute("transform", "translate(" + o.x.toFixed(2) + "," + y.toFixed(2) + ")");
    if (o.phase === "physics" || o.phase === "settled") this._refreshTagText(o);
  };

  DL.Physics = Physics;
  DL.Tank = Tank;
  DL.BEAKER = BEAKER;
})(window);
