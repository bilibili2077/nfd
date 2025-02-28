const TOKEN = ENV_BOT_TOKEN;
const WEBHOOK = '/endpoint';
const SECRET = ENV_BOT_SECRET;
const ADMIN_UID = ENV_ADMIN_UID;
const NOTIFY_INTERVAL = 7 * 24 * 3600 * 1000;
const fraudDb = 'https://raw.githubusercontent.com/LloydAsp/nfd/main/data/fraud.db';
const startMsgUrl = 'https://raw.githubusercontent.com/bilibili2077/nfd/refs/heads/main/data/startMessage.md';
const userDataTemplateUrl = 'https://raw.githubusercontent.com/bilibili2077/nfd/refs/heads/main/data/userdata.md';
const helpTemplateUrl = 'https://raw.githubusercontent.com/bilibili2077/nfd/refs/heads/main/data/helpMessage.md';
const blockListTemplateUrl = 'https://raw.githubusercontent.com/bilibili2077/nfd/refs/heads/main/data/blockListTemplate.md';
const fraudListTemplateUrl = 'https://raw.githubusercontent.com/bilibili2077/nfd/refs/heads/main/data/fraudListTemplate.md';
const LOCAL_FRAUD_PREFIX = 'fraud-local-';

function apiUrl(methodName， params = null) {
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${params ? '?' + new URLSearchParams(params) : ''}`;
}

function requestTelegram(methodName， body， params = null) {
  return fetch(apiUrl(methodName， params)， body)。then(r => r。json());
}

function makeReqBody(body) {
  return { method: 'POST'， headers: { 'content-type': 'application/json' }， body: JSON。stringify(body) };
}

function sendMessage(msg) {
  return requestTelegram('sendMessage'， makeReqBody(msg));
}

function sendError(chatId， errorMsg) {
  return sendMessage({ chat_id: chatId， text: `⚠️ ${errorMsg}`， parse_mode: 'Markdown' });
}

function copyMessage(msg) {
  return requestTelegram('copyMessage'， makeReqBody(msg));
}

function forwardMessage(msg) {
  return requestTelegram('forwardMessage'， makeReqBody(msg));
}

function deleteMessage(msg) {
  return requestTelegram('deleteMessage'， makeReqBody(msg));
}

function getChat(chat_id) {
  return requestTelegram('getChat'， null， { chat_id });
}

addEventListener('fetch'， event => {
  const url = new URL(event。request。url);
  if (url。pathname === WEBHOOK) event。respondWith(handleWebhook(event));
  else if (url。pathname === '/registerWebhook') event。respondWith(registerWebhook(event， url， WEBHOOK， SECRET));
  else if (url。pathname === '/unRegisterWebhook') event。respondWith(unRegisterWebhook(event));
  else event。respondWith(new Response('No handler for this request'));
});

async function handleWebhook(event) {
  if (event。request。headers。get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized'， { status: 403 });
  }
  const update = await event。request。json();
  event。waitUntil(onUpdate(update));
  return new Response('Ok');
}

async function onUpdate(update) {
  if ('message' in update) await onMessage(update。message);
  else if ('callback_query' in update) await onCallbackQuery(update。callback_query);
}

async function onCallbackQuery(callbackQuery) {
  const { id， from， message， data } = callbackQuery;
  if (from。id。toString() !== ADMIN_UID) {
    return requestTelegram('answerCallbackQuery'， makeReqBody({ callback_query_id: id， text: "⚠️ 权限不足" }));
  }
  const [action， userId] = data。split(':');
  const chatId = message。chat。id;
  const messageId = message。message_id;
  let caption;

  try {
    switch (action) {
      case 'confirm_block':
        await performBlock(userId);
        caption = `✅ 已屏蔽用户 \`${userId}\`\n操作时间：${formatAdminTime()}`;
        break;
      case 'view_profile':
        return handleUserInfo(message, userId);
      case 'confirm_unblock':
        await lBot.delete('isblocked-' + userId);
        caption = `✅ 已解除屏蔽用户 \`${userId}\``;
        break;
      case 'cancel_block':
      case 'cancel_unblock':
      case 'cancel_add_fraud':
      case 'cancel_remove_fraud':
        caption = "❌ 操作已取消";
        await requestTelegram('editMessageCaption', makeReqBody({ chat_id: chatId, message_id: messageId, caption, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }));
        break;
      case 'confirm_add_fraud':
        await performAddFraud(userId);
        caption = `✅ 已添加欺诈用户 ${userId}\n操作时间：${formatAdminTime()}`;
        break;
      case 'confirm_remove_fraud':
        await lBot.delete(LOCAL_FRAUD_PREFIX + userId);
        caption = `✅ 已移除欺诈用户 ${userId}`;
        break;
      default:
        caption = "❌ 未知操作";
    }
    await requestTelegram('editMessageCaption', makeReqBody({ chat_id: chatId, message_id: messageId, caption, parse_mode: 'Markdown' }));
  } catch (error) {
    await requestTelegram('editMessageCaption', makeReqBody({ chat_id: chatId, message_id: messageId, caption: `❌ 操作失败：${error.message}`, parse_mode: 'Markdown' }));
  }
  return requestTelegram('answerCallbackQuery', makeReqBody({ callback_query_id: id }));
}

async function performBlock(userId) {
  if (await lBot.get(`isblocked-${userId}`)) throw new Error('该用户已被屏蔽');
  const [targetUser, operatorInfo] = await Promise.all([getChat(userId), getChat(ADMIN_UID)]);
  const storeData = {
    target: { id: userId, name: [targetUser.result.last_name, targetUser.result.first_name].filter(Boolean).join(' ') || '未知', username: targetUser.result.username || '无' },
    operator: { name: [operatorInfo.result.last_name, operatorInfo.result.first_name].filter(Boolean).join(' ') || '系统管理员', username: operatorInfo.result.username || '无' },
    timestamp: Date.now()
  };
  await lBot.put(`isblocked-${userId}`, JSON.stringify(storeData));
}

async function performAddFraud(userId) {
  const [targetUser, operatorInfo] = await Promise.all([getChat(userId), getChat(ADMIN_UID)]);
  const storeData = {
    target: { id: userId, name: [targetUser.result.last_name, targetUser.result.first_name].filter(Boolean).join(' ') || '未知', username: targetUser.result.username || '无' },
    operator: { name: [operatorInfo.result.last_name, operatorInfo.result.first_name].filter(Boolean).join(' ') || '系统管理员', username: operatorInfo.result.username || '无' },
    timestamp: Date.now()
  };
  await lBot.put(LOCAL_FRAUD_PREFIX + userId, JSON.stringify(storeData));
}

async function onMessage(message) {
  const { chat, text, from, reply_to_message } = message;
  const chatId = chat.id.toString();

  if (text?.startsWith('/') && text !== '/start') {
    if (chatId !== ADMIN_UID) {
      const { result } = await sendMessage({ chat_id: chatId, text: '⛔ 该指令仅主人可用' });
      setTimeout(() => deleteMessage({ chat_id: result.chat.id, message_id: result.message_id }), 480);
      return;
    }
  }

  if (text === '/start') {
    const userId = from.id;
    const username = from.username || [from.last_name, from.first_name].filter(Boolean).join(' ') || '未知用户';
    let startMsg = await fetch(startMsgUrl).then(r => r.text());
    startMsg = startMsg.replace('{{username}}', username).replace('{{user_id}}', userId);
    return sendMessage({
      chat_id: chatId,
      text: startMsg,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '皮卡丘的Alist站点', url: 'https://pan.110014.xyz' }]] }
    });
  }

  if (chatId === ADMIN_UID) {
    const commands = {
      '/blocklist': handleBlockList,
      '/localfraudlist': handleLocalFraudList,
      '/help': handleHelpCommand，
      '/status': handleStatusCommand，
      '/block': handleBlock，
      '/unblock': handleUnBlock，
      '/checkblock': checkBlock
    };
    if (commands[text]) return commands[text](message);
    if (/^\/fraud(_add)?(?:\s+(\d+))?$/。test(text)) return handleFraud(message， text。split(' ')[1]);
    if (/^\/unfraud(_remove)?(?:\s+(\d+))?$/。test(text)) return handleUnFraud(message， text。split(' ')[1]);
    if (/^\/userinfo\s+\d+$/。test(text)) return handleUserInfo(message， text。split(' ')[1]);
    if (/^\/unblockid\s+\d+$/。test(text)) return handleUnBlockById(message， text。split(' ')[1]);

    const guestChatId = await lBot。get('msg-map-' + reply_to_message?.message_id， { type: 'json' });
    if (guestChatId) return copyMessage({ chat_id: guestChatId， from_chat_id: chatId， message_id: message。message_id });
  }
  return handleGuestMessage(message);
}

async function handleHelpCommand(message) {
  try {
    const [template， blockedCount， fraudCount] = await Promise。all([fetch(helpTemplateUrl)。then(r => r。text())， getLocalBlockedCount()， getLocalFraudCount()]);
    const finalText = template。replace('{{botName}}'， '蒂法酱')。replace('{{blockedCount}}'， blockedCount)。replace('{{fraudCount}}'， fraudCount)。replace('{{updateTime}}'， formatAdminTime());
    return sendMessage({ chat_id: ADMIN_UID， text: finalText， parse_mode: 'Markdown'， disable_web_page_preview: true });
  } catch (error) {
    return sendError(ADMIN_UID， `帮助菜单加载失败：${error。message}`);
  }
}

async function handleStatusCommand(message) {
  try {
    const [blockedCount， fraudCount] = await Promise。all([getLocalBlockedCount()， getLocalFraudCount()]);
    const statusText = `🤖 *机器人状态监控*\n\n🛡️ 本地屏蔽访客：${blockedCount} 人\n🚨 欺诈访客记录：${fraudCount} 人\n🔄 最后更新：${formatAdminTime()}`;
    return sendMessage({ chat_id: ADMIN_UID， text: statusText， parse_mode: 'Markdown' });
  } catch (error) {
    return sendError(ADMIN_UID， `状态获取失败：${error。message}`);
  }
}

async function getLocalCount(prefix) {
  let count = 0， cursor = null;
  do {
    const list = await lBot。list({ prefix， cursor });
    count += list。keys。length;
    cursor = list。list_complete ? null : list。cursor;
  } while (cursor);
  return count;
}

const getLocalBlockedCount = () => getLocalCount('isblocked-');
const getLocalFraudCount = () => getLocalCount(LOCAL_FRAUD_PREFIX);

async function loadListData(prefix) {
  const 用户 = [];
  let cursor = null;
  do {
    const list = await lBot。list({ prefix， cursor });
    for (const key of list。keys) {
      const rawData = await lBot。get(key。name， { type: 'json' });
      if (rawData) 用户。push({ id: key。name。replace(prefix， ''), ...rawData });
    }
    cursor = list。list_complete ? null : list。cursor;
  } while (cursor);
  return 用户;
}

function formatAdminTime(date = new Date()) {
  return date。toLocaleString('zh-CN'， { year: 'numeric'， month: '2-digit'， day: '2-digit'， hour: '2-digit'， minute: '2-digit'， second: '2-digit'， hour12: false })。replace(/\//g， '-');
}

async function isFraud(id) {
  const db = await fetch(fraudDb)。then(r => r。text());
  return db。split('\n')。filter(v => v)。includes(id。toString());
}

async function isLocalFraud(id) {
  return !!(await lBot。get(LOCAL_FRAUD_PREFIX + id， { type: 'json' }));
}

async function checkFraud(id) {
  return (await isFraud(id)) || (await isLocalFraud(id));
}

async function handleLocalFraudList(message) {
  try {
    const [template， fraudList] = await Promise。all([fetch(fraudListTemplateUrl)。then(r => r。text())， loadListData(LOCAL_FRAUD_PREFIX)]);
    const keyboard = fraudList。map(user => [
      { text: "👤资料"， callback_data: `view_profile:${user。target。id}` }，
      { text: `✅用户 ${user。target。id}`， callback_data: `confirm_remove_fraud:${user。target。id}` }
    ]);
    const usersSection = fraudList。map((user， i) => {
      const operator = user。operator。username ? `${user。operator。name} (@${user。operator。username})` : user。operator。name;
      return `🔸 用户 ${i + 1}\n├─🚫 用户ID：\`${user。target。id}\`\n├─📛 全称：${user。target。name}\n├─📧 用户名：${user。target。username === '无' ? '（未设置）' : '@' + user。target。username}\n├─🛡️ 操作人：${operator}\n└─⏰ 时间：${formatAdminTime(new Date(user。timestamp))}`;
    })。join('\n\n');
    const finalText = template。replace('{{count}}'， fraudList。length)。replace('{{users}}'， fraudList。length ? usersSection : '当前无欺诈访客记录')。replace('{{updateTime}}'， formatAdminTime());
    return sendMessage({ chat_id: ADMIN_UID， text: finalText， parse_mode: 'Markdown'， reply_markup: { inline_keyboard: keyboard } });
  } catch (error) {
    return sendError(ADMIN_UID， `欺诈列表加载失败：${error。message}`);
  }
}

async function handleBlockList(message) {
  try {
    const [template， blockedUsers] = await Promise。all([fetch(blockListTemplateUrl)。then(r => r。text())， loadListData('isblocked-')]);
    const keyboard = blockedUsers。map(user => [
      { text: "👤资料"， callback_data: `view_profile:${user。target。id}` }，
      { text: `✅解除 ${user。target。id}`， callback_data: `confirm_unblock:${user。target。id}` }
    ]);
    const usersSection = blockedUsers。map((user， i) => {
      const operator = user。operator。username ? `${user。operator。name} (@${user。operator。username})` : user。operator。name;
      return `🔸 用户 ${i + 1}\n├─🚫 用户ID：\`${user。target。id}\`\n├─📛 全称：${user。target。name}\n├─📧 用户名：${user。target。username === '无' ? '（未设置）' : '@' + user。target。username}\n├─🛡️ 操作人：${operator}\n└─⏰ 时间：${formatAdminTime(new Date(user。timestamp))}`;
    })。join('\n\n');
    const finalText = template。replace('{{count}}'， blockedUsers。length)。replace('{{users}}'， usersSection)。replace('{{updateTime}}'， formatAdminTime());
    return sendMessage({ chat_id: ADMIN_UID， text: finalText， parse_mode: 'Markdown'， reply_markup: { inline_keyboard: keyboard } });
  } catch (error) {
    return sendError(ADMIN_UID， `屏蔽列表加载失败：${error。message}`);
  }
}

function getConfirmKeyboard(action， userId， extraButton = null) {
  const base = [{ text: `✅ 确认${action === 'block' ? '屏蔽' : action === 'unblock' ? '解除' : action === 'add_fraud' ? '添加' : '移除'}`， callback_data: `confirm_${action}:${userId}` }];
  if (extraButton) base。push(extraButton);
  base。push({ text: "❌ 取消"， callback_data: `cancel_${action}:${userId}` });
  return { inline_keyboard: [base] };
}

async function handleBlock(message) {
  const guestChatId = await lBot。get('msg-map-' + message。reply_to_message?.message_id， { type: "json" });
  if (!guestChatId) return sendError(ADMIN_UID， "请回复一条消息");
  if (await lBot。get('isblocked-' + guestChatId)) return sendError(ADMIN_UID， `用户 ${guestChatId} 已在屏蔽名单中`);
  if (guestChatId === ADMIN_UID) return sendError(ADMIN_UID， "不能屏蔽自己");
  return sendMessage({
    chat_id: ADMIN_UID，
    text: `⚠️ *屏蔽确认*\n\n即将屏蔽用户：\`${guestChatId}\`\n\n请确认操作：`，
    parse_mode: 'Markdown'，
    reply_markup: getConfirmKeyboard('block'， guestChatId， { text: "👤 查看资料"， callback_data: `view_profile:${guestChatId}` })
  });
}

async function handleUnBlock(message) {
  const guestChatId = await lBot。get('msg-map-' + message。reply_to_message?.message_id， { type: "json" });
  if (!guestChatId) return sendError(ADMIN_UID， "请回复一条消息");
  return sendMessage({
    chat_id: ADMIN_UID，
    text: `⚠️ *解除屏蔽确认*\n\n即将解除用户：\`${guestChatId}\`\n\n请确认操作：`，
    parse_mode: 'Markdown'，
    reply_markup: getConfirmKeyboard('unblock'， guestChatId)
  });
}

async function handleFraud(message， userId) {
  const guestChatId = userId || await lBot。get('msg-map-' + message。reply_to_message?.message_id， { type: "json" });
  if (!guestChatId) return sendError(ADMIN_UID， userId ? `访客不存在` : "请回复一条消息或提供用户ID");
  if (await lBot。get(LOCAL_FRAUD_PREFIX + guestChatId)) return sendError(ADMIN_UID， `访客 ${guestChatId} 已在欺诈名单中`);
  const chatRes = await getChat(guestChatId);
  if (!chatRes。ok) return sendError(ADMIN_UID， `访客不存在：${chatRes。description}`);
  return sendMessage({
    chat_id: ADMIN_UID,
    text: `⚠️ 添加欺诈用户确认\n\n即将添加用户：${guestChatId}`,
    parse_mode: 'Markdown',
    reply_markup: getConfirmKeyboard('add_fraud'， guestChatId， { text: "👤 查看资料"， callback_data: `view_profile:${guestChatId}` })
  });
}

async function handleUnFraud(message， userId) {
  const guestChatId = userId || await lBot。get('msg-map-' + message。reply_to_message?.message_id， { type: "json" });
  if (!guestChatId) return sendError(ADMIN_UID， userId ? `访客不存在` : "请回复一条消息或提供用户ID");
  if (!(await lBot。get(LOCAL_FRAUD_PREFIX + guestChatId))) return sendError(ADMIN_UID， `访客 \`${guestChatId}\` 不在欺诈名单中`);
  return sendMessage({
    chat_id: ADMIN_UID，
    text: `⚠️ 移除欺诈用户确认\n\n用户ID：${guestChatId}`，
    parse_mode: 'Markdown'，
    reply_markup: getConfirmKeyboard('remove_fraud'， guestChatId)
  });
}

async function handleGuestMessage(message) {
  const chatId = message。chat。id;
  if (await lBot。get('isblocked-' + chatId)) return sendMessage({ chat_id: chatId， text: '隔断天涯路，言辞难再通' });
  const sentMessage = await sendMessage({ chat_id: chatId， text: '✅消息已送达，看到后会尽快回复你的' });
  setTimeout(() => deleteMessage({ chat_id: chatId， message_id: sentMessage。result。message_id })， 460);
  const forwardReq = await forwardMessage({ chat_id: ADMIN_UID， from_chat_id: chatId， message_id: message。message_id });
  if (forwardReq。ok) await lBot。put('msg-map-' + forwardReq。result。message_id， chatId);
  if (await checkFraud(chatId)) {
    const fullName = [message。from。first_name， message。from。last_name]。filter(Boolean)。join(' ') || '无';
    const reportText = `📛 欺诈访客消息报警\n\n用户ID：\`${chatId}\`\n用户名：@${message。from。username || '无'}\n姓名：${fullName}\n消息内容：\n\`\`\`\n${message。text || '（非文本消息）'}\n\`\`\``;
    await sendMessage({ chat_id: ADMIN_UID， text: reportText， parse_mode: 'Markdown' });
  }
}

async function handleUserInfo(message， userId) {
  try {
    const chatRes = await getChat(userId);
    if (!chatRes。ok) return sendError(ADMIN_UID， `获取用户信息失败：${chatRes。description || '未知错误'}`);
    const template = await fetch(userDataTemplateUrl)。then(r => r。text());
    const user = chatRes。result;
    const filledTemplate = template
      。replace('{{userid}}'， user。id)
      。replace('{{fullname}}'， [user。last_name， user。first_name]。filter(n => n && n。trim())。join(' ') || '未设置')
      。replace('{{username}}'， user。username ? '@' + user。username : '无')
      。replace('{{isbot}}'， user。is_bot ? '是 🤖' : '否 👤')
      。replace('{{lang}}'， user。language_code || '未知')
      。replace('{{status}}'， '🔍 活跃度分析需高级权限');
    return sendMessage({ chat_id: ADMIN_UID， text: filledTemplate， parse_mode: 'Markdown'， disable_web_page_preview: true });
  } catch (error) {
    return sendError(ADMIN_UID， `查询出错：${error。message}`);
  }
}

async function checkBlock(message) {
  const guestChatId = await lBot。get('msg-map-' + message。reply_to_message?.message_id， { type: "json" });
  if (!guestChatId) return sendError(ADMIN_UID， "请回复一条消息");
  const blockedData = await lBot。get('isblocked-' + guestChatId， { type: "json" });
  if (blockedData) {
    const target = blockedData。target || {}， operator = blockedData。operator || {}， timestamp = new Date(blockedData。timestamp || Date。当前());
    const infoText = `🔒 *用户屏蔽状态*\n\n▫️ 用户ID：\`${target。id || '未知'}\`\n▫️ 用户全名：${target。name || '未设置'}\n▫️ 用户账号：${target。username ? '@' + target。username : '未设置'}\n\n🛡️ *操作信息*\n▫️ 操作者：${operator。name || '系统操作'}\n▫️ 操作账号：${operator。username ? '@' + operator。username : '未记录'}\n▫️ 屏蔽时间：${formatAdminTime(timestamp)}`;
    return sendMessage({ chat_id: ADMIN_UID， text: infoText， parse_mode: 'Markdown' });
  }
  return sendMessage({ chat_id: ADMIN_UID， text: `🔓 用户 \`${guestChatId}\` 未在屏蔽列表中`， parse_mode: 'Markdown' });
}

async function handleUnBlockById(message， userId) {
  try {
    if (userId === ADMIN_UID) return sendError(ADMIN_UID， "不能解除屏蔽自己");
    const chatRes = await getChat(userId);
    if (!chatRes。ok) return sendError(ADMIN_UID， `用户不存在：${chatRes。description || '未知错误'}`);
    await lBot。delete('isblocked-' + userId);
    return sendMessage({ chat_id: ADMIN_UID， text: `✅ 已解除屏蔽该访客：${userId}`， parse_mode: 'Markdown' });
  } catch (error) {
    return sendError(ADMIN_UID， `解除屏蔽失败：${error。message}`);
  }
}

async function registerWebhook(event， requestUrl， suffix， secret) {
  try {
    const webhookUrl = `${requestUrl。protocol}//${requestUrl。hostname}${suffix}`;
    const response = await fetch(apiUrl('setWebhook'， { url: webhookUrl， secret_token: secret }));
    const result = await response。json();
    return new Response(result。ok ? 'Webhook 注册成功 ✅' : `错误: ${result。description}`);
  } catch (error) {
    return new Response(`严重错误: ${error。message}`， { status: 500 });
  }
}

async function unRegisterWebhook(event) {
  try {
    const response = await fetch(apiUrl('deleteWebhook'));
    const result = await response。json();
    return new Response(result。ok ? 'Webhook 取消注册成功 ✅' : `错误: ${result。description}`);
  } catch (error) {
    return new Response(`严重错误: ${error。message}`， { status: 500 });
  }
}
