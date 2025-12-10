import {
  STORAGE_KEYS,
  ARTICLE_STATUS,
  STORAGE_LIMITS,
  DEFAULT_SETTINGS,
  generateId
} from './constants.js';

/**
 * 記事を最小化形式に変換（ストレージ節約）
 * @param {Object} article - 元の記事オブジェクト
 * @returns {Object} 最小化された記事
 */
function minimizeArticle(article) {
  return {
    i: article.id || generateId(),
    u: article.url,
    t: (article.title || '').slice(0, STORAGE_LIMITS.MAX_TITLE_LENGTH),
    s: article.savedAt || Date.now(),
    f: article.scheduledFor,
    a: article.status === ARTICLE_STATUS.ARCHIVED ? 1 : 0
  };
}

/**
 * 最小化形式から元の形式に展開
 * @param {Object} min - 最小化された記事
 * @returns {Object} 展開された記事
 */
function expandArticle(min) {
  return {
    id: min.i,
    url: min.u,
    title: min.t,
    savedAt: min.s,
    scheduledFor: min.f,
    status: min.a === 1 ? ARTICLE_STATUS.ARCHIVED : ARTICLE_STATUS.PENDING
  };
}

/**
 * 全記事を取得
 * @returns {Promise<Array>} 記事配列
 */
export async function getArticles() {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.ARTICLES);
  const articles = data[STORAGE_KEYS.ARTICLES] || [];
  return articles.map(expandArticle);
}

/**
 * 今日読む記事を取得（予定日が今日以前の未読記事）
 * @returns {Promise<Array>} 記事配列
 */
export async function getTodayArticles() {
  const articles = await getArticles();
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  return articles.filter(article =>
    article.status === ARTICLE_STATUS.PENDING &&
    article.scheduledFor <= endOfToday.getTime()
  );
}

/**
 * 未読記事を取得
 * @returns {Promise<Array>} 記事配列
 */
export async function getPendingArticles() {
  const articles = await getArticles();
  return articles.filter(article => article.status === ARTICLE_STATUS.PENDING);
}

/**
 * アーカイブ済み記事を取得
 * @returns {Promise<Array>} 記事配列
 */
export async function getArchivedArticles() {
  const articles = await getArticles();
  return articles.filter(article => article.status === ARTICLE_STATUS.ARCHIVED);
}

/**
 * 記事を保存
 * @param {Object} article - 記事オブジェクト
 * @returns {Promise<Object>} 保存された記事
 */
export async function saveArticle(article) {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.ARTICLES);
  let articles = data[STORAGE_KEYS.ARTICLES] || [];

  // 同じURLの記事が既にあるかチェック
  const existingIndex = articles.findIndex(a => a.u === article.url);
  if (existingIndex >= 0) {
    // 既存の記事を更新
    articles[existingIndex] = minimizeArticle({
      ...expandArticle(articles[existingIndex]),
      ...article,
      id: articles[existingIndex].i
    });
  } else {
    // 新規追加
    articles.push(minimizeArticle(article));
  }

  // 容量チェック＆古いアーカイブ削除
  articles = await trimIfNeeded(articles);

  await chrome.storage.sync.set({ [STORAGE_KEYS.ARTICLES]: articles });

  return expandArticle(articles[existingIndex >= 0 ? existingIndex : articles.length - 1]);
}

/**
 * 記事をアーカイブ
 * @param {string} articleId - 記事ID
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function archiveArticle(articleId) {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.ARTICLES);
  const articles = data[STORAGE_KEYS.ARTICLES] || [];

  const index = articles.findIndex(a => a.i === articleId);
  if (index === -1) return false;

  articles[index].a = 1;
  await chrome.storage.sync.set({ [STORAGE_KEYS.ARTICLES]: articles });
  return true;
}

/**
 * 記事を削除
 * @param {string} articleId - 記事ID
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function deleteArticle(articleId) {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.ARTICLES);
  let articles = data[STORAGE_KEYS.ARTICLES] || [];

  const initialLength = articles.length;
  articles = articles.filter(a => a.i !== articleId);

  if (articles.length === initialLength) return false;

  await chrome.storage.sync.set({ [STORAGE_KEYS.ARTICLES]: articles });
  return true;
}

/**
 * 記事を未読に戻す
 * @param {string} articleId - 記事ID
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function unarchiveArticle(articleId) {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.ARTICLES);
  const articles = data[STORAGE_KEYS.ARTICLES] || [];

  const index = articles.findIndex(a => a.i === articleId);
  if (index === -1) return false;

  articles[index].a = 0;
  await chrome.storage.sync.set({ [STORAGE_KEYS.ARTICLES]: articles });
  return true;
}

/**
 * 容量超過時に古いアーカイブを削除
 * @param {Array} articles - 記事配列（最小化形式）
 * @returns {Promise<Array>} 調整後の記事配列
 */
async function trimIfNeeded(articles) {
  let size = new Blob([JSON.stringify(articles)]).size;

  if (size <= STORAGE_LIMITS.WARNING_SIZE) {
    return articles;
  }

  // 古いアーカイブから削除
  const archived = articles
    .filter(a => a.a === 1)
    .sort((a, b) => a.s - b.s); // 保存日時の古い順

  while (archived.length > 0 && size > STORAGE_LIMITS.WARNING_SIZE) {
    const oldest = archived.shift();
    const index = articles.findIndex(a => a.i === oldest.i);
    if (index >= 0) {
      articles.splice(index, 1);
      size = new Blob([JSON.stringify(articles)]).size;
    }
  }

  return articles;
}

/**
 * ストレージ使用量を取得
 * @returns {Promise<Object>} 使用量情報
 */
export async function getStorageUsage() {
  const data = await chrome.storage.sync.get(null);
  const used = new Blob([JSON.stringify(data)]).size;
  return {
    used,
    total: STORAGE_LIMITS.MAX_SIZE,
    percentage: Math.round((used / STORAGE_LIMITS.MAX_SIZE) * 100)
  };
}

/**
 * 設定を取得
 * @returns {Promise<Object>} 設定オブジェクト
 */
export async function getSettings() {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEYS.SETTINGS] };
}

/**
 * 設定を保存
 * @param {Object} settings - 設定オブジェクト
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  const current = await getSettings();
  await chrome.storage.sync.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings }
  });
}
