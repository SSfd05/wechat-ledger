function pad2(value) {
  return value < 10 ? '0' + value : '' + value;
}

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function dateInput(ts) {
  return dayKey(ts);
}

function monthKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}

function money(cents, comma) {
  const value = Math.round(Math.abs(Number(cents) || 0));
  const yuan = Math.floor(value / 100);
  const fen = pad2(value % 100);
  let text = String(yuan);
  if (comma) {
    text = text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return (cents < 0 ? '-' : '') + text + '.' + fen;
}

function amountInput(cents) {
  const text = (Math.round(Number(cents) || 0) / 100).toFixed(2);
  return text.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function toCents(input) {
  const raw = String(input === undefined || input === null ? '' : input).replace(/,/g, '');
  const value = parseFloat(raw);
  if (!isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

function clampAmount(cents) {
  if (!isFinite(cents) || cents <= 0) return 0;
  return Math.min(Math.round(cents), 100000000);
}

function timeText(ts) {
  const d = new Date(ts);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayText(ts) {
  return WEEKDAYS[new Date(ts).getDay()];
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(ts, nowTs) {
  const now = nowTs === undefined ? Date.now() : nowTs;
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  const d = new Date(ts);
  return d.getMonth() + 1 + '月' + d.getDate() + '日';
}

function groupLabel(ts) {
  const d = new Date(ts);
  return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + weekdayText(ts);
}

function monthLabel(year, month) {
  return year + '年' + month + '月';
}

function monthDay(ts) {
  const d = new Date(ts);
  const now = new Date();
  const prefix = d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '年';
  return prefix + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function shortDate(ts) {
  const d = new Date(ts);
  return d.getMonth() + 1 + '/' + d.getDate();
}

function dateFromInput(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 3) return 0;
  const ts = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0, 0).getTime();
  return isFinite(ts) ? ts : 0;
}

module.exports = {
  pad2: pad2,
  dayKey: dayKey,
  dateInput: dateInput,
  monthKey: monthKey,
  money: money,
  amountInput: amountInput,
  toCents: toCents,
  clampAmount: clampAmount,
  timeText: timeText,
  weekdayText: weekdayText,
  startOfDay: startOfDay,
  dayLabel: dayLabel,
  groupLabel: groupLabel,
  monthLabel: monthLabel,
  monthDay: monthDay,
  shortDate: shortDate,
  dateFromInput: dateFromInput
};
