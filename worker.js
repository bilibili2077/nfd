const config = {
  token: ENV_BOT_TOKEN,
  webhook: '/endpoint',
  secret: ENV_BOT_SECRET,
  adminUid: ENV_ADMIN_UID,
};

const cache = {};

function apiUrl(methodName, params = null) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `https://api.telegram.org/bot${config.token}/${methodName}${query}`;
}

async function requestTelegram(methodName, body, params = null, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(apiUrl(methodName, params), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      
      if (!result.ok) throw new Error(`Telegram API 错误: ${JSON.stringify(result)}`);
      
      return result;
    } catch (error) {
      console.error(`请求失败 (尝试 ${i + 1}):`, error);
      if (i === retries - 1) throw error;
    }
  }
}

async function sendMessage(chatId, text, options = {}) {
  return requestTelegram('sendMessage', { chat_id: chatId, text, ...options });
}

async function copyMessage(chatId, fromChatId, messageId) {
  return requestTelegram('copyMessage', {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

async function forwardMessage(chatId, fromChatId, messageId) {
  return requestTelegram('forwardMessage', {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

async function deleteMessage(chatId, messageId) {
  return requestTelegram('deleteMessage', { chat_id: chatId, message_id: messageId });
}

addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === config.webhook) {
    event.respondWith(handleWebhook(event));
  } else {
    event.respondWith(new Response('无效请求', { status: 404 }));
  }
});

async function handleWebhook(event) {
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== config.secret) {
    return new Response('未授权', { status: 403 });
  }

  const update = await event.request.json();
  event.waitUntil(onUpdate(update, event));
  return new Response('OK');
}

async function onUpdate(update, event) {
  if (update.message) return onMessage(update.message, event);
  if (update.callback_query) return onCallbackQuery(update.callback_query);
}

async function onMessage(message, event) {
  if (message.text === '/start') return handleStartCommand(message);
  if (message.chat.id.toString() === config.adminUid) return handleAdminMessage(message, event);
  return handleGuestMessage(message, event);
}

async function handleStartCommand(message) {
  const userId = message.from.id;
  const username = message.from.username || 
                   `${message.from.first_name} ${message.from.last_name}`.trim() || 
                   '⁉️神秘用户';

  const startMsg = `
🎉 你好呀，用户名为➡️：@${username} ⬅️🧣  
🎉 你的用户🆔是：➡️\`${userId}\` ⬅️📋

✨我是[蒂法酱](https://img.110014.xyz/file/KB21lHfb.jpg)的🤖私聊消息转发助手，您的每一条信息，我都会确保快速🚀且准确地送达。
🌈 🔖如何使用我⤵️：  
- 💌 将您想发送的消息（文字💬、图片🖼、文件📁 或其他内容）直接发送给我。  
- 🔒 您的信息将严格保密㊙️，并会立刻提交给蒂法酱。   
🌟 如果有任何问题❓或需要帮助🆘，随时告诉我哦！👇
`.trim();

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: "🌐 皮卡丘的Alist站点",
          url: "https://pan.110014.xyz"
        }
      ]
    ]
  };

  await sendMessage(message.chat.id, startMsg, {
    parse_mode: 'Markdown',
    disable_web_page_preview: false,
    reply_markup: JSON.stringify(replyMarkup)
  });
}

async function handleAdminMessage(message, event) {
  if (!message.reply_to_message) {
    return sendMessage(config.adminUid, "💡 请先双击回复用户的消息，再发送回复!");
  }

  const guestChatId = await getGuestChatId(message.reply_to_message.message_id);
  if (!guestChatId) {
    return sendMessage(config.adminUid, "⚠️ 消息映射已过期，请让用户重新发送消息");
  }

  const sentMessage = await copyMessage(guestChatId, message.chat.id, message.message_id);
  const confirmMsg = await sendMessage(config.adminUid, "✅ 你已成功回复用户！✅");
  
  event.waitUntil(
    new Promise(resolve => setTimeout(resolve, 3 * 1000))
      .then(() => deleteMessage(config.adminUid, confirmMsg.result.message_id))
      .catch(error => console.error('删除管理员确认消息失败:', error))
  );

  return sentMessage;
}

async function handleGuestMessage(message, event) {
  const chatId = message.chat.id;
  try {
    const forwardResult = await forwardMessage(config.adminUid, chatId, message.message_id);
    if (!forwardResult.ok) {
      return sendMessage(chatId, '❌ 消息转发失败，请稍后重试');
    }
    await lBot.put(`msg-map-${forwardResult.result.message_id}`, chatId, { expirationTtl: 86400 });
    const confirmMsg = await sendMessage(chatId, '✅ 消息已送达，看到后会尽快回复你的！✅');
    event.waitUntil(
      new Promise(resolve => setTimeout(resolve, 3 * 1000))
        .then(() => deleteMessage(chatId, confirmMsg.result.message_id))
        .catch(error => console.error('删除确认消息失败:', error))
    );
  } catch (error) {
    console.error('处理用户消息时出错:', error);
    await sendMessage(chatId, '❌ 系统错误，请稍后重试');
  }
}

async function getGuestChatId(messageId) {
  return lBot.get(`msg-map-${messageId}`, { type: 'json' });
}
