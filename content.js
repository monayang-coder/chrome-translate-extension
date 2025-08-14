// content.js
console.log("Content script loaded for page translation.");

let lastSelectedText = "";

document.addEventListener('mouseup', () => {
  const currentSelectedText = window.getSelection().toString().trim();
  if (currentSelectedText.length > 0 && currentSelectedText !== lastSelectedText) {
    lastSelectedText = currentSelectedText;
    chrome.runtime.sendMessage({ action: "selectionChanged", selectedText: currentSelectedText });
  } else if (currentSelectedText.length === 0 && lastSelectedText.length > 0) {
    lastSelectedText = "";
  }
});

// >>> 关键改动：监听来自 background.js 的命令 <<<
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 页面文本提取请求
    if (request.action === "extractPageContent") {
        const textNodes = [];
        const originalElements = [];

        const tagsToTranslate = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'span', 'div', 'a', 'b', 'strong', 'em', 'i', 'blockquote', 'code', 'pre']; // 增加更多常见标签

        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: function(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toLowerCase();
                    // 过滤掉脚本、样式、元数据、隐藏元素、以及用户通常不希望翻译的元素
                    if (['script', 'style', 'noscript', 'meta', 'link', 'br', 'hr', 'img', 'input', 'textarea', 'select', 'button', 'svg', 'canvas', 'audio', 'video', 'iframe'].includes(tagName)) {
                        return NodeFilter.FILTER_SKIP;
                    }
                    // 检查是否隐藏 (display: none, visibility: hidden, content-visibility: hidden)
                    const computedStyle = window.getComputedStyle(node);
                    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.contentVisibility === 'hidden') {
                        return NodeFilter.FILTER_SKIP;
                    }
                     // 跳过头部和导航等可能不希望翻译的区域 (需要根据实际页面结构调整)
                    if (node.closest('header, nav, footer, .sidebar, #comments, #modal-root')) { // 示例：可以添加更多id/class
                        return NodeFilter.FILTER_SKIP;
                    }
                    // 检查是否有 data-original-index 属性，避免二次处理已经处理过的元素
                    if (node.hasAttribute('data-original-index')) {
                        return NodeFilter.FILTER_SKIP;
                    }
                } else if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.nodeValue.trim();
                    if (text.length > 0) {
                        let parent = node.parentNode;
                        while (parent && parent !== document.body) {
                            const computedStyle = window.getComputedStyle(parent);
                            if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.contentVisibility === 'hidden') {
                                return NodeFilter.FILTER_REJECT;
                            }
                            parent = parent.parentNode;
                        }
                        // 过滤掉纯数字或很短的文本，通常不是有效翻译内容
                        if (!isNaN(text) || text.length < 2) { // 过滤纯数字和过短文本
                             return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
                return NodeFilter.FILTER_SKIP;
            }
        });

        let currentNode;
        while (currentNode = walk.nextNode()) {
            if (currentNode.nodeType === Node.TEXT_NODE && currentNode.nodeValue.trim().length > 0) {
                let parentElement = currentNode.parentElement;
                while(parentElement && !tagsToTranslate.includes(parentElement.tagName.toLowerCase()) && parentElement !== document.body) {
                    parentElement = parentElement.parentElement;
                }

                if (parentElement && tagsToTranslate.includes(parentElement.tagName.toLowerCase())) {
                    // 尝试以一个可翻译的父元素为一个段落
                    // 如果这个父元素还没有被标记过
                    if (!parentElement.hasAttribute('data-translation-id')) {
                        const uniqueId = `translation-${Date.now()}-${originalElements.length}`;
                        parentElement.setAttribute('data-translation-id', uniqueId);
                        originalElements.push({
                            id: uniqueId,
                            text: parentElement.textContent.trim()
                        });
                        textNodes.push(parentElement.textContent.trim());
                    }
                }
            }
        }
        // 返回提取到的文本和它们的唯一标识符
        sendResponse({ texts: textNodes, originalElementsData: originalElements });
        return true; // 表示异步响应
    }

    // 页面翻译结果渲染请求
    if (request.action === "renderTranslatedContent") {
        const translatedSegments = request.translatedSegments;

        const styleElementId = 'chrome-translation-styles';
        if (!document.getElementById(styleElementId)) {
            const style = document.createElement('style');
            style.id = styleElementId;
            style.textContent = `
                .translation-wrapper {
                    /* display: flex; */
                    /* flex-direction: column; */
                    /* align-items: flex-start; */
                    /* margin-bottom: 5px; */
                }
                .original-text-hidden {
                    display: none !important; /* 隐藏原文 */
                }
                .translation-pair {
                    margin-bottom: 1em; /* 段落间距 */
                }
                .translated-text {
                    color: #007bff;
                    font-weight: bold;
                    display: block;
                    margin-top: 3px;
                    font-size: 1.1em;
                    background-color: #e6f2ff;
                    padding: 2px 5px;
                    border-radius: 3px;
                }
                .chrome-translate-original-text {
                    /* 原始文本的样式，可以在译文上方或旁边 */
                }
                /* 双语对照模式的容器 */
                .chrome-translate-bilingual-container {
                    /* 可以让原文和译文并排，如果需要 */
                    /* display: flex; */
                    /* justify-content: space-between; */
                    /* align-items: flex-start; */
                    /* gap: 10px; */
                }
            `;
            document.head.appendChild(style);
        }

        translatedSegments.forEach(segment => {
            const originalElement = document.querySelector(`[data-translation-id="${segment.id}"]`);

            if (originalElement) {
                // 检查是否已经有翻译容器
                let translationPair = originalElement.querySelector('.translation-pair-wrapper');
                if (!translationPair) {
                    translationPair = document.createElement('span'); // 使用span或div
                    translationPair.className = 'translation-pair-wrapper';

                    // 移动原始内容到新的容器中
                    const originalContentSpan = document.createElement('span');
                    originalContentSpan.className = 'chrome-translate-original-text';
                    // 遍历原始元素的子节点并移动到新的span中
                    while (originalElement.firstChild) {
                        originalContentSpan.appendChild(originalElement.firstChild);
                    }
                    translationPair.appendChild(originalContentSpan);
                    originalElement.appendChild(translationPair);
                }

                // 检查是否已经有翻译文本
                let translatedTextSpan = translationPair.querySelector('.translated-text');
                if (!translatedTextSpan) {
                    translatedTextSpan = document.createElement('span');
                    translatedTextSpan.className = 'translated-text';
                    translationPair.appendChild(translatedTextSpan);
                }
                translatedTextSpan.textContent = segment.translated;

                // 如果想要原文和译文都显示，可以保持 originalContentSpan 可见
                // 如果只显示译文，或者点击切换，可以设置 originalContentSpan.style.display = 'none';

                // 移除标记，以便在需要时再次处理
                // originalElement.removeAttribute('data-translation-id'); // 移除此属性后下次就不会再找到
            }
        });
        sendResponse({ success: true }); // 响应渲染完成
        return true;
    }

    // 恢复页面到翻译前的状态请求
    if (request.action === "restorePageContent") {
        // 找到所有翻译相关的注入内容并移除
        document.querySelectorAll('.translation-pair-wrapper').forEach(wrapper => {
            const parent = wrapper.parentNode;
            if (parent) {
                const originalTextSpan = wrapper.querySelector('.chrome-translate-original-text');
                if (originalTextSpan) {
                    // 将原始内容移回父元素
                    while(originalTextSpan.firstChild) {
                        parent.appendChild(originalTextSpan.firstChild);
                    }
                }
                parent.removeAttribute('data-translation-id'); // 移除标记
                wrapper.remove(); // 移除 wrapper
            }
        });

        const styleElement = document.getElementById(styleElementId);
        if (styleElement) {
            styleElement.remove();
        }
        sendResponse({ success: true });
        return true;
    }

    // 默认返回 false 表示不发送异步响应
    return false;
});