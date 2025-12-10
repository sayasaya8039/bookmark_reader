// URLパラメータから情報を取得
const params = new URLSearchParams(window.location.search);
const articleUrl = params.get('url');
const articleTitle = params.get('title');

// 要素
const datetimeInput = document.getElementById('datetime');
const saveBtn = document.getElementById('save');
const cancelBtn = document.getElementById('cancel');

// デフォルト値を設定（明日の20時）
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(20, 0, 0, 0);
datetimeInput.value = formatDatetimeLocal(tomorrow);

// 最小値を現在時刻に設定
datetimeInput.min = formatDatetimeLocal(new Date());

/**
 * datetime-local用のフォーマット
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
 * 保存ボタン
 */
saveBtn.addEventListener('click', async () => {
  if (!datetimeInput.value) {
    alert('日時を選択してください');
    return;
  }

  const scheduledFor = new Date(datetimeInput.value).getTime();

  // Service Workerにメッセージを送信して保存
  try {
    await chrome.runtime.sendMessage({
      type: 'saveArticle',
      data: {
        url: articleUrl,
        title: articleTitle,
        scheduledFor
      }
    });

    // ウィンドウを閉じる
    window.close();
  } catch (error) {
    console.error('保存エラー:', error);
    alert('保存に失敗しました');
  }
});

/**
 * キャンセルボタン
 */
cancelBtn.addEventListener('click', () => {
  window.close();
});

// Escキーでも閉じる
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
});
