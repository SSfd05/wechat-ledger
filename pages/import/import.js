const store = require('../../utils/store');
const categories = require('../../utils/categories');
const format = require('../../utils/format');
const parser = require('../../utils/parse');

Page({
  data: {
    text: '',
    items: [],
    totalText: '0.00',
    incomeText: '0.00',
    count: 0
  },

  onLoad() {
    const app = getApp();
    const pending = app.globalData.importText;
    if (pending) {
      app.globalData.importText = '';
      this.setData({ text: pending });
      this.doParse(pending, true);
    }
  },

  onInput(e) {
    this.setData({ text: e.detail.value });
  },

  fillSample() {
    this.setData({
      text: '2026-10-18\n午饭 25\n地铁 4\n咖啡 18.5\n超市 102.4'
    });
  },

  parse() {
    this.doParse(this.data.text, false);
  },

  scanBill() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success(res) {
        const file = res && res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        wx.showLoading({ title: '识别中…' });
        wx.cloud.uploadFile({
          cloudPath: 'ocr-bill/' + Date.now() + '.jpg',
          filePath: file.tempFilePath,
          success(up) {
            wx.cloud.callFunction({
              name: 'voice',
              data: { action: 'ocr', fileID: up.fileID },
              success(call) {
                wx.hideLoading();
                const result = (call && call.result) || {};
                if (result.ok && result.text) {
                  that.setData({ text: result.text });
                  that.doParse(result.text, false);
                } else {
                  wx.showToast({ title: '识别失败：' + (result.error || '未知错误'), icon: 'none' });
                }
              },
              fail() {
                wx.hideLoading();
                wx.showToast({ title: '云函数调用失败', icon: 'none' });
              }
            });
          },
          fail() {
            wx.hideLoading();
            wx.showToast({ title: '上传失败', icon: 'none' });
          }
        });
      }
    });
  },

  doParse(text, silent) {
    const list = parser.parseLines(text);
    if (!list.length) {
      this.setData({ items: [], totalText: '0.00', count: 0 });
      if (!silent) {
        wx.showToast({ title: '没有识别到金额', icon: 'none' });
      }
      return;
    }

    const items = list.map(function (record) {
      const category = categories.get(record.category);
      const isIncome = record.type === 'income';
      return {
        key: store.newId(),
        amount: record.amount,
        note: record.note,
        category: record.category,
        type: isIncome ? 'income' : 'expense',
        ts: record.ts,
        categoryName: category.name,
        icon: category.icon,
        color: category.color,
        soft: category.soft,
        amountText: format.money(record.amount),
        signedAmountText: (isIncome ? '+' : '-') + '¥' + format.money(record.amount),
        amountClass: isIncome ? 'income' : 'expense',
        dateText: format.monthDay(record.ts)
      };
    });

    const total = items.reduce(function (sum, item) {
      return item.type === 'income' ? sum : sum + item.amount;
    }, 0);
    const income = items.reduce(function (sum, item) {
      return item.type === 'income' ? sum + item.amount : sum;
    }, 0);

    this.setData({
      items: items,
      totalText: format.money(total),
      incomeText: format.money(income),
      count: items.length
    });
  },

  removeItem(e) {
    const key = e.currentTarget.dataset.key;
    const items = this.data.items.filter(function (item) {
      return item.key !== key;
    });
    const total = items.reduce(function (sum, item) {
      return item.type === 'income' ? sum : sum + item.amount;
    }, 0);
    const income = items.reduce(function (sum, item) {
      return item.type === 'income' ? sum + item.amount : sum;
    }, 0);
    this.setData({
      items: items,
      totalText: format.money(total),
      incomeText: format.money(income),
      count: items.length
    });
  },

  saveAll() {
    if (!this.data.items.length) {
      wx.showToast({ title: '还没有可导入的记录', icon: 'none' });
      return;
    }

    const records = this.data.items.map(function (item) {
      return {
        id: store.newId(),
        amount: item.amount,
        note: item.note,
        category: item.category,
        type: item.type === 'income' ? 'income' : 'expense',
        ts: item.ts,
        createdAt: Date.now()
      };
    });

    store.addMany(records);
    getApp().globalData.focusTs = records.reduce(function (max, record) {
      return Math.max(max, record.ts);
    }, 0);
    wx.showToast({ title: '已导入 ' + records.length + ' 笔', icon: 'success' });

    setTimeout(function () {
      wx.switchTab({ url: '/pages/index/index' });
    }, 600);
  }
});
