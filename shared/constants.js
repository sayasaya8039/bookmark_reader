// ストレージキー
export const STORAGE_KEYS = {
  ARTICLES: 'articles',
  SETTINGS: 'settings'
};

// 記事ステータス
export const ARTICLE_STATUS = {
  PENDING: 0,   // 未読
  ARCHIVED: 1   // アーカイブ済み
};

// 読む時期プリセット
export const SCHEDULE_PRESETS = {
  TONIGHT: 'tonight',     // 今夜
  WEEKEND: 'weekend',     // 週末
  NEXT_WEEK: 'nextWeek',  // 来週
  CUSTOM: 'custom'        // カスタム
};

// デフォルト設定
export const DEFAULT_SETTINGS = {
  notifyTime: '20:00',    // 通知時刻
  notifyEnabled: true     // 通知有効
};

// ストレージ制限
export const STORAGE_LIMITS = {
  MAX_SIZE: 102400,       // 100KB
  WARNING_SIZE: 80000,    // 80KB（警告閾値）
  MAX_TITLE_LENGTH: 80    // タイトル最大文字数
};

// アラーム名
export const ALARM_NAMES = {
  DAILY_REMINDER: 'daily-reminder'
};

/**
 * 読む時期のタイムスタンプを計算
 * @param {string} preset - プリセット種別
 * @param {Date} [customDate] - カスタム日時
 * @returns {number} Unixタイムスタンプ（ミリ秒）
 */
export function calculateScheduledTime(preset, customDate = null) {
  const now = new Date();

  switch (preset) {
    case SCHEDULE_PRESETS.TONIGHT: {
      // 今日の20:00
      const tonight = new Date(now);
      tonight.setHours(20, 0, 0, 0);
      // もう20時を過ぎていたら明日の20時
      if (tonight <= now) {
        tonight.setDate(tonight.getDate() + 1);
      }
      return tonight.getTime();
    }

    case SCHEDULE_PRESETS.WEEKEND: {
      // 次の土曜日
      const saturday = new Date(now);
      const dayOfWeek = saturday.getDay();
      const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
      saturday.setDate(saturday.getDate() + daysUntilSaturday);
      saturday.setHours(10, 0, 0, 0);
      return saturday.getTime();
    }

    case SCHEDULE_PRESETS.NEXT_WEEK: {
      // 7日後
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(20, 0, 0, 0);
      return nextWeek.getTime();
    }

    case SCHEDULE_PRESETS.CUSTOM: {
      if (customDate) {
        return customDate.getTime();
      }
      // フォールバック: 明日の20時
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(20, 0, 0, 0);
      return tomorrow.getTime();
    }

    default:
      return now.getTime();
  }
}

/**
 * 日付をフォーマット
 * @param {number} timestamp - Unixタイムスタンプ（ミリ秒）
 * @returns {string} フォーマットされた日付文字列
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今日';
  } else if (diffDays === 1) {
    return '明日';
  } else if (diffDays < 7) {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${weekdays[date.getDay()]}曜日`;
  } else {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

/**
 * ユニークIDを生成
 * @returns {string} ユニークID
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
