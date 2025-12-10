import { saveArticle, getArticles, getTodayArticles } from '../shared/storage.js';
import {
  SCHEDULE_PRESETS,
  calculateScheduledTime,
  formatDate,
  ARTICLE_STATUS
} from '../shared/constants.js';

// DOM要素
const faviconEl = document.getElementById('favicon');
const pageTitleEl = document.getElementById('page-title');
const pageUrlEl = document.getElementById('page-url');
const scheduleButtons = document.querySelectorAll('.schedule-btn');
const customDateSection = document.getElementById('custom-date-section');
const customDatetime = document.getElementById('custom-datetime');
const saveBtn = document.getElementById('save-btn');
const messageEl = document.getElementById('message');
const recentList = document.getElementById('recent-list');
const todaySection = document.getElementById('today-section');
const todayList = document.getElementById('today-list');
const openNewtab = document.getElementById('open-newtab');

// 現在のタブ情報
let currentTab = null;
let selectedPreset = SCHEDULE_PRESETS.TONIGHT;

/**
 * 初期化
 */
async function init() {
  // 現在のタブ情報を取得
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // ページ情報を表示
  displayPageInfo(tab);

  // スケジュールボタンのイベントリスナー
  scheduleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      scheduleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPreset = btn.dataset.preset;

      // カスタムの場合は日時選択を表示
      if (selectedPreset === SCHEDULE_PRESETS.CUSTOM) {
        customDateSection.classList.remove('hidden');
        // デフォルト値を設定（明日の20時）
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(20, 0, 0, 0);
        customDatetime.value = formatDatetimeLocal(tomorrow);
      } else {
        customDateSection.classList.add('hidden');
      }
    });
  });

  // 保存ボタン
  saveBtn.addEventListener('click', handleSave);

  // 新しいタブで開くリンク
  openNewtab.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://newtab' });
    window.close();
  });

  // 今読む記事を表示
  await loadTodayArticles();

  // 最近の記事を表示
  await loadRecentArticles();
}

/**
 * ページ情報を表示
 */
function displayPageInfo(tab) {
  pageTitleEl.textContent = tab.title || 'タイトルなし';
  pageUrlEl.textContent = getDomain(tab.url);

  // ファビコンを表示
  if (tab.favIconUrl) {
    faviconEl.innerHTML = `<img src="${tab.favIconUrl}" alt="">`;
  } else {
    const domain = getDomain(tab.url);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=40`;
    faviconEl.innerHTML = `<img src="${faviconUrl}" alt="" onerror="this.style.display='none'; this.parentElement.textContent='📄';">`;
  }
}

/**
 * URLからドメインを取得
 */
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * datetime-local用の日時フォーマット
 */
function formatDatetimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 保存ボタンのハンドラー
 */
async function handleSave() {
  if (!currentTab) return;

  saveBtn.disabled = true;

  try {
    // 予定日時を計算
    let scheduledFor;
    if (selectedPreset === SCHEDULE_PRESETS.CUSTOM && customDatetime.value) {
      scheduledFor = new Date(customDatetime.value).getTime();
    } else {
      scheduledFor = calculateScheduledTime(selectedPreset);
    }

    // 記事を保存
    await saveArticle({
      url: currentTab.url,
      title: currentTab.title,
      scheduledFor,
      status: ARTICLE_STATUS.PENDING
    });

    // 成功メッセージ
    showMessage('保存しました！', 'success');

    // バッジを更新するようService Workerに通知
    chrome.runtime.sendMessage({ type: 'updateBadge' });

    // 最近の記事を更新
    await loadRecentArticles();

  } catch (error) {
    console.error('保存エラー:', error);
    showMessage('保存に失敗しました', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * メッセージを表示
 */
function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.classList.remove('hidden');

  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 3000);
}

/**
 * 今読む記事を読み込み（予定時刻が過ぎた記事）
 */
async function loadTodayArticles() {
  const now = Date.now();
  const articles = await getArticles();

  // 予定時刻が過ぎた未読記事を取得
  const readyArticles = articles
    .filter(a => a.status === ARTICLE_STATUS.PENDING && a.scheduledFor <= now)
    .sort((a, b) => a.scheduledFor - b.scheduledFor);

  if (readyArticles.length === 0) {
    todaySection.classList.add('hidden');
    return;
  }

  todaySection.classList.remove('hidden');
  todayList.innerHTML = readyArticles.map(article => {
    const domain = getDomain(article.url);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=20`;

    return `
      <a href="${escapeHtml(article.url)}" class="today-item" target="_blank" rel="noopener">
        <div class="today-favicon">
          <img src="${faviconUrl}" alt="" onerror="this.style.display='none';">
        </div>
        <div class="today-info">
          <div class="today-title">${escapeHtml(article.title || 'タイトルなし')}</div>
          <div class="today-url">${escapeHtml(domain)}</div>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * 最近の記事を読み込み
 */
async function loadRecentArticles() {
  const articles = await getArticles();

  // 未読の記事を保存日時の新しい順でソート、上位3件を取得
  const recent = articles
    .filter(a => a.status === ARTICLE_STATUS.PENDING)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 3);

  if (recent.length === 0) {
    recentList.innerHTML = '<div class="recent-empty">まだ記事がありません</div>';
    return;
  }

  recentList.innerHTML = recent.map(article => {
    const domain = getDomain(article.url);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=20`;

    return `
      <a href="${escapeHtml(article.url)}" class="recent-item" target="_blank" rel="noopener">
        <div class="recent-favicon">
          <img src="${faviconUrl}" alt="" onerror="this.style.display='none';">
        </div>
        <div class="recent-title">${escapeHtml(article.title || 'タイトルなし')}</div>
        <div class="recent-date">${formatDate(article.scheduledFor)}</div>
      </a>
    `;
  }).join('');
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初期化を実行
init();
