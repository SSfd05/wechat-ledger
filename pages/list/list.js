const store = require('../../utils/store');
const categories = require('../../utils/categories');
const format = require('../../utils/format');

Page({
  data: {
    year: 0,
    month: 0,
    monthText: '',
    totalText: '0.00',
    incomeText: '0.00',
    balanceText: '0.00',
    count: 0,
    avgText: '0.00',
    filters: [],
    filterId: 'all',
    groups: [],
    hasData: false
  },

  onLoad() {
    const now = new Date();
    const all = store.listAll();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const hasCurrentMonth = all.some(function (record) {
      const d = new Date(record.ts);
      return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth;
    });

    // 当前月没有记录时，优先展示最近有记录的月份
    const ts = !hasCurrentMonth && all.length ? all[0].ts : now.getTime();
    const d = new Date(ts);
    this.setData({ year: d.getFullYear(), month: d.getMonth() + 1 });
  },

  onShow() {
    const app = getApp();
    const focusTs = app && app.globalData ? app.globalData.focusTs : 0;

    if (focusTs) {
      app.globalData.focusTs = 0;
      const d = new Date(focusTs);
      const that = this;
      this.setData({ year: d.getFullYear(), month: d.getMonth() + 1, filterId: 'all' }, function () {
        that.refresh();
      });
      return;
    }

    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const year = this.data.year;
    const month = this.data.month;
    if (!year || !month) return;

    const all = store.listAll();
    const monthAll = store.filterMonth(all, year, month);

    const counts = {};
    monthAll.forEach(function (record) {
      counts[record.category] = (counts[record.category] || 0) + 1;
    });

    const filters = [{ id: 'all', name: '全部', count: monthAll.length }];
    categories.LIST.forEach(function (category) {
      if (counts[category.id]) {
        filters.push({ id: category.id, name: category.name, count: counts[category.id] });
      }
    });
    categories.INCOME.forEach(function (category) {
      if (counts[category.id]) {
        filters.push({ id: category.id, name: category.name, count: counts[category.id] });
      }
    });

    let filterId = this.data.filterId;
    if (
      !filters.some(function (item) {
        return item.id === filterId;
      })
    ) {
      filterId = 'all';
    }

    const records =
      filterId === 'all'
        ? monthAll
        : monthAll.filter(function (record) {
            return record.category === filterId;
          });

    const groups = [];
    const index = {};
    records.forEach(function (record) {
      const key = format.dayKey(record.ts);
      if (!index[key]) {
        index[key] = {
          key: key,
          label: format.groupLabel(record.ts),
          totalText: '0.00',
          items: []
        };
        groups.push(index[key]);
      }
      index[key].items.push(categories.view(record));
      if (record.type === 'income') {
        index[key].income = (index[key].income || 0) + record.amount;
      } else {
        index[key].total = (index[key].total || 0) + record.amount;
      }
    });
    groups.forEach(function (group) {
      const parts = [];
      if (group.total > 0) parts.push('-¥' + format.money(group.total));
      if (group.income > 0) parts.push('+¥' + format.money(group.income));
      group.totalLabel = parts.join(' · ') || '¥0.00';
    });

    const total = store.sum(records);
    const monthIncome = store.sumIncome(monthAll);
    const dayCount = groups.length || 1;

    this.setData({
      monthText: format.monthLabel(year, month),
      totalText: format.money(total),
      incomeText: format.money(monthIncome),
      balanceText: format.money(monthIncome - store.sum(monthAll)),
      count: records.length,
      avgText: format.money(Math.round(total / dayCount)),
      filters: filters,
      filterId: filterId,
      groups: groups,
      hasData: records.length > 0
    });
  },

  prevMonth() {
    this.shiftMonth(-1);
  },

  nextMonth() {
    this.shiftMonth(1);
  },

  shiftMonth(delta) {
    let year = this.data.year;
    let month = this.data.month + delta;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    const that = this;
    this.setData({ year: year, month: month, filterId: 'all' }, function () {
      that.refresh();
    });
  },

  setFilter(e) {
    const that = this;
    this.setData({ filterId: e.currentTarget.dataset.id }, function () {
      that.refresh();
    });
  },

  openAdd() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const year = this.data.year;
    const month = this.data.month;

    if (!year || !month) {
      wx.navigateTo({ url: '/pages/add/add' });
      return;
    }

    const isCurrent = year === currentYear && month === currentMonth;
    let url = '/pages/add/add';

    if (!isCurrent) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const day = Math.min(now.getDate(), daysInMonth);
      url += '?date=' + year + '-' + format.pad2(month) + '-' + format.pad2(day);
    }

    wx.navigateTo({ url: url });
  },

  recordMenu(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const that = this;
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success(res) {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/add/add?id=' + id });
          return;
        }
        wx.showModal({
          title: '删除记录',
          content: '删除后无法恢复，确定删除吗？',
          confirmText: '删除',
          confirmColor: '#e8663d',
          success(modal) {
            if (!modal.confirm) return;
            store.remove(id);
            that.refresh();
            wx.showToast({ title: '已删除', icon: 'none' });
          }
        });
      }
    });
  }
});
