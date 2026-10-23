const store = require('../../utils/store');
const categories = require('../../utils/categories');
const format = require('../../utils/format');
const parser = require('../../utils/parse');

Page({
  data: {
    categoryList: categories.LIST,
    recordType: 'expense',
    amount: '',
    note: '',
    categoryId: 'other',
    categoryTouched: false,
    autoTip: '',
    date: '',
    dateLabel: '今天',
    today: '',
    editingId: '',
    isMulti: false,
    multiItems: [],
    multiTotalText: ''
  },

  onLoad(options) {
    const today = format.dateInput(Date.now());
    let date = today;
    let dateLabel = '今天';

    // 从明细页进入时，默认记到正在浏览的那个月；允许未来日期
    const requested = options && options.date ? format.dateFromInput(options.date) : 0;
    if (requested) {
      date = format.dayKey(requested);
      dateLabel = format.dayLabel(requested);
    }

    this.setData({ date: date, dateLabel: dateLabel, today: today });

    if (options && options.id) {
      const record = store.get(options.id);
      if (!record) return;
      const type = record.type === 'income' ? 'income' : 'expense';
      this.originalTs = record.ts;
      this.setData({
        editingId: record.id,
        recordType: type,
        categoryList: type === 'income' ? categories.INCOME : categories.LIST,
        amount: format.amountInput(record.amount),
        note: record.note,
        categoryId: record.category,
        categoryTouched: true,
        date: format.dayKey(record.ts),
        dateLabel: format.dayLabel(record.ts)
      });
      wx.setNavigationBarTitle({ title: '编辑记录' });
    }
  },

  setType(e) {
    const type = e.currentTarget.dataset.type === 'income' ? 'income' : 'expense';
    if (type === this.data.recordType) return;
    this.setData({
      recordType: type,
      categoryList: type === 'income' ? categories.INCOME : categories.LIST,
      categoryId: type === 'income' ? 'other-income' : 'other',
      categoryTouched: false,
      autoTip: '',
      isMulti: false,
      multiItems: [],
      multiTotalText: ''
    });
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  applyMulti(note, list) {
    const items = list.map(function (record, index) {
      const category = categories.get(record.category);
      return {
        key: 'multi-' + index,
        amount: record.amount,
        amountText: format.money(record.amount),
        note: record.note,
        category: record.category,
        type: record.type === 'income' ? 'income' : 'expense',
        categoryName: category.name,
        icon: category.icon,
        color: category.color,
        soft: category.soft,
        ts: record.ts
      };
    });

    const total = items.reduce(function (sum, item) {
      return sum + item.amount;
    }, 0);

    this.setData({
      note: note,
      isMulti: true,
      multiItems: items,
      multiTotalText: format.money(total),
      autoTip: '识别到 ' + items.length + ' 笔，可一次记入'
    });
  },

  onNoteInput(e) {
    const note = e.detail.value;
    const list = this.data.editingId ? [] : parser.parseLines(note);

    if (list.length > 1) {
      this.applyMulti(note, list);
      return;
    }

    this.setData({ isMulti: false, multiItems: [], multiTotalText: '' });

    const patch = { note: note, autoTip: '' };

    if (!this.data.categoryTouched && note.trim()) {
      const result = categories.categorize(note, this.data.recordType);
      patch.categoryId = result.id;
      if (result.id !== (this.data.recordType === 'income' ? 'other-income' : 'other')) {
        patch.autoTip = '已自动归类为「' + categories.get(result.id).name + '」，可手动修改';
      }
    }

    this.setData(patch);
  },

  onNoteBlur(e) {
    const note = String(e.detail.value || '').trim();
    const list = this.data.editingId ? [] : parser.parseLines(note);

    if (list.length > 1) {
      this.applyMulti(note, list);
      return;
    }

    this.setData({ isMulti: false, multiItems: [], multiTotalText: '' });

    if (!note || this.data.amount) return;

    const parsed = list[0] || parser.parseLine(note);
    if (!parsed) return;

    const patch = {
      amount: format.amountInput(parsed.amount),
      note: parsed.note,
      autoTip: '已从备注中识别金额 ¥' + format.money(parsed.amount)
    };
    if (!this.data.editingId && parsed.type === 'income' && this.data.recordType !== 'income') {
      patch.recordType = 'income';
      patch.categoryList = categories.INCOME;
      patch.categoryTouched = false;
    } else if (!this.data.editingId && parsed.type !== 'income' && this.data.recordType === 'income') {
      patch.recordType = 'expense';
      patch.categoryList = categories.LIST;
      patch.categoryTouched = false;
    }
    if (!this.data.categoryTouched) {
      patch.categoryId = parsed.category;
    }
    this.setData(patch);
  },

  pickCategory(e) {
    this.setData({
      categoryId: e.currentTarget.dataset.id,
      categoryTouched: true,
      autoTip: ''
    });
  },

  onDateChange(e) {
    const value = e.detail.value;
    const ts = format.dateFromInput(value);
    this.setData({
      date: value,
      dateLabel: ts ? format.dayLabel(ts) : '今天'
    });
  },

  computeTs() {
    const today = format.dateInput(Date.now());
    if (this.data.editingId && this.originalTs && format.dayKey(this.originalTs) === this.data.date) {
      return this.originalTs;
    }
    if (this.data.date === today) return Date.now();
    return format.dateFromInput(this.data.date) || Date.now();
  },

  save() {
    if (this.data.isMulti) {
      this.saveMulti();
      return;
    }

    const cents = format.clampAmount(format.toCents(this.data.amount));
    if (!cents) {
      wx.showToast({ title: '请输入正确的金额', icon: 'none' });
      return;
    }

    const recordType = this.data.recordType === 'income' ? 'income' : 'expense';
    const categoryId = this.data.categoryId || (recordType === 'income' ? 'other-income' : 'other');
    const note = String(this.data.note || '').trim() || (recordType === 'income' ? '收入' : '未备注');
    const payload = {
      amount: cents,
      category: categoryId,
      type: recordType,
      note: note,
      ts: this.computeTs()
    };

    getApp().globalData.focusTs = payload.ts;

    if (this.data.editingId) {
      store.update(this.data.editingId, payload);
      wx.showToast({ title: '已保存 ' + format.monthDay(payload.ts), icon: 'none' });
    } else {
      payload.id = store.newId();
      store.add(payload);
      wx.showToast({ title: '已记入 ' + format.monthDay(payload.ts), icon: 'none' });
    }

    setTimeout(function () {
      wx.navigateBack({
        delta: 1,
        fail: function () {
          wx.switchTab({ url: '/pages/index/index' });
        }
      });
    }, 450);
  },

  saveMulti() {
    const items = this.data.multiItems || [];
    if (items.length < 2) {
      wx.showToast({ title: '没有可记入的明细', icon: 'none' });
      return;
    }

    const now = Date.now();
    const records = items.map(function (item) {
      return {
        id: store.newId(),
        amount: item.amount,
        category: item.category,
        type: item.type === 'income' ? 'income' : 'expense',
        note: item.note,
        ts: item.ts || now,
        createdAt: now
      };
    });

    store.addMany(records);
    getApp().globalData.focusTs = records.reduce(function (max, record) {
      return Math.max(max, record.ts);
    }, 0);
    wx.showToast({ title: '已记入 ' + records.length + ' 笔', icon: 'success' });

    setTimeout(function () {
      wx.navigateBack({
        delta: 1,
        fail: function () {
          wx.switchTab({ url: '/pages/index/index' });
        }
      });
    }, 500);
  },

  readClipboard() {
    const that = this;
    wx.getClipboardData({
      success(res) {
        const text = String(res.data || '').trim();
        if (!text) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' });
          return;
        }

        const list = parser.parseLines(text);
        if (!list.length) {
          wx.showToast({ title: '没有识别到金额', icon: 'none' });
          return;
        }

        if (list.length > 1) {
          if (that.data.editingId) {
            wx.showToast({ title: '编辑模式只能保存一笔', icon: 'none' });
            return;
          }
          // 单行短文本直接在记账页展示多笔；多行/长文本走批量导入页
          if (!/[\r\n]/.test(text) && text.length <= 120) {
            that.applyMulti(text, list);
            wx.showToast({ title: '识别到 ' + list.length + ' 笔', icon: 'none' });
            return;
          }
          getApp().globalData.importText = text;
          wx.navigateTo({ url: '/pages/import/import' });
          return;
        }

        const parsed = list[0];
        const patch = {
          amount: format.amountInput(parsed.amount),
          note: parsed.note,
          date: format.dayKey(parsed.ts),
          dateLabel: format.dayLabel(parsed.ts),
          autoTip: '已从剪贴板识别',
          categoryTouched: true,
          isMulti: false,
          multiItems: [],
          multiTotalText: ''
        };
        if (!that.data.editingId) {
          const type = parsed.type === 'income' ? 'income' : 'expense';
          patch.recordType = type;
          patch.categoryList = type === 'income' ? categories.INCOME : categories.LIST;
          patch.categoryId = parsed.category;
        }
        that.setData(patch);
      },
      fail() {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      }
    });
  },

  goImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  }
});
