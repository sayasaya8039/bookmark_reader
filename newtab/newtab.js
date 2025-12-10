import {
  getTodayArticles,
  getPendingArticles,
  getArchivedArticles,
  archiveArticle,
  unarchiveArticle,
  deleteArticle,
  getStorageUsage
} from '../shared/storage.js';
import { formatDate, ARTICLE_STATUS } from '../shared/constants.js';

// DOM要素
const articleList = document.getElementById('article-list');
const emptyState = document.getElementById('empty-state');
const countEl = document.getElementById('count');
const storageFill = document.getElementById('storage-fill');
const storageText = document.getElementById('storage-text');
const tabs = document.querySelectorAll('.tab');
const bulkActions = document.getElementById('bulk-actions');
const selectAllCheckbox = document.getElementById('select-all');
const bulkDeleteBtn = document.getElementById('bulk-delete');

// 現在のフィルター
let currentFilter = 'today';

/**
 * 初期化
 */
async function init() {
  // タブのイベントリスナー
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      selectAllCheckbox.checked = false;
      loadArticles();
    });
  });

  // すべて選択チェックボックス
  selectAllCheckbox.addEventListener('change', handleSelectAll);

  // 一括削除ボタン
  bulkDeleteBtn.addEventListener('click', handleBulkDelete);

  // 記事を読み込み
  await loadArticles();

  // ストレージ使用量を表示
  await updateStorageUsage();

  // ストレージ変更を監視
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      loadArticles();
      updateStorageUsage();
    }
  });
}

/**
 * 記事を読み込んで表示
 */
async function loadArticles() {
  let articles;

  switch (currentFilter) {
    case 'today':
      articles = await getTodayArticles();
      break;
    case 'all':
      articles = await getPendingArticles();
      break;
    case 'archived':
      articles = await getArchivedArticles();
      break;
    default:
      articles = await getTodayArticles();
  }

  // 予定日時でソート（近い順）
  articles.sort((a, b) => a.scheduledFor - b.scheduledFor);

  // 件数を更新
  countEl.textContent = articles.length;

  // アーカイブタブのときだけ一括操作を表示
  if (currentFilter === 'archived' && articles.length > 0) {
    bulkActions.classList.remove('hidden');
  } else {
    bulkActions.classList.add('hidden');
  }

  // 表示を切り替え
  if (articles.length === 0) {
    articleList.innerHTML = '';
    emptyState.classList.remove('hidden');
    updateEmptyMessage();
  } else {
    emptyState.classList.add('hidden');
    renderArticles(articles);
  }
}

/**
 * 空状態のメッセージを更新
 */
function updateEmptyMessage() {
  const textEl = emptyState.querySelector('.empty-text');
  const hintEl = emptyState.querySelector('.empty-hint');

  switch (currentFilter) {
    case 'today':
      textEl.textContent = '今日読む記事はありません';
      hintEl.textContent = 'ゆっくり休んでください';
      break;
    case 'all':
      textEl.textContent = '未読の記事はありません';
      hintEl.textContent = '拡張機能アイコンをクリックして記事を追加しましょう';
      break;
    case 'archived':
      textEl.textContent = 'アーカイブした記事はありません';
      hintEl.textContent = '読了した記事がここに表示されます';
      break;
  }
}

/**
 * 記事をレンダリング
 */
function renderArticles(articles) {
  articleList.innerHTML = articles.map(article => createArticleCard(article)).join('');

  // イベントリスナーを設定
  articleList.querySelectorAll('.btn-done').forEach(btn => {
    btn.addEventListener('click', handleArchive);
  });

  articleList.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', handleRestore);
  });

  articleList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', handleDelete);
  });
}

/**
 * 記事カードのHTMLを生成
 */
function createArticleCard(article) {
  const isArchived = article.status === ARTICLE_STATUS.ARCHIVED;
  const domain = getDomain(article.url);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  const showCheckbox = currentFilter === 'archived';

  return `
    <div class="article-card ${isArchived ? 'archived' : ''}" data-id="${article.id}">
      ${showCheckbox ? `
        <div class="article-checkbox">
          <input type="checkbox" class="article-select" data-id="${article.id}">
        </div>
      ` : ''}
      <div class="article-favicon">
        <img src="${faviconUrl}" alt="" onerror="this.style.display='none'; this.parentElement.textContent='📄';">
      </div>
      <div class="article-content">
        <a href="${escapeHtml(article.url)}" class="article-title" target="_blank" rel="noopener">
          ${escapeHtml(article.title || 'タイトルなし')}
        </a>
        <div class="article-meta">
          <span class="article-date">${formatDate(article.scheduledFor)}</span>
          <span class="article-url">${escapeHtml(domain)}</span>
        </div>
      </div>
      <div class="article-actions">
        ${isArchived
          ? `<button class="btn btn-restore" data-id="${article.id}">戻す</button>`
          : `<button class="btn btn-done" data-id="${article.id}">読了</button>`
        }
        <button class="btn btn-delete" data-id="${article.id}">削除</button>
      </div>
    </div>
  `;
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
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 読了ボタンのハンドラー
 */
async function handleArchive(e) {
  const id = e.target.dataset.id;
  await archiveArticle(id);
  await loadArticles();
}

/**
 * 戻すボタンのハンドラー
 */
async function handleRestore(e) {
  const id = e.target.dataset.id;
  await unarchiveArticle(id);
  await loadArticles();
}

/**
 * 削除ボタンのハンドラー
 */
async function handleDelete(e) {
  const id = e.target.dataset.id;
  if (confirm('この記事を削除しますか？')) {
    await deleteArticle(id);
    await loadArticles();
  }
}

/**
 * すべて選択チェックボックスのハンドラー
 */
function handleSelectAll(e) {
  const isChecked = e.target.checked;
  const checkboxes = articleList.querySelectorAll('.article-select');
  checkboxes.forEach(checkbox => {
    checkbox.checked = isChecked;
  });
}

/**
 * 一括削除ボタンのハンドラー
 */
async function handleBulkDelete() {
  const checkboxes = articleList.querySelectorAll('.article-select:checked');
  const ids = Array.from(checkboxes).map(cb => cb.dataset.id);

  if (ids.length === 0) {
    alert('削除する記事を選択してください');
    return;
  }

  if (!confirm(`${ids.length}件の記事を削除しますか？`)) {
    return;
  }

  // 選択された記事を削除
  for (const id of ids) {
    await deleteArticle(id);
  }

  selectAllCheckbox.checked = false;
  await loadArticles();
}

/**
 * ストレージ使用量を更新
 */
async function updateStorageUsage() {
  const usage = await getStorageUsage();
  storageFill.style.width = `${usage.percentage}%`;
  storageText.textContent = `${usage.percentage}%`;

  // 80%を超えたら警告色
  if (usage.percentage > 80) {
    storageFill.style.background = '#ff9800';
  } else {
    storageFill.style.background = 'white';
  }
}

// 初期化を実行
init();
