// ==UserScript==
// @name         学习通自动刷课脚本 V3 稳定版（列表连播 · 1-5倍速）
// @namespace    local.codex.xuexitong
// @version      3.5.0
// @description  自动播放、自动切换下一节，目录列表连播，1-5 倍速可调；页面结构异常时安全停止
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '3.5.0';
    const APP_KEY = '__xuexitongPlayerV3';
    const BOOT_TIMER_KEY = '__xuexitongPlayerV3BootTimer';
    const PANEL_ID = 'xtv3-panel';
    const STYLE_ID = 'xtv3-style';
    const RATE_KEY = 'xtv3.playbackRate';
    const COLLAPSE_KEY = 'xtv3.panelCollapsed';

    const TYPE_LABEL = {
        视频: '视频',
        文档: '文档',
        测验: '测验',
        未知: '待识别',
        非视频: '非视频',
    };

    const TYPE_CLASS = {
        视频: 'video',
        文档: 'doc',
        测验: 'quiz',
        未知: 'unknown',
        非视频: 'doc',
    };

    const STATUS_LABEL = {
        idle: '待播放',
        current: '当前',
        loading: '加载中',
        playing: '播放中',
        done: '已完成',
        skipped: '已跳过',
        failed: '失败',
        stopped: '已中断',
    };

    function makeEl(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        return el;
    }

    function clampRate(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1.5;
        const clamped = Math.min(5, Math.max(1, n));
        // 与滑杆的 0.25 步长保持一致，避免显示值和实际值不一致
        return Math.round(clamped * 4) / 4;
    }

    function storageGet(key, fallback) {
        try {
            const value = window.localStorage.getItem(key);
            return value == null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function storageSet(key, value) {
        try {
            window.localStorage.setItem(key, String(value));
        } catch (e) {
            // 隐私模式或禁用 localStorage 时忽略即可
        }
    }

    function readStoredRate() {
        return clampRate(storageGet(RATE_KEY, '1.5'));
    }

    const UI_CSS = `
#${PANEL_ID} {
    position: fixed;
    top: 72px;
    right: 16px;
    z-index: 2147483000;
    width: min(620px, calc(100vw - 32px));
    background: #ffffff;
    color: #1f2937;
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(15, 23, 42, .18);
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    text-align: left;
}
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID} .xtv3-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: linear-gradient(135deg, #1d4ed8, #2563eb);
    color: #ffffff;
    border-radius: 11px 11px 0 0;
}
#${PANEL_ID}.xtv3-collapsed .xtv3-head { border-radius: 11px; }
#${PANEL_ID} .xtv3-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .2px;
    white-space: nowrap;
}
#${PANEL_ID} .xtv3-title b {
    margin-left: 4px;
    padding: 1px 5px;
    border-radius: 5px;
    background: rgba(255, 255, 255, .18);
    font-size: 11px;
    font-weight: 500;
}
#${PANEL_ID} .xtv3-head-spacer { flex: 1 1 auto; }
#${PANEL_ID} .xtv3-head-btn {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, .4);
    background: rgba(255, 255, 255, .12);
    color: #ffffff;
    border-radius: 6px;
    padding: 3px 9px;
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
    cursor: pointer;
}
#${PANEL_ID} .xtv3-head-btn:hover { background: rgba(255, 255, 255, .22); }
#${PANEL_ID} .xtv3-body { padding: 10px 12px 12px; }
#${PANEL_ID}.xtv3-collapsed .xtv3-body { display: none; }

#${PANEL_ID} .xtv3-speed {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 1px 0 9px;
    border-bottom: 1px dashed #e2e8f0;
}
#${PANEL_ID} .xtv3-speed-label {
    color: #475569;
    font-weight: 600;
    white-space: nowrap;
}
#${PANEL_ID} .xtv3-speed input[type="range"] {
    flex: 1 1 150px;
    min-width: 120px;
    margin: 0;
    accent-color: #2563eb;
    cursor: pointer;
}
#${PANEL_ID} .xtv3-rate-out {
    min-width: 42px;
    color: #1d4ed8;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
}
#${PANEL_ID} .xtv3-chips { display: flex; gap: 4px; flex-wrap: wrap; }
#${PANEL_ID} .xtv3-chips button {
    appearance: none;
    border: 1px solid #dbe3ef;
    background: #ffffff;
    color: #475569;
    border-radius: 6px;
    padding: 2px 7px;
    font: inherit;
    font-size: 11px;
    line-height: 1.5;
    cursor: pointer;
}
#${PANEL_ID} .xtv3-chips button:hover { border-color: #93c5fd; color: #1d4ed8; }
#${PANEL_ID} .xtv3-chips button.is-active {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
}

#${PANEL_ID} .xtv3-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 9px;
}
#${PANEL_ID} .xtv3-btn {
    appearance: none;
    border: 1px solid #d7dfeb;
    background: #ffffff;
    color: #334155;
    border-radius: 7px;
    padding: 5px 10px;
    font: inherit;
    font-size: 12px;
    line-height: 1.3;
    cursor: pointer;
}
#${PANEL_ID} .xtv3-btn:hover {
    border-color: #93c5fd;
    background: #f8fbff;
    color: #1d4ed8;
}
#${PANEL_ID} .xtv3-btn.xtv3-primary {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
}
#${PANEL_ID} .xtv3-btn.xtv3-primary:hover {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
}
#${PANEL_ID} .xtv3-count {
    margin-left: auto;
    color: #64748b;
    font-size: 11px;
    white-space: nowrap;
}

#${PANEL_ID} .xtv3-list-wrap {
    max-height: 46vh;
    margin-top: 8px;
    overflow: auto;
    border: 1px solid #e5eaf2;
    border-radius: 8px;
    background: #ffffff;
}
#${PANEL_ID} .xtv3-list {
    margin: 0;
    padding: 0;
    list-style: none;
}
#${PANEL_ID} .xtv3-row {
    position: relative;
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 8px 9px 8px 8px;
    border-bottom: 1px solid #f1f5f9;
    background: #ffffff;
}
#${PANEL_ID} .xtv3-row:last-child { border-bottom: 0; }
#${PANEL_ID} .xtv3-row:hover { background: #f8fbff; }
#${PANEL_ID} .xtv3-row.is-current { background: #eef5ff; }
#${PANEL_ID} .xtv3-row.is-current::before {
    content: "";
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: #2563eb;
}
#${PANEL_ID} .xtv3-row-no {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #f1f5f9;
    color: #64748b;
    font-size: 10px;
    line-height: 22px;
    text-align: center;
    font-variant-numeric: tabular-nums;
}
#${PANEL_ID} .xtv3-row.is-current .xtv3-row-no {
    background: #dbeafe;
    color: #1d4ed8;
    font-weight: 600;
}
#${PANEL_ID} .xtv3-row-main { min-width: 0; }
#${PANEL_ID} .xtv3-row-title {
    display: block;
    width: 100%;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: none;
    color: #1e293b;
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.45;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}
#${PANEL_ID} .xtv3-row-title:hover {
    color: #1d4ed8;
    text-decoration: underline;
}
#${PANEL_ID} .xtv3-row-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-top: 2px;
    overflow: hidden;
    color: #94a3b8;
    font-size: 10px;
    line-height: 1.4;
}
#${PANEL_ID} .xtv3-row-chapter {
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
#${PANEL_ID} .xtv3-row-duration {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
#${PANEL_ID} .xtv3-type {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    padding: 0 4px;
    border-radius: 4px;
    font-size: 10px;
    line-height: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
#${PANEL_ID} .xtv3-type-video { background: #e8f7ef; color: #15803d; }
#${PANEL_ID} .xtv3-type-doc { background: #eef2ff; color: #4338ca; }
#${PANEL_ID} .xtv3-type-quiz { background: #fff7ed; color: #c2410c; }
#${PANEL_ID} .xtv3-type-unknown { background: #f1f5f9; color: #64748b; }
#${PANEL_ID} .xtv3-badge {
    display: inline-block;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 10px;
    line-height: 18px;
    white-space: nowrap;
}
#${PANEL_ID} .xtv3-badge-idle { background: #f1f5f9; color: #64748b; }
#${PANEL_ID} .xtv3-badge-current { background: #dbeafe; color: #1d4ed8; }
#${PANEL_ID} .xtv3-badge-loading { background: #fef3c7; color: #b45309; }
#${PANEL_ID} .xtv3-badge-playing { background: #dcfce7; color: #15803d; }
#${PANEL_ID} .xtv3-badge-done { background: #d1fae5; color: #047857; }
#${PANEL_ID} .xtv3-badge-skipped { background: #f1f5f9; color: #94a3b8; }
#${PANEL_ID} .xtv3-badge-failed { background: #fee2e2; color: #b91c1c; }
#${PANEL_ID} .xtv3-badge-stopped { background: #fef3c7; color: #92400e; }
#${PANEL_ID} .xtv3-row-status { justify-self: end; }
#${PANEL_ID} .xtv3-play {
    appearance: none;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
    border-radius: 5px;
    padding: 2px 7px;
    font: inherit;
    font-size: 11px;
    line-height: 1.5;
    cursor: pointer;
}
#${PANEL_ID} .xtv3-play:hover { border-color: #2563eb; background: #dbeafe; }
#${PANEL_ID} .xtv3-empty {
    padding: 24px 12px;
    color: #94a3b8;
    font-size: 12px;
    text-align: center;
}

#${PANEL_ID} .xtv3-status {
    min-height: 26px;
    margin-top: 7px;
    padding: 4px 8px;
    overflow: hidden;
    border-radius: 6px;
    background: #f8fafc;
    color: #475569;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
#${PANEL_ID} .xtv3-status.is-error { background: #fef2f2; color: #b91c1c; }
#${PANEL_ID} .xtv3-hint {
    margin-top: 5px;
    color: #94a3b8;
    font-size: 10px;
    line-height: 1.5;
}
`;

    const previousApp = window[APP_KEY];
    if (previousApp && typeof previousApp.destroy === 'function') {
        try {
            previousApp.destroy();
        } catch (e) {
            console.warn('清理旧版脚本实例失败:', e);
        }
    }
    if (window[BOOT_TIMER_KEY]) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
    }
    // 兼容旧版本没有 destroy 清理面板的情况
    const stalePanel = document.getElementById(PANEL_ID);
    if (stalePanel) stalePanel.remove();
    const staleStyle = document.getElementById(STYLE_ID);
    if (staleStyle) staleStyle.remove();

    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function () {
            console.log('jQuery loaded.');
            if (!window.$ && window.jQuery) window.$ = window.jQuery;
            waitForCoursePage();
        };
        script.onerror = function () {
            console.error('%cjQuery 加载失败，脚本无法读取课程目录。', 'color:#F44336;font-weight:bold');
        };
        document.head.appendChild(script);
    } else {
        waitForCoursePage();
    }

    function waitForCoursePage() {
        let attempts = 0;
        const maxAttempts = 20;
        window[BOOT_TIMER_KEY] = setInterval(() => {
            attempts++;
            try {
                if (window.jQuery && document.getElementById('coursetree')) {
                    clearInterval(window[BOOT_TIMER_KEY]);
                    window[BOOT_TIMER_KEY] = null;
                    if (!window.$ && window.jQuery) window.$ = window.jQuery;
                    initializePlayer();
                    return;
                }
            } catch (e) {
                console.warn('检查课程目录时出错:', e);
            }
            if (attempts >= maxAttempts) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                console.error('%c脚本启动超时：未检测到课程目录（#coursetree）或 jQuery 未加载。请确认当前处于课程播放页。', 'color:#F44336;font-weight:bold');
            }
        }, 1000);
    }

    function initializePlayer() {
        const app = {
            version: VERSION,
            configs: {
                playbackRate: readStoredRate(),
                minRate: 1,
                maxRate: 5,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                autoAdvanceNoVideo: false,
                // 切节点后等待视频加载的时间；超过后连播模式会安全跳过
                switchWaitMs: 3000,
                queueNoVideoWaitMs: 12000,
                queueNoVideoQuickSkipMs: 4000,
                queueMaxSkipped: 20,
            },

            _active: false,
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _checkInterval: null,
            _eventVideoEl: null,
            _boundVideoHandlers: null,
            _nextUnitPending: false,
            _chapterAdvanceTimes: 0,
            _timers: Object.create(null),
            _catalog: [],
            _catalogIndex: -1,
            _chapterCount: 0,
            _queue: [],
            _queuePos: -1,
            _queueActive: false,
            _queueSkipped: 0,
            _leafClickAt: 0,
            _endedHandled: false,
            _stoppedByUser: false,
            _rowStatuses: Object.create(null),
            _ui: null,
            _pageGuards: null,
            _stepNavigationBound: false,
            _warnedNoActive: false,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,
            _stallCount: 0,
            _missingVideoSince: 0,
            _tryTimes: 0,
            _stepAdvanceTimes: 0,
            _stepSwitchAt: 0,
            _stepSwitchPending: false,

            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: '',
            },

            get cellData() {
                return this._cellData;
            },

            // ---------------------------------- 启动与生命周期 ----------------------------------

            run() {
                console.log('%c=== 学习通自动刷课脚本 V3.5 启动（列表连播 / 1-5倍速）===', 'color:#4CAF50;font-size:16px;font-weight:bold');
                this._active = true;
                this._nextUnitPending = false;
                this._chapterAdvanceTimes = 0;
                this._rowStatuses = Object.create(null);
                this._stoppedByUser = false;
                this._catalogIndex = -1;
                this._queueActive = false;
                this._queue = [];
                this._queuePos = -1;
                this._clearPlaybackTimers();
                this._getTreeContainer();
                this._refreshCatalog(false);
                this._initCellData();
                this._videoEl = null;
                this._clearCheckInterval();
                this._ensureUI();
                this._renderList();
                this._syncRateUI();
                this._bindStepNavigation();
                this._log('目录已读取，点「播放全部」或列表里的「播放」开始；点标题也可从该节连播。');
                this.play();
            },

            destroy() {
                this._active = false;
                this._stoppedByUser = true;
                this._queueActive = false;
                this._queue = [];
                this._queuePos = -1;
                this._nextUnitPending = false;
                this._isPlaying = false;
                this._clearCheckInterval();
                this._clearPlaybackTimers();
                this._detachVideoEvents();
                try {
                    $(document).off('.xuexitongPlayerV3');
                } catch (e) {}
                if (this._pageGuards) {
                    const { preventPause, resumePlaybackNow } = this._pageGuards;
                    document.removeEventListener('mouseleave', preventPause);
                    window.removeEventListener('mouseleave', preventPause);
                    document.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('blur', resumePlaybackNow);
                    document.removeEventListener('visibilitychange', resumePlaybackNow);
                    this._pageGuards = null;
                }
                this._removeUI();
                if (window.app === this) window.app = null;
                if (window[APP_KEY] === this) window[APP_KEY] = null;
            },

            // ---------------------------------- 目录解析与列表 ----------------------------------

            _getTreeContainer() {
                if (!this._treeContainerEl || !this._treeContainerEl.length || !document.contains(this._treeContainerEl[0])) {
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error('找不到视频列表');
                    }
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },

            _readNodeTitle($node) {
                const $name = $node.find('.posCatalog_name').first();
                const raw = $name.attr('title') || $name.text() || $node.text() || '';
                return String(raw).replace(/\s+/g, ' ').trim();
            },

            _guessType($node, title) {
                const text = title || '';
                if (/测验|测试|考试|作业|章节检测|章节测验/.test(text)) return '测验';
                if (/视频|视音频|录像|录播|视频资料/.test(text)) return '视频';
                if (/文档|讲义|课件|资料|PPT|PDF|Word|阅读|图文|附件/i.test(text)) return '文档';

                let hint = '';
                hint += ' ' + ($node.attr('class') || '');
                hint += ' ' + ($node.attr('data-type') || '');
                hint += ' ' + ($node.attr('data') || '');
                hint += ' ' + ($node.attr('onclick') || '');
                $node.find('i, em, span').each((_, el) => {
                    if (el && typeof el.className === 'string') hint += ' ' + el.className;
                });

                if (/video|shipin|bofang|play-circle|icon-play/i.test(hint)) return '视频';
                if (/quiz|exam|test|kaoshi|ceyan|zuoye/i.test(hint)) return '测验';
                if (/doc|pdf|ppt|wenjian|jiangyi|kejian|ziliao/i.test(hint)) return '文档';
                return '未知';
            },

            _collectCatalog() {
                const tree = this._getTreeContainer();
                const list = [];
                let chapterNo = 0;
                let chapterTitle = '未分章';
                let nIndex = 0;
                let activeIndex = -1;

                tree.find('.posCatalog_select').each((_, node) => {
                    const $node = $(node);
                    const title = this._readNodeTitle($node);

                    if ($node.hasClass('firstLayer')) {
                        chapterNo += 1;
                        chapterTitle = title || `第${chapterNo}章`;
                        nIndex = 0;
                        return;
                    }

                    const item = {
                        node: node,
                        nameEl: $node.find('.posCatalog_name').first().get(0) || node,
                        chapterIndex: Math.max(0, chapterNo - 1),
                        chapterTitle: chapterTitle,
                        nIndex: nIndex,
                        title: title || `未命名小节 ${list.length + 1}`,
                        duration: String($node.find('.posCatalog_time').first().text() || '').replace(/\s+/g, ' ').trim(),
                        type: this._guessType($node, title),
                        active: $node.hasClass('posCatalog_active'),
                    };

                    if (item.active) activeIndex = list.length;
                    list.push(item);
                    nIndex += 1;
                });

                this._catalog = list;
                this._chapterCount = chapterNo || (list.length ? 1 : 0);

                if (this._catalogIndex < 0 || this._catalogIndex >= list.length) {
                    this._catalogIndex = activeIndex >= 0 ? activeIndex : (list.length ? 0 : -1);
                }

                if (!this._warnedNoActive && list.length && activeIndex < 0) {
                    this._warnedNoActive = true;
                    console.warn('%c未找到当前激活的视频节点，已默认从第 1 节开始。', 'color:#FF9800');
                }

                return list;
            },

            _updateCellDataFromCatalog() {
                const item = this._catalog[this._catalogIndex];
                this._cellData.cells = this._chapterCount;
                this._cellData.nCells = this._catalog.length;
                if (item) {
                    this._cellData.currentCellIndex = item.chapterIndex;
                    this._cellData.currentNCellIndex = item.nIndex;
                    this._cellData.currentVideoTitle = item.title;
                }
            },

            _initCellData() {
                const oldLength = this._catalog.length;
                this._collectCatalog();
                this._updateCellDataFromCatalog();

                if (this._ui) {
                    if (oldLength !== this._catalog.length) {
                        this._renderList();
                    } else {
                        this._updateRowStates();
                        this._updateCounts();
                    }
                }

                const item = this._catalog[this._catalogIndex];
                if (item) {
                    console.log(
                        `%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${item.chapterIndex + 1}章第${item.nIndex + 1}节「${item.title}」`,
                        'color:#607D8B'
                    );
                } else {
                    console.warn('%c课程目录为空，无法识别学习节。', 'color:#FF9800');
                }
            },

            _refreshCatalog(render) {
                this._collectCatalog();
                this._updateCellDataFromCatalog();
                if (this._ui) {
                    if (render) {
                        this._renderList();
                    } else {
                        this._updateRowStates();
                        this._updateCounts();
                    }
                }
                return this._catalog;
            },

            _syncCatalogIndexFromActive() {
                const list = this._collectCatalog();
                let activeIndex = -1;
                list.forEach((item, index) => {
                    if (item.active) activeIndex = index;
                });
                if (activeIndex >= 0) this._catalogIndex = activeIndex;
                this._updateCellDataFromCatalog();
                if (this._ui) {
                    this._updateRowStates();
                    this._updateCounts();
                }
            },

            _statusFor(index) {
                const explicit = this._rowStatuses[index];
                if (explicit) return explicit;
                if (index === this._catalogIndex) return 'current';
                return 'idle';
            },

            _setStatus(index, status) {
                if (!Number.isInteger(index) || index < 0 || !this._catalog[index]) return;
                if (this._rowStatuses[index] === status) {
                    this._updateRowStates();
                    return;
                }
                this._rowStatuses[index] = status;
                this._updateRowStates();
            },

            _markType(index, type) {
                const item = this._catalog[index];
                if (!item || item.type === type) return;
                item.type = type;
                this._updateRowStates();
                this._updateCounts();
            },

            _renderList() {
                if (!this._ui || !this._ui.list) return;
                const list = this._ui.list;
                list.textContent = '';
                const frag = document.createDocumentFragment();

                if (!this._catalog.length) {
                    frag.appendChild(makeEl('li', 'xtv3-empty', '未读取到课程目录节点，点「刷新目录」重试。'));
                    list.appendChild(frag);
                    this._updateCounts();
                    return;
                }

                this._catalog.forEach((item, index) => {
                    const row = makeEl('li', 'xtv3-row');
                    row.setAttribute('data-index', String(index));
                    if (index === this._catalogIndex) row.classList.add('is-current');

                    const rowNo = makeEl('span', 'xtv3-row-no', String(index + 1));

                    const main = makeEl('div', 'xtv3-row-main');
                    const titleBtn = makeEl('button', 'xtv3-row-title', item.title);
                    titleBtn.type = 'button';
                    titleBtn.setAttribute('data-row-index', String(index));
                    titleBtn.title = `从「${item.title}」开始连播`;

                    const meta = makeEl('div', 'xtv3-row-meta');
                    const chapter = makeEl('span', 'xtv3-row-chapter', item.chapterTitle || '—');
                    chapter.title = item.chapterTitle || '';
                    const typeBadge = makeEl('span', `xtv3-type xtv3-type-${TYPE_CLASS[item.type] || 'unknown'}`, TYPE_LABEL[item.type] || item.type);
                    typeBadge.setAttribute('data-role', 'type');
                    meta.appendChild(chapter);
                    meta.appendChild(typeBadge);
                    if (item.duration && item.duration !== '--') {
                        meta.appendChild(makeEl('span', 'xtv3-row-duration', item.duration));
                    }

                    main.appendChild(titleBtn);
                    main.appendChild(meta);

                    const status = this._statusFor(index);
                    const statusBadge = makeEl('span', `xtv3-badge xtv3-badge-${status} xtv3-row-status`, STATUS_LABEL[status] || status);
                    statusBadge.setAttribute('data-role', 'row-status');

                    const playBtn = makeEl('button', 'xtv3-play', '播放');
                    playBtn.type = 'button';
                    playBtn.setAttribute('data-row-index', String(index));
                    playBtn.title = `从「${item.title}」开始连播`;

                    row.appendChild(rowNo);
                    row.appendChild(main);
                    row.appendChild(statusBadge);
                    row.appendChild(playBtn);
                    frag.appendChild(row);
                });

                list.appendChild(frag);
                this._updateRowStates();
                this._updateCounts();
            },

            _updateRowStates() {
                if (!this._ui || !this._ui.list) return;
                Array.prototype.forEach.call(this._ui.list.children, (row) => {
                    if (!row.hasAttribute('data-index')) return;
                    const index = Number(row.getAttribute('data-index'));
                    const item = this._catalog[index];
                    if (!item) return;
                    row.classList.toggle('is-current', index === this._catalogIndex);

                    const status = this._statusFor(index);
                    const badge = row.querySelector('[data-role="row-status"]');
                    if (badge) {
                        badge.textContent = STATUS_LABEL[status] || status;
                        badge.className = `xtv3-badge xtv3-badge-${status} xtv3-row-status`;
                    }

                    const typeBadge = row.querySelector('[data-role="type"]');
                    if (typeBadge) {
                        typeBadge.textContent = TYPE_LABEL[item.type] || item.type;
                        typeBadge.className = `xtv3-type xtv3-type-${TYPE_CLASS[item.type] || 'unknown'}`;
                    }
                });
            },

            _updateCounts() {
                if (!this._ui || !this._ui.count) return;
                const total = this._catalog.length;
                const videoCount = this._catalog.filter(item => item.type === '视频').length;
                const unknownCount = this._catalog.filter(item => item.type === '未知').length;
                this._ui.count.textContent = `共 ${total} 节 · 视频 ${videoCount}${unknownCount ? ` · 待识别 ${unknownCount}` : ''}`;
            },

            _scrollToRow(index) {
                if (!this._ui || !this._ui.list) return;
                const row = this._ui.list.querySelector(`li[data-index="${index}"]`);
                if (row && typeof row.scrollIntoView === 'function') {
                    try {
                        row.scrollIntoView({ block: 'nearest' });
                    } catch (e) {}
                }
            },

            // ---------------------------------- 面板与倍速 ----------------------------------

            _ensureUI() {
                if (this._ui && this._ui.root && document.body.contains(this._ui.root)) return;
                if (!document.body) return;

                let style = document.getElementById(STYLE_ID);
                if (!style) {
                    style = document.createElement('style');
                    style.id = STYLE_ID;
                    style.textContent = UI_CSS;
                    (document.head || document.documentElement).appendChild(style);
                }

                const collapsed = storageGet(COLLAPSE_KEY, '0') === '1';
                const root = document.createElement('div');
                root.id = PANEL_ID;
                root.className = 'xtv3-panel' + (collapsed ? ' xtv3-collapsed' : '');
                root.innerHTML = `
<div class="xtv3-head">
    <span class="xtv3-title">学习通自动刷课 <b>V${VERSION}</b></span>
    <span class="xtv3-head-spacer"></span>
    <button type="button" class="xtv3-head-btn" data-act="collapse">${collapsed ? '展开' : '收起'}</button>
</div>
<div class="xtv3-body">
    <div class="xtv3-speed">
        <span class="xtv3-speed-label">倍速</span>
        <input type="range" min="1" max="5" step="0.25" data-role="rate" aria-label="视频播放倍速，1 到 5 倍">
        <output class="xtv3-rate-out" data-role="rate-out">1.5x</output>
        <span class="xtv3-chips" role="group" aria-label="常用倍速">
            <button type="button" data-rate="1">1x</button>
            <button type="button" data-rate="1.5">1.5x</button>
            <button type="button" data-rate="2">2x</button>
            <button type="button" data-rate="3">3x</button>
            <button type="button" data-rate="4">4x</button>
            <button type="button" data-rate="5">5x</button>
        </span>
    </div>
    <div class="xtv3-toolbar">
        <button type="button" class="xtv3-btn xtv3-primary" data-act="play-all">播放全部</button>
        <button type="button" class="xtv3-btn" data-act="play-current">从当前连播</button>
        <button type="button" class="xtv3-btn" data-act="stop">停止</button>
        <button type="button" class="xtv3-btn" data-act="refresh">刷新目录</button>
        <span class="xtv3-count" data-role="count">共 0 节</span>
    </div>
    <div class="xtv3-list-wrap">
        <ul class="xtv3-list" data-role="list"></ul>
    </div>
    <div class="xtv3-status" data-role="status">正在读取课程目录…</div>
    <div class="xtv3-hint">点标题或「播放」从该节开始连播；倍速会立即生效，并在播放器重置后自动恢复。</div>
</div>`;

                document.body.appendChild(root);

                const rateInput = root.querySelector('[data-role="rate"]');
                const list = root.querySelector('[data-role="list"]');
                this._ui = {
                    root: root,
                    rateInput: rateInput,
                    rateOutput: root.querySelector('[data-role="rate-out"]'),
                    count: root.querySelector('[data-role="count"]'),
                    status: root.querySelector('[data-role="status"]'),
                    list: list,
                };

                root.addEventListener('click', (e) => this._onPanelClick(e));
                if (list) list.addEventListener('click', (e) => this._onListClick(e));
                if (rateInput) {
                    rateInput.addEventListener('input', (e) => this._onRateInput(e));
                    rateInput.addEventListener('change', () => this._log(`倍速已调整为 ${this.configs.playbackRate}x`));
                }
            },

            _removeUI() {
                if (this._ui && this._ui.root && this._ui.root.parentNode) {
                    this._ui.root.parentNode.removeChild(this._ui.root);
                }
                this._ui = null;
                const style = document.getElementById(STYLE_ID);
                if (style) style.remove();
            },

            _onPanelClick(e) {
                const root = this._ui && this._ui.root;
                if (!root) return;

                const rateBtn = e.target.closest('[data-rate]');
                if (rateBtn && root.contains(rateBtn)) {
                    this.setRate(rateBtn.getAttribute('data-rate'));
                    return;
                }

                const actionBtn = e.target.closest('[data-act]');
                if (!actionBtn || !root.contains(actionBtn)) return;

                const action = actionBtn.getAttribute('data-act');
                if (action === 'collapse') {
                    const collapsed = root.classList.toggle('xtv3-collapsed');
                    actionBtn.textContent = collapsed ? '展开' : '收起';
                    storageSet(COLLAPSE_KEY, collapsed ? '1' : '0');
                    return;
                }
                if (action === 'refresh') {
                    this.refresh();
                    this._log('课程目录已刷新。');
                    return;
                }
                if (action === 'play-all') {
                    this._startQueue(0);
                    return;
                }
                if (action === 'play-current') {
                    this._startQueue(this._catalogIndex >= 0 ? this._catalogIndex : 0);
                    return;
                }
                if (action === 'stop') {
                    this._stopQueue(true);
                    return;
                }
            },

            _onListClick(e) {
                const button = e.target.closest('button[data-row-index]');
                if (!button || !this._ui || !this._ui.root.contains(button)) return;
                e.preventDefault();
                e.stopPropagation();
                const index = Number(button.getAttribute('data-row-index'));
                if (Number.isInteger(index) && index >= 0) {
                    this._startQueue(index);
                }
            },

            _onRateInput(e) {
                const rate = clampRate(e.target.value);
                this.configs.playbackRate = rate;
                storageSet(RATE_KEY, rate);
                this._syncRateUI();
                this._applyPlaybackRate();
            },

            setRate(value) {
                const rate = clampRate(value);
                this.configs.playbackRate = rate;
                storageSet(RATE_KEY, rate);
                this._syncRateUI();
                this._applyPlaybackRate();
                this._log(`倍速已调整为 ${rate}x`);
                return rate;
            },

            _syncRateUI() {
                if (!this._ui || !this._ui.rateInput) return;
                const rate = this.configs.playbackRate;
                this._ui.rateInput.value = String(rate);
                if (this._ui.rateOutput) this._ui.rateOutput.textContent = `${rate}x`;
                this._ui.root.querySelectorAll('[data-rate]').forEach((btn) => {
                    const btnRate = Number(btn.getAttribute('data-rate'));
                    btn.classList.toggle('is-active', Math.abs(btnRate - rate) < 0.001);
                });
            },

            _applyPlaybackRate(video) {
                const el = video || this._videoEl;
                if (!el || !this._active) return;
                const rate = this.configs.playbackRate;
                try {
                    if (Math.abs((el.playbackRate || 1) - rate) > 0.001) el.playbackRate = rate;
                    if (Math.abs((el.defaultPlaybackRate || 1) - rate) > 0.001) el.defaultPlaybackRate = rate;
                } catch (e) {
                    // 播放器只读或尚未加载元数据时忽略，监控循环会再试
                }
            },

            _log(text, isError) {
                if (!this._ui || !this._ui.status) return;
                const now = new Date();
                const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
                    .map(n => String(n).padStart(2, '0'))
                    .join(':');
                this._ui.status.textContent = `[${time}] ${text}`;
                this._ui.status.title = text;
                this._ui.status.classList.toggle('is-error', !!isError);
            },

            // ---------------------------------- 定时器 ----------------------------------

            _setTimer(key, fn, delay) {
                if (!this._active) return;
                this._clearTimer(key);
                this._timers[key] = window.setTimeout(() => {
                    delete this._timers[key];
                    if (!this._active) return;
                    try {
                        fn();
                    } catch (e) {
                        console.error(`定时任务 ${key} 执行失败:`, e);
                    }
                }, delay);
            },

            _clearTimer(key) {
                if (this._timers[key]) {
                    clearTimeout(this._timers[key]);
                    delete this._timers[key];
                }
            },

            _clearPlaybackTimers() {
                ['playRetry', 'switchPlay', 'nextUnit', 'queueAdvance', 'queueVideoWait', 'chapterAdvance', 'endedAdvance', 'reenter']
                    .forEach((key) => this._clearTimer(key));
            },

            // ---------------------------------- 连播队列 ----------------------------------

            _startQueue(startIndex) {
                if (!this._active) return;
                this._clearPlaybackTimers();
                this._stopQueue(false, true);
                this._refreshCatalog(false);

                if (!this._catalog.length) {
                    this._log('没有读到课程目录，无法连播。', true);
                    return;
                }

                let start = Number(startIndex);
                if (!Number.isFinite(start)) start = this._catalogIndex;
                start = Math.max(0, Math.min(this._catalog.length - 1, Math.floor(start)));

                const queue = [];
                for (let i = start; i < this._catalog.length; i += 1) {
                    const item = this._catalog[i];
                    if (item.type === '文档' || item.type === '测验' || item.type === '非视频') {
                        this._setStatus(i, 'skipped');
                        continue;
                    }
                    queue.push(i);
                }

                if (!queue.length) {
                    this._log('从该位置开始没有待播放的视频节点，可检查目录类型或稍后刷新。', true);
                    return;
                }

                this._queue = queue;
                this._queueActive = true;
                this._queuePos = 0;
                this._queueSkipped = 0;
                this._nextUnitPending = false;
                this._log(`开始连播：从第 ${start + 1} 节起，共 ${queue.length} 个待播节点。`);
                this._playCatalogIndex(queue[0]);
            },

            _advanceQueue() {
                if (!this._active || !this._queueActive) return;
                this._queuePos += 1;
                if (this._queuePos >= this._queue.length) {
                    this._finishQueue();
                    return;
                }
                this._playCatalogIndex(this._queue[this._queuePos]);
            },

            _finishQueue() {
                const played = this._queue.length;
                this._queueActive = false;
                this._queue = [];
                this._queuePos = -1;
                this._nextUnitPending = false;
                this._isPlaying = false;
                this._clearCheckInterval();
                this._clearPlaybackTimers();
                this._queueSkipped = 0;
                this._stoppedByUser = true;
                this._updateRowStates();
                console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                console.log('%c============== 列表连播完成 ==============', 'color:#4CAF50;font-size:16px;font-weight:bold');
                console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                this._log(`连播完成：本次共处理 ${played} 个视频节点。`);
            },

            _queueNoVideoWaitMs() {
                const step = this._currentStepTitle();
                // 明确的非视频步骤可快速跳过；疑似视频页面多等一会儿 iframe 加载
                if (step && !step.includes('视频') && !step.includes('测验')) {
                    return this.configs.queueNoVideoQuickSkipMs;
                }
                return this.configs.queueNoVideoWaitMs;
            },

            _waitOrSkipNoVideo(reason) {
                if (!this._queueActive) return false;
                const waitMs = this._queueNoVideoWaitMs();
                if (Date.now() - this._leafClickAt >= waitMs) {
                    this._skipQueueItem(reason);
                    return true;
                }
                this._setTimer('queueVideoWait', () => this.play(), 1200);
                return true;
            },

            _skipQueueItem(reason) {
                if (!this._queueActive) return false;
                const index = this._catalogIndex;
                const item = this._catalog[index];
                const step = this._currentStepTitle();
                this._queueSkipped += 1;
                if (item) {
                    this._setStatus(index, 'skipped');
                    // 只有确认是文档/其他非视频步骤时才永久标记，避免把慢加载的视频误判
                    if (item.type === '未知' && step && !step.includes('视频') && !step.includes('测验')) {
                        this._markType(index, '非视频');
                    }
                }
                this._log(`跳过「${item ? item.title : index + 1}」：${reason}`, true);

                if (this._queueSkipped >= this.configs.queueMaxSkipped) {
                    this._log(`连续跳过 ${this._queueSkipped} 个节点，已停止连播以避免页面异常循环。`, true);
                    this._stopQueue(false);
                    return true;
                }

                this._isPlaying = false;
                this._nextUnitPending = false;
                this._clearCheckInterval();
                this._clearTimer('queueVideoWait');
                this._setTimer('queueAdvance', () => this._advanceQueue(), 800);
                return true;
            },

            _stopQueue(showLog, pauseVideo) {
                const wasActive = this._queueActive;
                const currentIndex = this._catalogIndex;
                const currentStatus = this._rowStatuses[currentIndex];
                if (currentStatus === 'playing' || currentStatus === 'loading' || currentStatus === 'current') {
                    this._rowStatuses[currentIndex] = 'stopped';
                }
                this._queueActive = false;
                this._queue = [];
                this._queuePos = -1;
                this._nextUnitPending = false;
                this._isPlaying = false;
                this._stoppedByUser = true;
                this._clearCheckInterval();
                this._clearPlaybackTimers();

                if (pauseVideo !== false) {
                    const video = this._videoEl || this._getVideoEl();
                    if (video) {
                        try {
                            video.pause();
                        } catch (e) {}
                    }
                }

                if (showLog) this._log(wasActive ? '已停止连播。' : '已停止播放。');
                this._updateRowStates();
            },

            // 控制台快捷入口
            playAll() {
                this._startQueue(0);
            },

            playFromCurrent() {
                this._startQueue(this._catalogIndex >= 0 ? this._catalogIndex : 0);
            },

            stop() {
                this._stopQueue(true);
            },

            refresh() {
                if (this._queueActive) this._stopQueue(false, true);
                this._refreshCatalog(true);
                if (!this._queueActive && !this._isPlaying) this._syncCatalogIndexFromActive();
            },

            // ---------------------------------- 单个节点播放 ----------------------------------

            _playCatalogIndex(index) {
                if (!this._active) return;
                const item = this._catalog[index];
                if (!item) {
                    this._nextUnitPending = false;
                    this._log(`找不到第 ${index + 1} 节，无法切换。`, true);
                    if (this._queueActive) {
                        this._queueSkipped += 1;
                        if (this._queueSkipped >= this.configs.queueMaxSkipped) {
                            this._stopQueue(false);
                        } else {
                            this._setTimer('queueAdvance', () => this._advanceQueue(), 300);
                        }
                    } else {
                        this._stopQueue(false);
                    }
                    return;
                }

                this._clearCheckInterval();
                this._clearPlaybackTimers();
                this._detachVideoEvents();

                const previousIndex = this._catalogIndex;
                if (previousIndex >= 0 && previousIndex !== index) {
                    const previousStatus = this._rowStatuses[previousIndex];
                    if (previousStatus === 'playing' || previousStatus === 'loading' || previousStatus === 'current') {
                        this._rowStatuses[previousIndex] = 'stopped';
                    }
                }

                this._catalogIndex = index;
                this._nextUnitPending = false;
                this._isPlaying = false;
                this._stoppedByUser = false;
                this._videoEl = null;
                this._chapterAdvanceTimes = 0;
                this._stepAdvanceTimes = 0;
                this._tryTimes = 0;
                this._stallCount = 0;
                this._missingVideoSince = 0;
                this._endedHandled = false;
                this._leafClickAt = Date.now();
                this._setStatus(index, 'loading');
                this._scrollToRow(index);
                this._log(`切换到第 ${index + 1} 节：${item.title}`);

                try {
                    $(item.nameEl || item.node).trigger('click');
                } catch (e) {
                    console.error('点击课程节点失败:', e);
                    this._setStatus(index, 'failed');
                    this._log('点击课程节点失败，请检查页面结构。', true);
                    this._nextUnitPending = false;
                    if (this._queueActive) this._skipQueueItem('点击课程节点失败');
                    return;
                }

                this._setTimer('switchPlay', () => {
                    this._initCellData();
                    if (this.configs.autoplay && !this._isPlaying) this.play();
                }, this.configs.switchWaitMs);
            },

            playCurrentIndex(target) {
                if (typeof target === 'number' && Number.isInteger(target)) {
                    this._playCatalogIndex(target);
                    return;
                }
                let index = -1;
                if (target && target.nodeType === 1) {
                    index = this._catalog.findIndex(item => item.node === target || item.node.contains(target) || (item.nameEl && (item.nameEl === target || item.nameEl.contains(target))));
                }
                if (index < 0) index = this._catalogIndex;
                this._playCatalogIndex(index);
            },

            nextUnit() {
                if (!this._active) return;
                if (this._nextUnitPending) {
                    console.warn('%c已有小节切换正在进行，忽略重复请求', 'color:#FF9800');
                    return;
                }

                this._isPlaying = false;
                this._clearCheckInterval();
                this._nextUnitPending = true;

                if (this._queueActive) {
                    this._setTimer('queueAdvance', () => this._advanceQueue(), 500);
                    return;
                }

                const list = this._collectCatalog();
                let index = this._catalogIndex;
                if (index < 0) {
                    index = list.findIndex(item => item.active);
                }
                const nextIndex = index + 1;

                if (nextIndex >= list.length) {
                    console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                    console.log('%c============== 本课程学习完成了 ==============', 'color:#4CAF50;font-size:16px;font-weight:bold');
                    console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                    this._nextUnitPending = false;
                    this._log('本课程学习完成了。');
                    return;
                }

                this._setTimer('nextUnit', () => this._playCatalogIndex(nextIndex), 800);
            },

            // ---------------------------------- 视频元素与播放 ----------------------------------

            _getVideoEl() {
                if (this._videoEl && this._videoEl.isConnected) {
                    return this._videoEl;
                }
                this._videoEl = null;

                try {
                    const directVideo = document.querySelector('video#video_html5_api, video[id*="video_html5"]');
                    if (directVideo) {
                        this._videoEl = directVideo;
                        this._applyPlaybackRate(directVideo);
                        return directVideo;
                    }

                    const findVideo = (frame, depth) => {
                        if (depth > 2) return null;
                        try {
                            const frameDocument = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
                            if (!frameDocument) return null;
                            const frameVideo = frameDocument.querySelector('video#video_html5_api, video[id*="video_html5"]');
                            if (frameVideo) return frameVideo;

                            const nestedFrames = frameDocument.querySelectorAll('iframe.ans-insertvideo-online, iframe[src*="video"]');
                            for (const nestedFrame of nestedFrames) {
                                const nestedVideo = findVideo(nestedFrame, depth + 1);
                                if (nestedVideo) return nestedVideo;
                            }
                        } catch (e) {
                            // 跨域 iframe 无法读取，继续检查下一个
                        }
                        return null;
                    };

                    for (const frame of document.querySelectorAll('iframe')) {
                        const video = findVideo(frame, 0);
                        if (video) {
                            this._videoEl = video;
                            this._applyPlaybackRate(video);
                            return video;
                        }
                    }
                } catch (e) {
                    console.error('获取视频元素失败:', e);
                    return null;
                }

                return null;
            },

            async play() {
                if (!this._active) return;
                try {
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._queueActive && Date.now() - this._leafClickAt >= this._queueNoVideoWaitMs()) {
                            this._skipQueueItem('等待视频超时');
                            return;
                        }

                        if (this._currentStepTitle().includes('视频')) {
                            if (this._queueActive && Date.now() - this._leafClickAt >= this._queueNoVideoWaitMs()) {
                                this._skipQueueItem('视频加载超时');
                                return;
                            }
                            throw new Error('视频组件尚未加载完成');
                        }

                        if (this._advanceLearningStep()) {
                            console.log('%c当前不在视频页，已尝试切到视频页签，2秒后重试', 'color:#607D8B');
                            this._setTimer('playRetry', () => this.play(), 2000);
                            return;
                        }

                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }

                        this._isPlaying = false;
                        this._clearCheckInterval();

                        if (this._queueActive) {
                            this._waitOrSkipNoVideo('未检测到视频');
                            return;
                        }

                        if (this.configs.autoAdvanceNoVideo) {
                            console.warn('%c当前小节未发现视频，按配置切换到下一小节', 'color:#FF9800');
                            this.nextUnit();
                        } else {
                            this._setStatus(this._catalogIndex, 'failed');
                            console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。确认无需完成课件后，可执行 app.nextUnit() 或点面板里的「播放」跳转。', 'color:#FF9800');
                            this._log('当前小节没有视频，已安全停止。', true);
                        }
                        return;
                    }

                    this._isPlaying = true;
                    this._videoEventHandle();
                    this._applyPlaybackRate(el);
                    const playIndex = this._catalogIndex;
                    const playVideo = el;

                    try {
                        await el.play();
                        if (!this._active || this._stoppedByUser || this._catalogIndex !== playIndex || this._videoEl !== playVideo) {
                            return;
                        }
                        this._tryTimes = 0;
                        this._queueSkipped = 0;
                        this._clearTimer('playRetry');
                        this._applyPlaybackRate(el);
                        this._setStatus(this._catalogIndex, 'playing');
                        if (this._catalog[this._catalogIndex] && this._catalog[this._catalogIndex].type === '未知') {
                            this._markType(this._catalogIndex, '视频');
                        }
                        console.log(`%c视频开始播放，倍速: ${this.configs.playbackRate}x`, 'color:#4CAF50');
                        this._startVideoMonitoring();
                    } catch (playError) {
                        console.error('视频播放失败:', playError);
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    if (!this._active || this._stoppedByUser) return;

                    if (this._queueActive && Date.now() - this._leafClickAt >= this._queueNoVideoWaitMs()) {
                        this._skipQueueItem('等待视频超时');
                        return;
                    }

                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error('%c视频播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                        this._clearCheckInterval();
                        if (this._queueActive) {
                            this._skipQueueItem('视频加载失败');
                        } else {
                            this._setStatus(this._catalogIndex, 'failed');
                            this._log('视频加载失败，已达到最大重试次数。', true);
                        }
                        return;
                    }
                    this._tryTimes += 1;
                    console.log(`%c播放失败，${this.configs.retryInterval / 1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, 'color:#FF9800');
                    this._setTimer('playRetry', () => this.play(), this.configs.retryInterval);
                }
            },

            _handlePlayError(error) {
                console.error('播放错误详情:', error);
                if (this._stoppedByUser || !this._active) return;
                const errorIndex = this._catalogIndex;
                const video = this._getVideoEl();
                if (!video) {
                    if (this._queueActive && Date.now() - this._leafClickAt >= this._queueNoVideoWaitMs()) {
                        this._skipQueueItem('视频元素丢失');
                    } else {
                        this._setTimer('playRetry', () => this.play(), this.configs.retryInterval);
                    }
                    return;
                }
                this._clearCheckInterval();
                this._isPlaying = false;
                video.muted = true;
                video.play().then(() => {
                    if (!this._active || this._stoppedByUser || this._catalogIndex !== errorIndex) return;
                    console.log('%c静音播放成功', 'color:#4CAF50');
                    this._tryTimes = 0;
                    this._queueSkipped = 0;
                    this._isPlaying = true;
                    this._applyPlaybackRate(video);
                    this._setStatus(this._catalogIndex, 'playing');
                    this._startVideoMonitoring();
                }).catch(e => {
                    if (!this._active || this._stoppedByUser || this._catalogIndex !== errorIndex) return;
                    console.error('静音播放也失败:', e);
                    this._isPlaying = false;
                    if (this._queueActive && (this._tryTimes >= this.configs.maxRetries || Date.now() - this._leafClickAt >= this._queueNoVideoWaitMs())) {
                        this._skipQueueItem('静音播放失败');
                        return;
                    }
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error('%c静音播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                        this._setStatus(this._catalogIndex, 'failed');
                        this._log('视频播放失败，已达到最大重试次数。', true);
                        return;
                    }
                    this._tryTimes += 1;
                    this._setTimer('playRetry', () => this.play(), this.configs.retryInterval);
                });
            },

            _startVideoMonitoring() {
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._stallCount = 0;
                this._missingVideoSince = 0;
                this._applyPlaybackRate();
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },

            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },

            _tryResumePlayback(reason) {
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
                    return;
                }
                this._guardLastResumeTs = now;

                const video = this._getVideoEl();
                if (!video || !this._isPlaying || video.ended) return;

                console.log(`%c触发视频保活恢复(${reason})`, 'color:#607D8B');
                const result = video.play();
                if (result && typeof result.then === 'function') {
                    result.then(() => {
                        this._applyPlaybackRate(video);
                    }).catch(() => {
                        console.warn('直接恢复播放失败，尝试静音恢复');
                        video.muted = true;
                        video.play().then(() => {
                            this._applyPlaybackRate(video);
                        }).catch((err) => {
                            console.error('静音恢复播放失败:', err);
                        });
                    });
                }
            },

            _checkVideoStatus() {
                if (!this._active) return;
                try {
                    const video = this._getVideoEl();
                    if (!video) {
                        if (this._isPlaying) {
                            const now = Date.now();
                            if (!this._missingVideoSince) {
                                this._missingVideoSince = now;
                            } else if (now - this._missingVideoSince >= 6000) {
                                this._missingVideoSince = 0;
                                this._isPlaying = false;
                                this._clearCheckInterval();
                                if (this._queueActive) {
                                    this._skipQueueItem('视频元素丢失');
                                } else {
                                    this._setStatus(this._catalogIndex, 'failed');
                                    this._log('视频元素丢失，已安全停止。', true);
                                    this._stopQueue(false);
                                }
                            }
                        }
                        return;
                    }
                    this._missingVideoSince = 0;
                    this._applyPlaybackRate(video);

                    if (video.ended) {
                        if (this._isPlaying) this._handleVideoEnded();
                        return;
                    }

                    if (video.paused) {
                        if (this._isPlaying) {
                            console.log('%c检测到视频暂停，尝试恢复播放...', 'color:#FF5722');
                            this._tryResumePlayback('paused');
                        }
                        return;
                    }

                    if (this._isPlaying) {
                        const now = Date.now();
                        const current = Number(video.currentTime || 0);
                        if (this._guardLastWallTs === 0) {
                            this._guardLastWallTs = now;
                            this._guardLastTime = current;
                        } else {
                            const stalled = Math.abs(current - this._guardLastTime) < 0.01;
                            const stalledMs = now - this._guardLastWallTs;
                            if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
                                this._stallCount += 1;
                                if (this._stallCount >= 3) {
                                    this._stallCount = 0;
                                    this._isPlaying = false;
                                    this._clearCheckInterval();
                                    if (this._queueActive) {
                                        this._skipQueueItem('视频长时间无进度');
                                    } else {
                                        this._setStatus(this._catalogIndex, 'failed');
                                        this._log('视频长时间无进度，已安全停止。', true);
                                        this._stopQueue(false);
                                    }
                                    return;
                                }
                                this._tryResumePlayback('no-progress');
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._stallCount = 0;
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }
                } catch (e) {
                    console.error('视频状态检查失败:', e);
                }
            },

            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log('videoEl未加载');
                    return;
                }
                if (this._eventVideoEl === el) return;

                this._detachVideoEvents();
                this._eventVideoEl = el;
                this._boundVideoHandlers = {
                    ended: this._handleVideoEnded.bind(this),
                    loadedmetadata: this._handleVideoLoaded.bind(this),
                    play: this._handleVideoPlay.bind(this),
                    pause: this._handleVideoPause.bind(this),
                    ratechange: this._handleVideoRateChange.bind(this),
                };

                el.addEventListener('ended', this._boundVideoHandlers.ended);
                el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                el.addEventListener('play', this._boundVideoHandlers.play);
                el.addEventListener('pause', this._boundVideoHandlers.pause);
                el.addEventListener('ratechange', this._boundVideoHandlers.ratechange);
            },

            _detachVideoEvents() {
                if (!this._eventVideoEl || !this._boundVideoHandlers) return;
                this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
                this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
                this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
                this._eventVideoEl.removeEventListener('ratechange', this._boundVideoHandlers.ratechange);
                this._eventVideoEl = null;
                this._boundVideoHandlers = null;
            },

            _handleVideoEnded(e) {
                if (e && e.currentTarget && this._eventVideoEl && e.currentTarget !== this._eventVideoEl) return;
                if (this._stoppedByUser) return;
                if (this._endedHandled) return;
                this._endedHandled = true;
                const index = this._catalogIndex;
                const item = this._catalog[index];
                if (item) {
                    this._setStatus(index, 'done');
                    if (item.type === '未知') this._markType(index, '视频');
                }
                console.warn(`%c============'${item ? item.title : '视频'}' 播放完成=============`, 'color:#4CAF50;font-weight:bold');
                this._isPlaying = false;
                this._clearCheckInterval();
                this._setTimer('endedAdvance', () => this.nextUnit(), 1000);
            },

            _handleVideoLoaded(e) {
                if (e && e.currentTarget && this._eventVideoEl && e.currentTarget !== this._eventVideoEl) return;
                console.log('%c============视频加载完成=============', 'color:#2196F3');
                if (this._stoppedByUser) return;
                this._applyPlaybackRate();
                if (this.configs.autoplay && !this._isPlaying) {
                    this.play();
                }
            },

            _handleVideoPlay(e) {
                if (e && e.currentTarget && this._eventVideoEl && e.currentTarget !== this._eventVideoEl) return;
                if (this._stoppedByUser) return;
                const item = this._catalog[this._catalogIndex];
                console.info(`%c============'${item ? item.title : '视频'}' 开始播放=============`, 'color:#4CAF50');
                this._isPlaying = true;
                this._stepSwitchPending = false;
                this._stepAdvanceTimes = 0;
                this._endedHandled = false;
                this._queueSkipped = 0;
                this._stallCount = 0;
                this._missingVideoSince = 0;
                const video = this._getVideoEl();
                this._applyPlaybackRate(video);
                this._guardLastTime = Number(video && video.currentTime || 0);
                this._guardLastWallTs = Date.now();
                this._setStatus(this._catalogIndex, 'playing');
                this._clearTimer('playRetry');
            },

            _handleVideoPause(e) {
                if (e && e.currentTarget && this._eventVideoEl && e.currentTarget !== this._eventVideoEl) return;
                console.log('%c============视频暂停=============', 'color:#FF9800');
            },

            _handleVideoRateChange(e) {
                if (e && e.currentTarget && this._eventVideoEl && e.currentTarget !== this._eventVideoEl) return;
                const expected = this.configs.playbackRate;
                const actual = this._videoEl && this._videoEl.playbackRate;
                if (typeof actual === 'number' && Math.abs(actual - expected) > 0.001) {
                    const now = Date.now();
                    if (now - (this._guardLastRateFixTs || 0) < 300) return;
                    this._guardLastRateFixTs = now;
                    this._applyPlaybackRate();
                }
            },

            // ---------------------------------- 学习步骤 / 章节测验 ----------------------------------

            _currentStepTitle() {
                const prevTitle = document.getElementsByClassName('prev_title')[0];
                return prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
            },

            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
                    return true;
                }
                if (this._stepAdvanceTimes >= 4) {
                    return false;
                }

                const currentStepTitle = this._currentStepTitle();
                if (currentStepTitle.includes('章节测验') || currentStepTitle.includes('视频')) {
                    return false;
                }

                const clickElement = (el, label) => {
                    if (!el) return false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    this._stepAdvanceTimes += 1;
                    console.log(`%c尝试点击${label}`, 'color:#2196F3');
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return true;
                };

                const videoTab = $('.prev_white:visible').filter((_, el) => {
                    const text = ($(el).text() || '').replace(/\s+/g, '');
                    return text.includes('视频');
                }).get(0);
                if (clickElement(videoTab, '“视频”页签')) {
                    return true;
                }

                return false;
            },

            _isChapterTest() {
                const step = this._currentStepTitle();
                return step.includes('章节测验') || step.includes('测验');
            },

            _advanceChapterTest() {
                if (this._chapterAdvanceTimes >= 3) {
                    console.error('%c章节测验页面连续跳转失败，已停止以避免页面循环。请手动处理后执行 app.run()。', 'color:#F44336;font-weight:bold');
                    if (this._queueActive) this._skipQueueItem('章节测验连续跳转失败');
                    return;
                }

                const nextButton = $('#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible').first().get(0);
                if (!nextButton) {
                    console.warn('%c未找到章节测验的下一步按钮，已停止。', 'color:#FF9800');
                    if (this._queueActive) this._skipQueueItem('章节测验没有下一步按钮');
                    return;
                }

                this._chapterAdvanceTimes += 1;
                console.log('%c检测到章节测验，尝试进入下一学习步骤', 'color:#607D8B');
                nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                this._setTimer('chapterAdvance', () => this.play(), 2000);
            },

            _bindStepNavigation() {
                if (this._stepNavigationBound) return;
                this._stepNavigationBound = true;

                const reenterVideoMode = () => {
                    const wasQueue = this._queueActive;
                    this._queueActive = false;
                    this._queue = [];
                    this._queuePos = -1;
                    this._nextUnitPending = false;
                    this._clearPlaybackTimers();
                    this._clearCheckInterval();
                    this._videoEl = null;
                    this._isPlaying = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    if (wasQueue) this._log('检测到手动切换学习步骤，已暂停自动连播。');
                    this._setTimer('reenter', () => {
                        try {
                            this._syncCatalogIndexFromActive();
                        } catch (e) {}
                        this.play();
                    }, 1800);
                };

                $(document).off('click.xuexitongPlayerV3', '.prev_white').on('click.xuexitongPlayerV3', '.prev_white', (e) => {
                    const originalEvent = e.originalEvent || e;
                    if (!originalEvent.isTrusted) return;
                    const text = ($(e.currentTarget).text() || '').replace(/\s+/g, '');
                    if (text.includes('视频')) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新接管视频页`, 'color:#607D8B');
                        reenterVideoMode();
                    }
                });
            },

            _bindPageGuards() {
                if (this._pageGuards) return;
                const preventPause = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                };
                const resumePlaybackNow = () => this._tryResumePlayback('page-event');
                this._pageGuards = { preventPause, resumePlaybackNow };
                document.addEventListener('mouseleave', preventPause);
                window.addEventListener('mouseleave', preventPause);
                document.addEventListener('mouseout', preventPause);
                window.addEventListener('mouseout', preventPause);
                window.addEventListener('blur', resumePlaybackNow);
                document.addEventListener('visibilitychange', resumePlaybackNow);
            },
        };

        window.app = app;
        window[APP_KEY] = app;

        try {
            app.run();
            app._bindPageGuards();
        } catch (error) {
            console.error('%c脚本运行失败: ', 'color:#F44336;font-weight:bold', error.message);
            console.log('请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。');
        }
    }
})();
