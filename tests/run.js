/* 纯逻辑单测：不依赖微信运行时，用内存 shim 模拟 wx 存储。 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const storage = {};
global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : '';
  },
  setStorageSync(key, value) {
    storage[key] = value;
  }
};

const categories = require('../utils/categories');
const parser = require('../utils/parse');
const format = require('../utils/format');
const store = require('../utils/store');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok   ' + name);
  } catch (err) {
    failed += 1;
    console.error('  FAIL ' + name);
    console.error((err && err.stack) || err);
  }
}

const now = new Date(2026, 9, 19, 15, 30, 0, 0).getTime();
const day = 86400000;

console.log('\n[categorize]');
test('常见备注自动归类', function () {
  assert.strictEqual(categories.categorize('午饭').id, 'food');
  assert.strictEqual(categories.categorize('咖啡').id, 'food');
  assert.strictEqual(categories.categorize('打车').id, 'transport');
  assert.strictEqual(categories.categorize('地铁').id, 'transport');
  assert.strictEqual(categories.categorize('超市采购').id, 'shopping');
  assert.strictEqual(categories.categorize('电影票').id, 'fun');
  assert.strictEqual(categories.categorize('房租').id, 'home');
  assert.strictEqual(categories.categorize('买药').id, 'health');
  assert.strictEqual(categories.categorize('买书').id, 'study');
  assert.strictEqual(categories.categorize('随便写点什么').id, 'other');
});

test('长关键词优先于短关键词', function () {
  assert.strictEqual(categories.categorize('午饭').id, 'food');
  assert.strictEqual(categories.categorize('电影').id, 'fun');
});

test('summarize 汇总金额、占比与条形宽度', function () {
  const items = categories.summarize([
    { amount: 3000, category: 'food' },
    { amount: 1000, category: 'food' },
    { amount: 2000, category: 'transport' }
  ]);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].id, 'food');
  assert.strictEqual(items[0].amount, 4000);
  assert.strictEqual(items[0].pct, 67);
  assert.strictEqual(items[0].bar, 100);
  assert.strictEqual(items[0].amountText, '40.00');
  assert.strictEqual(items[1].pct, 33);
  assert.strictEqual(items[1].bar, 50);
});

console.log('\n[format]');
test('金额格式化', function () {
  assert.strictEqual(format.money(0), '0.00');
  assert.strictEqual(format.money(5), '0.05');
  assert.strictEqual(format.money(2500), '25.00');
  assert.strictEqual(format.money(123456, true), '1,234.56');
  assert.strictEqual(format.amountInput(2550), '25.5');
  assert.strictEqual(format.amountInput(2500), '25');
  assert.strictEqual(format.toCents('25.5'), 2550);
  assert.strictEqual(format.toCents('abc'), 0);
  assert.strictEqual(format.clampAmount(999999999999), 100000000);
});

test('日期键与标签', function () {
  assert.strictEqual(format.dayKey(now), '2026-10-19');
  assert.strictEqual(format.monthKey(now), '2026-10');
  assert.strictEqual(format.dayLabel(now, now), '今天');
  assert.strictEqual(format.dayLabel(now - day, now), '昨天');
  assert.strictEqual(format.dayLabel(now - 2 * day, now), '前天');
  assert.strictEqual(format.monthLabel(2026, 10), '2026年10月');
  assert.strictEqual(format.monthDay(new Date(2026, 9, 18, 12).getTime()), '10月18日');
  assert.strictEqual(format.dayKey(format.dateFromInput('2026-04-20')), '2026-04-20');
});

console.log('\n[parse]');
test('中文备注 + 金额', function () {
  const r = parser.parseLine('午饭 25', now);
  assert.strictEqual(r.amount, 2500);
  assert.strictEqual(r.category, 'food');
  assert.strictEqual(r.note, '午饭');
  assert.strictEqual(r.ts, now);
});

test('金额在前', function () {
  const r = parser.parseLine('25 午饭', now);
  assert.strictEqual(r.amount, 2500);
  assert.strictEqual(r.category, 'food');
});

test('带元字', function () {
  const r = parser.parseLine('地铁4元', now);
  assert.strictEqual(r.amount, 400);
  assert.strictEqual(r.category, 'transport');
  assert.strictEqual(r.note, '地铁');
});

test('货币符号在前', function () {
  const r = parser.parseLine('¥12.00 早餐', now);
  assert.strictEqual(r.amount, 1200);
  assert.strictEqual(r.category, 'food');
  assert.strictEqual(r.note, '早餐');
});

test('多数字取最大金额', function () {
  const r = parser.parseLine('买了2杯咖啡 36', now);
  assert.strictEqual(r.amount, 3600);
  assert.strictEqual(r.category, 'food');
  assert.strictEqual(r.note, '买了2杯咖啡');
});

test('完整日期', function () {
  const r = parser.parseLine('2026-10-02 房租 2500', now);
  assert.strictEqual(r.amount, 250000);
  assert.strictEqual(r.category, 'home');
  assert.strictEqual(r.ts, new Date(2026, 9, 2, 12).getTime());
});

test('月日日期', function () {
  const r = parser.parseLine('10月1日 火锅 128', now);
  assert.strictEqual(r.amount, 12800);
  assert.strictEqual(r.category, 'food');
  assert.strictEqual(r.ts, new Date(2026, 9, 1, 12).getTime());
});

test('昨天', function () {
  const r = parser.parseLine('昨天 电影票 45', now);
  assert.strictEqual(r.amount, 4500);
  assert.strictEqual(r.category, 'fun');
  assert.strictEqual(format.dayKey(r.ts), '2026-10-18');
});

test('千分位金额', function () {
  const r = parser.parseLine('￥1,280.50 机票', now);
  assert.strictEqual(r.amount, 128050);
  assert.strictEqual(r.category, 'transport');
});

test('没有金额返回 null', function () {
  assert.strictEqual(parser.parseLine('加班', now), null);
  assert.strictEqual(parser.parseLine('', now), null);
});

test('多行与分号批量解析', function () {
  const list = parser.parseLines('午饭 25\n打车 18;咖啡 12', now);
  assert.strictEqual(list.length, 3);
  assert.deepStrictEqual(
    list.map(function (item) {
      return item.amount;
    }),
    [2500, 1800, 1200]
  );
});

test('逗号分隔多笔', function () {
  const list = parser.parseLines('午饭27.5，奶茶7.5', now);
  assert.strictEqual(list.length, 2);
  assert.deepStrictEqual(
    list.map(function (item) {
      return item.amount;
    }),
    [2750, 750]
  );
  assert.deepStrictEqual(
    list.map(function (item) {
      return item.note;
    }),
    ['午饭', '奶茶']
  );
  assert.strictEqual(list[0].category, 'food');
  assert.strictEqual(list[1].category, 'food');
});

test('备注里的逗号不误拆', function () {
  const list = parser.parseLines('午饭，奶茶 27.5', now);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].amount, 2750);
  assert.strictEqual(list[0].note, '午饭 奶茶');
});

test('千分位金额不误拆', function () {
  const list = parser.parseLines('1,280.50 机票，住宿 300', now);
  assert.strictEqual(list.length, 2);
  assert.deepStrictEqual(
    list.map(function (item) {
      return item.amount;
    }),
    [128050, 30000]
  );
});

test('日期应用到逗号多笔', function () {
  const list = parser.parseLines('2026-10-19 午饭 25，打车 18', now);
  assert.strictEqual(list.length, 2);
  const ts = new Date(2026, 9, 19, 12).getTime();
  assert.strictEqual(list[0].ts, ts);
  assert.strictEqual(list[1].ts, ts);
  assert.strictEqual(list[0].category, 'food');
  assert.strictEqual(list[1].category, 'transport');
});

test('单独一行日期作为后续记录日期', function () {
  const list = parser.parseLines('2026-10-18\n午饭 25\n地铁 4', now);
  assert.strictEqual(list.length, 2);
  const ts = new Date(2026, 9, 18, 12).getTime();
  assert.strictEqual(list[0].ts, ts);
  assert.strictEqual(list[1].ts, ts);
});

test('点分日期行也能生效', function () {
  const list = parser.parseLines('2026.10.18\n午饭 25\n地铁 4', now);
  assert.strictEqual(list.length, 2);
  const ts = new Date(2026, 9, 18, 12).getTime();
  assert.strictEqual(list[0].ts, ts);
  assert.strictEqual(list[1].ts, ts);
});

test('相对日期行作为后续记录日期', function () {
  const list = parser.parseLines('昨天\n午饭 25\n打车 18', now);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(format.dayKey(list[0].ts), '2026-10-18');
  assert.strictEqual(format.dayKey(list[1].ts), '2026-10-18');
});

test('日期行可以切换', function () {
  const list = parser.parseLines('2026-10-18\n午饭 25\n2026-10-19\n打车 18', now);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].ts, new Date(2026, 9, 18, 12).getTime());
  assert.strictEqual(list[1].ts, new Date(2026, 9, 19, 12).getTime());
});

test('相对日期不会重复减一天', function () {
  const list = parser.parseLines('昨天打车28', now);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(format.dayKey(list[0].ts), '2026-10-18');
});

test('语音指令前缀剥离', function () {
  assert.strictEqual(parser.stripCommand('记账 昨天午饭25'), '昨天午饭25');
  assert.strictEqual(parser.stripCommand('帮我记一下 昨天 打车 18'), '昨天 打车 18');
  assert.strictEqual(parser.stripCommand('请帮我记个账 打车18'), '打车18');
  assert.strictEqual(parser.stripCommand('昨天午饭25'), '昨天午饭25');
  assert.strictEqual(parser.stripCommand('午饭25呢'), '午饭25');
});

test('语音空格清理', function () {
  assert.strictEqual(parser.tidySpeech('昨 天 午 饭 25'), '昨天午饭 25');
  assert.strictEqual(parser.tidySpeech('昨天  午饭  25'), '昨天 午饭 25');
  assert.strictEqual(parser.tidySpeech(' 昨天午饭25 '), '昨天午饭25');
});

test('中文数字金额', function () {
  assert.strictEqual(parser.parseLine('十块钱', now).amount, 1000);
  assert.strictEqual(parser.parseLine('一百二十块', now).amount, 12000);
  const r = parser.parseLine('五十元 打车', now);
  assert.strictEqual(r.amount, 5000);
  assert.strictEqual(r.category, 'transport');
});

test('句子中间或结尾的日期词', function () {
  const r = parser.parseLine('花费了十块钱今天', now);
  assert.strictEqual(r.amount, 1000);
  assert.strictEqual(format.dayKey(r.ts), '2026-10-19');
  const r2 = parser.parseLine('昨天买菜花了15块', now);
  assert.strictEqual(r2.amount, 1500);
  assert.strictEqual(format.dayKey(r2.ts), '2026-10-18');
});

test('十几这类模糊说法', function () {
  const r = parser.parseLine('又花了十几块钱使用这个AI', now);
  assert.strictEqual(r.amount, 1000);
  const r2 = parser.parseLine('昨天使用de p花了十块钱，好贵啊。', now);
  assert.strictEqual(r2.amount, 1000);
  assert.strictEqual(format.dayKey(r2.ts), '2026-10-18');
});

test('收入识别', function () {
  const r1 = parser.parseLine('收到红包50', now);
  assert.strictEqual(r1.type, 'income');
  assert.strictEqual(r1.category, 'redpack');
  assert.strictEqual(r1.amount, 5000);
  const r2 = parser.parseLine('工资8000', now);
  assert.strictEqual(r2.type, 'income');
  assert.strictEqual(r2.category, 'salary');
  const r3 = parser.parseLine('给别人转账50', now);
  assert.strictEqual(r3.type, 'expense');
  const r4 = parser.parseLine('发红包50', now);
  assert.strictEqual(r4.type, 'expense');
});

test('同一句里混合收入与支出', function () {
  const list = parser.parseLines('收到红包50然后午饭花了25', now);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].type, 'income');
  assert.strictEqual(list[0].amount, 5000);
  assert.strictEqual(list[1].type, 'expense');
  assert.strictEqual(list[1].amount, 2500);
  assert.strictEqual(list[1].category, 'food');
});

console.log('\n[store]');
test('增删改查、按日/月过滤与预算', function () {
  Object.keys(storage).forEach(function (key) {
    delete storage[key];
  });

  const t1 = new Date(2026, 9, 19, 12).getTime();
  const t2 = new Date(2026, 8, 30, 12).getTime();

  store.add({ amount: 2500, category: 'food', note: '午饭', ts: t1 });
  store.add({ amount: 1000, category: 'transport', note: '地铁', ts: t1 + 3600000 });
  store.add({ amount: 9900, category: 'shopping', note: '超市', ts: t2 });

  const all = store.listAll();
  assert.strictEqual(all.length, 3);
  assert.strictEqual(store.sum(all), 13400);
  assert.strictEqual(store.filterDay(all, t1).length, 2);
  assert.strictEqual(store.filterMonth(all, 2026, 10).length, 2);
  assert.strictEqual(store.filterMonth(all, 2026, 9).length, 1);

  const target = all[0];
  store.update(target.id, { amount: 3000 });
  assert.strictEqual(store.get(target.id).amount, 3000);

  store.remove(target.id);
  assert.strictEqual(store.listAll().length, 2);

  store.setBudget(500000);
  assert.strictEqual(store.getBudget(), 500000);
});

test('批量写入与导出', function () {
  Object.keys(storage).forEach(function (key) {
    delete storage[key];
  });
  const t = Date.now();
  const count = store.addMany([
    { amount: 100, category: 'food', note: 'a', ts: t },
    { amount: 200, category: 'food', note: 'b', ts: t + 1 }
  ]);
  assert.strictEqual(count, 2);
  assert.strictEqual(store.listAll().length, 2);

  const data = store.exportData();
  assert.strictEqual(data.records.length, 2);
  assert.ok(data.exportedAt);
  assert.doesNotThrow(function () {
    JSON.parse(JSON.stringify(data));
  });
});

test('收入与支出分开统计', function () {
  Object.keys(storage).forEach(function (key) {
    delete storage[key];
  });
  store.add({ amount: 2500, category: 'food', note: '午饭', ts: now });
  store.add({ amount: 800000, category: 'salary', type: 'income', note: '工资', ts: now });
  assert.strictEqual(store.sum(store.listAll()), 2500);
  assert.strictEqual(store.sumIncome(store.listAll()), 800000);
  const income = store.exportData().records.filter(function (item) {
    return item.type === 'income';
  })[0];
  assert.ok(income);
  assert.strictEqual(income.amount, 800000);
});

console.log('\n[project]');
test('app.json 页面文件齐全', function () {
  const root = path.join(__dirname, '..');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  app.pages.forEach(function (page) {
    ['js', 'json', 'wxml', 'wxss'].forEach(function (ext) {
      const file = path.join(root, page + '.' + ext);
      assert.ok(fs.existsSync(file), 'missing ' + file);
    });
  });
  app.tabBar.list.forEach(function (item) {
    assert.ok(fs.existsSync(path.join(root, item.iconPath)), 'missing ' + item.iconPath);
    assert.ok(fs.existsSync(path.join(root, item.selectedIconPath)), 'missing ' + item.selectedIconPath);
  });
});

test('WXML 事件处理函数都存在', function () {
  const root = path.join(__dirname, '..');
  ['index', 'add', 'list', 'import', 'settings'].forEach(function (page) {
    const wxml = fs.readFileSync(path.join(root, 'pages', page, page + '.wxml'), 'utf8');
    const js = fs.readFileSync(path.join(root, 'pages', page, page + '.js'), 'utf8');
    const handlers = {};
    wxml.replace(/\b(?:bind|catch)([a-z]+)="([A-Za-z0-9_]+)"/g, function (match, evt, name) {
      handlers[name] = true;
      return match;
    });
    Object.keys(handlers).forEach(function (name) {
      const pattern = new RegExp('\\b' + name + '\\s*\\(');
      assert.ok(pattern.test(js), page + '.wxml 引用了不存在的方法: ' + name);
    });
  });
});

test('换肤皮肤资源齐全', function () {
  const skins = require('../utils/skins');
  const root = path.join(__dirname, '..');
  skins.list().forEach(function (item) {
    assert.ok(fs.existsSync(path.join(root, item.src.replace(/^\//, ''))), 'missing ' + item.src);
  });
});

test('所有 JSON 文件可解析', function () {
  const root = path.join(__dirname, '..');
  const files = [
    'app.json',
    'project.config.json',
    'sitemap.json',
    'pages/index/index.json',
    'pages/add/add.json',
    'pages/list/list.json',
    'pages/import/import.json',
    'pages/settings/settings.json'
  ];
  files.forEach(function (file) {
    assert.doesNotThrow(function () {
      JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    }, file);
  });
});

console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项\n');
process.exitCode = failed ? 1 : 0;
