/* 浮沉实验室 v2.0 — 流程、模式、记录、报告（app.js） */
(function () {
  "use strict";

  var DL = window.DL;
  var ICONS = DL.ICONS;
  var STORE_KEY = "densityLabV2State";

  // ------------------------------------------------------------------
  // 状态
  // ------------------------------------------------------------------
  function defaultState() {
    return {
      mode: "self",
      showData: false,
      station: 1,
      s1: { tested: {}, view: "list" },
      s2: { groups: {} },
      s3: { rows: [], firstFloatSpoon: null },
      s4: {
        sub: "mystery",
        mystery: { order: [null, null, null], results: {} },
        raft: { picked: [], result: null },
        vestChoice: null,
        seaChoice: null
      },
      conclusions: {},
      stationDone: { 1: false, 2: false, 3: false, 4: false }
    };
  }

  var state = defaultState();

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      var base = defaultState();
      for (var k in base) {
        if (saved[k] !== undefined) base[k] = saved[k];
      }
      state = base;
    } catch (e) { /* 读不到也能正常用，保持默认状态 */ }
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }

  // ------------------------------------------------------------------
  // DOM 小工具
  // ------------------------------------------------------------------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ------------------------------------------------------------------
  // 顶栏
  // ------------------------------------------------------------------
  var STEP_LABELS = ["预测与分类", "重量还是密度？", "改变液体", "生活难题", "学习报告"];

  function renderTopbar() {
    var stepsWrap = q("#topSteps");
    stepsWrap.innerHTML = "";
    STEP_LABELS.forEach(function (label, i) {
      var num = i + 1;
      var btn = el("button", "step-btn", "");
      btn.type = "button";
      btn.setAttribute("aria-label", "第" + num + "站 " + label);
      if (num === state.station) btn.classList.add("is-active");
      var done = num <= 4 ? state.stationDone[num] : isReportReady();
      if (done) btn.classList.add("is-done");
      var badge = el("span", "step-num", done ? ICONS.check() : String(num));
      var text = el("span", "step-text", label);
      btn.appendChild(badge);
      btn.appendChild(text);
      btn.addEventListener("click", function () { goToStation(num); });
      stepsWrap.appendChild(btn);
    });

    var dataToggle = q("#dataToggle");
    dataToggle.classList.toggle("is-on", state.showData);
    dataToggle.setAttribute("aria-pressed", state.showData ? "true" : "false");

    qa(".seg-btn", q("#modeSeg")).forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.mode === state.mode);
      b.setAttribute("aria-pressed", b.dataset.mode === state.mode ? "true" : "false");
    });

    document.documentElement.classList.toggle("teacher-mode", state.mode === "teacher");
  }

  function isReportReady() {
    return state.stationDone[1] || state.stationDone[2] || state.stationDone[3] || state.stationDone[4];
  }

  function goToStation(num) {
    state.station = num;
    saveState();
    renderTopbar();
    renderStation();
  }

  function markStationDone(num) {
    if (!state.stationDone[num]) {
      state.stationDone[num] = true;
      saveState();
      renderTopbar();
    }
  }

  // ------------------------------------------------------------------
  // 通用：结论题卡片
  // ------------------------------------------------------------------
  function renderQuestion(container, storeKey, qDef) {
    var card = el("div", "panel-block question-card");
    card.appendChild(el("div", "block-title", "本站结论题"));
    card.appendChild(el("div", "q-prompt", qDef.prompt));
    var optsWrap = el("div", "q-options");
    var feedback = el("div", "q-feedback");

    var teacherMode = state.mode === "teacher";
    var revealed = !teacherMode;
    var revealBtn = null;

    function paint(chosenKey) {
      qa(".q-option", optsWrap).forEach(function (b) {
        b.classList.remove("is-chosen", "is-correct", "is-wrong");
        var k = b.dataset.key;
        if (revealed && k === qDef.correct) b.classList.add("is-correct");
        if (chosenKey && k === chosenKey && k !== qDef.correct) b.classList.add("is-wrong");
        if (chosenKey && k === chosenKey) b.classList.add("is-chosen");
      });
    }

    qDef.options.forEach(function (opt) {
      var btn = el("button", "q-option");
      btn.type = "button";
      btn.dataset.key = opt.key;
      btn.innerHTML = '<span class="q-key">' + opt.key + "</span><span>" + opt.text + "</span>";
      btn.addEventListener("click", function () {
        if (teacherMode) return;
        var isCorrect = opt.key === qDef.correct;
        if (state.conclusions[storeKey] == null) {
          state.conclusions[storeKey] = { chosen: opt.key, correct: isCorrect };
          saveState();
        }
        paint(opt.key);
        feedback.className = "q-feedback show " + (isCorrect ? "is-correct" : "is-wrong");
        feedback.innerHTML = (isCorrect ? ICONS.check() : ICONS.cross()) + "<span>" + qDef.explain[opt.key] + "</span>";
      });
      optsWrap.appendChild(btn);
    });

    card.appendChild(optsWrap);

    if (teacherMode) {
      revealBtn = el("button", "btn btn-ghost reveal-btn", "显示答案");
      revealBtn.type = "button";
      revealBtn.addEventListener("click", function () {
        revealed = true;
        paint(null);
        feedback.className = "q-feedback show is-correct";
        feedback.innerHTML = ICONS.check() + "<span>正确答案：" + qDef.correct + "。" + qDef.explain[qDef.correct] + "</span>";
      });
      card.appendChild(revealBtn);
    }

    card.appendChild(feedback);
    container.appendChild(card);
  }

  // ------------------------------------------------------------------
  // 通用：物体架（拖拽 + 点选放入）
  // ------------------------------------------------------------------
  function buildShelf(container, ids, opts) {
    opts = opts || {};
    var grid = el("div", "shelf-grid");
    var selectedId = null;
    var placeBtn = opts.placeBtn;

    function updatePlaceBtn() {
      if (!placeBtn) return;
      placeBtn.disabled = !selectedId;
      placeBtn.textContent = selectedId ? "放入水槽：" + DL.OBJECTS[selectedId].name : "放入水槽";
    }

    ids.forEach(function (id) {
      var def = DL.OBJECTS[id];
      var item = el("div", "shelf-item");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.dataset.id = id;
      var thumb = el("div", "shelf-thumb");
      var img = document.createElement("img");
      img.alt = def.name;
      img.src = "assets/objects/" + (def.image || id) + ".png";
      img.addEventListener("error", function () {
        thumb.classList.add("thumb-fallback");
        thumb.textContent = def.name.charAt(0);
      });
      thumb.appendChild(img);
      var badge = el("span", "thumb-tested-badge", ICONS.check());
      thumb.appendChild(badge);
      item.appendChild(thumb);
      item.appendChild(el("div", "shelf-name", def.name));
      if (opts.isUsed && opts.isUsed(id)) item.classList.add("is-used");

      function select() {
        selectedId = id;
        qa(".shelf-item", grid).forEach(function (n) { n.classList.remove("is-selected"); });
        item.classList.add("is-selected");
        updatePlaceBtn();
        if (opts.onSelect) opts.onSelect(id);
      }
      item.addEventListener("click", select);
      item.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
      });

      // 拖拽增强（Pointer Events），点选+按钮永远是可用的替代路径
      item.addEventListener("pointerdown", function (downEvt) {
        if (downEvt.button !== undefined && downEvt.button !== 0) return;
        var startX = downEvt.clientX, startY = downEvt.clientY;
        var dragging = false, ghost = null;

        function onMove(moveEvt) {
          var dx = moveEvt.clientX - startX, dy = moveEvt.clientY - startY;
          if (!dragging && Math.sqrt(dx * dx + dy * dy) > 8) {
            dragging = true;
            ghost = el("div", "drag-ghost", def.name);
            document.body.appendChild(ghost);
          }
          if (dragging && ghost) {
            ghost.style.left = moveEvt.clientX + "px";
            ghost.style.top = moveEvt.clientY + "px";
          }
        }
        function onUp(upEvt) {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
          if (dragging && opts.onDrop) {
            opts.onDrop(id, upEvt.clientX, upEvt.clientY);
          }
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });

      grid.appendChild(item);
    });

    container.appendChild(grid);
    if (placeBtn) {
      placeBtn.addEventListener("click", function () {
        if (selectedId && opts.onPlaceClick) opts.onPlaceClick(selectedId);
      });
      updatePlaceBtn();
    }
    return {
      refreshUsed: function () {
        qa(".shelf-item", grid).forEach(function (n) {
          n.classList.toggle("is-used", !!(opts.isUsed && opts.isUsed(n.dataset.id)));
        });
      }
    };
  }

  // ------------------------------------------------------------------
  // 通用：预测浮层（跟随物体位置）
  // ------------------------------------------------------------------
  var activeOverlays = {};

  function showPredictOverlay(tank, uid, onChoose) {
    var host = tank.overlayLayer;
    var box = el("div", "predict-box");
    if (state.mode === "teacher") {
      box.innerHTML =
        '<div class="predict-q">请全班先预测：会浮还是会沉？</div>' +
        '<button type="button" class="btn btn-primary predict-reveal">揭晓结果</button>';
      host.appendChild(box);
      q(".predict-reveal", box).addEventListener("click", function () {
        cleanup();
        onChoose(null);
      });
    } else {
      box.innerHTML =
        '<div class="predict-q">你猜会怎样？</div>' +
        '<div class="predict-choices">' +
        '<button type="button" class="choice-btn choice-float">' + ICONS.float() + "<span>会浮</span></button>" +
        '<button type="button" class="choice-btn choice-sink">' + ICONS.sink() + "<span>会沉</span></button>" +
        "</div>";
      host.appendChild(box);
      q(".choice-float", box).addEventListener("click", function () { cleanup(); onChoose("float"); });
      q(".choice-sink", box).addEventListener("click", function () { cleanup(); onChoose("sink"); });
    }

    function reposition() {
      var pos = tank.getObjectScreenPosition(uid);
      if (!pos) return;
      box.style.left = pos.x + "px";
      box.style.top = Math.max(8, pos.y - 84) + "px";
    }
    reposition();
    var raf = null;
    function loop() { reposition(); raf = requestAnimationFrame(loop); }
    loop();

    function cleanup() {
      if (raf) cancelAnimationFrame(raf);
      if (box.parentNode) box.parentNode.removeChild(box);
      delete activeOverlays[uid];
    }
    activeOverlays[uid] = cleanup;
  }

  function clearOverlays() {
    for (var k in activeOverlays) activeOverlays[k]();
  }

  // ------------------------------------------------------------------
  // 水槽工具列
  // ------------------------------------------------------------------
  function renderToolbar(tank, config) {
    var bar = q("#tankToolbar");
    bar.innerHTML = "";
    if (config.clear) {
      var clearBtn = el("button", "btn btn-ghost tool-btn", ICONS.refresh() + "<span>清空水槽</span>");
      clearBtn.type = "button";
      clearBtn.addEventListener("click", function () { clearOverlays(); tank.clearAll(); });
      bar.appendChild(clearBtn);
    }
    if (config.salt) {
      var saltBtn = el("button", "btn btn-primary tool-btn", ICONS.spoon() + "<span>加一勺盐</span>");
      saltBtn.type = "button";
      saltBtn.addEventListener("click", config.onAddSalt || function () { tank.addSalt(); });
      bar.appendChild(saltBtn);
      var resetSaltBtn = el("button", "btn btn-ghost tool-btn", ICONS.droplet() + "<span>恢复清水</span>");
      resetSaltBtn.type = "button";
      resetSaltBtn.addEventListener("click", config.onResetSalt || function () { tank.resetToFreshWater(); });
      bar.appendChild(resetSaltBtn);
    }
  }

  // ------------------------------------------------------------------
  // 站点容器 & Tank 生命周期
  // ------------------------------------------------------------------
  var currentTank = null;

  function freshTank(host, opts) {
    if (currentTank) currentTank.destroy();
    clearOverlays();
    currentTank = new DL.Tank(host, opts);
    currentTank.setShowData(state.showData);
    return currentTank;
  }

  function renderStation() {
    var taskPanel = q("#taskPanel");
    var recordPanel = q("#recordPanel");
    var stage = q("#tankStage");
    taskPanel.innerHTML = "";
    recordPanel.innerHTML = "";
    q("#tankToolbar").innerHTML = "";
    // 用 flex（不是 block）才会套用 .tank-stage 的 justify-content:center——
    // 内联样式盖过外部样式表，之前写成 block 等于让水槽居中失效，槽体贴着
    // 面板左边、右边留一大块空白（v2.1 修正 item 5）。
    stage.style.display = "flex";
    taskPanel.style.display = "";
    q(".layout").classList.remove("report-mode");

    switch (state.station) {
      case 1: renderStation1(taskPanel, stage, recordPanel); break;
      case 2: renderStation2(taskPanel, stage, recordPanel); break;
      case 3: renderStation3(taskPanel, stage, recordPanel); break;
      case 4: renderStation4(taskPanel, stage, recordPanel); break;
      case 5: renderStation5(taskPanel, stage, recordPanel); break;
    }
  }

  // ------------------------------------------------------------------
  // 站① 预测与分类
  // ------------------------------------------------------------------
  // 注意：站内交互（放入水槽、加盐……）绝不能调用整站的 renderStation()，
  // 否则会把 Tank 整个重建、正在缸里的物体（例如站③的鸡蛋）会凭空消失。
  // 每站都只建一次 Tank，事件回调只刷新任务卡表头 / 记录面板的局部区块。
  function renderStation1(taskPanel, stage, recordPanel) {
    var header = el("div", "s1-header");
    var shelfWrap = el("div", "s1-shelf-wrap");
    taskPanel.appendChild(header);
    taskPanel.appendChild(shelfWrap);

    var placeBtn = el("button", "btn btn-primary place-btn", "放入水槽");
    placeBtn.type = "button";

    var tank = freshTank(stage, {
      onSettled: function (info) {
        state.s1.tested[info.defId] = { predict: info.guess, floats: info.floats, correct: info.correct };
        saveState();
        shelfCtl.refreshUsed();
        refreshHeader();
        refreshRecord();
      }
    });
    renderToolbar(tank, { clear: true, salt: false });

    function placeObject(id, x) {
      if (tank.count() >= 6) { flashToolbarWarning("水槽已经放了 6 个，先清空再试试"); return; }
      var uid = tank.addObject(id, x);
      if (!uid) return;
      tank.beginPredict(uid);
      showPredictOverlay(tank, uid, function (guess) { tank.confirmDrop(uid, guess); });
    }

    var shelfCtl = buildShelf(shelfWrap, DL.STATION1_IDS, {
      isUsed: function (id) { return !!state.s1.tested[id]; },
      onDrop: function (id, clientX, clientY) {
        if (tank.isPointInside(clientX, clientY)) placeObject(id, tank.clientXToLocalX(clientX));
      }
    });
    shelfWrap.appendChild(placeBtn);
    placeBtn.addEventListener("click", function () {
      var selected = q(".shelf-item.is-selected", shelfWrap);
      if (selected) placeObject(selected.dataset.id);
    });

    function refreshHeader() {
      header.innerHTML = "";
      var testedCount = Object.keys(state.s1.tested).length;
      var goalDone = testedCount >= 8;
      header.appendChild(el("div", "block-title", "任务卡 · 站①"));
      header.appendChild(el("div", "task-goal", "预测再动手：至少测试 8 个物体，看看谁浮谁沉。"));

      header.appendChild(progressBarRow(testedCount, 8, "已测 " + Math.min(testedCount, 8) + " / 8"));

      if (state.mode !== "teacher") {
        var steps = el("div", "task-steps");
        steps.appendChild(taskStepRow(goalDone, "测试至少 8 个物体（已测 " + testedCount + " 个）"));
        steps.appendChild(taskStepRow(state.s1.view === "grouped", "按结果分类（浮 / 沉）"));
        steps.appendChild(taskStepRow(!!state.conclusions.station1, "回答结论题"));
        header.appendChild(steps);
      }

      if (goalDone) {
        var toggleWrap = el("div", "task-hint-row");
        var toggleBtn = el("button", "btn btn-ghost", state.s1.view === "grouped" ? "查看测试顺序" : "查看浮 / 沉分类");
        toggleBtn.type = "button";
        toggleBtn.addEventListener("click", function () {
          state.s1.view = state.s1.view === "grouped" ? "list" : "grouped";
          saveState();
          refreshHeader();
          refreshRecord();
        });
        toggleWrap.appendChild(toggleBtn);
        header.appendChild(toggleWrap);
      }
      header.appendChild(el("div", "block-title shelf-title", "物体架"));
    }

    function refreshRecord() {
      recordPanel.innerHTML = "";
      var testedCount = Object.keys(state.s1.tested).length;
      var goalDone = testedCount >= 8;
      recordPanel.appendChild(el("div", "block-title", "实验记录"));
      if (state.s1.view === "list" || !goalDone) {
        var table = el("div", "record-table record-table--s1");
        var head = el("div", "record-row record-head");
        ["物体", "预测", "结果", "对错"].forEach(function (t) { head.appendChild(el("div", "cell", t)); });
        table.appendChild(head);
        DL.STATION1_IDS.forEach(function (id) {
          var rec = state.s1.tested[id];
          if (!rec) return;
          var row = el("div", "record-row");
          var def = DL.OBJECTS[id];
          var nameCell = el("div", "cell cell-with-thumb");
          var thumbImg = document.createElement("img");
          thumbImg.className = "cell-thumb";
          thumbImg.alt = "";
          thumbImg.src = "assets/objects/" + (def.image || id) + ".png";
          thumbImg.addEventListener("error", function () { this.style.display = "none"; });
          nameCell.appendChild(thumbImg);
          nameCell.appendChild(el("span", "cell-name-text", def.name));
          row.appendChild(nameCell);
          row.appendChild(el("div", "cell", rec.predict ? (rec.predict === "float" ? "会浮" : "会沉") : "—"));
          row.appendChild(el("div", "cell cell-result " + (rec.floats ? "is-float" : "is-sink"), (rec.floats ? ICONS.float() : ICONS.sink()) + (rec.floats ? "浮" : "沉")));
          var okCell = el("div", "cell cell-icon");
          if (rec.correct === null) okCell.innerHTML = "—";
          else okCell.innerHTML = rec.correct ? ICONS.check() : ICONS.cross();
          if (rec.correct === false) row.appendChild(withNote(okCell, "和预测不一样——这正是值得研究的地方"));
          else row.appendChild(okCell);
          table.appendChild(row);
        });
        recordPanel.appendChild(table);
      } else {
        var cols = el("div", "classify-cols");
        ["float", "sink"].forEach(function (kind) {
          var col = el("div", "classify-col");
          col.appendChild(el("div", "classify-head " + (kind === "float" ? "is-float" : "is-sink"), (kind === "float" ? ICONS.float() : ICONS.sink()) + (kind === "float" ? "会浮" : "会沉")));
          DL.STATION1_IDS.forEach(function (id) {
            var rec = state.s1.tested[id];
            if (!rec) return;
            if ((kind === "float") === rec.floats) col.appendChild(el("div", "classify-item", DL.OBJECTS[id].name));
          });
          cols.appendChild(col);
        });
        recordPanel.appendChild(cols);
      }

      if (goalDone) {
        renderQuestion(recordPanel, "station1", DL.QUESTIONS.station1);
      }

      if (goalDone && state.s1.view === "grouped" && state.conclusions.station1) {
        markStationDone(1);
      }
    }

    refreshHeader();
    refreshRecord();
  }

  function taskStepRow(done, text) {
    var row = el("div", "task-step" + (done ? " is-done" : ""));
    row.innerHTML = '<span class="step-check">' + (done ? ICONS.check() : "") + "</span><span>" + text + "</span>";
    return row;
  }

  function progressBarRow(done, total, label) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    var row = el("div", "progress-bar-row");
    row.innerHTML =
      '<div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="progress-bar-label">' + label + "</span>";
    return row;
  }

  function withNote(cellEl, note) {
    var wrap = el("div", "cell cell-with-note", cellEl.innerHTML);
    wrap.appendChild(el("div", "cell-note", note));
    return wrap;
  }

  function flashToolbarWarning(msg) {
    var bar = q("#tankToolbar");
    var warn = el("div", "toolbar-warning", ICONS.warn() + "<span>" + msg + "</span>");
    bar.appendChild(warn);
    setTimeout(function () { if (warn.parentNode) warn.parentNode.removeChild(warn); }, 2600);
  }

  // ------------------------------------------------------------------
  // 站② 是重量还是密度？
  // ------------------------------------------------------------------
  // SVG 电子台秤：底座（带 LCD 显示窗）+ 短支柱 + 平秤盘，选中物体的图片会
  // 摆到秤盘上（v2.1 修正 item 7：原本是一个灰色 T 字形色块，看不出是台秤；
  // 现在照实物结构画——底座、显示窗、支柱、秤盘都用 1px 细描边 + 规格里
  // 既有的 token 颜色，秤盘加一层浅色高光做出「金属反光」的立体感）。
  function balanceScaleSVG(imgSrc) {
    var gid = "scaleSheen" + Math.floor(Math.random() * 100000);
    return '<svg viewBox="0 0 84 58" width="84" height="58" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55"/>' +
          '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>' +
      // 底座
      '<rect x="10" y="40" width="64" height="14" rx="4" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="1"/>' +
      '<rect x="10" y="40" width="64" height="7" rx="4" fill="url(#' + gid + ')"/>' +
      // 显示窗（LCD）
      '<rect x="15" y="44" width="21" height="7.5" rx="1.5" fill="#1E2B33" stroke="var(--line-strong)" stroke-width="1"/>' +
      '<line x1="18.5" y1="47.7" x2="23" y2="47.7" stroke="#6FE3C6" stroke-width="1.2" stroke-linecap="round"/>' +
      '<line x1="25" y1="47.7" x2="29.5" y2="47.7" stroke="#6FE3C6" stroke-width="1.2" stroke-linecap="round" opacity="0.55"/>' +
      // 按钮
      '<circle cx="63" cy="47.5" r="2.4" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1"/>' +
      // 支柱
      '<rect x="38.5" y="31" width="7" height="10" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="1"/>' +
      // 秤盘
      '<ellipse cx="42" cy="28" rx="27" ry="5.5" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1"/>' +
      '<ellipse cx="42" cy="26.5" rx="23" ry="3.2" fill="url(#' + gid + ')"/>' +
      (imgSrc ? '<image href="' + imgSrc + '" x="27" y="1" width="30" height="25" preserveAspectRatio="xMidYMid meet"/>' : "") +
      "</svg>";
  }

  function renderStation2(taskPanel, stage, recordPanel) {
    taskPanel.appendChild(el("div", "block-title", "任务卡 · 站②"));
    taskPanel.appendChild(el("div", "task-goal", "三组物体，先称重再放水槽，看看谁浮谁沉。"));

    if (typeof state.s2.current !== "number") state.s2.current = 0;
    var groupUpdaters = {};

    var tank = freshTank(stage, {
      onSettled: function (info) {
        var g = currentGroupFor(info.defId);
        if (!g) return;
        var rec = state.s2.groups[g.key] || {};
        rec[info.defId] = { floats: info.floats, mass: info.mass };
        state.s2.groups[g.key] = rec;
        saveState();
        if (groupUpdaters[g.key]) groupUpdaters[g.key]();
        refreshQuestionSlot();
      }
    });
    renderToolbar(tank, { clear: true, salt: false });

    // 天平
    var balance = el("div", "panel-block balance-widget");
    balance.appendChild(el("div", "block-title", "电子天平"));
    var scaleHost = el("div", "balance-scale");
    var lcd = el("div", "balance-lcd", "-- g");
    var balanceRow = el("div", "balance-row");
    balanceRow.appendChild(scaleHost);
    balanceRow.appendChild(lcd);
    balance.appendChild(balanceRow);
    var weighBtn = el("button", "btn btn-ghost", "称重");
    weighBtn.type = "button";
    weighBtn.disabled = true;
    balance.appendChild(weighBtn);
    taskPanel.appendChild(balance);

    var selectedId = null;
    function setScaleImage(id) {
      var def = id ? DL.OBJECTS[id] : null;
      scaleHost.innerHTML = balanceScaleSVG(def ? "assets/objects/" + (def.image || id) + ".png" : null);
    }
    setScaleImage(null);
    weighBtn.addEventListener("click", function () {
      if (!selectedId) return;
      lcd.textContent = DL.mass(DL.OBJECTS[selectedId]) + " g";
    });

    function currentGroupFor(defId) {
      for (var i = 0; i < DL.STATION2_GROUPS.length; i++) {
        var g = DL.STATION2_GROUPS[i];
        if (g.a === defId || g.b === defId) return g;
      }
      return null;
    }

    // 分组任务卡：一次只显示一组，配「第 X / 3 组」+ 上一组/下一组，
    // 不然三组堆叠成一长条要一直捲动（v2 规格 J 项）。
    var groupCardHost = el("div", "group-card-host");
    taskPanel.appendChild(groupCardHost);

    function buildGroupCard(idx) {
      groupCardHost.innerHTML = "";
      groupUpdaters = {};
      selectedId = null;
      weighBtn.disabled = true;
      lcd.textContent = "-- g";
      setScaleImage(null);

      var g = DL.STATION2_GROUPS[idx];
      var groupCard = el("div", "panel-block group-card");

      var navRow = el("div", "group-nav-row");
      var prevBtn = el("button", "group-nav-btn", ICONS.chevronLeft());
      prevBtn.type = "button";
      prevBtn.disabled = idx === 0;
      prevBtn.setAttribute("aria-label", "上一组");
      prevBtn.addEventListener("click", function () { state.s2.current = idx - 1; saveState(); buildGroupCard(state.s2.current); });
      var navLabel = el("span", "group-nav-label", "第 " + (idx + 1) + " / " + DL.STATION2_GROUPS.length + " 组");
      var nextBtn = el("button", "group-nav-btn", ICONS.chevronRight());
      nextBtn.type = "button";
      nextBtn.disabled = idx === DL.STATION2_GROUPS.length - 1;
      nextBtn.setAttribute("aria-label", "下一组");
      nextBtn.addEventListener("click", function () { state.s2.current = idx + 1; saveState(); buildGroupCard(state.s2.current); });
      navRow.appendChild(prevBtn);
      navRow.appendChild(navLabel);
      navRow.appendChild(nextBtn);
      groupCard.appendChild(navRow);

      groupCard.appendChild(el("div", "block-title", g.title));

      var pairRow = el("div", "pair-shelf");
      var itemRefs = {};
      [g.a, g.b].forEach(function (id) {
        var def = DL.OBJECTS[id];
        var item = el("div", "shelf-item pair-item");
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        var thumb = el("div", "shelf-thumb");
        var img = document.createElement("img");
        img.alt = def.name;
        img.src = "assets/objects/" + (def.image || id) + ".png";
        img.addEventListener("error", function () { thumb.classList.add("thumb-fallback"); thumb.textContent = def.name.charAt(0); });
        thumb.appendChild(img);
        item.appendChild(thumb);
        item.appendChild(el("div", "shelf-name", def.name + (state.showData ? "（" + DL.mass(def) + " g）" : "")));
        item.addEventListener("click", function () {
          selectedId = id;
          weighBtn.disabled = false;
          setScaleImage(id);
          qa(".pair-item", groupCard).forEach(function (n) { n.classList.remove("is-selected"); });
          item.classList.add("is-selected");
        });
        itemRefs[id] = item;
        pairRow.appendChild(item);
      });
      groupCard.appendChild(pairRow);

      var dropBtn = el("button", "btn btn-primary", "两个都放入水槽");
      dropBtn.type = "button";
      dropBtn.addEventListener("click", function () {
        if (tank.count() + 2 > 6) tank.clearAll();
        // 一个一个放：两个预测浮层同时出现会互相遮挡（v2.2）
        var interior = DL.BEAKER.right - DL.BEAKER.left;
        var xs = [DL.BEAKER.left + interior * 0.3, DL.BEAKER.left + interior * 0.7];
        (function next(i) {
          if (i > 1) return;
          var uid = tank.addObject([g.a, g.b][i], xs[i]);
          if (!uid) return;
          tank.beginPredict(uid);
          showPredictOverlay(tank, uid, function (guess) { tank.confirmDrop(uid, guess); next(i + 1); });
        })(0);
      });
      groupCard.appendChild(dropBtn);

      var noteSlot = el("div", "note-slot");
      groupCard.appendChild(noteSlot);

      groupUpdaters[g.key] = function () {
        var rec = state.s2.groups[g.key] || {};
        itemRefs[g.a].classList.toggle("is-used", !!rec[g.a]);
        itemRefs[g.b].classList.toggle("is-used", !!rec[g.b]);
        noteSlot.innerHTML = "";
        if (rec[g.a] && rec[g.b]) {
          noteSlot.appendChild(el("div", "observation-note", ICONS.lightbulb() + "<span>" + g.note + "</span>"));
        }
      };
      groupUpdaters[g.key]();

      groupCardHost.appendChild(groupCard);
    }
    buildGroupCard(state.s2.current);

    // 密度示意卡 + 结论题（结论题区域独立刷新，不动 Tank）
    recordPanel.appendChild(densityDiagramCard());
    var questionSlot = el("div", "question-slot");
    recordPanel.appendChild(questionSlot);

    function refreshQuestionSlot() {
      questionSlot.innerHTML = "";
      var allDone = DL.STATION2_GROUPS.every(function (g) {
        var rec = state.s2.groups[g.key] || {};
        return rec[g.a] && rec[g.b];
      });
      if (allDone) {
        renderQuestion(questionSlot, "station2", DL.QUESTIONS.station2);
        if (state.conclusions.station2) markStationDone(2);
      } else {
        questionSlot.appendChild(el("div", "hint-block", "完成三组比较后，这里会出现结论题。"));
      }
    }
    refreshQuestionSlot();
  }

  function densityDiagramCard() {
    var card = el("div", "panel-block density-diagram");
    card.appendChild(el("div", "block-title", "一样大小，里面挤得多紧？"));
    var row = el("div", "diagram-row");
    // 三个一样大的方框，粒子数量固定 9 颗（3x3），只用间距松/中/紧表现密度
    // 差异——之前用不同颗数配同样的 5 列网格，颗数不整除时最后一行会歪掉，
    // 看起来「没对齐」（v2 规格 K 项）。
    var kinds = [
      { label: "木", spacing: "loose" }, { label: "水", spacing: "medium" }, { label: "铁", spacing: "tight" }
    ];
    kinds.forEach(function (k) {
      var box = el("div", "diagram-box");
      var grid = el("div", "diagram-dots spacing-" + k.spacing);
      for (var i = 0; i < 9; i++) grid.appendChild(el("span", "dot"));
      box.appendChild(grid);
      box.appendChild(el("div", "diagram-label", k.label));
      row.appendChild(box);
    });
    card.appendChild(row);
    card.appendChild(el("div", "diagram-caption", "挤得越紧，密度越大。密度比水小会浮，比水大会沉。"));
    return card;
  }

  // ------------------------------------------------------------------
  // 站③ 改变液体
  // ------------------------------------------------------------------
  function renderStation3(taskPanel, stage, recordPanel) {
    taskPanel.appendChild(el("div", "block-title", "任务卡 · 站③"));
    taskPanel.appendChild(el("div", "task-goal", "鸡蛋在清水里沉底。只靠加盐，能不能让它浮起来？"));
    taskPanel.appendChild(el("div", "hint-block", ICONS.lightbulb() + "<span>科学家的习惯：每次只改变一样东西（盐的份量），其他不变。</span>"));

    // 任务卡本身很短，左栏下面容易留一片空白——放一个盐勺/液体密度小仪表，
    // 呼应水槽里那个仪表卡，也让左栏有内容可看（v2 规格 M 项）。
    var saltMeter = el("div", "salt-meter-mini");
    taskPanel.appendChild(saltMeter);
    function refreshSaltMeter() {
      var n = tank.saltSpoons;
      var segs = "";
      for (var i = 0; i < DL.SALT_MAX; i++) segs += '<div class="salt-meter-mini-seg' + (i < n ? " is-filled" : "") + '"></div>';
      saltMeter.innerHTML =
        '<div class="salt-meter-mini-row"><span class="block-title">液体密度</span><span class="salt-meter-mini-value">' +
        (n > 0 ? "盐水 · " + n + " 勺" : "清水") + "</span></div>" +
        '<div class="salt-meter-mini-segs">' + segs + "</div>";
    }

    recordPanel.appendChild(el("div", "block-title", "实验记录"));
    var tableSlot = el("div", "table-slot");
    var noteSlot = el("div", "note-slot");
    recordPanel.appendChild(tableSlot);
    recordPanel.appendChild(noteSlot);

    var pendingSpoon = null;

    var tank = freshTank(stage, {
      onSettled: function (info) {
        if (info.defId !== "egg") return;
        if (pendingSpoon === null) return;
        var isFirstFloat = info.floats && state.s3.firstFloatSpoon === null;
        if (isFirstFloat) state.s3.firstFloatSpoon = pendingSpoon;
        var label = !info.floats ? "沉在底部" : (state.s3.firstFloatSpoon === pendingSpoon ? "离开底部" : "浮上水面");
        state.s3.rows.push({ spoon: pendingSpoon, label: label });
        pendingSpoon = null;
        saveState();
        refreshRecord();
      },
      onChange: function () { refreshSaltMeter(); }
    });
    refreshSaltMeter();

    var eggUid = tank.addObject("egg");
    if (eggUid) tank.confirmDrop(eggUid, null);
    // 恢复已加过的盐（若从别的站切回来）
    if (state.s3.rows.length) {
      tank.setSaltSpoons(state.s3.rows[state.s3.rows.length - 1].spoon);
    }

    renderToolbar(tank, {
      clear: false,
      salt: true,
      onAddSalt: function () {
        if (tank.saltSpoons >= DL.SALT_MAX) { flashToolbarWarning("已经加到 8 勺了"); return; }
        pendingSpoon = tank.saltSpoons + 1;
        tank.addSalt();
      },
      onResetSalt: function () {
        tank.resetToFreshWater();
        state.s3.rows = [];
        state.s3.firstFloatSpoon = null;
        saveState();
        refreshRecord();
      }
    });

    function refreshRecord() {
      tableSlot.innerHTML = "";
      var table = el("div", "record-table");
      var head = el("div", "record-row record-head");
      ["盐（勺）", "鸡蛋的位置"].forEach(function (t) { head.appendChild(el("div", "cell", t)); });
      table.appendChild(head);
      state.s3.rows.forEach(function (r) {
        var row = el("div", "record-row");
        row.appendChild(el("div", "cell", String(r.spoon)));
        row.appendChild(el("div", "cell", r.label));
        table.appendChild(row);
      });
      tableSlot.appendChild(table);

      noteSlot.innerHTML = "";
      var floated = state.s3.rows.some(function (r) { return r.label !== "沉在底部"; });
      if (floated) {
        noteSlot.appendChild(el("div", "observation-note", ICONS.lightbulb() +
          "<span>加盐让水的密度变大；当水的密度比鸡蛋大，鸡蛋就浮起来。</span>"));
        renderQuestion(noteSlot, "station3", DL.QUESTIONS.station3);
        if (state.conclusions.station3) markStationDone(3);
      } else {
        noteSlot.appendChild(el("div", "hint-block", "目标：让鸡蛋浮起来（大约第 4 勺时会离开底部）。"));
      }
    }
    refreshRecord();
  }

  // ------------------------------------------------------------------
  // 站④ 生活中的难题
  // ------------------------------------------------------------------
  var S4_SUBS = [
    { key: "mystery", label: "神秘方块" },
    { key: "raft", label: "做木筏" },
    { key: "vest", label: "救生衣" },
    { key: "sea", label: "海水和河水" }
  ];

  function renderStation4(taskPanel, stage, recordPanel) {
    taskPanel.appendChild(el("div", "block-title", "任务卡 · 站④"));
    var subNav = el("div", "sub-nav");
    S4_SUBS.forEach(function (s) {
      var b = el("button", "sub-nav-btn" + (state.s4.sub === s.key ? " is-active" : ""), s.label);
      b.type = "button";
      b.addEventListener("click", function () { state.s4.sub = s.key; saveState(); renderStation(); });
      subNav.appendChild(b);
    });
    taskPanel.appendChild(subNav);

    if (state.s4.sub === "mystery") renderMystery(taskPanel, stage, recordPanel);
    else if (state.s4.sub === "raft") renderRaft(taskPanel, stage, recordPanel);
    else if (state.s4.sub === "vest") renderLiteracy(taskPanel, stage, recordPanel, "vest", DL.QUESTIONS.vest);
    else renderLiteracy(taskPanel, stage, recordPanel, "sea", DL.QUESTIONS.sea);

    checkStation4Done();
  }

  function checkStation4Done() {
    var mysteryOk = state.s4.mystery.order.join(",") === "mystery_x,mystery_y,mystery_z" &&
      state.s4.mystery.checked === true;
    var raftOk = state.s4.raft.result === true;
    var vestOk = state.conclusions.vest && state.conclusions.vest.correct;
    var seaOk = state.conclusions.sea && state.conclusions.sea.correct;
    if (mysteryOk && raftOk && vestOk && seaOk) markStationDone(4);
  }

  // 神秘方块：三个中性灰金属方块，三个面分层打阴影表现立体感，字母印在
  // 正面——之前是纯色方格配一个字母，看起来太平（v2 规格 L 项）。
  function mysteryCubeSVG(letter, size) {
    size = size || 40;
    return '<svg viewBox="0 0 40 40" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<polygon points="8,13 20,7 32,13 20,19" fill="#CBD2D9"/>' +
      '<polygon points="8,13 20,19 20,33 8,27" fill="#818C99"/>' +
      '<polygon points="32,13 20,19 20,33 32,27" fill="#A9B2BC"/>' +
      '<text x="26" y="28" text-anchor="middle" font-family="&quot;IBM Plex Mono&quot;, monospace" font-size="8" font-weight="600" fill="#28323C">' + letter + '</text>' +
      "</svg>";
  }

  function renderMystery(taskPanel, stage, recordPanel) {
    taskPanel.appendChild(el("div", "task-goal", "三个方块 X / Y / Z 没有标签。在清水、盐水里试一试，找出密度小到大的顺序。"));
    taskPanel.appendChild(el("div", "hint-block", ICONS.lightbulb() + "<span>提示：方块 Y 在清水里会沉，在满盐水里会浮。</span>"));

    var resultEls = {};

    var tank = freshTank(stage, {
      onSettled: function (info) {
        if (!DL.OBJECTS[info.defId].mystery) return;
        var key = tank.saltSpoons >= DL.SALT_MAX ? "salty" : "fresh";
        var results = state.s4.mystery.results[info.defId] || {};
        results[key] = info.floats;
        state.s4.mystery.results[info.defId] = results;
        saveState();
        refreshShelfResults();
      }
    });
    renderToolbar(tank, {
      clear: true, salt: true,
      onAddSalt: function () { tank.setSaltSpoons(DL.SALT_MAX); },
      onResetSalt: function () { tank.resetToFreshWater(); }
    });

    var shelf = el("div", "shelf-grid mystery-shelf");
    ["mystery_x", "mystery_y", "mystery_z"].forEach(function (id) {
      var def = DL.OBJECTS[id];
      var item = el("div", "shelf-item");
      item.appendChild(el("div", "shelf-thumb mystery-thumb", mysteryCubeSVG(def.mystery, 48)));
      item.appendChild(el("div", "shelf-name", def.name));
      var resultEl = el("div", "shelf-result", "");
      item.appendChild(resultEl);
      resultEls[id] = resultEl;
      item.addEventListener("click", function () {
        if (tank.count() >= 6) { flashToolbarWarning("先清空水槽再试"); return; }
        var uid = tank.addObject(id);
        if (uid) { tank.beginPredict(uid); showPredictOverlay(tank, uid, function (g) { tank.confirmDrop(uid, g); }); }
      });
      shelf.appendChild(item);
    });
    taskPanel.appendChild(shelf);

    function refreshShelfResults() {
      ["mystery_x", "mystery_y", "mystery_z"].forEach(function (id) {
        var res = state.s4.mystery.results[id];
        if (!res) { resultEls[id].textContent = ""; return; }
        var tag = (res.fresh !== undefined ? ("清水：" + (res.fresh ? "浮" : "沉")) : "清水：未测") +
          (res.salty !== undefined ? "　盐水：" + (res.salty ? "浮" : "沉") : "");
        resultEls[id].textContent = tag;
      });
    }
    refreshShelfResults();

    // 排序区（只操作记录面板，不碰 Tank）
    function renderOrderSection() {
      recordPanel.innerHTML = "";
      recordPanel.appendChild(el("div", "block-title", "神秘方块排序"));
      var card = el("div", "order-card");

      var caption = el("div", "order-scale-caption");
      caption.innerHTML = "<span>1 密度最小</span>" + ICONS.chevronRight() + "<span>3 密度最大</span>";
      card.appendChild(caption);

      var pool = el("div", "order-pool");
      ["mystery_x", "mystery_y", "mystery_z"].forEach(function (id) {
        if (state.s4.mystery.order.indexOf(id) !== -1) return;
        var chip = el("div", "order-chip", mysteryCubeSVG(DL.OBJECTS[id].mystery, 40));
        chip.dataset.id = id;
        chip.tabIndex = 0;
        chip.setAttribute("role", "button");
        chip.setAttribute("aria-label", "放入下一个空格：" + DL.OBJECTS[id].name);
        chip.addEventListener("click", function () {
          var emptyIdx = state.s4.mystery.order.indexOf(null);
          if (emptyIdx === -1) return;
          state.s4.mystery.order[emptyIdx] = id;
          saveState();
          renderOrderSection();
        });
        pool.appendChild(chip);
      });
      card.appendChild(pool);

      var slotsRow = el("div", "order-slots");
      for (var i = 0; i < 3; i++) {
        var slotWrap = el("div", "order-slot");
        slotWrap.appendChild(el("span", "order-slot-num", String(i + 1)));
        var box = el("div", "order-slot-box");
        var filled = state.s4.mystery.order[i];
        if (filled) {
          box.classList.add("has-chip");
          var chip2 = el("div", "order-chip is-placed", mysteryCubeSVG(DL.OBJECTS[filled].mystery, 40));
          chip2.tabIndex = 0;
          chip2.setAttribute("role", "button");
          chip2.setAttribute("aria-label", "移出：" + DL.OBJECTS[filled].name);
          chip2.addEventListener("click", function (idx) {
            return function () {
              state.s4.mystery.order[idx] = null;
              state.s4.mystery.checked = false;
              saveState();
              renderOrderSection();
            };
          }(i));
          box.appendChild(chip2);
        }
        slotWrap.appendChild(box);
        slotsRow.appendChild(slotWrap);
      }
      card.appendChild(slotsRow);
      recordPanel.appendChild(card);

      var checkBtn = el("button", "btn btn-primary", "检查顺序");
      checkBtn.type = "button";
      checkBtn.disabled = state.s4.mystery.order.indexOf(null) !== -1;
      var feedbackSlot = el("div", "feedback-slot");
      checkBtn.addEventListener("click", function () {
        var correctOrder = ["mystery_x", "mystery_y", "mystery_z"];
        var ok = state.s4.mystery.order.every(function (id, i) { return id === correctOrder[i]; });
        state.s4.mystery.checked = ok;
        saveState();
        feedbackSlot.innerHTML = "";
        var fb = el("div", "q-feedback show " + (ok ? "is-correct" : "is-wrong"));
        fb.innerHTML = (ok ? ICONS.check() : ICONS.cross()) +
          "<span>" + (ok ? "对了！X 密度最小、Z 密度最大。" : "再想想：Y 在清水沉、在盐水浮，密度介于两者之间。") + "</span>";
        feedbackSlot.appendChild(fb);
        checkStation4Done();
        renderTopbar();
      });
      recordPanel.appendChild(checkBtn);
      recordPanel.appendChild(feedbackSlot);
    }
    renderOrderSection();
  }

  function renderRaft(taskPanel, stage, recordPanel) {
    taskPanel.appendChild(el("div", "task-goal", "从下面选 3 种材料做木筏，目标是全部能浮起来。"));
    var grid = el("div", "raft-grid");
    DL.RAFT_MATERIALS.forEach(function (id) {
      var def = DL.OBJECTS[id];
      var chip = el("label", "raft-chip");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.s4.raft.picked.indexOf(id) !== -1;
      cb.addEventListener("change", function () {
        var picked = state.s4.raft.picked.slice();
        if (cb.checked) {
          if (picked.length >= 3) { cb.checked = false; return; }
          picked.push(id);
        } else {
          picked = picked.filter(function (x) { return x !== id; });
        }
        state.s4.raft.picked = picked;
        state.s4.raft.result = null;
        saveState();
        refreshPickedList();
        tryBtn.disabled = state.s4.raft.picked.length !== 3;
      });
      chip.appendChild(cb);
      chip.appendChild(document.createTextNode(" " + def.name));
      grid.appendChild(chip);
    });
    taskPanel.appendChild(grid);

    var tank = freshTank(stage, { onSettled: function () {} });
    renderToolbar(tank, { clear: true, salt: false });

    var tryBtn = el("button", "btn btn-primary", "放下水试试");
    tryBtn.type = "button";
    tryBtn.disabled = state.s4.raft.picked.length !== 3;
    taskPanel.appendChild(tryBtn);

    recordPanel.appendChild(el("div", "block-title", "已选材料"));
    var listSlot = el("div", "list-slot");
    var feedbackSlot = el("div", "feedback-slot");
    recordPanel.appendChild(listSlot);
    recordPanel.appendChild(feedbackSlot);

    function refreshPickedList() {
      listSlot.innerHTML = "";
      var list = el("div", "record-table");
      state.s4.raft.picked.forEach(function (id) {
        list.appendChild(el("div", "record-row", "<div class='cell'>" + DL.OBJECTS[id].name + "</div>"));
      });
      listSlot.appendChild(list);
    }
    refreshPickedList();

    tryBtn.addEventListener("click", function () {
      tank.clearAll();
      var sinkers = state.s4.raft.picked.filter(function (id) { return DL.OBJECTS[id].density >= 1; });
      state.s4.raft.result = sinkers.length === 0;
      saveState();
      state.s4.raft.picked.forEach(function (id) {
        var uid = tank.addObject(id);
        if (uid) tank.confirmDrop(uid, null);
      });
      feedbackSlot.innerHTML = "";
      var fb = el("div", "q-feedback show " + (state.s4.raft.result ? "is-correct" : "is-wrong"));
      if (state.s4.raft.result) {
        fb.innerHTML = ICONS.check() + "<span>成功！三种材料的密度都比水小，木筏能浮起来。</span>";
      } else {
        var names = sinkers.map(function (id) { return DL.OBJECTS[id].name; }).join("、");
        fb.innerHTML = ICONS.cross() + "<span>木筏沉了一部分——" + names + " 的密度比水大，换掉它再试试。</span>";
      }
      feedbackSlot.appendChild(fb);
      checkStation4Done();
      renderTopbar();
    });

    if (state.s4.raft.result !== null) {
      var fb2 = el("div", "q-feedback show " + (state.s4.raft.result ? "is-correct" : "is-wrong"));
      fb2.innerHTML = state.s4.raft.result
        ? ICONS.check() + "<span>成功！三种材料的密度都比水小。</span>"
        : ICONS.cross() + "<span>有材料的密度比水大，木筏沉了一部分。</span>";
      feedbackSlot.appendChild(fb2);
    }
  }

  // 这两页只有一句任务目标，左栏任务卡会很短、下面留一大片空白——放一张
  // 跟题目相关的说明性插图把空间用起来，而不是留死区（v2 规格 M 项）。
  function sideIllustration(key) {
    var wrap = el("div", "side-illustration");
    if (key === "vest") {
      wrap.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M12 3v5.4M12 15.6V21M3 12h5.4M15.6 12H21"/></svg>' +
        "<p>救生衣里的泡沫，跟救生圈是同一个道理——靠密度比水小很多的材料提供浮力。</p>";
    } else {
      wrap.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M2 8.5c1.5 1.4 3 1.4 4.5 0s3-1.4 4.5 0 3 1.4 4.5 0 3-1.4 4.5 0"/>' +
        '<path d="M2 13.5c1.5 1.4 3 1.4 4.5 0s3-1.4 4.5 0 3 1.4 4.5 0 3-1.4 4.5 0"/>' +
        '<path d="M2 18.5c1.5 1.4 3 1.4 4.5 0s3-1.4 4.5 0 3 1.4 4.5 0 3-1.4 4.5 0"/></svg>' +
        "<p>海水含盐、密度比较大；河水是淡水，密度比较小——同一个人在两种水里浮起来的程度不一样。</p>";
    }
    return wrap;
  }

  function renderLiteracy(taskPanel, stage, recordPanel, key, qDef) {
    taskPanel.appendChild(el("div", "task-goal", "读一读，想一想，选出最合理的答案。"));
    taskPanel.appendChild(sideIllustration(key));
    q("#tankToolbar").innerHTML = "";
    stage.style.display = "none";
    var card = el("div", "literacy-card panel-block");
    card.appendChild(el("div", "literacy-icon", ICONS.lightbulb()));
    recordPanel.appendChild(card);
    renderQuestion(recordPanel, key, qDef);
  }

  // ------------------------------------------------------------------
  // 站⑤ 学习报告
  // ------------------------------------------------------------------
  function renderStation5(taskPanel, stage, recordPanel) {
    stage.style.display = "none";
    q("#tankToolbar").innerHTML = "";
    taskPanel.innerHTML = "";
    recordPanel.innerHTML = "";

    var wrap = el("div", "report-wrap");
    wrap.appendChild(el("h2", "report-title", "学习报告"));

    var grid = el("div", "report-grid");
    for (var i = 1; i <= 4; i++) {
      var card = el("div", "report-card" + (state.stationDone[i] ? " is-done" : ""));
      card.innerHTML = "<div class='report-card-icon'>" + (state.stationDone[i] ? ICONS.check() : ICONS.beaker()) + "</div>" +
        "<div class='report-card-label'>站" + ["①", "②", "③", "④"][i - 1] + "</div>" +
        "<div class='report-card-status'>" + (state.stationDone[i] ? "已完成" : "未完成") + "</div>";
      grid.appendChild(card);
    }
    wrap.appendChild(grid);

    var testedIds = Object.keys(state.s1.tested);
    var correctCount = testedIds.filter(function (id) { return state.s1.tested[id].correct; }).length;
    var accuracy = testedIds.length ? Math.round((correctCount / testedIds.length) * 100) : null;
    wrap.appendChild(el("div", "report-line", "① 预测正确率：" + (accuracy === null ? "尚未测试" : accuracy + "%（" + correctCount + " / " + testedIds.length + "）")));

    ["station1", "station2", "station3"].forEach(function (key, idx) {
      var c = state.conclusions[key];
      wrap.appendChild(el("div", "report-line",
        "站" + ["①", "②", "③"][idx] + " 结论题首次作答：" + (c ? (c.correct ? "正确" : "不正确（选了 " + c.chosen + "）") : "尚未作答")));
    });

    var gaps = [];
    if (state.conclusions.station1 && !state.conclusions.station1.correct) gaps.push("浮沉看的是密度，不是重量或大小");
    if (state.conclusions.station2 && !state.conclusions.station2.correct && gaps.indexOf("浮沉看的是密度，不是重量或大小") === -1) gaps.push("浮沉看的是密度，不是重量或大小");
    if (state.conclusions.station3 && !state.conclusions.station3.correct) gaps.push("加盐可以增加水的密度");

    var gapCard = el("div", "panel-block gap-card");
    gapCard.appendChild(el("div", "block-title", "还要加油的概念"));
    if (gaps.length === 0) {
      gapCard.appendChild(el("div", "hint-block", "目前的结论题首次作答都答对了，很棒！"));
    } else {
      var list = el("ul", "gap-list");
      gaps.forEach(function (g) { list.appendChild(el("li", "", g)); });
      gapCard.appendChild(list);
    }
    wrap.appendChild(gapCard);

    var actions = el("div", "report-actions");
    var printBtn = el("button", "btn btn-primary", ICONS.printer() + "<span>打印报告</span>");
    printBtn.type = "button";
    printBtn.addEventListener("click", function () { window.print(); });
    actions.appendChild(printBtn);

    var resetBtn = el("button", "btn btn-ghost", ICONS.refresh() + "<span>重新开始全部</span>");
    resetBtn.type = "button";
    var confirmBox = null;
    resetBtn.addEventListener("click", function () {
      if (confirmBox) return;
      confirmBox = el("div", "confirm-inline");
      confirmBox.innerHTML = "<span>确定要清除所有记录，重新开始吗？</span>";
      var yes = el("button", "btn btn-primary", "确定重来");
      var no = el("button", "btn btn-ghost", "取消");
      yes.type = "button"; no.type = "button";
      yes.addEventListener("click", function () {
        state = defaultState();
        saveState();
        renderTopbar();
        goToStation(1);
      });
      no.addEventListener("click", function () { confirmBox.remove(); confirmBox = null; });
      confirmBox.appendChild(yes);
      confirmBox.appendChild(no);
      actions.appendChild(confirmBox);
    });
    actions.appendChild(resetBtn);
    wrap.appendChild(actions);

    recordPanel.appendChild(wrap);
    taskPanel.style.display = "none";
    q(".layout").classList.add("report-mode");
  }

  // ------------------------------------------------------------------
  // 顶栏交互绑定
  // ------------------------------------------------------------------
  function bindTopbarEvents() {
    q("#dataToggle").addEventListener("click", function () {
      state.showData = !state.showData;
      saveState();
      renderTopbar();
      if (currentTank) currentTank.setShowData(state.showData);
      renderStation();
    });
    qa(".seg-btn", q("#modeSeg")).forEach(function (b) {
      b.addEventListener("click", function () {
        state.mode = b.dataset.mode;
        saveState();
        renderTopbar();
        renderStation();
      });
    });
  }

  // ------------------------------------------------------------------
  // 启动
  // ------------------------------------------------------------------
  function init() {
    loadState();
    q(".layout").classList.remove("report-mode");
    q("#taskPanel").style.display = "";
    bindTopbarEvents();
    renderTopbar();
    renderStation();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
