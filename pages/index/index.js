const store = require('../../utils/store');
const categories = require('../../utils/categories');
const format = require('../../utils/format');
const parser = require('../../utils/parse');
const skins = require('../../utils/skins');

let voicePlugin = null;
try {
  voicePlugin = requirePlugin('WechatSI');
} catch (err) {
  voicePlugin = null;
}
let recognition = null;
const recorder = typeof wx !== 'undefined' ? wx.getRecorderManager() : null;

Page({
  data: {
    greeting: '你好',
    dateText: '',
    todayTotalText: '0.00',
    monthTotalText: '0.00',
    todayIncomeText: '0.00',
    monthIncomeText: '0.00',
    balanceText: '0.00',
    budgetText: '设置月预算',
    budgetPct: -1,
    showBudgetLink: true,
    overBudget: false,
    todayCats: [],
    recent: [],
    hasToday: false,
    petText: '点我，语音记账',
    petSrc: '',
    customSkin: false,
    micMode: 'hold',
    summaryShow: false,
    summaryDateText: '',
    summaryExpenseText: '0.00',
    summaryIncomeText: '0.00',
    summaryBalanceText: '¥0.00',
    summaryCount: 0,
    summaryBudgetText: '',
    petPanelShow: false,
    listening: false,
    listeningText: '',
    heardText: '',
    voiceResult: '',
    canUndo: false
  },

  onLoad() {
    this.speakSeq = 0;
    this.ttsNext = 1;
    this.ttsResults = {};
    this.playQueue = [];
    const mode = wx.getStorageSync('ledger.micmode.v1');
    if (mode === 'tap' || mode === 'hold') {
      this.setData({ micMode: mode });
    }
    this.applyPetSkin();
    this.initVoice();
    this.initRecorder();
  },

  onShow() {
    this.applyPetSkin();
    this.refresh();
    this.maybeShowSummary();
  },

  maybeShowSummary() {
    const now = new Date();
    const todayKey = format.dayKey(now.getTime());
    const last = wx.getStorageSync('ledger.summary.v1') || '';
    if (last === todayKey) return;

    const yesterdayTs = now.getTime() - 86400000;
    const all = store.listAll();
    const records = store.filterDay(all, yesterdayTs);
    if (!records.length) {
      wx.setStorageSync('ledger.summary.v1', todayKey);
      return;
    }

    const expense = store.sum(records);
    const income = store.sumIncome(records);
    const diff = income - expense;
    const budget = store.getBudget();
    const monthExpense = store.sum(store.filterMonth(all, now.getFullYear(), now.getMonth() + 1));

    let budgetText = '';
    if (budget > 0) {
      const left = budget - monthExpense;
      budgetText = left >= 0 ? '本月预算剩余 ¥' + format.money(left) : '本月已超支 ¥' + format.money(-left);
    }

    this.setData({
      summaryShow: true,
      summaryDateText: format.monthDay(yesterdayTs),
      summaryExpenseText: format.money(expense),
      summaryIncomeText: format.money(income),
      summaryBalanceText: (diff >= 0 ? '+' : '-') + '¥' + format.money(Math.abs(diff)),
      summaryCount: records.length,
      summaryBudgetText: budgetText
    });
  },

  closeSummary() {
    this.setData({ summaryShow: false });
    wx.setStorageSync('ledger.summary.v1', format.dayKey(Date.now()));
  },

  applyPetSkin() {
    this.setData({
      petSrc: skins.currentSrc(),
      customSkin: skins.isCustomActive()
    });
  },

  onHide() {
    if (this.data.listening) {
      this.voiceStop();
    }
    this.stopVoiceAudio();
  },

  onUnload() {
    this.destroyVoice();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  initVoice() {
    if (!voicePlugin) return;
    try {
      recognition = voicePlugin.getRecordRecognitionManager();
    } catch (err) {
      recognition = null;
      return;
    }

    const that = this;
    recognition.onRecognize = function (res) {
      that.setData({ listeningText: res && res.result ? res.result : '' });
    };
    recognition.onStop = function (res) {
      that.setData({ listening: false, listeningText: '' });
      that.handleVoiceText(res && res.result ? res.result : '');
    };
    recognition.onError = function (res) {
      that.setData({ listening: false, listeningText: '' });
      const message = String((res && (res.msg || res.errMsg)) || '');
      if (/auth|authorize|permission|deny/i.test(message)) {
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中允许使用麦克风，用于语音记账。',
          confirmText: '去设置',
          success(modal) {
            if (modal.confirm) {
              wx.openSetting({});
            }
          }
        });
      } else {
        that.setPetText('语音识别出错了，请再试一次');
      }
    };
  },

  initRecorder() {
    const that = this;
    recorder.onStop(function (res) {
      that.setData({ listening: false, listeningText: '' });
      const path = res && res.tempFilePath;
      if (!path) {
        that.setPetText('没录到声音，再试一次');
        return;
      }
      wx.getFileSystemManager().readFile({
        filePath: path,
        success(read) {
          const base64 = wx.arrayBufferToBase64(read.data);
          wx.cloud.callFunction({
            name: 'voice',
            data: { action: 'asr', audio: base64 },
            success(call) {
              const result = (call && call.result) || {};
              if (result.ok) {
                that.handleVoiceText(result.text);
              } else {
                that.setPetText('识别失败：' + (result.error || '未知错误'));
              }
            },
            fail() {
              that.setPetText('语音服务还没就绪：需要开通云开发并部署 voice 云函数');
            }
          });
        },
        fail() {
          that.setPetText('读取录音失败');
        }
      });
    });
    recorder.onError(function (res) {
      that.setData({ listening: false, listeningText: '' });
      const message = String((res && (res.errMsg || res.msg)) || '');
      if (/auth|authorize|permission|deny/i.test(message)) {
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中允许使用麦克风，用于语音记账。',
          confirmText: '去设置',
          success(modal) {
            if (modal.confirm) {
              wx.openSetting({});
            }
          }
        });
      } else {
        that.setPetText('录音出错，请再试一次');
      }
    });
  },

  destroyVoice() {
    recognition = null;
    this.stopVoiceAudio();
  },

  stopVoiceAudio() {
    this.playQueue = [];
    this.ttsResults = {};
    this.ttsNext = (this.speakSeq || 0) + 1;
    if (this.voiceAudio) {
      try {
        this.voiceAudio.stop();
      } catch (err) {
        /* ignore */
      }
      try {
        this.voiceAudio.destroy();
      } catch (err) {
        /* ignore */
      }
      this.voiceAudio = null;
    }
  },

  openPet() {
    this.setData({ petPanelShow: true });
  },

  closePet() {
    if (this.data.listening) {
      this.voiceStop();
    }
    this.setData({ petPanelShow: false });
  },

  setPetText(text) {
    this.setData({ petText: text });
    this.speak(text);
  },

  speak(text) {
    if (!text) return;
    const that = this;
    const seq = (this.speakSeq || 0) + 1;
    this.speakSeq = seq;
    if (!this.ttsResults) this.ttsResults = {};
    if (!this.ttsNext) this.ttsNext = 1;
    if (!this.playQueue) this.playQueue = [];

    // 按 seq 顺序收集合成结果：先到的旧回复也要等前一条放行，避免乱序
    const done = function (src) {
      if (seq < that.ttsNext) return;
      that.ttsResults[seq] = src || null;
      that.drainTtsQueue();
    };

    if (voicePlugin) {
      try {
        voicePlugin.textToSpeech({
          lang: 'zh_CN',
          tts: true,
          content: text,
          success(res) {
            done(res && res.filename ? res.filename : '');
          },
          fail() {
            done('');
          }
        });
      } catch (err) {
        done('');
      }
      return;
    }

    wx.cloud.callFunction({
      name: 'voice',
      data: { action: 'tts', text: text },
      success(res) {
        const result = (res && res.result) || {};
        if (!result.ok || !result.audio) {
          done('');
          return;
        }
        const path = wx.env.USER_DATA_PATH + '/pet-reply-' + Date.now() + '-' + seq + '.mp3';
        wx.getFileSystemManager().writeFile({
          filePath: path,
          data: result.audio,
          encoding: 'base64',
          success() {
            done(path);
          },
          fail() {
            done('');
          }
        });
      },
      fail() {
        done('');
      }
    });
  },

  drainTtsQueue() {
    if (!this.ttsResults || !this.ttsNext) return;
    if (!this.playQueue) this.playQueue = [];
    while (Object.prototype.hasOwnProperty.call(this.ttsResults, this.ttsNext)) {
      const src = this.ttsResults[this.ttsNext];
      delete this.ttsResults[this.ttsNext];
      this.ttsNext += 1;
      if (src) {
        if (this.playQueue.length >= 3) this.playQueue.shift();
        this.playQueue.push(src);
      }
    }
    this.playNext();
  },

  playNext() {
    if (this.voiceAudio || !this.playQueue || !this.playQueue.length) return;
    const that = this;
    const src = this.playQueue.shift();
    const audio = wx.createInnerAudioContext();
    this.voiceAudio = audio;
    audio.src = src;
    audio.onEnded(function () {
      if (that.voiceAudio === audio) {
        try {
          audio.destroy();
        } catch (err) {
          /* ignore */
        }
        that.voiceAudio = null;
        that.playNext();
      }
    });
    audio.onError(function () {
      if (that.voiceAudio === audio) {
        try {
          audio.destroy();
        } catch (err) {
          /* ignore */
        }
        that.voiceAudio = null;
        that.playNext();
      }
    });
    audio.play();
  },

  setMicMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'hold' && mode !== 'tap') return;
    if (this.data.listening) {
      this.voiceStop();
    }
    wx.setStorageSync('ledger.micmode.v1', mode);
    this.setData({ micMode: mode });
  },

  onMicTouchStart() {
    if (this.data.micMode !== 'hold') return;
    this.voiceStart();
  },

  onMicTouchEnd() {
    if (this.data.micMode !== 'hold') return;
    this.voiceStop();
  },

  onMicTap() {
    if (this.data.micMode !== 'tap') return;
    if (this.data.listening) {
      this.voiceStop();
    } else {
      this.voiceStart();
    }
  },

  voiceStart() {
    if (this.data.listening) return;
    // 开始新录音前，先停掉正在播放的上一条回复
    this.stopVoiceAudio();
    if (voicePlugin && recognition) {
      try {
        recognition.start({ lang: 'zh_CN', duration: 60000 });
        this.setData({ listening: true, listeningText: '', heardText: '', voiceResult: '' });
      } catch (err) {
        this.setPetText('无法开始录音，请检查麦克风权限');
      }
      return;
    }
    try {
      recorder.start({ duration: 60000, format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 64000 });
      this.setData({ listening: true, listeningText: '', heardText: '', voiceResult: '' });
    } catch (err) {
      this.setPetText('无法开始录音，请检查麦克风权限');
    }
  },

  voiceStop() {
    if (!this.data.listening) return;
    try {
      if (voicePlugin && recognition) {
        recognition.stop();
      } else {
        recorder.stop();
      }
    } catch (err) {
      this.setData({ listening: false, listeningText: '' });
    }
  },

  handleVoiceText(text) {
    const raw = String(text || '').trim();
    const heard = parser.tidySpeech(raw);
    if (!heard) {
      this.setData({ heardText: '' });
      this.setPetText('没听清，再说一次吧，比如：昨天午饭25');
      return;
    }
    this.setData({ heardText: heard });

    const cleaned = parser.stripCommand(heard);
    const list = parser.parseLines(cleaned);
    if (!list.length) {
      const short = heard.length > 40 ? heard.slice(0, 40) + '…' : heard;
      this.setPetText('没听出金额，我听到的是「' + short + '」，再说一次试试');
      return;
    }

    const now = Date.now();
    const records = list.map(function (record) {
      return {
        id: store.newId(),
        amount: record.amount,
        category: record.category,
        type: record.type === 'income' ? 'income' : 'expense',
        note: record.note,
        ts: record.ts || now,
        createdAt: now
      };
    });

    store.addMany(records);
    getApp().globalData.focusTs = records.reduce(function (max, record) {
      return Math.max(max, record.ts);
    }, 0);
    this.lastSavedIds = records.map(function (record) {
      return record.id;
    });

    let reply = '';
    let resultText = '';
    if (records.length === 1) {
      const record = records[0];
      const category = categories.get(record.category);
      const isIncome = record.type === 'income';
      reply = (isIncome ? '已记入收入 ' : '已记入 ') + format.dayLabel(record.ts) + '，' + record.note + ' ' + format.money(record.amount) + ' 元，归为' + category.name;
      resultText = (isIncome ? '✓ +¥' : '✓ -¥') + format.money(record.amount) + ' ' + record.note + ' · ' + category.name;
    } else {
      const total = store.sum(records);
      const income = store.sumIncome(records);
      reply = '已记入 ' + records.length + ' 笔' + (total ? '，支出 ' + format.money(total) + ' 元' : '') + (income ? '，收入 ' + format.money(income) + ' 元' : '');
      resultText = '✓ 已记入 ' + records.length + ' 笔' + (total ? '，支出 ¥' + format.money(total) : '') + (income ? '，收入 ¥' + format.money(income) : '');
    }

    this.setData({ voiceResult: resultText, canUndo: true });
    this.setPetText(reply);
    this.refresh();
  },

  undoVoice() {
    const ids = this.lastSavedIds || [];
    if (!ids.length) return;
    ids.forEach(function (id) {
      store.remove(id);
    });
    this.lastSavedIds = [];
    this.setData({ voiceResult: '', canUndo: false });
    this.setPetText('已撤销刚才的记录');
    this.refresh();
  },

  refresh() {
    const now = Date.now();
    const today = new Date(now);
    const all = store.listAll();
    const dayRecords = store.filterDay(all, now);
    const monthRecords = store.filterMonth(all, today.getFullYear(), today.getMonth() + 1);
    const todayTotal = store.sum(dayRecords);
    const monthTotal = store.sum(monthRecords);
    const todayIncome = store.sumIncome(dayRecords);
    const monthIncome = store.sumIncome(monthRecords);
    const budget = store.getBudget();

    let budgetText = '设置月预算';
    let budgetPct = -1;
    let overBudget = false;
    if (budget > 0) {
      const left = budget - monthTotal;
      overBudget = left < 0;
      budgetText = overBudget ? '已超支 ¥' + format.money(-left) : '预算剩余 ¥' + format.money(left);
      budgetPct = Math.min(100, Math.round((monthTotal / budget) * 100));
    }

    const hour = today.getHours();
    let greeting = '晚上好';
    if (hour < 6) greeting = '夜深了';
    else if (hour < 11) greeting = '早上好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';

    this.setData({
      greeting: greeting,
      dateText: format.groupLabel(now),
      todayTotalText: format.money(todayTotal),
      monthTotalText: format.money(monthTotal),
      todayIncomeText: format.money(todayIncome),
      monthIncomeText: format.money(monthIncome),
      balanceText: format.money(monthIncome - monthTotal),
      budgetText: budgetText,
      budgetPct: budgetPct,
      showBudgetLink: budgetPct < 0,
      overBudget: overBudget,
      todayCats: categories.summarize(dayRecords),
      recent: all.slice(0, 5).map(function (record) {
        return categories.view(record, now);
      }),
      hasToday: store.sum(dayRecords) > 0
    });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },

  goList() {
    wx.switchTab({ url: '/pages/list/list' });
  },

  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
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
