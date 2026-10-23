const format = require('./format');

const RECORDS_KEY = 'ledger.records.v1';
const BUDGET_KEY = 'ledger.budget.v1';
const MAX_AMOUNT = 100000000;

function read(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    if (value === '' || value === undefined || value === null) return fallback;
    return value;
  } catch (err) {
    return fallback;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (err) {
    /* storage may be unavailable */
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalize(record) {
  const amount = Math.min(MAX_AMOUNT, Math.max(0, Math.round(Number(record.amount) || 0)));
  const ts = Number(record.ts) || Date.now();
  return {
    id: record.id || newId(),
    amount: amount,
    category: record.category || 'other',
    type: record.type === 'income' ? 'income' : 'expense',
    note: String(record.note || '').slice(0, 60),
    ts: ts,
    createdAt: Number(record.createdAt) || Date.now()
  };
}

function sortDesc(list) {
  return list.sort(function (a, b) {
    return b.ts - a.ts;
  });
}

function listAll() {
  const saved = read(RECORDS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return sortDesc(
    saved
      .filter(function (item) {
        return item && isFinite(item.amount) && isFinite(item.ts);
      })
      .map(normalize)
  );
}

function saveAll(list) {
  write(RECORDS_KEY, sortDesc(list));
}

function add(record) {
  const list = listAll();
  const next = normalize(record);
  list.push(next);
  saveAll(list);
  return next;
}

function addMany(records) {
  const list = listAll();
  records.forEach(function (record) {
    list.push(normalize(record));
  });
  saveAll(list);
  return records.length;
}

function get(id) {
  return listAll().filter(function (item) {
    return item.id === id;
  })[0] || null;
}

function update(id, patch) {
  const list = listAll().map(function (item) {
    if (item.id !== id) return item;
    return normalize(Object.assign({}, item, patch, { id: id }));
  });
  saveAll(list);
}

function remove(id) {
  saveAll(
    listAll().filter(function (item) {
      return item.id !== id;
    })
  );
}

function sum(list) {
  return list.reduce(function (total, item) {
    return item.type === 'income' ? total : total + item.amount;
  }, 0);
}

function sumIncome(list) {
  return list.reduce(function (total, item) {
    return item.type === 'income' ? total + item.amount : total;
  }, 0);
}

function filterDay(list, ts) {
  const key = format.dayKey(ts);
  return list.filter(function (item) {
    return format.dayKey(item.ts) === key;
  });
}

function filterMonth(list, year, month) {
  return list.filter(function (item) {
    const d = new Date(item.ts);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

function getBudget() {
  const value = Number(read(BUDGET_KEY, 0));
  return isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function setBudget(cents) {
  write(BUDGET_KEY, Math.max(0, Math.round(Number(cents) || 0)));
}

function clearRecords() {
  write(RECORDS_KEY, []);
}

function exportData() {
  return {
    app: '拾光账本本',
    version: 1,
    exportedAt: new Date().toISOString(),
    budget: getBudget(),
    records: listAll()
  };
}

module.exports = {
  RECORDS_KEY: RECORDS_KEY,
  BUDGET_KEY: BUDGET_KEY,
  newId: newId,
  listAll: listAll,
  add: add,
  addMany: addMany,
  get: get,
  update: update,
  remove: remove,
  sum: sum,
  sumIncome: sumIncome,
  filterDay: filterDay,
  filterMonth: filterMonth,
  getBudget: getBudget,
  setBudget: setBudget,
  clearRecords: clearRecords,
  exportData: exportData
};
