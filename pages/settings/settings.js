const store = require('../../utils/store');
const format = require('../../utils/format');
const skins = require('../../utils/skins');

Page({
  data: {
    budget: '',
    recordCount: 0,
    days: 0,
    totalText: '0.00',
    version: '1.6.0',
    skins: [],
    skinId: 'cat'
  },

  onShow() {
    this.setData({ skins: skins.list(), skinId: skins.currentId() });
    this.refresh();
  },

  refresh() {
    const all = store.listAll();
    const days = {};
    all.forEach(function (record) {
      days[format.dayKey(record.ts)] = true;
    });

    const budget = store.getBudget();
    this.setData({
      budget: budget ? format.amountInput(budget) : '',
      recordCount: all.length,
      days: Object.keys(days).length,
      totalText: format.money(store.sum(all))
    });
  },

  onBudgetInput(e) {
    this.setData({ budget: e.detail.value });
  },

  saveBudget() {
    const cents = format.toCents(this.data.budget);
    store.setBudget(cents);
    this.setData({ budget: cents ? format.amountInput(cents) : '' });
    wx.showToast({ title: cents ? '预算已保存' : '已关闭预算', icon: 'none' });
  },

  goImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  },

  exportData() {
    const data = store.exportData();
    wx.setClipboardData({
      data: JSON.stringify(data, null, 2),
      success() {
        wx.showToast({ title: '已复制到剪贴板', icon: 'none' });
      }
    });
  },

  pickSkin(e) {
    const id = e.currentTarget.dataset.id;
    skins.set(id);
    this.setData({ skinId: id });
    wx.showToast({ title: '已换肤', icon: 'success' });
  },

  pickCustomSkin() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const file = res && res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        const match = String(file.tempFilePath).match(/\.(png|jpe?g|webp)$/i);
        const ext = match ? match[0] : '.png';
        const target = wx.env.USER_DATA_PATH + '/pet-custom-' + Date.now() + ext;
        const fs = wx.getFileSystemManager();
        try {
          fs.copyFileSync(file.tempFilePath, target);
        } catch (err) {
          wx.showToast({ title: '保存图片失败', icon: 'none' });
          return;
        }
        // 删除旧的自定义图片，避免占满本地存储
        try {
          const old = skins.customPath();
          if (old && old !== target) fs.unlinkSync(old);
        } catch (err) {
          /* 旧文件不存在时忽略 */
        }
        skins.setCustomPath(target);
        that.setData({ skinId: 'custom' });
        wx.showToast({ title: '已换肤', icon: 'success' });
      },
      fail() {
        wx.showToast({ title: '未选择图片', icon: 'none' });
      }
    });
  },

  clearAll() {
    const that = this;
    if (!this.data.recordCount) {
      wx.showToast({ title: '还没有记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清空账本',
      content: '会删除全部 ' + this.data.recordCount + ' 条记录，且无法恢复。',
      confirmText: '清空',
      confirmColor: '#e8663d',
      success(res) {
        if (!res.confirm) return;
        store.clearRecords();
        that.refresh();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  }
});
