// 确保 md5.min.js 已经加载
// 如果 md5.min.js 文件正确加载，md5 函数将可用
// console.log(typeof md5); // 应该输出 "function"

importScripts('md5.min.js'); // 确保 md5.min.js 在同级目录

// 你的百度翻译 API 凭证
const BAIDU_APP_ID = ""; // 替换为你的 App ID
const BAIDU_SECRET_KEY = ""; // 替换为你的密钥

const BAIDU_TRANSLATE_API_URL = "https://fanyi-api.baidu.com/api/trans/vip/translate";

// let panelVisible = false;


// chrome.action.onClicked.addListener(async (tab) => {
//   panelVisible = !panelVisible;

//   await chrome.sidePanel.setOptions({
//     tabId: tab.id,
//     path: "sidebar.html",
//     enabled: panelVisible
//   });

//   if (panelVisible) {
//     // 展开 Side Panel
//     await chrome.sidePanel.open({ tabId: tab.id });
//   } else {
//     // 收起 Side Panel
//     // 注意：目前 Chrome API 没有直接 close() 方法
//     // 只能通过切换 enabled=false 或让用户手动关闭
//     await chrome.sidePanel.setOptions({
//       tabId: tab.id,
//       enabled: false
//     });
//   }
// });

// 让图标点击 = 开关 side panel
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidebar.html',
    enabled: true
  });
  chrome.sidePanel.open({ tabId: tab.id });
});

async function callBaiduTranslateAPI(text, fromLang, toLang) {
    if (!text) {
        throw new Error('翻译文本不能为空');
    }
    const salt = (new Date).getTime();
    const signString = BAIDU_APP_ID + text + salt + BAIDU_SECRET_KEY;
    const sign = md5(signString);

    const params = new URLSearchParams();
    params.append('q', text);
    params.append('from', fromLang);
    params.append('to', toLang);
    params.append('appid', BAIDU_APP_ID);
    params.append('salt', salt);
    params.append('sign', sign);

    const response = await fetch(BAIDU_TRANSLATE_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });

    if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status} - ${response.statusText}`);
    }
    const data = await response.json();
    if (data.trans_result && data.trans_result.length > 0) {
        return data.trans_result[0].dst;
    } else if (data.error_code) {
        throw new Error(`翻译失败，错误码: ${data.error_code}, 消息: ${data.error_msg}`);
    } else {
        throw new Error('翻译失败，无法解析结果。');
    }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理文本翻译请求（来自 sidebar.js）
  if (request.action === "translate") {
    callBaiduTranslateAPI(request.text, request.from, request.to)
      .then(translatedText => {
        sendResponse({ translatedText: translatedText });
      })
      .catch(error => {
        console.error('文本翻译API请求出错:', error);
        sendResponse({ error: error.message || '文本翻译失败。' });
      });
    return true; // 异步响应
  }

  // 处理来自 content.js 的选中文本消息，转发给 sidebar.js
  if (request.action === "selectionChanged" && request.selectedText) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && sender.tab.id === tabs[0].id) {
        chrome.runtime.sendMessage({
          action: "autoTranslateSelection",
          text: request.selectedText
        });
      }
    });
  }

  // >>> 关键改动：处理页面翻译请求 (来自 sidebar.js) <<<
  if (request.action === "translatePage") {
    const fromLang = request.from;
    const toLang = request.to;

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;

        // 1. 通知 sidebar 正在处理
        chrome.runtime.sendMessage({ action: "pageTranslationStatus", status: "正在提取页面内容..." });

        try {
          // 2. 向 content.js 发送消息，请求提取页面内容
          // 注意：这里不再直接调用函数名，而是发送消息
          const responseFromContent = await chrome.tabs.sendMessage(tabId, { action: "extractPageContent" });

          if (!responseFromContent || !responseFromContent.texts || !responseFromContent.originalElementsData) {
            throw new Error("无法从页面提取内容或数据格式不正确。");
          }

          const textSegments = responseFromContent.texts;
          const originalElementsData = responseFromContent.originalElementsData;

          if (!textSegments || textSegments.length === 0) {
            chrome.runtime.sendMessage({ action: "pageTranslationStatus", status: "页面没有可翻译的文本。" });
            return;
          }

          chrome.runtime.sendMessage({ action: "pageTranslationStatus", status: `共发现 ${textSegments.length} 段文本，开始翻译...` });

          const translatedSegments = [];
          // 3. 批量翻译
          // 优化：百度翻译API支持单次请求最大6000字节。可以考虑将文本分批发送。
          // 这里简化为逐个翻译，实际应实现批量逻辑。
          for (let i = 0; i < textSegments.length; i++) {
              const originalText = textSegments[i];
              const elementData = originalElementsData[i]; // 获取对应的元素数据

              if (originalText.trim().length > 0) {
                  try {
                      const translatedText = await callBaiduTranslateAPI(originalText, fromLang, toLang);
                      translatedSegments.push({
                          id: elementData.id, // 使用元素的唯一ID
                          original: originalText,
                          translated: translatedText
                      });
                  } catch (e) {
                      console.error(`翻译 ID 为 ${elementData.id} 的文本失败: ${originalText}`, e);
                      translatedSegments.push({
                          id: elementData.id,
                          original: originalText,
                          translated: `[翻译失败: ${e.message}]`
                      });
                  }
              } else {
                  translatedSegments.push({
                      id: elementData.id,
                      original: originalText,
                      translated: ""
                  });
              }
              // 可以在这里发送翻译进度给 sidebar
              chrome.runtime.sendMessage({ action: "pageTranslationStatus", status: `翻译进度: ${Math.floor(((i + 1) / textSegments.length) * 100)}%` });
          }

          // 4. 向 content.js 发送消息，命令它渲染翻译结果
          await chrome.tabs.sendMessage(tabId, {
            action: "renderTranslatedContent",
            translatedSegments: translatedSegments
          });

          chrome.runtime.sendMessage({ action: "pageTranslationComplete" });

        } catch (error) {
          console.error('页面翻译过程中发生错误:', error);
          chrome.runtime.sendMessage({ action: "pageTranslationStatus", status: `页面翻译失败: ${error.message}` });
        }
      }
    });
    return true; // 异步响应
  }

  // >>> 新增：处理侧边栏请求恢复页面 <<<
  if (request.action === "restorePage") {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0]) {
              try {
                  await chrome.tabs.sendMessage(tabs[0].id, { action: "restorePageContent" });
                  sendResponse({ success: true });
              } catch (error) {
                  console.error("恢复页面内容失败:", error);
                  sendResponse({ success: false, error: error.message });
              }
          } else {
              sendResponse({ success: false, error: "没有找到活跃的标签页。" });
          }
      });
      return true;
  }
});