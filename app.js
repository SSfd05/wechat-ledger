// 云开发环境 ID；留空则使用该小程序的默认环境
const CLOUD_ENV = 'cloud1-hx-d4g6ayrp8b245f12a';

App({
  onLaunch() {
    const budget = wx.getStorageSync('ledger.budget.v1');
    if (budget === '' || budget === undefined || budget === null) {
      wx.setStorageSync('ledger.budget.v1', 0);
    }
    if (wx.cloud) {
      const options = { traceUser: true };
      if (CLOUD_ENV) {
        options.env = CLOUD_ENV;
      }
      wx.cloud.init(options);
    }
  },
  globalData: {
    importText: '',
    focusTs: 0
  }
});
