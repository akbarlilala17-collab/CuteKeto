/* ============================================================
   storage.js — all persistence lives here (localStorage).
   Nothing else in the app touches localStorage directly, so
   swapping to IndexedDB or a backend later means editing
   only this file.
   ============================================================ */

const Store = {
  KEYS: {
    foods: 'keto.foods',
    log: 'keto.log',        // { "YYYY-MM-DD": [entries...] }
    settings: 'keto.settings',
  },

  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Failed to read', key, e);
      return fallback;
    }
  },

  _write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  /* ---------- Foods ---------- */
  getFoods() {
    let foods = this._read(this.KEYS.foods, null);
    if (!foods) {
      // First run: seed database from the Excel-derived defaults
      foods = DEFAULT_FOODS.slice();
      this._write(this.KEYS.foods, foods);
    }
    return foods;
  },

  saveFoods(foods) {
    this._write(this.KEYS.foods, foods);
  },

  resetFoodsToDefault() {
    this._write(this.KEYS.foods, DEFAULT_FOODS.slice());
  },

  /* ---------- Daily log ---------- */
  getLog() {
    return this._read(this.KEYS.log, {});
  },

  getDay(dateKey) {
    return this.getLog()[dateKey] || [];
  },

  saveDay(dateKey, entries) {
    const log = this.getLog();
    if (entries.length) log[dateKey] = entries;
    else delete log[dateKey];
    this._write(this.KEYS.log, log);
  },

  /* ---------- Settings ---------- */
  getSettings() {
    return this._read(this.KEYS.settings, { calorieGoal: 2000, netCarbGoal: 20 });
  },

  saveSettings(settings) {
    this._write(this.KEYS.settings, settings);
  },

  /* ---------- Backup / restore ---------- */
  exportAll() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      foods: this.getFoods(),
      log: this.getLog(),
      settings: this.getSettings(),
    }, null, 2);
  },

  importAll(json) {
    const data = JSON.parse(json); // throws if invalid
    if (!data.foods || !data.log || !data.settings) {
      throw new Error('Not a valid Keto Tracker backup file');
    }
    this._write(this.KEYS.foods, data.foods);
    this._write(this.KEYS.log, data.log);
    this._write(this.KEYS.settings, data.settings);
  },
};
