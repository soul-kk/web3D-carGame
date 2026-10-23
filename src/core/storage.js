/**
 * localStorage 的安全包装。
 *
 * 【为什么要再包一层】直接访问 localStorage 在很多情况下会**抛异常**，
 * 而不是返回 null：
 *   - 浏览器隐私模式 / 禁用了 Cookie
 *   - 用 file:// 直接打开 index.html（部分浏览器）
 *   - 存储配额写满
 * 一旦抛异常且没人接，整个游戏会在启动时就挂掉。所以读写全部 try 起来，
 * 失败就退化成"没有记录"，游戏照常能玩。
 *
 * 统一加前缀是为了不和同域下的其它页面抢 key。
 */

const PREFIX = 'toon-racing:';

/**
 * 读一个 JSON 值。
 * @param {string} key
 * @param {any} [fallback] 读不到 / 解析失败时返回它
 */
export function readJson(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * 写一个 JSON 值。
 * @param {string} key
 * @param {any} value
 * @returns {boolean} 是否写入成功（失败只影响"下次能不能看到记录"）
 */
export function writeJson(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 删掉一个 key */
export function removeKey(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* 忽略：存不了也不影响这一局游戏 */
  }
}
