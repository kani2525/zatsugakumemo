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
  };

  var els = {};

  function qs(id) { return document.getElementById(id); }

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("読み込みに失敗しました", e);
      return [];
    }
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
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
    state.entries = samples.map(function (s, i) {
      return {
        id: uid(),
        title: s.title,
        content: s.content,
        category: s.category,
        tags: s.tags,
        source: s.source,
        createdAt: now - (samples.length - i) * 1000,
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

  function renderCategoryDatalist() {
    var categories = getCategories();
    qs("category-options").innerHTML = categories.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '"></option>';
    }).join("");
    var select = qs("random-category");
    var current = select.value;
    select.innerHTML = '<option value="">すべてのカテゴリ</option>' + categories.map(function (c) {
      return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + " (" + c.count + ")</option>";
    }).join("");
    select.value = current;
  }

  function renderAll() {
    renderTopbar();
    renderChips();
    renderList();
    renderCategoryDatalist();
    qs("backup-count").textContent = state.entries.length;
  }

  function openDetail(id) {
    var entry = state.entries.find(function (e) { return e.id === id; });
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
    els.detailModal.classList.remove("hidden");
  }

  function closeDetail() {
    els.detailModal.classList.add("hidden");
    delete els.detailModal.dataset.id;
  }

  function switchView(name) {
    ["list", "random", "form", "backup"].forEach(function (v) {
      qs("view-" + v).classList.toggle("hidden", v !== name);
    });
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
    if (name === "form" && state.editingId === null) {
      resetForm();
    }
  }

  function resetForm() {
    qs("form-heading").textContent = "うんちくを追加";
    qs("entry-form").reset();
    qs("form-cancel").classList.add("hidden");
    state.editingId = null;
  }

  function startEdit(id) {
    var entry = state.entries.find(function (e) { return e.id === id; });
    if (!entry) return;
    state.editingId = id;
    qs("form-heading").textContent = "うんちくを編集";
    qs("field-title").value = entry.title;
    qs("field-content").value = entry.content || "";
    qs("field-category").value = entry.category || "";
    qs("field-tags").value = (entry.tags || []).join(", ");
    qs("field-source").value = entry.source || "";
    qs("form-cancel").classList.remove("hidden");
    switchView("form");
  }

  function handleFormSubmit(ev) {
    ev.preventDefault();
    var title = qs("field-title").value.trim();
    if (!title) return;
    var tags = qs("field-tags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    if (state.editingId) {
      var entry = state.entries.find(function (e) { return e.id === state.editingId; });
      entry.title = title;
      entry.content = qs("field-content").value.trim();
      entry.category = qs("field-category").value.trim();
      entry.tags = tags;
      entry.source = qs("field-source").value.trim();
    } else {
      state.entries.push({
        id: uid(),
        title: title,
        content: qs("field-content").value.trim(),
        category: qs("field-category").value.trim(),
        tags: tags,
        source: qs("field-source").value.trim(),
        createdAt: Date.now(),
      });
    }
    saveEntries();
    resetForm();
    renderAll();
    switchView("list");
  }

  function deleteEntry(id) {
    if (!window.confirm("このうんちくを削除します。よろしいですか？")) return;
    state.entries = state.entries.filter(function (e) { return e.id !== id; });
    saveEntries();
    closeDetail();
    renderAll();
  }

  function pickRandom() {
    var category = qs("random-category").value;
    var pool = state.entries.filter(function (e) { return !category || e.category === category; });
    els.randomEmpty.classList.toggle("hidden", pool.length > 0);
    els.randomCard.classList.toggle("hidden", pool.length === 0);
    if (pool.length === 0) return;
    var candidate;
    if (pool.length === 1) {
      candidate = pool[0];
    } else {
      do {
        candidate = pool[Math.floor(Math.random() * pool.length)];
      } while (candidate.id === state.lastRandomId);
    }
    state.lastRandomId = candidate.id;
    qs("random-card-category").textContent = candidate.category || "";
    qs("random-card-category").classList.toggle("hidden", !candidate.category);
    qs("random-card-title").textContent = candidate.title;
    qs("random-card-content").textContent = candidate.content || "";
    qs("random-card-source").textContent = candidate.source ? "出典：" + candidate.source : "";
  }

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
        incoming.forEach(function (item) {
          if (!item || !item.title) return;
          state.entries.push({
            id: uid(),
            title: String(item.title),
            content: String(item.content || ""),
            category: String(item.category || ""),
            tags: Array.isArray(item.tags) ? item.tags : [],
            source: String(item.source || ""),
            createdAt: item.createdAt || Date.now(),
          });
          added++;
        });
        saveEntries();
        renderAll();
        qs("backup-status").textContent = added + "件のうんちくを読み込みました。";
      } catch (e) {
        qs("backup-status").textContent = "読み込みに失敗しました。ファイルを確認してください。";
      }
    };
    reader.readAsText(file);
  }

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
    });
    qs("detail-edit").addEventListener("click", function () {
      var id = els.detailModal.dataset.id;
      closeDetail();
      startEdit(id);
    });
    qs("detail-delete").addEventListener("click", function () {
      deleteEntry(els.detailModal.dataset.id);
    });

    qs("entry-form").addEventListener("submit", handleFormSubmit);
    qs("form-cancel").addEventListener("click", function () {
      resetForm();
      switchView("list");
    });

    qs("random-shuffle").addEventListener("click", pickRandom);
    qs("random-category").addEventListener("change", pickRandom);

    qs("export-btn").addEventListener("click", exportData);
    qs("import-input").addEventListener("change", function (ev) {
      var file = ev.target.files[0];
      if (file) importData(file);
      ev.target.value = "";
    });
  }

  function init() {
    els.chipRow = qs("chip-row");
    els.entryList = qs("entry-list");
    els.listEmpty = qs("list-empty");
    els.searchInput = qs("search-input");
    els.detailModal = qs("detail-modal");
    els.randomEmpty = qs("random-empty");
    els.randomCard = qs("random-card");

    state.entries = loadEntries();
    seedIfEmpty();
    bindEvents();
    renderAll();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
