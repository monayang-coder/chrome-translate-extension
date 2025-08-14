// sidebar.js
document.addEventListener('DOMContentLoaded', () => {
  const inputText = document.getElementById('inputText');
  const fromLangSelect = document.getElementById('fromLang');
  const toLangSelect = document.getElementById('toLang');
  const translateButton = document.getElementById('translateButton'); // 保持按钮，用户仍可手动点击
  const translatePageButton = document.getElementById('translatePageButton');
  const restorePageButton = document.getElementById('restorePageButton'); // 获取新按钮
  const translationResult = document.getElementById('translationResult');

  // 初始化时尝试获取页面选中文字 (可以保留，但在自动翻译模式下优先级不高)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      // 这里的 chrome.scripting.executeScript 是针对 popup 的，
      // 对于侧边栏，我们主要依赖 content.js 发送的 selectionChanged 消息
      // 可以选择移除或保留，如果侧边栏打开时想加载已有选中文本
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          function: () => window.getSelection().toString(), // 直接在 sidebar.js 里定义获取选中文字的函数
        },
        (injectionResults) => {
          if (injectionResults && injectionResults[0] && injectionResults[0].result) {
            const initialSelectedText = injectionResults[0].result.trim();
            if (initialSelectedText.length > 0) {
              inputText.value = initialSelectedText;
              // 初始加载时也自动翻译
              triggerTranslation(initialSelectedText, fromLangSelect.value, toLangSelect.value);
            }
          }
        }
      );
    }
  });

  // 手动翻译按钮点击事件
  translateButton.addEventListener('click', () => {
    const textToTranslate = inputText.value.trim();
    if (textToTranslate) {
      triggerTranslation(textToTranslate, fromLangSelect.value, toLangSelect.value);
    } else {
      translationResult.textContent = '请输入或选中要翻译的文本。';
    }
  });

  // 核心改动：监听来自 background.js 的自动翻译请求
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "autoTranslateSelection" && request.text) {
      const selectedText = request.text;
      if (inputText.value !== selectedText) { // 避免重复翻译相同的文本
        inputText.value = selectedText;
        triggerTranslation(selectedText, fromLangSelect.value, toLangSelect.value);
      }
    }
    // 其他可能的 action（如来自 background.js 的翻译结果响应）
    else if (request.action === "displayTranslationResult" && request.translatedText) {
        translationResult.textContent = request.translatedText;
    } else if (request.action === "displayTranslationError" && request.error) {
        translationResult.textContent = '错误: ' + request.error;
    }
  });


  // 封装翻译逻辑为一个函数，方便复用
  function triggerTranslation(text, from, to) {
    translationResult.textContent = '翻译中...';
    // 向 background.js 发送翻译请求
    chrome.runtime.sendMessage({ action: "translate", text: text, from: from, to: to }, (response) => {
      if (response && response.translatedText) {
        translationResult.textContent = response.translatedText;
      } else if (response && response.error) {
        translationResult.textContent = '错误: ' + response.error;
      } else {
        translationResult.textContent = '翻译失败，请稍后再试。';
      }
    });
  }

  // 监听“翻译整个页面”按钮点击事件
  translatePageButton.addEventListener('click', () => {
    translationResult.textContent = '正在翻译整个页面，请稍候...';
    chrome.runtime.sendMessage({
      action: "translatePage",
      from: fromLangSelect.value,
      to: toLangSelect.value
    });
  });

  // 监听“恢复页面”按钮点击事件
  restorePageButton.addEventListener('click', () => {
      translationResult.textContent = '正在恢复页面...';
      chrome.runtime.sendMessage({ action: "restorePage" }, (response) => {
          if (response && response.success) {
              translationResult.textContent = '页面已恢复。';
          } else {
              translationResult.textContent = '恢复页面失败: ' + (response ? response.error : '未知错误');
          }
      });
  });

  // 监听来自 background.js 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "autoTranslateSelection" && request.text) {
      const selectedText = request.text;
      if (inputText.value !== selectedText) {
        inputText.value = selectedText;
        triggerTranslation(selectedText, fromLangSelect.value, toLangSelect.value);
      }
    }
    // 处理页面翻译的反馈
    else if (request.action === "pageTranslationStatus" && request.status) {
        translationResult.textContent = `页面翻译状态: ${request.status}`;
    }
    else if (request.action === "pageTranslationComplete") {
        translationResult.textContent = '页面翻译完成！';
    }
    else if (request.action === "displayTranslationResult" && request.translatedText) {
        translationResult.textContent = request.translatedText;
    } else if (request.action === "displayTranslationError" && request.error) {
        translationResult.textContent = '错误: ' + request.error;
    }
    // 页面内容脚本发送的翻译完成消息
    else if (request.action === "pageTranslationCompleteFromContent") {
        translationResult.textContent = '页面翻译完成！(内容已渲染)';
    }
  });


  function triggerTranslation(text, from, to) {
    translationResult.textContent = '翻译中...';
    chrome.runtime.sendMessage({ action: "translate", text: text, from: from, to: to }, (response) => {
      if (response && response.translatedText) {
        translationResult.textContent = response.translatedText;
      } else if (response && response.error) {
        translationResult.textContent = '错误: ' + response.error;
      } else {
        translationResult.textContent = '翻译失败，请稍后再试。';
      }
    });
  }
});