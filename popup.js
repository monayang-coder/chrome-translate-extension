document.addEventListener('DOMContentLoaded', () => {
  const inputText = document.getElementById('inputText');
  const fromLangSelect = document.getElementById('fromLang'); // 新增
  const toLangSelect = document.getElementById('toLang');     // 新增
  const translateButton = document.getElementById('translateButton');
  const translationResult = document.getElementById('translationResult');

  // 获取页面选中文字
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        function: getSelectedText,
      },
      (injectionResults) => {
        if (injectionResults && injectionResults[0] && injectionResults[0].result) {
          inputText.value = injectionResults[0].result;
        }
      }
    );
  });

  function getSelectedText() {
    return window.getSelection().toString();
  }

  translateButton.addEventListener('click', () => {
    const textToTranslate = inputText.value.trim();
    const fromLang = fromLangSelect.value; // 获取源语言
    const toLang = toLangSelect.value;     // 获取目标语言

    if (textToTranslate) {
      translationResult.textContent = '翻译中...';
      // 向 background.js 发送消息进行翻译，并包含语言信息
      chrome.runtime.sendMessage(
        { action: "translate", text: textToTranslate, from: fromLang, to: toLang },
        (response) => {
          if (response && response.translatedText) {
            translationResult.textContent = response.translatedText;
          } else if (response && response.error) {
            translationResult.textContent = '错误: ' + response.error;
          } else {
            translationResult.textContent = '翻译失败，请稍后再试。';
          }
        }
      );
    } else {
      translationResult.textContent = '请输入或选中要翻译的文本。';
    }
  });
});