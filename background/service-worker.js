import { saveArticle, getTodayArticles, getSettings } from '../shared/storage.js';
import {
  ALARM_NAMES,
  ARTICLE_STATUS,
  calculateScheduledTime,
  SCHEDULE_PRESETS
} from '../shared/constants.js';

/**
 * 拡張機能インストール時の初期化
 */
chrome.runtime.onInstalled.addListener(async () => {
  // コンテキストメニューを作成（ページ用 - 親メニュー）
  chrome.contextMenus.create({
    id: 'save-page',
    title: '後で読む',
    contexts: ['page']
  });

  // ページ用サブメニュー
  chrome.contextMenus.create({
    id: 'save-page-tonight',
    parentId: 'save-page',
    title: '🌙 今夜',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'save-page-weekend',
    parentId: 'save-page',
    title: '☀️ 週末',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'save-page-nextweek',
    parentId: 'save-page',
    title: '📅 来週',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'save-page-custom',
    parentId: 'save-page',
    title: '⚙️ カスタム...',
    contexts: ['page']
  });

  // リンク用 - 親メニュー
  chrome.contextMenus.create({
    id: 'save-link',
    title: 'リンクを後で読む',
    contexts: ['link']
  });

  // リンク用サブメニュー
  chrome.contextMenus.create({
    id: 'save-link-tonight',
    parentId: 'save-link',
    title: '🌙 今夜',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'save-link-weekend',
    parentId: 'save-link',
    title: '☀️ 週末',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'save-link-nextweek',
    parentId: 'save-link',
    title: '📅 来週',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'save-link-custom',
    parentId: 'save-link',
    title: '⚙️ カスタム...',
    contexts: ['link']
  });

  // 通知アラームを設定
  await setupDailyAlarm();

  // バッジを更新
  await updateBadge();
});

/**
 * Service Worker起動時
 */
chrome.runtime.onStartup.addListener(async () => {
  // アラームが存在するか確認し、なければ再作成
  const alarm = await chrome.alarms.get(ALARM_NAMES.DAILY_REMINDER);
  if (!alarm) {
    await setupDailyAlarm();
  }

  // バッジを更新
  await updateBadge();
});

/**
 * コンテキストメニュークリック時
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;

  // 親メニューがクリックされた場合は無視（サブメニューのみ処理）
  if (menuId === 'save-page' || menuId === 'save-link') {
    return;
  }

  let url, title, preset;

  // リンク用メニュー
  if (menuId.startsWith('save-link-')) {
    url = info.linkUrl;
    if (info.selectionText) {
      title = info.selectionText;
    } else {
      title = await getLinkText(tab.id, info.linkUrl);
    }
    preset = menuId.replace('save-link-', '');
  }
  // ページ用メニュー
  else if (menuId.startsWith('save-page-')) {
    url = info.pageUrl || tab.url;
    title = await getPageTitle(tab.id) || tab.title;
    preset = menuId.replace('save-page-', '');
  } else {
    return;
  }

  // タイトルがない場合はURLから生成
  if (!title) {
    title = generateTitleFromUrl(url);
  }

  // カスタムの場合はピッカーウィンドウを開く
  if (preset === 'custom') {
    const pickerUrl = chrome.runtime.getURL('picker/picker.html') +
      `?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;

    chrome.windows.create({
      url: pickerUrl,
      type: 'popup',
      width: 320,
      height: 320,
      focused: true
    });
    return;
  }

  // プリセットをSCHEDULE_PRESETSの形式に変換
  const presetMap = {
    'tonight': SCHEDULE_PRESETS.TONIGHT,
    'weekend': SCHEDULE_PRESETS.WEEKEND,
    'nextweek': SCHEDULE_PRESETS.NEXT_WEEK
  };
  const schedulePreset = presetMap[preset] || SCHEDULE_PRESETS.TONIGHT;

  try {
    const scheduledFor = calculateScheduledTime(schedulePreset);
    const savedArticle = await saveArticle({
      url,
      title,
      scheduledFor,
      status: ARTICLE_STATUS.PENDING
    });

    // バッジを更新
    await updateBadge();

    // 予定時刻にアラームを設定
    await scheduleArticleAlarm(savedArticle.id, scheduledFor, title, url);

  } catch (error) {
    console.error('保存エラー:', error);
  }
});

/**
 * ページタイトルを取得
 */
async function getPageTitle(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title
    });
    return results[0]?.result || null;
  } catch (error) {
    console.error('タイトル取得エラー:', error);
    return null;
  }
}

/**
 * リンクテキストを取得
 */
async function getLinkText(tabId, linkUrl) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (url) => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.href === url) {
            const text = link.textContent?.trim();
            if (text) return text;
          }
        }
        return null;
      },
      args: [linkUrl]
    });
    return results[0]?.result || null;
  } catch (error) {
    console.error('リンクテキスト取得エラー:', error);
    return null;
  }
}

/**
 * URLからタイトルを生成
 */
function generateTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      const name = decodeURIComponent(lastPart.replace(/\.[^.]+$/, ''));
      return name.replace(/[-_]/g, ' ') || urlObj.hostname;
    }
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * 記事用のアラームを設定
 */
async function scheduleArticleAlarm(articleId, scheduledFor, title, url) {
  const alarmName = `article-${articleId}`;

  // アラーム情報をストレージに保存（アラーム発火時に使用）
  const alarmData = await chrome.storage.local.get('articleAlarms') || {};
  const alarms = alarmData.articleAlarms || {};
  alarms[alarmName] = { title, url, articleId };
  await chrome.storage.local.set({ articleAlarms: alarms });

  // アラームを設定
  await chrome.alarms.create(alarmName, {
    when: scheduledFor
  });

  console.log(`アラーム設定: ${alarmName} at ${new Date(scheduledFor).toLocaleString()}`);
}

/**
 * アラーム発火時
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // 記事ごとのアラーム
  if (alarm.name.startsWith('article-')) {
    const alarmData = await chrome.storage.local.get('articleAlarms');
    const alarms = alarmData.articleAlarms || {};
    const articleInfo = alarms[alarm.name];

    if (articleInfo) {
      // 通知を表示
      chrome.notifications.create(
        alarm.name,
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: articleInfo.title || 'タイトルなし',
          message: '読む時間です！'
        }
      );

      // アラーム情報を削除
      delete alarms[alarm.name];
      await chrome.storage.local.set({ articleAlarms: alarms });
    }
  }
  // 毎日のリマインダー
  else if (alarm.name === ALARM_NAMES.DAILY_REMINDER) {
    const settings = await getSettings();

    if (settings.notifyEnabled) {
      const articles = await getTodayArticles();

      if (articles.length > 0) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: '今日読む記事があります',
          message: `${articles.length}件の記事が待っています`,
          buttons: [{ title: '今すぐ読む' }]
        });
      }
    }

    // 次の日のアラームを設定
    await setupDailyAlarm();
  }
});

/**
 * 通知クリック時
 */
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // 記事の通知の場合、その記事を開く
  if (notificationId.startsWith('article-')) {
    const alarmData = await chrome.storage.local.get('articleAlarms');
    const alarms = alarmData.articleAlarms || {};
    const articleInfo = alarms[notificationId];

    if (articleInfo && articleInfo.url) {
      chrome.tabs.create({ url: articleInfo.url });
    } else {
      chrome.tabs.create({ url: 'chrome://newtab' });
    }
  } else {
    chrome.tabs.create({ url: 'chrome://newtab' });
  }

  // 通知を閉じる
  chrome.notifications.clear(notificationId);
});

/**
 * 通知ボタンクリック時
 */
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    chrome.tabs.create({ url: 'chrome://newtab' });
  }
});

/**
 * メッセージ受信（ポップアップ/ピッカーからのリクエスト）
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateBadge') {
    updateBadge();
    sendResponse({ success: true });
  } else if (message.type === 'saveArticle') {
    // ピッカーからの保存リクエスト
    (async () => {
      try {
        const savedArticle = await saveArticle({
          url: message.data.url,
          title: message.data.title,
          scheduledFor: message.data.scheduledFor,
          status: ARTICLE_STATUS.PENDING
        });
        await updateBadge();

        // 予定時刻にアラームを設定
        await scheduleArticleAlarm(
          savedArticle.id,
          message.data.scheduledFor,
          message.data.title,
          message.data.url
        );

        sendResponse({ success: true });
      } catch (error) {
        console.error('保存エラー:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 非同期レスポンスのため
  }
  return true;
});

/**
 * ストレージ変更時にバッジを更新
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.articles) {
    updateBadge();
  }
});

/**
 * 毎日の通知アラームを設定
 */
async function setupDailyAlarm() {
  const settings = await getSettings();
  const [hours, minutes] = settings.notifyTime.split(':').map(Number);

  const now = new Date();
  const alarmTime = new Date();
  alarmTime.setHours(hours, minutes, 0, 0);

  // 既に過ぎている場合は明日に設定
  if (alarmTime <= now) {
    alarmTime.setDate(alarmTime.getDate() + 1);
  }

  await chrome.alarms.create(ALARM_NAMES.DAILY_REMINDER, {
    when: alarmTime.getTime()
  });
}

/**
 * バッジを更新
 */
async function updateBadge() {
  try {
    const articles = await getTodayArticles();
    const count = articles.length;

    await chrome.action.setBadgeText({
      text: count > 0 ? String(count) : ''
    });

    await chrome.action.setBadgeBackgroundColor({
      color: '#667eea'
    });
  } catch (error) {
    console.error('バッジ更新エラー:', error);
  }
}
