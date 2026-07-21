(function () {
  "use strict";

  // ---------------------------------------------------------------
  // 材料数据：密度单位 g/cm³（水 = 1.00），数值取自真实材料的常见参考值
  // ---------------------------------------------------------------
  const MATERIALS = [
    { id: "wood", name: "木块", density: 0.60, base: "#c8935a", edge: "#8a5f34", texture: "wood" },
    { id: "apple", name: "苹果", density: 0.84, base: "#d0453f", edge: "#8f2a26", texture: "apple" },
    { id: "ice", name: "冰块", density: 0.92, base: "#cdeaf5", edge: "#8fc7df", texture: "ice" },
    { id: "candle", name: "蜡烛", density: 0.90, base: "#f3e1ad", edge: "#c9ab63", texture: "candle" },
    { id: "styrofoam", name: "泡沫块", density: 0.15, base: "#f5f5f2", edge: "#d7d7d0", texture: "foam" },
    { id: "plastic", name: "塑料积木", density: 0.95, base: "#4f8fd6", edge: "#2f5f96", texture: "plastic" },
    { id: "egg", name: "鸡蛋", density: 1.03, base: "#f2e9d8", edge: "#cbb98f", texture: "egg" },
    { id: "eraser", name: "橡皮擦", density: 1.40, base: "#e293a8", edge: "#a95a71", texture: "eraser" },
    { id: "stone", name: "石头", density: 2.60, base: "#8d8f92", edge: "#5c5e60", texture: "stone" },
    { id: "nail", name: "铁钉", density: 7.80, base: "#9aa3ab", edge: "#5b636b", texture: "metal" }
  ];

  const WATER_BASE = 1.00;
  const SALT_STEP = 0.03;
  const SALT_MAX_SPOONS = 6;

  // ---------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------
  let selectedMaterial = null;
  let chosenGuess = null;
  let saltSpoons = 0;
  let mode = "explore";

  // ---------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------
  const shelfGrid = document.getElementById("shelfGrid");
  const predictBox = document.getElementById("predictBox");
  const predictName = document.getElementById("predictName");
  const dropBtn = document.getElementById("dropBtn");
  const tankStage = document.querySelector(".tank-stage");
  const tank = document.querySelector(".tank");
  const waterEl = document.getElementById("water");
  const emptyHint = document.getElementById("emptyHint");
  const resultBanner = document.getElementById("resultBanner");
  const resultIcon = document.getElementById("resultIcon");
  const resultTitle = document.getElementById("resultTitle");
  const resultDesc = document.getElementById("resultDesc");
  const compareLiquidFill = document.getElementById("compareLiquidFill");
  const compareObjectMarker = document.getElementById("compareObjectMarker");
  const liquidDensityLabel = document.getElementById("liquidDensityLabel");
  const objectDensityChip = document.getElementById("objectDensityChip");
  const objectDensityLabel = document.getElementById("objectDensityLabel");
  const saltMeterFill = document.getElementById("saltMeterFill");
  const addSaltBtn = document.getElementById("addSaltBtn");
  const resetSaltBtn = document.getElementById("resetSaltBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");
  const challengeBox = document.getElementById("challengeBox");
  const challengeProgress = document.getElementById("challengeProgress");

  let currentSpecimenEl = null;
  let currentSpecimenMaterial = null;

  // ---------------------------------------------------------------
  // 图标：用内联 SVG + 渐变制造材质感，不用 emoji
  // ---------------------------------------------------------------
  function iconSVG(material) {
    const id = material.id;
    switch (material.texture) {
      case "wood":
        return `<svg viewBox="0 0 48 48"><defs>
          <linearGradient id="g_${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#dba875"/><stop offset="100%" stop-color="#a06c3d"/>
          </linearGradient></defs>
          <rect x="6" y="12" width="36" height="24" rx="3" fill="url(#g_${id})"/>
          <path d="M6 18 H42 M6 24 H42 M6 30 H42" stroke="#8a5f34" stroke-width="1.2" opacity="0.5"/>
        </svg>`;
      case "apple":
        return `<svg viewBox="0 0 48 48"><defs>
          <radialGradient id="g_${id}" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#f08b7f"/><stop offset="70%" stop-color="#cf3f39"/><stop offset="100%" stop-color="#8f2a26"/>
          </radialGradient></defs>
          <path d="M24 14c6-6 16-2 15 7c-1 12-9 20-15 20s-14-8-15-20c-1-9 9-13 15-7z" fill="url(#g_${id})"/>
          <path d="M24 14c0-4 2-6 5-7" stroke="#5b7a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
        </svg>`;
      case "ice":
        return `<svg viewBox="0 0 48 48"><defs>
          <linearGradient id="g_${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#eaf8fd" stop-opacity="0.95"/><stop offset="100%" stop-color="#a9dcee" stop-opacity="0.85"/>
          </linearGradient></defs>
          <polygon points="24,6 42,18 42,34 24,44 6,34 6,18" fill="url(#g_${id})" stroke="#8fc7df" stroke-width="1.5"/>
          <path d="M24 6V44 M6 18 L42 34 M42 18 L6 34" stroke="#ffffff" stroke-width="1" opacity="0.55"/>
        </svg>`;
      case "candle":
        return `<svg viewBox="0 0 48 48"><defs>
          <linearGradient id="g_${id}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#fff3d4"/><stop offset="50%" stop-color="#f3e1ad"/><stop offset="100%" stop-color="#d9bd77"/>
          </linearGradient></defs>
          <rect x="15" y="10" width="18" height="30" rx="4" fill="url(#g_${id})"/>
          <rect x="22" y="4" width="4" height="8" fill="#8a6a2e"/>
        </svg>`;
      case "foam":
        return `<svg viewBox="0 0 48 48"><defs>
          <linearGradient id="g_${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e2e2dc"/>
          </linearGradient></defs>
          <rect x="7" y="13" width="34" height="22" rx="4" fill="url(#g_${id})" stroke="#d7d7d0" stroke-width="1"/>
          <circle cx="14" cy="20" r="1.6" fill="#d7d7d0"/><circle cx="24" cy="27" r="1.6" fill="#d7d7d0"/>
          <circle cx="33" cy="19" r="1.6" fill="#d7d7d0"/><circle cx="18" cy="31" r="1.6" fill="#d7d7d0"/>
        </svg>`;
      case "plastic":
        return `<svg viewBox="0 0 48 48"><defs>
          <linearGradient id="g_${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8fc0ec"/><stop offset="55%" stop-color="#4f8fd6"/><stop offset="100%" stop-color="#2f5f96"/>
          </linearGradient></defs>
          <rect x="8" y="10" width="32" height="28" rx="6" fill="url(#g_${id})"/>
          <rect x="13" y="15" width="10" height="7" rx="2" fill="#ffffff" opacity="0.35"/>
        </svg>`;
      case "egg":
        return `<svg viewBox="0 0 48 48"><defs>
          <radialGradient id="g_${id}" cx="38%" cy="28%" r="75%">
            <stop offset="0%" stop-color="#fffaf0"/><stop offset="70%" stop-color="#f2e9d8"/><stop offset="100%" stop-color="#cbb98f"/>
          </radialGradient></defs>
          <ellipse cx="24" cy="25" rx="13" ry="17" fill="url(#g_${id})"/>
        </svg>`;
      case "eraser":
        return `<svg viewBox="0 0 48 48"><defs>
          <linearGradient id="g_${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f2b3c4"/><stop offset="100%" stop-color="#c1587a"/>
          </linearGradient></defs>
          <rect x="9" y="15" width="30" height="18" rx="4" fill="url(#g_${id})"/>
          <rect x="9" y="15" width="30" height="6" rx="3" fill="#ffffff" opacity="0.4"/>
        </svg>`;
      case "stone":
        return `<svg viewBox="0 0 48 48"><defs>
          <radialGradient id="g_${id}" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#b3b5b8"/><stop offset="70%" stop-color="#8d8f92"/><stop offset="100%" stop-color="#5c5e60"/>
          </radialGradient></defs>
          <path d="M10 30c-2-8 4-16 14-17c9-1 17 5 16 14c-1 9-10 13-17 12c-7-1-11-3-13-9z" fill="url(#g_${id})"/>
          <circle cx="19" cy="22" r="1.4" fill="#6b6d70"/><circle cx="28" cy="27" r="1.2" fill="#6b6d70"/>
        </svg>`;
      case "metal":
        return `<svg viewBox="0 0 48 48"><defs>
          <linearGradient id="g_${id}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#e8ebee"/><stop offset="45%" stop-color="#9aa3ab"/><stop offset="100%" stop-color="#5b636b"/>
          </linearGradient></defs>
          <rect x="21" y="6" width="6" height="28" rx="2" fill="url(#g_${id})"/>
          <path d="M17 6 H31 L24 2 Z" fill="#7c848c"/>
          <path d="M21 34 L24 44 L27 34 Z" fill="url(#g_${id})"/>
        </svg>`;
      default:
        return `<svg viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="6" fill="${material.base}"/></svg>`;
    }
  }

  // ---------------------------------------------------------------
  // 建立物体架
  // ---------------------------------------------------------------
  function buildShelf() {
    shelfGrid.innerHTML = "";
    MATERIALS.forEach((m) => {
      const item = document.createElement("div");
      item.className = "shelf-item";
      item.dataset.id = m.id;
      item.innerHTML = `<div class="shelf-icon">${iconSVG(m)}</div><div class="shelf-name">${m.name}</div>`;
      item.addEventListener("click", () => selectMaterial(m, item));
      shelfGrid.appendChild(item);
    });
  }

  function selectMaterial(material, itemEl) {
    selectedMaterial = material;
    chosenGuess = null;
    document.querySelectorAll(".shelf-item").forEach((el) => el.classList.remove("selected"));
    itemEl.classList.add("selected");

    predictName.textContent = material.name;
    predictBox.classList.add("show");
    document.querySelectorAll(".choice-btn").forEach((b) => b.classList.remove("chosen"));
    dropBtn.disabled = true;
    dropBtn.textContent = "丢进水里看看！";

    resultBanner.classList.remove("show");
    objectDensityChip.style.display = "none";
  }

  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      chosenGuess = btn.dataset.guess;
      document.querySelectorAll(".choice-btn").forEach((b) => b.classList.remove("chosen"));
      btn.classList.add("chosen");
      dropBtn.disabled = false;
    });
  });

  // ---------------------------------------------------------------
  // 液体密度
  // ---------------------------------------------------------------
  function currentLiquidDensity() {
    return +(WATER_BASE + saltSpoons * SALT_STEP).toFixed(2);
  }

  function refreshLiquidLabel() {
    const d = currentLiquidDensity();
    liquidDensityLabel.textContent = d.toFixed(2);
    const pct = Math.min(100, (saltSpoons / SALT_MAX_SPOONS) * 100);
    saltMeterFill.style.width = pct + "%";
    waterEl.classList.toggle("salty", saltSpoons > 0);
  }

  addSaltBtn.addEventListener("click", () => {
    if (saltSpoons >= SALT_MAX_SPOONS) return;
    saltSpoons++;
    refreshLiquidLabel();
    if (mode === "challenge") {
      challengeProgress.textContent = `已加盐：${saltSpoons} 勺（当前液体密度 ${currentLiquidDensity().toFixed(2)} g/cm³）`;
    }
    if (currentSpecimenEl && currentSpecimenMaterial) {
      settleSpecimen(currentSpecimenMaterial, currentSpecimenEl, true);
    }
  });

  resetSaltBtn.addEventListener("click", () => {
    saltSpoons = 0;
    refreshLiquidLabel();
    if (mode === "challenge") challengeProgress.textContent = "已加盐：0 勺";
    if (currentSpecimenEl && currentSpecimenMaterial) {
      settleSpecimen(currentSpecimenMaterial, currentSpecimenEl, true);
    }
  });

  // ---------------------------------------------------------------
  // 丢入水中
  // ---------------------------------------------------------------
  dropBtn.addEventListener("click", () => {
    if (!selectedMaterial || !chosenGuess) return;
    emptyHint.style.display = "none";
    spawnSpecimen(selectedMaterial);
  });

  function clearCurrentSpecimen() {
    if (currentSpecimenEl && currentSpecimenEl.parentNode) {
      currentSpecimenEl.parentNode.removeChild(currentSpecimenEl);
    }
    currentSpecimenEl = null;
    currentSpecimenMaterial = null;
  }

  function spawnSpecimen(material) {
    clearCurrentSpecimen();
    const el = document.createElement("div");
    el.className = "specimen";
    el.innerHTML = iconSVG(material);
    el.style.top = "-70px";
    tank.appendChild(el);
    currentSpecimenEl = el;
    currentSpecimenMaterial = material;

    // 落体动画：先让它掉到水面
    requestAnimationFrame(() => {
      el.style.top = "40%";
    });

    setTimeout(() => {
      splashEffect();
      settleSpecimen(material, el, false);
    }, 620);
  }

  function splashEffect() {
    const rect = tank.getBoundingClientRect();
    const waterRect = waterEl.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = waterRect.top - rect.top;

    const ripple = document.createElement("div");
    ripple.className = "ripple";
    ripple.style.left = cx + "px";
    ripple.style.top = cy + "px";
    tank.appendChild(ripple);
    setTimeout(() => ripple.remove(), 950);

    for (let i = 0; i < 7; i++) {
      const d = document.createElement("div");
      d.className = "droplet";
      d.style.left = cx + "px";
      d.style.top = cy + "px";
      const angle = (Math.PI / 3) + Math.random() * (Math.PI / 3);
      const dist = 20 + Math.random() * 24;
      const dx = Math.cos(Math.PI - angle) * dist * (Math.random() > 0.5 ? 1 : -1);
      const dy = -Math.sin(angle) * dist;
      d.style.setProperty("--dx", dx + "px");
      d.style.setProperty("--dy", dy + "px");
      tank.appendChild(d);
      setTimeout(() => d.remove(), 600);
    }
  }

  function settleSpecimen(material, el, isReposition) {
    const liquidD = currentLiquidDensity();
    const floats = material.density < liquidD;

    // 计算沉浸比例 (物体密度 / 液体密度)，浮起时露出水面的比例 = 1 - submerged
    const submergedFraction = floats ? Math.min(1, material.density / liquidD) : 1;

    const tankH = tank.clientHeight;
    const waterH = waterEl.clientHeight;
    const waterTopY = tankH - waterH; // 水面在 tank 内的 y 坐标（从顶部算）
    const objSize = 58;

    let centerY;
    if (floats) {
      // 物体中心位置：露出水面部分在上，浸入部分在下
      const submergedPx = objSize * submergedFraction;
      centerY = waterTopY + submergedPx - objSize / 2 + 4;
    } else {
      centerY = tankH - objSize / 2 - 6; // 沉到缸底
    }

    el.style.top = (centerY - objSize / 2) + "px";
    el.classList.remove("settled-float", "settled-sink");
    void el.offsetWidth;
    el.classList.add(floats ? "settled-float" : "settled-sink");

    if (!isReposition) {
      showResult(material, floats, liquidD, chosenGuess);
    } else {
      showResult(material, floats, liquidD, null);
    }
  }

  function showResult(material, floats, liquidD, guess) {
    resultBanner.classList.remove("float", "sink");
    resultBanner.classList.add(floats ? "float" : "sink");
    resultBanner.classList.add("show");

    resultIcon.textContent = floats ? "▲" : "▼";
    resultTitle.textContent = `${material.name}${floats ? "浮起来了！" : "沉下去了！"}`;

    let guessNote = "";
    if (guess) {
      const correct = (guess === "float" && floats) || (guess === "sink" && !floats);
      guessNote = correct ? "你猜对了！" : "猜错了，但没关系，我们看看原因：";
    }
    resultDesc.textContent =
      `${guessNote}${material.name}的密度是 ${material.density.toFixed(2)} g/cm³，` +
      `水的密度是 ${liquidD.toFixed(2)} g/cm³。` +
      (floats ? "物体密度比液体小，所以浮起来。" : "物体密度比液体大，所以沉下去。");

    objectDensityChip.style.display = "flex";
    objectDensityLabel.textContent = material.density.toFixed(2);

    // 比较条：范围 0 ~ 3.0 g/cm³（涵盖大部分教具密度）
    const maxScale = Math.max(3.0, material.density + 0.3);
    const liquidPct = Math.min(100, (liquidD / maxScale) * 100);
    const objectPct = Math.min(100, (material.density / maxScale) * 100);
    compareLiquidFill.style.width = liquidPct + "%";
    compareObjectMarker.style.left = objectPct + "%";

    // 挑战模式：鸡蛋 + 已加盐 + 浮起来 → 特别祝贺
    if (mode === "challenge" && material.id === "egg" && floats && saltSpoons > 0) {
      challengeProgress.textContent =
        `成功！加了 ${saltSpoons} 勺盐之后，液体密度提升到 ${liquidD.toFixed(2)} g/cm³，超过了鸡蛋的密度，鸡蛋浮起来了！`;
    }
  }

  // ---------------------------------------------------------------
  // 模式切换
  // ---------------------------------------------------------------
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      challengeBox.classList.toggle("show", mode === "challenge");
      if (mode === "challenge") {
        challengeProgress.textContent = `已加盐：${saltSpoons} 勺`;
      }
    });
  });

  // ---------------------------------------------------------------
  // 重设整个实验
  // ---------------------------------------------------------------
  resetAllBtn.addEventListener("click", () => {
    saltSpoons = 0;
    refreshLiquidLabel();
    clearCurrentSpecimen();
    selectedMaterial = null;
    chosenGuess = null;
    document.querySelectorAll(".shelf-item").forEach((el) => el.classList.remove("selected"));
    predictBox.classList.remove("show");
    resultBanner.classList.remove("show");
    objectDensityChip.style.display = "none";
    emptyHint.style.display = "flex";
    if (mode === "challenge") challengeProgress.textContent = "已加盐：0 勺";
  });

  // ---------------------------------------------------------------
  // 初始化
  // ---------------------------------------------------------------
  buildShelf();
  refreshLiquidLabel();
})();
