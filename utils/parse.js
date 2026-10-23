const categories = require('./categories');

const CURRENCY_PREFIX = /[¥￥]\s*(\d[\d,]*(?:\.\d{1,2})?)/;
const CURRENCY_SUFFIX = /(\d[\d,]*(?:\.\d{1,2})?)\s*(?:元|块钱|块)/;
const PLAIN_NUMBER = /\d[\d,]*(?:\.\d{1,2})?/g;
const CN_SUFFIX = /([零一二两三四五六七八九十百千万亿几]+(?:点[零一二三四五六七八九]+)?)\s*(?:元|块钱|块|钱)/;

const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 };

function cnToNumber(raw) {
  const parts = String(raw || '').split('点');
  const intPart = parts[0] || '';
  const decPart = parts[1] || '';
  let total = 0;
  let section = 0;
  let num = 0;

  for (let i = 0; i < intPart.length; i += 1) {
    const ch = intPart[i];
    if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)) {
      num = CN_DIGITS[ch];
    } else if (CN_UNITS[ch]) {
      const unit = CN_UNITS[ch];
      if (unit >= 10000) {
        section += num;
        if (section === 0) section = 1;
        total = (total + section) * unit;
        section = 0;
      } else {
        if (num === 0) num = 1;
        section += num * unit;
      }
      num = 0;
    }
  }

  let value = total + section + num;
  if (decPart) {
    let scale = 0.1;
    for (let i = 0; i < decPart.length; i += 1) {
      const d = CN_DIGITS[decPart[i]];
      if (d === undefined) continue;
      value += d * scale;
      scale /= 10;
    }
  }
  return value;
}

function toValue(raw) {
  return parseFloat(String(raw).replace(/,/g, ''));
}

function validAmount(value) {
  return isFinite(value) && value > 0 && value <= 1000000;
}

function findAmount(text) {
  let match = CURRENCY_PREFIX.exec(text);
  if (match && validAmount(toValue(match[1]))) {
    return { value: toValue(match[1]), raw: match[0], index: match.index };
  }

  match = CURRENCY_SUFFIX.exec(text);
  if (match && validAmount(toValue(match[1]))) {
    return { value: toValue(match[1]), raw: match[0], index: match.index };
  }

  match = CN_SUFFIX.exec(text);
  if (match) {
    const value = cnToNumber(match[1]);
    if (validAmount(value)) {
      return { value: value, raw: match[0], index: match.index };
    }
  }

  let best = null;
  let plain;
  PLAIN_NUMBER.lastIndex = 0;
  while ((plain = PLAIN_NUMBER.exec(text)) !== null) {
    const value = toValue(plain[0]);
    if (!validAmount(value)) continue;
    if (!best || value > best.value) {
      best = { value: value, raw: plain[0], index: plain.index };
    }
  }
  return best;
}

function makeTs(year, month, day, fallback) {
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return fallback;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (!isFinite(date.getTime())) return fallback;
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return fallback;
  return date.getTime();
}

function takeDate(text, nowTs) {
  let match = text.match(/^\s*(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?\s*/);
  if (match) {
    return { rest: text.slice(match[0].length), ts: makeTs(Number(match[1]), Number(match[2]), Number(match[3]), nowTs), matched: true };
  }

  match = text.match(/^\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?\s*/);
  if (match) {
    const year = new Date(nowTs).getFullYear();
    return { rest: text.slice(match[0].length), ts: makeTs(year, Number(match[1]), Number(match[2]), nowTs), matched: true };
  }

  match = text.match(/^\s*(\d{1,2})\s*[-/]\s*(\d{1,2})\s*/);
  if (match) {
    const year = new Date(nowTs).getFullYear();
    return { rest: text.slice(match[0].length), ts: makeTs(year, Number(match[1]), Number(match[2]), nowTs), matched: true };
  }

  match = text.match(/^\s*(今天|昨天|前天)\s*/);
  if (match) {
    const offset = match[1] === '今天' ? 0 : match[1] === '昨天' ? 1 : 2;
    return { rest: text.slice(match[0].length), ts: nowTs - offset * 86400000, matched: true };
  }

  return { rest: text, ts: nowTs, matched: false };
}

function cleanNote(text) {
  return String(text || '')
    .replace(/[¥￥]/g, ' ')
    .replace(/(花费了|花费|花了|消费了|消费|支出了|支出|用了|付了|付款|扣了|支付)/g, ' ')
    .replace(/[，,；;、|/\\：:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-—\s]+|[-—\s]+$/g, '')
    .trim();
}

function isIncomeText(text) {
  const t = String(text || '');
  if (/(收到|收入|进账|到账|工资|薪水|奖金|退款|退钱|报销|返现|分红|利息|借入|给我转|转给我|打钱给我|别人给我转)/.test(t)) {
    return true;
  }
  if (/红包/.test(t) && /(收到|领|抢|收)/.test(t)) {
    return true;
  }
  return false;
}

function parseLine(line, nowTs) {
  const base = nowTs === undefined ? Date.now() : nowTs;
  let text = String(line === undefined || line === null ? '' : line).replace(/\u00a0/g, ' ').trim();
  if (!text) return null;

  const dated = takeDate(text, base);
  text = dated.rest;
  let ts = dated.ts;

  // 日期词也可能出现在句子中间或结尾（例如「花费了十块钱今天」）
  if (!dated.matched) {
    const loose = text.match(/(今天|昨天|前天|明天|后天)/);
    if (loose) {
      const word = loose[1];
      const offset = word === '今天' ? 0 : word === '昨天' ? 1 : word === '前天' ? 2 : word === '明天' ? -1 : -2;
      ts = base - offset * 86400000;
      text = text.replace(word, ' ');
    }
  }

  const amount = findAmount(text);
  if (!amount) return null;

  const cents = Math.round(amount.value * 100);
  if (cents <= 0) return null;

  const before = text.slice(0, amount.index);
  const after = text.slice(amount.index + amount.raw.length);
  const note = cleanNote(before + ' ' + after);
  const type = isIncomeText(line) ? 'income' : 'expense';
  const category = categories.categorize(note, type);

  return {
    amount: cents,
    note: note || '未备注',
    category: note ? category.id : type === 'income' ? 'other-income' : 'other',
    type: type,
    ts: ts
  };
}

function splitCommas(text) {
  const parts = [];
  let current = '';

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === ',' || ch === '，') {
      const prev = text[i - 1] || '';
      const next = text[i + 1] || '';
      // 数字之间的逗号视为千分位，不拆
      if (/\d/.test(prev) && /\d/.test(next)) {
        current += ch;
        continue;
      }
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  parts.push(current);
  return parts
    .map(function (part) {
      return part.trim();
    })
    .filter(Boolean);
}

function splitConjunctions(text) {
  return String(text || '')
    .split(/然后|还有|另外|以及/)
    .map(function (part) {
      return part.trim();
    })
    .filter(Boolean);
}

function parseEntry(line, nowTs) {
  const base = nowTs === undefined ? Date.now() : nowTs;
  const text = String(line === undefined || line === null ? '' : line)
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!text) return [];

  const dated = takeDate(text, base);
  const rest = dated.rest;
  const parts = splitCommas(rest);
  const clauses = [];
  parts.forEach(function (part) {
    splitConjunctions(part).forEach(function (piece) {
      clauses.push(piece);
    });
  });

  let segments = [rest];

  // 只有每一段都带金额时才拆成多笔，避免「午饭，奶茶 27.5」被误拆
  if (clauses.length > 1) {
    const everyPartHasAmount = clauses.every(function (part) {
      return Boolean(findAmount(part));
    });
    if (everyPartHasAmount) {
      segments = clauses;
    }
  }

  return segments
    .map(function (segment) {
      return parseLine(segment, dated.ts);
    })
    .filter(Boolean);
}

function parseText(text, nowTs) {
  const base = nowTs === undefined ? Date.now() : nowTs;
  const results = [];
  let activeTs = base;

  String(text === undefined || text === null ? '' : text)
    .split(/\r?\n/)
    .forEach(function (line) {
      const raw = String(line).replace(/\u00a0/g, ' ').trim();
      if (!raw) return;

      const lineDated = takeDate(raw, base);
      if (lineDated.matched) {
        const rest = lineDated.rest.trim();
        // 单独一行日期（或“日期 + 标题”且没有金额）作为后续记录的日期
        if (!findAmount(rest)) {
          activeTs = lineDated.ts;
          return;
        }
      }

      raw.split(/[;；]+/).forEach(function (part) {
        const partText = part.trim();
        if (!partText) return;

        const partDated = takeDate(partText, base);
        if (partDated.matched && !findAmount(partDated.rest)) {
          activeTs = partDated.ts;
          return;
        }

        // 带日期的行相对“今天”计算，避免同一天被重复减；
        // 不带日期的行继承上一行日期。
        const parseBase = partDated.matched ? base : activeTs;
        const records = parseEntry(partText, parseBase);

        if (records.length) {
          activeTs = records[records.length - 1].ts;
          records.forEach(function (record) {
            results.push(record);
          });
        }
      });
    });

  return results;
}

function parseLines(text, nowTs) {
  return parseText(text, nowTs);
}

function stripCommand(text) {
  let t = String(text === undefined || text === null ? '' : text).trim();
  t = t.replace(/^(?:请|帮我|给我|我要|我想|咱们|来)+[,:：，。、\s]*/, '');
  t = t.replace(/^(?:记一笔|记个账|记账|记一下|记一记|记录一下|记录|记)+[,:：，。、\s]*/, '');
  t = t.replace(/[呢吧啊哦呀]+[。.!！？?]*$/, '');
  return t.trim();
}

function tidySpeech(text) {
  const chars = Array.from(String(text === undefined || text === null ? '' : text).replace(/\u00a0/g, ' '));
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      const prev = out[out.length - 1] || '';
      const next = chars[i + 1] || '';
      if (/[\u4e00-\u9fa5]/.test(prev) && /[\u4e00-\u9fa5]/.test(next)) continue;
      if (out[out.length - 1] === ' ') continue;
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out.trim();
}

module.exports = {
  parseLine: parseLine,
  parseLines: parseLines,
  parseText: parseText,
  splitCommas: splitCommas,
  findAmount: findAmount,
  stripCommand: stripCommand,
  tidySpeech: tidySpeech,
  isIncomeText: isIncomeText
};
