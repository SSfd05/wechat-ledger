const format = require('./format');

const LIST = [
  {
    id: 'food',
    name: '餐饮',
    icon: '🍜',
    color: '#e8663d',
    soft: 'rgba(232, 102, 61, 0.12)',
    keywords: ['早餐', '午饭', '午餐', '晚饭', '晚餐', '夜宵', '外卖', '咖啡', '奶茶', '火锅', '烧烤', '食堂', '餐厅', '饭店', '面馆', '零食', '水果', '蛋糕', '麦当劳', '肯德基', '星巴克', '瑞幸', '蜜雪', '吃的', '饭', '餐']
  },
  {
    id: 'transport',
    name: '交通',
    icon: '🚇',
    color: '#3b82f6',
    soft: 'rgba(59, 130, 246, 0.12)',
    keywords: ['地铁', '公交', '打车', '滴滴', '出租车', '网约车', '高铁', '火车', '机票', '飞机', '停车', '加油', '共享单车', '哈啰', '青桔', '车费', '路费', '通勤']
  },
  {
    id: 'shopping',
    name: '购物',
    icon: '🛍️',
    color: '#8b5cf6',
    soft: 'rgba(139, 92, 246, 0.12)',
    keywords: ['淘宝', '天猫', '京东', '拼多多', '超市', '商场', '衣服', '裤子', '鞋', '包', '化妆品', '护肤', '日用品', '网购', '快递', '盒马', '山姆', '便利店', '宜家', '数码']
  },
  {
    id: 'fun',
    name: '娱乐',
    icon: '🎬',
    color: '#ec4899',
    soft: 'rgba(236, 72, 153, 0.12)',
    keywords: ['电影', '游戏', 'ktv', '演唱会', '门票', '会员', '视频', '音乐', '桌游', '剧本杀', '健身', '游泳', '旅游', '景点', '酒吧', '展览']
  },
  {
    id: 'home',
    name: '居住',
    icon: '🏠',
    color: '#0ea5e9',
    soft: 'rgba(14, 165, 233, 0.12)',
    keywords: ['房租', '房贷', '水费', '电费', '燃气', '物业', '宽带', '话费', '流量', '家政', '维修', '家具', '家电', '保洁']
  },
  {
    id: 'health',
    name: '医疗',
    icon: '💊',
    color: '#10b981',
    soft: 'rgba(16, 185, 129, 0.12)',
    keywords: ['医院', '药店', '买药', '挂号', '体检', '牙医', '诊所', '医保', '看病', '疫苗', '保健品']
  },
  {
    id: 'study',
    name: '学习',
    icon: '📚',
    color: '#f59e0b',
    soft: 'rgba(245, 158, 11, 0.12)',
    keywords: ['买书', '书店', '课程', '培训', '学费', '考试', '文具', '打印', '网课', '订阅', '知识付费', '书']
  },
  {
    id: 'other',
    name: '其他',
    icon: '📦',
    color: '#64748b',
    soft: 'rgba(100, 116, 139, 0.12)',
    keywords: []
  }
];

const INCOME = [
  {
    id: 'salary',
    name: '工资',
    icon: '💼',
    color: '#3b82f6',
    soft: 'rgba(59, 130, 246, 0.12)',
    keywords: ['工资', '薪水', '底薪', '奖金', '加班费', '工资条']
  },
  {
    id: 'redpack',
    name: '红包',
    icon: '🧧',
    color: '#e8663d',
    soft: 'rgba(232, 102, 61, 0.12)',
    keywords: ['红包', '压岁钱', '礼金']
  },
  {
    id: 'transfer',
    name: '转账',
    icon: '💸',
    color: '#10b981',
    soft: 'rgba(16, 185, 129, 0.12)',
    keywords: ['转账', '进账', '到账', '打钱', '给我转', '转给我', '收入']
  },
  {
    id: 'refund',
    name: '退款',
    icon: '↩️',
    color: '#f59e0b',
    soft: 'rgba(245, 158, 11, 0.12)',
    keywords: ['退款', '退钱', '报销', '返现', '退回']
  },
  {
    id: 'other-income',
    name: '其他',
    icon: '💰',
    color: '#64748b',
    soft: 'rgba(100, 116, 139, 0.12)',
    keywords: []
  }
];

const MAP = {};
LIST.forEach(function (item) {
  MAP[item.id] = item;
});
const INCOME_MAP = {};
INCOME.forEach(function (item) {
  INCOME_MAP[item.id] = item;
});

function get(id) {
  return MAP[id] || INCOME_MAP[id] || MAP.other;
}

function categorize(note, type) {
  const list = type === 'income' ? INCOME : LIST;
  const fallback = type === 'income' ? 'other-income' : 'other';
  const text = String(note || '').toLowerCase();
  if (!text) return { id: fallback, score: 0 };

  let bestId = fallback;
  let bestScore = 0;

  list.forEach(function (category) {
    category.keywords.forEach(function (keyword) {
      const key = keyword.toLowerCase();
      const index = text.indexOf(key);
      if (index < 0) return;
      let score = key.length * 2 + (index === 0 ? 1 : 0);
      if (key === text) score += 3;
      if (score > bestScore) {
        bestScore = score;
        bestId = category.id;
      }
    });
  });

  return { id: bestId, score: bestScore };
}

function summarize(records) {
  const expenses = records.filter(function (record) {
    return record.type !== 'income';
  });
  const total = expenses.reduce(function (sum, record) {
    return sum + record.amount;
  }, 0);

  const buckets = {};
  expenses.forEach(function (record) {
    const id = MAP[record.category] ? record.category : 'other';
    buckets[id] = (buckets[id] || 0) + record.amount;
  });

  const items = Object.keys(buckets).map(function (id) {
    const category = get(id);
    return {
      id: id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      soft: category.soft,
      amount: buckets[id],
      pct: total > 0 ? Math.round((buckets[id] / total) * 100) : 0
    };
  });

  items.sort(function (a, b) {
    return b.amount - a.amount;
  });

  const max = items.length ? items[0].amount : 0;
  items.forEach(function (item) {
    item.bar = max > 0 ? Math.max(4, Math.round((item.amount / max) * 100)) : 0;
    item.amountText = format.money(item.amount);
  });

  return items;
}

function view(record, nowTs) {
  const category = get(record.category);
  const type = record.type === 'income' ? 'income' : 'expense';
  return {
    id: record.id,
    amount: record.amount,
    category: record.category,
    type: type,
    note: record.note,
    ts: record.ts,
    categoryName: category.name,
    icon: category.icon,
    color: category.color,
    soft: category.soft,
    amountText: format.money(record.amount),
    signedAmountText: (type === 'income' ? '+' : '-') + '¥' + format.money(record.amount),
    amountClass: type,
    dayKey: format.dayKey(record.ts),
    timeText: format.timeText(record.ts),
    dateText: format.dayLabel(record.ts, nowTs)
  };
}

module.exports = {
  LIST: LIST,
  INCOME: INCOME,
  get: get,
  categorize: categorize,
  summarize: summarize,
  view: view
};
