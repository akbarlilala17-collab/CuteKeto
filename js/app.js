/* ============================================================
   app.js — UI logic for Keto Tracker
   Sections: helpers · tab nav · Today view · food picker ·
   portion sheet · Foods view · food editor · Settings
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ---------- date helpers ---------- */
function dateKey(d) {
  // local YYYY-MM-DD (not UTC, so days flip at local midnight)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmt(n, digits = 1) {
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

/* ---------- app state ---------- */
let currentDate = new Date();
let selectedFood = null;      // food chosen in picker, awaiting portion
let editingFoodId = null;     // food being edited in editor sheet
let activeCategory = 'All';   // Foods tab filter

/* ============================================================
   TAB NAVIGATION
   ============================================================ */
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    $$('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    $(`#view-${tab.dataset.view}`).classList.add('active');
    window.scrollTo(0, 0);
  });
});

/* ============================================================
   SHEETS (bottom modals)
   ============================================================ */
function openSheet(id) {
  $('#sheet-backdrop').classList.add('open');
  $(`#${id}`).classList.add('open');
}
function closeSheets() {
  $('#sheet-backdrop').classList.remove('open');
  $$('.sheet').forEach((s) => s.classList.remove('open'));
}
$('#sheet-backdrop').addEventListener('click', closeSheets);

/* ============================================================
   TODAY VIEW
   ============================================================ */
function renderToday() {
  const key = dateKey(currentDate);
  const todayKey = dateKey(new Date());
  const entries = Store.getDay(key);
  const settings = Store.getSettings();

  // Header
  const isToday = key === todayKey;
  $('#date-label').textContent = isToday
    ? 'Today'
    : currentDate.toLocaleDateString(undefined, { weekday: 'long' });
  $('#date-sub').textContent = currentDate.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  $('#btn-next-day').disabled = isToday; // can't log the future

  // Totals
  const total = { calories: 0, protein: 0, fat: 0, netCarbs: 0, fiber: 0 };
  entries.forEach((e) => {
    const f = e.grams / 100;
    total.calories += e.per100.calories * f;
    total.protein += e.per100.protein * f;
    total.fat += e.per100.fat * f;
    total.netCarbs += e.per100.netCarbs * f;
    total.fiber += e.per100.fiber * f;
  });

  // Progress bars
  const calPct = (total.calories / settings.calorieGoal) * 100;
  const carbPct = (total.netCarbs / settings.netCarbGoal) * 100;
  updateBar('#cal-fill', calPct);
  updateBar('#carb-fill', carbPct);
  $('#cal-label').textContent = `${fmt(total.calories, 0)} / ${settings.calorieGoal} kcal`;
  $('#carb-label').textContent = `${fmt(total.netCarbs)} / ${settings.netCarbGoal} g`;
  $('#sum-protein').textContent = fmt(total.protein, 0) + 'g';
  $('#sum-fat').textContent = fmt(total.fat, 0) + 'g';
  $('#sum-fiber').textContent = fmt(total.fiber, 0) + 'g';

  // Status line: green when within goals, orange when close, red when over
  const status = $('#summary-status');
  if (calPct > 100 || carbPct > 100) {
    status.className = 'summary-status over';
    status.innerHTML = '<span class="dot">✕</span> Over your goals';
  } else if (calPct > 90 || carbPct > 90) {
    status.className = 'summary-status close';
    status.innerHTML = '<span class="dot">!</span> Close to your limit';
  } else {
    status.className = 'summary-status ok';
    status.innerHTML = '<span class="dot">✓</span> On track';
  }

  // Log list
  const list = $('#log-list');
  list.innerHTML = '';
  $('#log-empty').style.display = entries.length ? 'none' : 'block';
  entries.forEach((e) => {
    const f = e.grams / 100;
    const li = document.createElement('li');
    li.className = 'log-item';
    li.innerHTML = `
      <div class="info">
        <div class="name">${esc(e.name)}${e.brand ? ` · ${esc(e.brand)}` : ''}</div>
        <div class="meta">${fmt(e.grams, 0)} g · P ${fmt(e.per100.protein * f)}g · F ${fmt(e.per100.fat * f)}g</div>
      </div>
      <div class="kcal">${fmt(e.per100.calories * f, 0)} kcal
        <small>${fmt(e.per100.netCarbs * f)}g net</small>
      </div>
      <button class="btn-x" aria-label="Remove">✕</button>`;
    li.querySelector('.btn-x').addEventListener('click', () => {
      Store.saveDay(key, Store.getDay(key).filter((x) => x.id !== e.id));
      renderToday();
    });
    list.appendChild(li);
  });
}

function updateBar(sel, pct) {
  const el = $(sel);
  el.style.width = Math.min(pct, 100) + '%';
  el.className = 'macro-bar-fill' + (pct > 100 ? ' over' : pct > 90 ? ' warn' : '');
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

$('#btn-prev-day').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() - 1);
  renderToday();
});
$('#btn-next-day').addEventListener('click', () => {
  currentDate.setDate(currentDate.getDate() + 1);
  renderToday();
});

/* ============================================================
   FOOD PICKER (search + select food to log)
   ============================================================ */
$('#btn-add-food').addEventListener('click', () => {
  $('#picker-search').value = '';
  renderPickerList('');
  openSheet('sheet-picker');
});

$('#picker-search').addEventListener('input', (e) => renderPickerList(e.target.value));

function renderPickerList(query) {
  const q = query.trim().toLowerCase();
  const foods = Store.getFoods().filter((f) =>
    !q ||
    f.name.toLowerCase().includes(q) ||
    (f.brand && f.brand.toLowerCase().includes(q)) ||
    f.category.toLowerCase().includes(q)
  );
  const list = $('#picker-list');
  list.innerHTML = '';
  foods.slice(0, 60).forEach((f) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="info">
        <div class="name">${esc(f.name)}${f.brand ? ` · ${esc(f.brand)}` : ''}</div>
        <div class="meta">${esc(f.category)} · ${fmt(f.calories, 0)} kcal · ${fmt(f.netCarbs)}g net carbs /100g</div>
      </div>
      ${ratingBadge(f.rating)}`;
    li.addEventListener('click', () => openPortionSheet(f));
    list.appendChild(li);
  });
  if (!foods.length) {
    list.innerHTML = '<p class="empty-msg">No foods match.<br>Add it in the Foods tab first.</p>';
  }
}

function ratingBadge(rating) {
  if (!rating) return '';
  const cls = rating.toLowerCase().startsWith('free') ? 'free'
    : rating.toLowerCase().startsWith('moderate') ? 'moderate' : 'portion';
  return `<span class="badge ${cls}">${esc(rating)}</span>`;
}

/* ============================================================
   PORTION SHEET
   ============================================================ */
function openPortionSheet(food) {
  selectedFood = food;
  $('#portion-food-name').textContent = food.brand ? `${food.name} · ${food.brand}` : food.name;
  $('#portion-food-note').textContent = food.notes || `Per 100 g · ${food.category}`;
  $('#portion-grams').value = 100;
  updatePortionPreview();
  closeSheets();
  openSheet('sheet-portion');
}

function updatePortionPreview() {
  if (!selectedFood) return;
  const g = parseFloat($('#portion-grams').value) || 0;
  const f = g / 100;
  $('#portion-preview').innerHTML = `
    <div><b>${fmt(selectedFood.calories * f, 0)}</b><span>kcal</span></div>
    <div><b>${fmt(selectedFood.netCarbs * f)}g</b><span>net carbs</span></div>
    <div><b>${fmt(selectedFood.protein * f)}g</b><span>protein</span></div>
    <div><b>${fmt(selectedFood.fat * f)}g</b><span>fat</span></div>`;
}

$('#portion-grams').addEventListener('input', updatePortionPreview);
$$('.quick-grams button').forEach((b) => {
  b.addEventListener('click', () => {
    $('#portion-grams').value = b.dataset.g;
    updatePortionPreview();
  });
});

$('#btn-confirm-portion').addEventListener('click', () => {
  const grams = parseFloat($('#portion-grams').value);
  if (!selectedFood || !grams || grams <= 0) return;
  const key = dateKey(currentDate);
  const entries = Store.getDay(key);
  entries.push({
    id: 'e' + Date.now(),
    name: selectedFood.name,
    brand: selectedFood.brand || '',
    grams,
    // snapshot the macros so later edits to the food DB don't rewrite history
    per100: {
      calories: selectedFood.calories,
      protein: selectedFood.protein,
      fat: selectedFood.fat,
      totalCarbs: selectedFood.totalCarbs,
      fiber: selectedFood.fiber,
      netCarbs: selectedFood.netCarbs,
    },
  });
  Store.saveDay(key, entries);
  closeSheets();
  renderToday();
});

/* ============================================================
   FOODS VIEW (database management)
   ============================================================ */
function renderCategoryChips() {
  const row = $('#chip-row');
  row.innerHTML = '';
  ['All', ...DEFAULT_CATEGORIES].forEach((cat) => {
    const b = document.createElement('button');
    b.className = 'chip' + (cat === activeCategory ? ' active' : '');
    b.textContent = cat;
    b.addEventListener('click', () => {
      activeCategory = cat;
      renderCategoryChips();
      renderFoodList();
    });
    row.appendChild(b);
  });
}

function renderFoodList() {
  const q = $('#db-search').value.trim().toLowerCase();
  const foods = Store.getFoods().filter((f) =>
    (activeCategory === 'All' || f.category === activeCategory) &&
    (!q || f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q)))
  );
  const list = $('#food-list');
  list.innerHTML = '';
  foods.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'food-item';
    li.innerHTML = `
      <div class="info">
        <div class="name">${esc(f.name)}${f.brand ? ` · ${esc(f.brand)}` : ''}</div>
        <div class="meta">${fmt(f.calories, 0)} kcal · ${fmt(f.netCarbs)}g net · P ${fmt(f.protein)}g · F ${fmt(f.fat)}g /100g</div>
      </div>
      ${f.custom ? '<span class="badge custom">Custom</span>' : ratingBadge(f.rating)}`;
    li.addEventListener('click', () => openEditor(f));
    list.appendChild(li);
  });
  if (!foods.length) {
    list.innerHTML = '<p class="empty-msg">No foods found.</p>';
  }
}

$('#db-search').addEventListener('input', renderFoodList);

/* ============================================================
   FOOD EDITOR (add / edit / delete)
   ============================================================ */
function populateCategorySelect() {
  const sel = $('#ed-category');
  sel.innerHTML = DEFAULT_CATEGORIES
    .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
    .join('');
}

function openEditor(food) {
  editingFoodId = food ? food.id : null;
  $('#editor-title').textContent = food ? 'Edit Food' : 'New Food';
  $('#btn-delete-food').hidden = !food;
  $('#ed-name').value = food ? food.name : '';
  $('#ed-brand').value = food ? food.brand || '' : '';
  $('#ed-category').value = food ? food.category : DEFAULT_CATEGORIES[0];
  $('#ed-calories').value = food ? food.calories : '';
  $('#ed-protein').value = food ? food.protein : '';
  $('#ed-fat').value = food ? food.fat : '';
  $('#ed-totalcarbs').value = food ? food.totalCarbs : '';
  $('#ed-fiber').value = food ? food.fiber : '';
  $('#ed-netcarbs').value = food ? food.netCarbs : '';
  $('#ed-notes').value = food ? food.notes || '' : '';
  openSheet('sheet-editor');
}

$('#btn-new-food').addEventListener('click', () => openEditor(null));

// Auto-fill net carbs = total carbs − fiber while typing (still editable)
['#ed-totalcarbs', '#ed-fiber'].forEach((sel) => {
  $(sel).addEventListener('input', () => {
    const total = parseFloat($('#ed-totalcarbs').value) || 0;
    const fiber = parseFloat($('#ed-fiber').value) || 0;
    $('#ed-netcarbs').value = Math.max(0, Math.round((total - fiber) * 100) / 100);
  });
});

$('#btn-save-food').addEventListener('click', () => {
  const name = $('#ed-name').value.trim();
  if (!name) { alert('Please enter a food name.'); return; }
  const num = (sel) => parseFloat($(sel).value) || 0;
  const foods = Store.getFoods();
  const data = {
    name,
    brand: $('#ed-brand').value.trim(),
    category: $('#ed-category').value,
    notes: $('#ed-notes').value.trim(),
    calories: num('#ed-calories'),
    protein: num('#ed-protein'),
    fat: num('#ed-fat'),
    totalCarbs: num('#ed-totalcarbs'),
    fiber: num('#ed-fiber'),
    netCarbs: num('#ed-netcarbs'),
  };
  if (editingFoodId) {
    const i = foods.findIndex((f) => f.id === editingFoodId);
    foods[i] = { ...foods[i], ...data };
  } else {
    foods.push({ id: 'c' + Date.now(), rating: '', custom: true, ...data });
  }
  Store.saveFoods(foods);
  closeSheets();
  renderFoodList();
});

$('#btn-delete-food').addEventListener('click', () => {
  if (!editingFoodId) return;
  if (!confirm('Delete this food from your database?')) return;
  Store.saveFoods(Store.getFoods().filter((f) => f.id !== editingFoodId));
  closeSheets();
  renderFoodList();
});

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  const s = Store.getSettings();
  $('#set-calories').value = s.calorieGoal;
  $('#set-carbs').value = s.netCarbGoal;
}

$('#btn-save-settings').addEventListener('click', () => {
  const calorieGoal = parseInt($('#set-calories').value, 10);
  const netCarbGoal = parseInt($('#set-carbs').value, 10);
  if (!calorieGoal || !netCarbGoal) { alert('Please enter valid numbers.'); return; }
  Store.saveSettings({ calorieGoal, netCarbGoal });
  renderToday();
  alert('Goals saved ✓');
});

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([Store.exportAll()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `keto-backup-${dateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#btn-import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      Store.importAll(reader.result);
      renderToday(); renderFoodList(); renderSettings();
      alert('Backup restored ✓');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('#btn-reset-db').addEventListener('click', () => {
  if (!confirm('Replace your food list with the original defaults? Custom foods will be lost (your daily logs are kept).')) return;
  Store.resetFoodsToDefault();
  renderFoodList();
});

/* ============================================================
   INIT
   ============================================================ */
populateCategorySelect();
renderCategoryChips();
renderFoodList();
renderSettings();
renderToday();
