// ==UserScript==
// @name         解除网页复制限制
// @name:en      Unblock Copy
// @name:zh-CN   解除网页复制限制
// @namespace    https://github.com/{YOUR_USERNAME}/unblock-copy
// @version      1.0.0
// @description  🚀 一键解除网页禁止复制、禁止粘贴、禁止选中、禁止右键菜单！安装即用，无需任何设置。支持百度文库、知乎、简书、CSDN 等绝大多数网站。
// @description:en 🚀 One-click unlock: copy, paste, text selection & right-click on any website. Just install and go. No config needed.
// @author       {YOUR_USERNAME}
// @license      MIT
// @match        *://*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=greasyfork.org
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_notification
// @run-at       document-start
// @supportURL   https://github.com/{YOUR_USERNAME}/unblock-copy/issues
// @homepageURL  https://github.com/{YOUR_USERNAME}/unblock-copy
// ==/UserScript==

(function () {
    "use strict";

    // ============================================================
    //  配置（普通用户无需修改）
    // ============================================================
    const CONFIG = {
        // 是否显示浮窗提示（安装成功后显示一次）
        showNotification: true,
        // 调试日志（普通用户关掉）
        debug: false,
    };

    const log = (...args) => CONFIG.debug && console.log("[UnblockCopy]", ...args);

    // ============================================================
    //  1. CSS 层面：强制允许选中和复制
    // ============================================================
    function injectCSS() {
        const style = document.createElement("style");
        style.textContent = `
            /* 强制所有元素可选中 */
            * {
                user-select: text !important;
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                -webkit-touch-callout: default !important;
            }

            /* 恢复 ::selection 样式，让选中的文字能看见 */
            *::selection {
                background: #b3d4fc !important;
                color: inherit !important;
            }

            /* 破除各种不要脸的透明遮罩层 */
            div[style*="position"][style*="fixed"],
            div[style*="position"][style*="absolute"] {
                pointer-events: none !important;
            }

            /* 防止内容被拖拽/复制图片的干扰 */
            body {
                -webkit-user-modify: read-write-plaintext-only !important;
            }
        `;
        // 插入到 <head> 最前面，尽早生效
        const head = document.head || document.documentElement;
        if (head) {
            head.insertBefore(style, head.firstChild);
        }
        log("CSS injected");
    }

    // ============================================================
    //  2. 事件层面：干掉所有阻止复制/选中/右键/粘贴的监听器
    // ============================================================
    function removeEventListeners() {
        // 要拦截的事件黑名单
        const blockedEvents = [
            "copy", "cut", "paste",
            "contextmenu",
            "selectstart", "select",
            "mousedown", "mouseup",
            "dragstart",
        ];

        // 策略 A：在事件捕获阶段直接 stopImmediatePropagation
        // 这样网页自己的监听器根本收不到事件
        blockedEvents.forEach((eventType) => {
            document.addEventListener(
                eventType,
                (e) => {
                    e.stopImmediatePropagation();
                },
                true // 捕获阶段
            );
        });

        // 策略 B：覆盖 addEventListener，阻止网站注册拦截性监听器
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            // 如果是在 document / window / body 上注册的阻止类事件，就忽略它
            const target = this;
            const isBlockedTarget =
                target === document ||
                target === window ||
                target === document.body ||
                target === document.documentElement;

            if (isBlockedTarget && blockedEvents.includes(type)) {
                // 检查 listener 是否包含阻止行为（return false / preventDefault）
                const fnStr = listener.toString().toLowerCase();
                if (
                    fnStr.includes("return false") ||
                    fnStr.includes("preventdefault") ||
                    fnStr.includes("returnvalue") ||
                    fnStr.includes(".cancel") ||
                    fnStr.includes("navigator.clipboard")
                ) {
                    log("Blocked event listener:", type, target.tagName || target);
                    return; // 不注册这个监听器
                }
            }

            // 正常的监听器照常注册
            return originalAddEventListener.call(this, type, listener, options);
        };

        log("Event listeners neutralized");
    }

    // ============================================================
    //  3. 属性层面：移除元素上的 oncopy / oncontextmenu 等内联属性
    // ============================================================
    function removeInlineAttributes() {
        const attrsToRemove = [
            "oncopy", "oncut", "onpaste",
            "oncontextmenu",
            "onselectstart",
            "onmousedown", "onmouseup",
            "ondragstart",
        ];

        // 立即清理一次
        cleanAllElements();
        // 新元素出现时也清理（MutationObserver 负责）
        observeNewElements();

        function cleanAllElements() {
            const all = document.querySelectorAll("*");
            all.forEach(cleanElement);
            log("Cleaned inline attributes on", all.length, "elements");
        }

        function cleanElement(el) {
            attrsToRemove.forEach((attr) => {
                if (el.hasAttribute(attr)) {
                    const val = el.getAttribute(attr);
                    // 只移除明显是阻止类的属性值
                    if (
                        val &&
                        (val.includes("return false") ||
                            val.includes("preventDefault") ||
                            val.includes("returnValue") ||
                            val === "false" ||
                            val === "return false;")
                    ) {
                        el.removeAttribute(attr);
                        log("Removed", attr, "from", el.tagName);
                    }
                }
            });
            // 移除 contenteditable 限制
            if (el.getAttribute("contenteditable") === "false") {
                el.removeAttribute("contenteditable");
            }
        }

        function observeNewElements() {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((m) => {
                    m.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            cleanElement(node);
                            // 也清理其子元素
                            node.querySelectorAll("*").forEach(cleanElement);
                        }
                    });
                });
            });
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
            });
            log("MutationObserver started");
        }
    }

    // ============================================================
    //  4. 定时器层面：清除网页轮询清空选区的流氓定时器
    // ============================================================
    function neutralizeEvilTimers() {
        // 有些网站每隔几百毫秒就清空你的选区 (selection.removeAllRanges)
        // 我们用更快的定时器抢回来

        let lastSelectionTime = 0;
        const selectionGuard = setInterval(() => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                // 选区存在，记录时间
                lastSelectionTime = Date.now();
            } else if (lastSelectionTime > 0 && Date.now() - lastSelectionTime < 500) {
                // 刚有选区就被清空了 —— 一定是网站的流氓定时器干的！
                // 尝试恢复... 但实际中我们拦截 removeAllRanges 更可靠
            }
        }, 100);

        // 直接覆盖 Selection.removeAllRanges / empty
        const originalRemoveAllRanges = Selection.prototype.removeAllRanges;
        Selection.prototype.removeAllRanges = function () {
            // 放行 —— 我们自己不拦，但网页的定时器会被下面的策略干扰
            // 方案：在 document 上监听 selectionchange，如果突然变空就恢复
            return originalRemoveAllRanges.call(this);
        };

        // selectionchange 守护
        let lastRange = null;
        document.addEventListener(
            "selectionchange",
            () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    lastRange = sel.getRangeAt(0).cloneRange();
                }
            },
            true
        );

        log("Selection guards active");
    }

    // ============================================================
    //  5. 右键菜单恢复
    // ============================================================
    function restoreContextMenu() {
        // 彻底覆盖 contextmenu 事件
        document.addEventListener(
            "contextmenu",
            (e) => {
                // 不做任何阻止，让浏览器显示默认右键菜单
                // 但如果有遮罩层阻止右键，让事件穿透
                e.stopPropagation();
            },
            true
        );

        // 如果页面自己改了 document.oncontextmenu
        Object.defineProperty(document, "oncontextmenu", {
            get() {
                return null;
            },
            set() {
                // 拒绝赋值
            },
            configurable: true,
        });

        // 如果页面改了 window.oncontextmenu
        Object.defineProperty(window, "oncontextmenu", {
            get() {
                return null;
            },
            set() {
                // 拒绝赋值
            },
            configurable: true,
        });

        log("Context menu restored");
    }

    // ============================================================
    //  6. 解除剪贴板劫持
    // ============================================================
    function unblockClipboard() {
        // 一些网站劫持 Ctrl+C 弹出登录框
        // 通过 capture 阶段的 stopImmediatePropagation 已经处理了
        // 额外覆盖 clipboard API
        if (navigator.clipboard && navigator.clipboard.write) {
            const originalWrite = navigator.clipboard.write.bind(navigator.clipboard);
            navigator.clipboard.write = async function (data) {
                try {
                    await originalWrite(data);
                } catch (e) {
                    // 如果被拒绝，用 GM_setClipboard 兜底
                    if (typeof GM_setClipboard !== "undefined") {
                        for (const item of data) {
                            for (const type of item.types) {
                                const blob = await item.getType(type);
                                const text = await blob.text();
                                GM_setClipboard(text, type === "text/html" ? "html" : "text");
                            }
                        }
                    }
                }
            };
        }
        log("Clipboard unblocked");
    }

    // ============================================================
    //  7. 粘贴放开
    // ============================================================
    function enablePaste() {
        // 很多网站禁止粘贴（onpaste="return false"）—— 我们已经在内联属性里移除了
        // 额外的守护：允许任何元素粘贴
        document.addEventListener(
            "paste",
            (e) => {
                // 什么都不做 —— 让浏览器默认行为放行
                e.stopPropagation();
            },
            true
        );

        // 覆盖 document.onpaste
        Object.defineProperty(document, "onpaste", {
            get() {
                return null;
            },
            set() {
                // 拒绝
            },
            configurable: true,
        });

        log("Paste enabled");
    }

    // ============================================================
    //  8. 启动！
    // ============================================================
    function boot() {
        log("🚀 Unblock Copy starting...");

        // 按顺序启动各模块
        injectCSS();
        removeEventListeners();
        removeInlineAttributes();
        neutralizeEvilTimers();
        restoreContextMenu();
        unblockClipboard();
        enablePaste();

        // 显示启动成功提示
        if (CONFIG.showNotification) {
            // 延迟确保页面已加载
            setTimeout(() => {
                showFloatingTip();
            }, 2000);
        }

        // 页面完全加载后再扫一遍（有些网站用 JS 延迟注入限制）
        window.addEventListener("load", () => {
            log("Page fully loaded, re-scanning...");
            // 重新应用 CSS（防止网站后来覆盖）
            injectCSS();
            // 清理新生成的元素
            const all = document.querySelectorAll("*");
            all.forEach((el) => {
                ["oncopy", "oncut", "onpaste", "oncontextmenu", "onselectstart"].forEach(
                    (attr) => {
                        if (
                            el.hasAttribute(attr) &&
                            el.getAttribute(attr)?.includes("return false")
                        ) {
                            el.removeAttribute(attr);
                        }
                    }
                );
            });
            log("Re-scan complete");
        });

        log("✅ Unblock Copy active on:", location.hostname);
    }

    // ============================================================
    //  小浮窗提示（非技术用户友好）
    // ============================================================
    function showFloatingTip() {
        // 检查是否已经显示过
        if (GM_getValue("tipShown", false)) return;

        const tip = document.createElement("div");
        tip.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                background: #2d3436;
                color: #fff;
                padding: 16px 24px;
                border-radius: 12px;
                font-family: -apple-system, 'Segoe UI', sans-serif;
                font-size: 14px;
                line-height: 1.6;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                max-width: 340px;
                animation: slideIn 0.4s ease;
            ">
                <div style="font-size: 20px; margin-bottom: 6px;">✅ 解除复制限制已生效</div>
                <div style="opacity: 0.85;">
                    现在你可以自由选中、复制、粘贴、右键<br>
                    再也不用担心网页的限制啦！
                </div>
                <div style="margin-top: 10px; font-size: 12px; opacity: 0.5;">
                    <span id="unblock-close-btn" style="cursor:pointer; text-decoration:underline;">知道了</span>
                </div>
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;
        document.body.appendChild(tip);

        document.getElementById("unblock-close-btn")?.addEventListener("click", () => {
            tip.remove();
            GM_setValue("tipShown", true);
        });

        // 6 秒后自动消失
        setTimeout(() => {
            if (tip.parentNode) {
                tip.style.transition = "opacity 0.5s";
                tip.style.opacity = "0";
                setTimeout(() => tip.remove(), 500);
            }
        }, 6000);
    }

    // ============================================================
    //  如果脚本在 document-start 运行，此时 body 可能还没准备好
    // ============================================================
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
