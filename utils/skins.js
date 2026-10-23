const KEY = 'ledger.skin.v1';
const CUSTOM_KEY = 'ledger.skin.custom.v1';

const SKINS = [
  { id: 'cat', name: '小猫', src: '/assets/pet/cat.png' }
];

function list() {
  return SKINS.map(function (skin) {
    return { id: skin.id, name: skin.name, src: skin.src };
  });
}

function find(id) {
  for (let i = 0; i < SKINS.length; i += 1) {
    if (SKINS[i].id === id) return SKINS[i];
  }
  return SKINS[0];
}

function currentId() {
  if (typeof wx === 'undefined') return SKINS[0].id;
  const id = wx.getStorageSync(KEY);
  if (!id) return SKINS[0].id;
  if (id === 'custom') return 'custom';
  return find(id).id;
}

function customPath() {
  if (typeof wx === 'undefined') return '';
  return wx.getStorageSync(CUSTOM_KEY) || '';
}

function currentSrc() {
  if (typeof wx === 'undefined') return SKINS[0].src;
  if (currentId() === 'custom') {
    const path = customPath();
    if (path) {
      try {
        wx.getFileSystemManager().accessSync(path);
        return path;
      } catch (err) {
        /* 自定义图片已被清理时回退到内置皮肤 */
      }
    }
    return SKINS[0].src;
  }
  return find(currentId()).src;
}

function set(id) {
  wx.setStorageSync(KEY, id);
}

function setCustomPath(path) {
  wx.setStorageSync(CUSTOM_KEY, path);
  wx.setStorageSync(KEY, 'custom');
}

function isCustomActive() {
  if (typeof wx === 'undefined') return false;
  if (currentId() !== 'custom') return false;
  const path = customPath();
  if (!path) return false;
  try {
    wx.getFileSystemManager().accessSync(path);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  list: list,
  currentId: currentId,
  currentSrc: currentSrc,
  isCustomActive: isCustomActive,
  set: set,
  setCustomPath: setCustomPath,
  customPath: customPath
};
