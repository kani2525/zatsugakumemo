(function () {
  "use strict";

  var STORAGE_KEY = "zatsugaku-memo-entries-v1";
  var SEEDED_KEY = "zatsugaku-memo-seeded-v1";

  var state = {
    entries: [],
    search: "",
    activeCategory: "",
    editingId: null,
    lastRandomId: null,
    formLinkSelection: null,
    formReturnView: "list",
    reelBuilt: false,
    mapCenterId: null,
    mapHistory: [],
  };

  var els = {};

  function qs(id) { return document.getElementById(id); }

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function normalizeEntry(e) {
    return {
      id: e.id || uid(),
      title: e.title || "",
      content: e.content || "",
      category: e.category || "",
      tags: Array.isArray(e.tags) ? e.tags : [],
      source: e.source || "",
      createdAt: e.createdAt || Date.now(),
      links: Array.isArray(e.links) ? e.links.slice() : [],
    };
  }

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
    } catch (e) {
      console.error("読み込みに失敗しました", e);
      return [];
    }
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  }

  function getEntryById(id) {
    return state.entries.find(function (e) { return e.id === id; }) || null;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function seedIfEmpty() {
    if (localStorage.getItem(SEEDED_KEY)) return;
    localStorage.setItem(SEEDED_KEY, "1");
    if (state.entries.length > 0) return;
    var now = Date.now();
    var samples = [
      {
        title: "タコの心臓は3つある",
        content: "タコには心臓が3つあり、2つはエラに血液を送り、残り1つが全身に血液を送っています。泳ぐと全身用の心臓が止まってしまうため、タコは泳ぐより歩く方が得意と言われています。",
        category: "動物",
        tags: ["生き物", "海", "意外"],
        source: "",
      },
      {
        title: "バナナは木ではなく草",
        content: "バナナの木のように見える幹は「偽茎（ぎけい）」と呼ばれる葉が重なったもので、実は木本ではなく多年生の草に分類されます。分類上はバナナの実は「果物」ではなく「野菜」に近い扱いになることもあります。",
        category: "植物",
        tags: ["食べ物", "分類", "意外"],
        source: "",
      },
      {
        title: "ハチミツは腐らない",
        content: "適切に保存されたハチミツは水分がほとんどなく強い酸性のため、微生物が繁殖できず、理論上は腐りません。数千年前の古代エジプトの墓から見つかったハチミツが、今でも食べられる状態だった例もあります。",
        category: "食べ物",
        tags: ["食べ物", "歴史", "保存"],
        source: "",
      },
    ];
    var ids = samples.map(function () { return uid(); });
    state.entries = samples.map(function (s, i) {
      return {
        id: ids[i],
        title: s.title,
        content: s.content,
        category: s.category,
        tags: s.tags,
        source: s.source,
        createdAt: now - (samples.length - i) * 1000,
        links: [ids[(i + 1) % ids.length]],
      };
    });
    saveEntries();
  }

  function getCategories() {
    var set = {};
    state.entries.forEach(function (e) {
      if (e.category) set[e.category] = (set[e.category] || 0) + 1;
    });
    return Object.keys(set).sort(function (a, b) { return set[b] - set[a]; }).map(function (name) {
      return { name: name, count: set[name] };
    });
  }

  function matchesSearch(entry, query) {
    if (!query) return true;
    var haystack = [entry.title, entry.content, entry.category].concat(entry.tags || []).join(" ").toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
  }

  function getFilteredEntries() {
    return state.entries
      .filter(function (e) { return matchesSearch(e, state.search); })
      .filter(function (e) { return !state.activeCategory || e.category === state.activeCategory; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function truncate(str, n) {
    str = String(str || "");
    return str.length > n ? str.slice(0, n) + "…" : str;
  }

  function wrapLines(str, perLine) {
    str = String(str || "");
    if (str.length <= perLine) return [str];
    var line1 = str.slice(0, perLine);
    var rest = str.slice(perLine);
    var line2 = rest.length > perLine ? rest.slice(0, perLine - 1) + "…" : rest;
    return [line1, line2];
  }

  function makeMapLabel(NS, x, y, title, perLine, cssClass) {
    var lines = wrapLines(title, perLine);
    var text = document.createElementNS(NS, "text");
    text.setAttribute("class", cssClass);
    text.setAttribute("x", x);
    var lineHeight = 11;
    var startY = y - ((lines.length - 1) * lineHeight) / 2 + 3;
    lines.forEach(function (line, i) {
      var tspan = document.createElementNS(NS, "tspan");
      tspan.setAttribute("x", x);
      tspan.setAttribute("y", startY + i * lineHeight);
      tspan.textContent = line;
      text.appendChild(tspan);
    });
    return text;
  }

  function renderTopbar() {
    qs("entry-count").textContent = state.entries.length > 0 ? state.entries.length + "件登録中" : "";
  }

  function renderChips() {
    var categories = getCategories();
    var html = '<button class="chip ' + (state.activeCategory === "" ? "active" : "") + '" data-cat="">すべて</button>';
    categories.forEach(function (c) {
      html += '<button class="chip ' + (state.activeCategory === c.name ? "active" : "") + '" data-cat="' +
        escapeHtml(c.name) + '">' + escapeHtml(c.name) + " (" + c.count + ")</button>";
    });
    els.chipRow.innerHTML = html;
  }

  function renderList() {
    var filtered = getFilteredEntries();
    els.listEmpty.classList.toggle("hidden", state.entries.length > 0);
    if (state.entries.length > 0 && filtered.length === 0) {
      els.entryList.innerHTML = '<li class="empty-message">条件に一致するうんちくが見つかりませんでした。</li>';
    } else {
      els.entryList.innerHTML = filtered.map(function (e) {
        var catBadge = e.category ? '<span class="card-category">' + escapeHtml(e.category) + "</span><br>" : "";
        return '<li class="entry-card" data-id="' + e.id + '">' + catBadge +
          "<h3>" + escapeHtml(e.title) + "</h3>" +
          "<p>" + escapeHtml(e.content) + "</p></li>";
      }).join("");
    }
  }

  function fillCategorySelect(select, categories) {
    var current = select.value;
    select.innerHTML = '<option value="">すべてのカテゴリ</option>' + categories.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + " (" + c.count + ")</option>";
    }).join("");
    select.value = current;
  }

  function renderCategoryDatalist() {
    var categories = getCategories();
    qs("category-options").innerHTML = categories.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '"></option>';
    }).join("");
    fillCategorySelect(qs("reel-category"), categories);
  }

  function renderAll() {
    renderTopbar();
    renderChips();
    renderList();
    renderCategoryDatalist();
    qs("backup-count").textContent = state.entries.length;
  }

  function renderLinkedPillsHtml(entry) {
    return (entry.links || []).map(function (id) {
      var linked = getEntryById(id);
      if (!linked) return "";
      return '<span class="tag-pill link-pill" data-id="' + linked.id + '">' + escapeHtml(linked.title) + "</span>";
    }).join("");
  }

  function openDetail(id) {
    var entry = getEntryById(id);
    if (!entry) return;
    els.detailModal.dataset.id = id;
    qs("detail-category").textContent = entry.category || "";
    qs("detail-category").classList.toggle("hidden", !entry.category);
    qs("detail-title").textContent = entry.title;
    qs("detail-content").textContent = entry.content || "";
    qs("detail-source").textContent = entry.source ? "出典：" + entry.source : "";
    qs("detail-tags").innerHTML = (entry.tags || []).map(function (t) {
      return '<span class="tag-pill">#' + escapeHtml(t) + "</span>";
    }).join("");
    var linksHtml = renderLinkedPillsHtml(entry);
    qs("detail-links").classList.toggle("hidden", !linksHtml);
    qs("detail-links-list").innerHTML = linksHtml;
    els.detailModal.classList.remove("hidden");
  }

  function closeDetail() {
    els.detailModal.classList.add("hidden");
    delete els.detailModal.dataset.id;
  }

  var VIEWS = ["list", "reel", "map", "form", "backup"];

  function switchView(name) {
    VIEWS.forEach(function (v) {
      qs("view-" + v).classList.toggle("hidden", v !== name);
    });
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
    if (name === "form" && state.editingId === null) {
      resetForm();
    }
    if (name === "reel") { layoutReelView(); buildReel(); }
    if (name === "map") renderMap();
  }

  function layoutReelView() {
    var view = qs("view-reel");
    var topbarRect = els.topbar.getBoundingClientRect();
    var tabbarRect = els.tabbar.getBoundingClientRect();
    var appRect = els.app.getBoundingClientRect();
    view.style.top = topbarRect.bottom + "px";
    view.style.left = appRect.left + "px";
    view.style.width = appRect.width + "px";
    view.style.height = Math.max(0, tabbarRect.top - topbarRect.bottom) + "px";
  }

  function focusMapOn(id) {
    var mapCurrentlyVisible = !qs("view-map").classList.contains("hidden");
    if (mapCurrentlyVisible && state.mapCenterId && state.mapCenterId !== id) {
      state.mapHistory.push(state.mapCenterId);
    } else if (!mapCurrentlyVisible) {
      state.mapHistory = [];
    }
    state.mapCenterId = id;
    switchView("map");
  }

  // ---------- Add / Edit form ----------

  function resetForm() {
    qs("form-heading").textContent = "うんちくを追加";
    qs("entry-form").reset();
    qs("form-cancel").classList.add("hidden");
    state.editingId = null;
    state.formReturnView = "list";
    state.formLinkSelection = new Set();
    qs("field-link-search").value = "";
    renderLinkPicker();
  }

  function startEdit(id, returnView) {
    var entry = getEntryById(id);
    if (!entry) return;
    state.editingId = id;
    state.formReturnView = returnView || "list";
    qs("form-heading").textContent = "うんちくを編集";
    qs("field-title").value = entry.title;
    qs("field-content").value = entry.content || "";
    qs("field-category").value = entry.category || "";
    qs("field-tags").value = (entry.tags || []).join(", ");
    qs("field-source").value = entry.source || "";
    qs("form-cancel").classList.remove("hidden");
    state.formLinkSelection = new Set(entry.links || []);
    qs("field-link-search").value = "";
    renderLinkPicker();
    switchView("form");
  }

  function renderLinkPicker() {
    var filter = qs("field-link-search").value.trim().toLowerCase();
    var others = state.entries.filter(function (e) {
      return e.id !== state.editingId && (!filter || e.title.toLowerCase().indexOf(filter) !== -1);
    });
    if (others.length === 0) {
      qs("link-picker").innerHTML = '<div class="link-picker-empty">' +
        (state.entries.length <= (state.editingId ? 1 : 0) ? "他のうんちくがまだ登録されていません。" : "一致するうんちくがありません。") +
        "</div>";
      return;
    }
    qs("link-picker").innerHTML = others.map(function (e) {
      var checked = state.formLinkSelection.has(e.id) ? "checked" : "";
      return '<label class="link-picker-row"><input type="checkbox" data-link-id="' + e.id + '" ' + checked + '>' +
        escapeHtml(e.title) + "</label>";
    }).join("");
  }

  function handleFormSubmit(ev) {
    ev.preventDefault();
    var title = qs("field-title").value.trim();
    if (!title) return;
    var tags = qs("field-tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    var newLinks = Array.from(state.formLinkSelection);
    var entry;
    var previousLinks = [];
    if (state.editingId) {
      entry = getEntryById(state.editingId);
      previousLinks = (entry.links || []).slice();
      entry.title = title;
      entry.content = qs("field-content").value.trim();
      entry.category = qs("field-category").value.trim();
      entry.tags = tags;
      entry.source = qs("field-source").value.trim();
      entry.links = newLinks;
    } else {
      entry = {
        id: uid(),
        title: title,
        content: qs("field-content").value.trim(),
        category: qs("field-category").value.trim(),
        tags: tags,
        source: qs("field-source").value.trim(),
        createdAt: Date.now(),
        links: newLinks,
      };
      state.entries.push(entry);
    }
    // keep links bidirectional
    var added = newLinks.filter(function (id) { return previousLinks.indexOf(id) === -1; });
    var removed = previousLinks.filter(function (id) { return newLinks.indexOf(id) === -1; });
    added.forEach(function (id) {
      var other = getEntryById(id);
      if (other && other.links.indexOf(entry.id) === -1) other.links.push(entry.id);
    });
    removed.forEach(function (id) {
      var other = getEntryById(id);
      if (other) other.links = other.links.filter(function (lid) { return lid !== entry.id; });
    });

    saveEntries();
    var returnView = state.formReturnView || "list";
    resetForm();
    renderAll();
    switchView(returnView);
    if (returnView === "map") { state.mapCenterId = entry.id; renderMap(); }
  }

  function deleteEntry(id) {
    if (!window.confirm("このうんちくを削除します。よろしいですか？")) return;
    state.entries = state.entries.filter(function (e) { return e.id !== id; });
    state.entries.forEach(function (e) {
      e.links = (e.links || []).filter(function (lid) { return lid !== id; });
    });
    saveEntries();
    closeDetail();
    renderAll();
    if (state.mapCenterId === id) { state.mapCenterId = null; state.mapHistory = []; }
  }

  // ---------- Reel (swipe) view ----------

  function buildReel(reshuffle) {
    var category = qs("reel-category").value;
    if (state.reelBuilt && !reshuffle && state.reelCategory === category) return;
    state.reelBuilt = true;
    state.reelCategory = category;
    var pool = state.entries.filter(function (e) { return !category || e.category === category; });
    els.reelEmpty.classList.toggle("hidden", pool.length > 0);
    els.reelContainer.classList.toggle("hidden", pool.length === 0);
    state.reelPool = pool;
    if (pool.length === 0) { els.reelContainer.innerHTML = ""; return; }
    var initial = shuffle(pool).slice(0, Math.min(pool.length, 12));
    els.reelContainer.innerHTML = "";
    initial.forEach(appendReelCard);
    els.reelContainer.scrollTop = 0;
    updateReelPosition();
  }

  function appendReelCard(entry) {
    var card = document.createElement("div");
    card.className = "reel-card";
    card.dataset.id = entry.id;
    card.innerHTML =
      '<div class="reel-card-inner">' +
      (entry.category ? '<div class="random-category-label">' + escapeHtml(entry.category) + "</div>" : "") +
      "<h2>" + escapeHtml(entry.title) + "</h2>" +
      '<p class="reel-content">' + escapeHtml(entry.content) + "</p>" +
      (entry.source ? '<p class="source-line">出典：' + escapeHtml(entry.source) + "</p>" : "") +
      '<div class="reel-actions">' +
      '<button class="secondary-btn reel-map-btn">🕸️ マップで見る</button>' +
      '<button class="secondary-btn reel-edit-btn">編集</button>' +
      '<button class="danger-btn reel-delete-btn">削除</button>' +
      "</div>" +
      "</div>";
    els.reelContainer.appendChild(card);
  }

  function updateReelPosition() {
    var el = els.reelContainer;
    var total = el.children.length;
    if (total === 0) { qs("reel-position").textContent = ""; return; }
    var index = Math.min(total, Math.round(el.scrollTop / el.clientHeight) + 1);
    qs("reel-position").textContent = index + " / " + total;
  }

  function maybeExtendReel() {
    var el = els.reelContainer;
    updateReelPosition();
    if (!state.reelPool || state.reelPool.length === 0) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 0.5) {
      shuffle(state.reelPool).slice(0, Math.min(state.reelPool.length, 8)).forEach(appendReelCard);
    }
  }

  // ---------- Map (mind map) view ----------

  function renderMap() {
    var hasEntries = state.entries.length > 0;
    qs("map-empty").classList.toggle("hidden", hasEntries);
    els.mapSvg.classList.toggle("hidden", !hasEntries);
    qs("map-actions").classList.toggle("hidden", !hasEntries);
    if (!hasEntries) { qs("map-crumbs").innerHTML = ""; return; }

    if (!state.mapCenterId || !getEntryById(state.mapCenterId)) {
      var withLinks = state.entries.find(function (e) { return e.links && e.links.length > 0; });
      state.mapCenterId = (withLinks || state.entries[0]).id;
      state.mapHistory = [];
    }
    var center = getEntryById(state.mapCenterId);
    var linked = (center.links || []).map(getEntryById).filter(Boolean).slice(0, 8);

    qs("map-crumbs").innerHTML = state.mapHistory.concat([state.mapCenterId]).map(function (id, i, arr) {
      var e = getEntryById(id);
      if (!e) return "";
      var isLast = i === arr.length - 1;
      return '<button class="chip ' + (isLast ? "active" : "") + '" data-crumb-index="' + i + '">' +
        escapeHtml(truncate(e.title, 10)) + "</button>";
    }).join("");

    qs("map-node-empty-note").classList.toggle("hidden", linked.length > 0);

    var NS = "http://www.w3.org/2000/svg";
    var svg = els.mapSvg;
    svg.innerHTML = "";
    var cx = 160, cy = 160, ringR = 118, centerR = 42, nodeR = 32;

    linked.forEach(function (node, i) {
      var angle = (2 * Math.PI * i / linked.length) - Math.PI / 2;
      var x = cx + ringR * Math.cos(angle);
      var y = cy + ringR * Math.sin(angle);
      var line = document.createElementNS(NS, "line");
      line.setAttribute("class", "map-line");
      line.setAttribute("x1", cx); line.setAttribute("y1", cy);
      line.setAttribute("x2", x); line.setAttribute("y2", y);
      svg.appendChild(line);
    });

    linked.forEach(function (node, i) {
      var angle = (2 * Math.PI * i / linked.length) - Math.PI / 2;
      var x = cx + ringR * Math.cos(angle);
      var y = cy + ringR * Math.sin(angle);
      var g = document.createElementNS(NS, "g");
      g.setAttribute("data-id", node.id);
      var circle = document.createElementNS(NS, "circle");
      circle.setAttribute("class", "map-node-circle");
      circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", nodeR);
      var text = makeMapLabel(NS, x, y, node.title, 5, "map-node-text");
      g.appendChild(circle);
      g.appendChild(text);
      svg.appendChild(g);
    });

    var centerG = document.createElementNS(NS, "g");
    centerG.setAttribute("data-id", center.id);
    var centerCircle = document.createElementNS(NS, "circle");
    centerCircle.setAttribute("class", "map-node-circle center");
    centerCircle.setAttribute("cx", cx); centerCircle.setAttribute("cy", cy); centerCircle.setAttribute("r", centerR);
    var centerText = makeMapLabel(NS, cx, cy, center.title, 6, "map-node-text map-center-text");
    centerG.appendChild(centerCircle);
    centerG.appendChild(centerText);
    svg.appendChild(centerG);
  }


  // ---------- Backup ----------

  function exportData() {
    var data = JSON.stringify({ exportedAt: new Date().toISOString(), entries: state.entries }, null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "zatsugaku-memo-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    qs("backup-status").textContent = "バックアップを書き出しました。";
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var incoming = Array.isArray(parsed) ? parsed : parsed.entries;
        if (!Array.isArray(incoming)) throw new Error("形式が正しくありません");
        var added = 0;
        var idMap = {};
        incoming.forEach(function (item) {
          if (!item || !item.title) return;
          var newId = uid();
          idMap[item.id] = newId;
          state.entries.push({
            id: newId,
            title: String(item.title),
            content: String(item.content || ""),
            category: String(item.category || ""),
            tags: Array.isArray(item.tags) ? item.tags : [],
            source: String(item.source || ""),
            createdAt: item.createdAt || Date.now(),
            links: Array.isArray(item.links) ? item.links.slice() : [],
            _oldLinks: Array.isArray(item.links) ? item.links.slice() : [],
          });
          added++;
        });
        // remap links that point at other imported entries in this same batch
        state.entries.forEach(function (e) {
          if (!e._oldLinks) return;
          e.links = e._oldLinks.map(function (oldId) { return idMap[oldId]; }).filter(Boolean);
          delete e._oldLinks;
        });
        saveEntries();
        renderAll();
        state.reelBuilt = false;
        qs("backup-status").textContent = added + "件のうんちくを読み込みました。";
      } catch (e) {
        qs("backup-status").textContent = "読み込みに失敗しました。ファイルを確認してください。";
      }
    };
    reader.readAsText(file);
  }

  // ---------- Events ----------

  function bindEvents() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });

    els.searchInput.addEventListener("input", function () {
      state.search = els.searchInput.value;
      renderList();
    });

    els.chipRow.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".chip");
      if (!btn) return;
      state.activeCategory = btn.dataset.cat || "";
      renderChips();
      renderList();
    });

    els.entryList.addEventListener("click", function (ev) {
      var card = ev.target.closest(".entry-card");
      if (!card) return;
      openDetail(card.dataset.id);
    });

    qs("detail-close").addEventListener("click", closeDetail);
    els.detailModal.addEventListener("click", function (ev) {
      if (ev.target === els.detailModal) closeDetail();
      var pill = ev.target.closest(".link-pill");
      if (pill) openDetail(pill.dataset.id);
    });
    qs("detail-edit").addEventListener("click", function () {
      var id = els.detailModal.dataset.id;
      closeDetail();
      startEdit(id, "list");
    });
    qs("detail-delete").addEventListener("click", function () {
      deleteEntry(els.detailModal.dataset.id);
    });
    qs("detail-set-center").addEventListener("click", function () {
      var id = els.detailModal.dataset.id;
      closeDetail();
      focusMapOn(id);
    });

    qs("entry-form").addEventListener("submit", handleFormSubmit);
    qs("form-cancel").addEventListener("click", function () {
      var returnView = state.formReturnView || "list";
      resetForm();
      switchView(returnView);
    });
    qs("field-link-search").addEventListener("input", renderLinkPicker);
    qs("link-picker").addEventListener("change", function (ev) {
      var box = ev.target.closest("input[type=checkbox]");
      if (!box) return;
      if (box.checked) state.formLinkSelection.add(box.dataset.linkId);
      else state.formLinkSelection.delete(box.dataset.linkId);
    });

    qs("export-btn").addEventListener("click", exportData);
    qs("import-input").addEventListener("change", function (ev) {
      var file = ev.target.files[0];
      if (file) importData(file);
      ev.target.value = "";
    });

    // Reel
    qs("reel-shuffle").addEventListener("click", function () { buildReel(true); });
    qs("reel-category").addEventListener("change", function () { buildReel(true); });
    els.reelContainer.addEventListener("scroll", maybeExtendReel);
    els.reelContainer.addEventListener("click", function (ev) {
      var card = ev.target.closest(".reel-card");
      if (!card) return;
      var id = card.dataset.id;
      if (ev.target.closest(".reel-edit-btn")) startEdit(id, "reel");
      else if (ev.target.closest(".reel-delete-btn")) deleteEntry(id);
      else if (ev.target.closest(".reel-map-btn")) {
        focusMapOn(id);
      }
    });

    // Map
    els.mapSvg.addEventListener("click", function (ev) {
      var g = ev.target.closest("g[data-id]");
      if (!g) return;
      openDetail(g.dataset.id);
    });
    qs("map-crumbs").addEventListener("click", function (ev) {
      var chip = ev.target.closest(".chip");
      if (!chip) return;
      var idx = parseInt(chip.dataset.crumbIndex, 10);
      var path = state.mapHistory.concat([state.mapCenterId]);
      state.mapCenterId = path[idx];
      state.mapHistory = path.slice(0, idx);
      renderMap();
    });
    qs("map-edit-current").addEventListener("click", function () {
      if (state.mapCenterId) startEdit(state.mapCenterId, "map");
    });
  }

  function hideSplash() {
    var splash = qs("splash");
    if (!splash) return;
    splash.classList.add("hide");
    setTimeout(function () { splash.remove(); }, 450);
  }

  function init() {
    els.chipRow = qs("chip-row");
    els.entryList = qs("entry-list");
    els.listEmpty = qs("list-empty");
    els.searchInput = qs("search-input");
    els.detailModal = qs("detail-modal");
    els.reelEmpty = qs("reel-empty");
    els.reelContainer = qs("reel-container");
    els.mapSvg = qs("map-svg");
    els.app = qs("app");
    els.topbar = document.querySelector(".topbar");
    els.tabbar = document.querySelector(".tabbar");

    state.entries = loadEntries();
    seedIfEmpty();
    state.formLinkSelection = new Set();
    bindEvents();
    renderAll();

    window.addEventListener("resize", function () {
      if (!qs("view-reel").classList.contains("hidden")) layoutReelView();
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }

    var minSplash = new Promise(function (resolve) { setTimeout(resolve, 650); });
    minSplash.then(hideSplash);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
