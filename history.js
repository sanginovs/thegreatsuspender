/*global chrome, gsUtils, render, createWindowHtml, createTabHtml */

(function () {

    'use strict';

    var tabs = {}, // unused
        windows = {}; // unused

    function getFormattedDate(date, includeTime) {
        var d = new Date(date),
            cur_date = ('0' + d.getDate()).slice(-2),
            cur_month = ('0' + (d.getMonth() + 1)).slice(-2),
            cur_year = d.getFullYear(),
            cur_time = d.toTimeString().match(/^([0-9]{2}:[0-9]{2})/)[0];

        if (includeTime) {
            return cur_time + ' ' + cur_date + '-' + cur_month + '-' + cur_year;
        }
        return cur_date + '-' + cur_month + '-' + cur_year;
    }

    function compareDate(a, b) {
        if (a.date > b.date) {
            return -1;
        }
        if (a.date < b.date) {
            return 1;
        }
        return 0;
    }

    function reloadTabs(element, suspendMode) {
        return function () {
            var tgs = chrome.extension.getBackgroundPage().tgs,
                windowId = element.getAttribute('data-windowId'),
                sessionId = element.getAttribute('data-sessionId'),
                session = gsUtils.getSessionById(sessionId),
                windows = [],
                curUrl;

            //if loading a specific window
            if (windowId) {
                windows.push(gsUtils.getWindowFromSession(windowId, session));

            //else load all windows from session
            } else {
                windows = session.windows;
            }

            windows.forEach(function(window) {

                chrome.windows.create(function (newWindow) {
                    window.tabs.forEach(function (curTab) {
                        curUrl = curTab.url;

                        if (suspendMode && curUrl.indexOf('suspended.html') < 0 && !tgs.isSpecialTab(curTab)) {
                            curUrl = gsUtils.generateSuspendedUrl(curUrl);
                        } else if (!suspendMode && curUrl.indexOf('suspended.html') > 0) {
                            curUrl = gsUtils.getSuspendedUrl(curTab.url.split('suspended.html')[1]);
                        }
                        chrome.tabs.create({windowId: newWindow.id, url: curUrl, pinned: curTab.pinned, active: false});
                    });

                    chrome.tabs.query({windowId: newWindow.id, index: 0}, function (tabs) {
                        chrome.tabs.remove(tabs[0].id);
                    });
                });
            });
        };
    }

    function removeTab(element) {

        return function () {

            var tabId = element.getAttribute('data-tabId'),
                windowId = element.getAttribute('data-windowId'),
                sessionId = element.getAttribute('data-sessionId'),
                session = gsUtils.getSessionById(sessionId),
                sessionEl,
                newSessionEl;

            session = gsUtils.removeTabFromSessionHistory(sessionId, windowId, tabId);
            sessionEl = element.parentElement.parentElement;
            newSessionEl = createSessionHtml(session);
            sessionEl.parentElement.replaceChild(newSessionEl, sessionEl);
            toggleSession(newSessionEl.getElementsByTagName('div')[0])();
        };
    }

    function toggleSession(element) {
        return function () {
            if (element.childElementCount > 0) {
                element.innerHTML = '';
                return;
            }

            var sessionId = element.getAttribute('data-sessionId'),
                session = gsUtils.getSessionById(sessionId),
                windowProperties,
                tabProperties;

            if (!session) {
                return;
            }

            session.windows.forEach(function (window, index) {
                windowProperties = window;
                windowProperties.sessionId = session.id;
                element.appendChild(createWindowHtml(windowProperties, index));

                windowProperties.tabs.forEach(function (tab) {
                    tabProperties = tab;
                    tabProperties.windowId = windowProperties.id;
                    tabProperties.sessionId = session.id;
                    element.appendChild(createTabHtml(tabProperties));
                });
            });
        };
    }

    function hideModal() {
        document.getElementById('sessionNameModal').style.display = 'none';
        document.getElementsByClassName('mainContent')[0].className = 'mainContent';
    }

    function saveSession(sessionId) {
        var session = gsUtils.getSessionById(sessionId);

        document.getElementsByClassName('mainContent')[0].className += ' blocked';
        document.getElementById('sessionNameModal').style.display = 'block';
        document.getElementById('sessionNameText').focus();

        document.getElementById('sessionNameCancel').onclick = hideModal;
        document.getElementById('sessionNameSubmit').onclick = function () {
            var text = document.getElementById('sessionNameText').value;
            if (text) {
                gsUtils.saveSession(text, session);
                render();
            }
        };
    }

    function exportSession(sessionId) {
        var session = gsUtils.getSessionById(sessionId),
            csvContent = "data:text/csv;charset=utf-8,",
            dataString = '';

        session.windows.forEach(function (curWindow, index) {
            curWindow.tabs.forEach(function (curTab, tabIndex) {
                if (curTab.url.indexOf("suspended.html") > 0) {
                    dataString += gsUtils.getSuspendedUrl(curTab.url.split('suspended.html')[1]) + '\n';
                } else {
                    dataString += curTab.url + '\n';
                }
            });
        });
        csvContent += dataString;

        var encodedUri = encodeURI(csvContent);
        var link = createEl("a", {
            "href": encodedUri,
            "download": "session.txt"
        });
        link.click();
    }

    function createSessionHtml(session) {
        var savedSession = session.name ? true : false,
            sessionContainer,
            sessionTitle,
            sessionSave,
            sessionExport,
            sessionDiv,
            windowResuspend,
            windowReload,
            titleText,
            winCnt = session.windows.length,
            tabCnt = session.windows.reduce(function(a, b) {return a + b.tabs.length;}, 0);

        if (savedSession) {
            titleText = session.name + ' (' + winCnt + pluralise(' window', winCnt) + ', ' + tabCnt + pluralise(' tab', tabCnt) + ')';
        } else {
            titleText = winCnt + pluralise(' window', winCnt) + ', ' + tabCnt + pluralise(' tab', tabCnt) + ': ' + gsUtils.getHumanDate(session.date);
        }

        sessionDiv = createEl('div', {
            'class': 'sessionDiv',
            'data-sessionId': session.id
        });

        sessionTitle = createEl('span', {
            'class': 'sessionLink'
        }, titleText);
        sessionTitle.onclick = toggleSession(sessionDiv);

        if (!savedSession) {
            sessionSave = createEl('a', {
                'class': 'groupLink',
                'href': '#'
            }, 'save');
            sessionSave.onclick = function () { saveSession(session.id); };
        }

        sessionExport = createEl('a', {
            'class': 'groupLink',
            'href': '#'
        }, 'export');
        sessionExport.onclick = function () { exportSession(session.id); };

        windowResuspend = createEl('a', {
            'class': 'groupLink',
            'href': '#'
        }, 'resuspend');
        windowResuspend.onclick = reloadTabs(sessionDiv, true);

        windowReload = createEl('a', {
            'class': 'groupLink',
            'href': '#'
        }, 'reload');
        windowReload.onclick = reloadTabs(sessionDiv, false);

        sessionContainer = createEl('div');
        sessionContainer.appendChild(sessionTitle);
        sessionContainer.appendChild(windowResuspend);
        sessionContainer.appendChild(windowReload);
        sessionContainer.appendChild(sessionExport);
        if (!savedSession) sessionContainer.appendChild(sessionSave);
        sessionContainer.appendChild(sessionDiv);

        return sessionContainer;
    }

    function createWindowHtml(window, count) {

        var groupHeading,
            windowHeading,
            groupUnsuspendCurrent,
            groupUnsuspendNew;

        groupHeading = createEl('div', {
            'class': 'windowHeading',
            'data-windowId': window.id,
            'data-sessionId': window.sessionId
        });

        windowHeading = createEl('span', {}, 'Window ' + (count + 1) + ':&nbsp;');

        groupUnsuspendCurrent = createEl('a', {
            'class': 'groupLink',
            'href': '#'
        }, 'resuspend');
        groupUnsuspendCurrent.onclick = reloadTabs(groupHeading, true);

        groupUnsuspendNew = createEl('a', {
            'class': 'groupLink',
            'href': '#'
        }, 'reload');
        groupUnsuspendNew.onclick = reloadTabs(groupHeading, false);

        groupHeading.appendChild(windowHeading);
        groupHeading.appendChild(groupUnsuspendCurrent);
        groupHeading.appendChild(groupUnsuspendNew);

        return groupHeading;
    }

    function createTabHtml(tabProperties) {

        var linksSpan,
            listImg,
            listLink,
            listHover,
            favicon = false;

        favicon = favicon || tabProperties.favicon;
        favicon = favicon || tabProperties.favIconUrl;
        favicon = favicon || 'chrome://favicon/' + tabProperties.url;

        if (tabProperties.sessionId) {
            linksSpan = createEl('div', {
                'class': 'recoveryLink',
                'data-tabId': tabProperties.id || tabProperties.url,
                'data-windowId': tabProperties.windowId,
                'data-sessionId': tabProperties.sessionId
            });
        } else {
            linksSpan = createEl('div', {
                'class': 'recoveryLink',
                'data-url': tabProperties.url
            });
        }

        listHover = createEl('img', {
            'src': chrome.extension.getURL('img/x.gif'),
            'class': 'itemHover'
        });
        listHover.onclick = removeTab(linksSpan);

        listImg = createEl('img', {
            'src': favicon,
            'height': '16px',
            'width': '16px'
        });

        listLink = createEl('a', {
            'class': 'historyLink',
            'href': tabProperties.url,
            'target': '_blank'
        }, tabProperties.title);

        linksSpan.appendChild(listHover);
        linksSpan.appendChild(listImg);
        linksSpan.appendChild(listLink);
        linksSpan.appendChild(createEl('br'));

        return linksSpan;
    }

    function createEl(elType, attributes, text) {

        var el = document.createElement(elType);
        attributes = attributes || {};
        el = setElAttributes(el, attributes);
        el.innerHTML = text || '';
        return el;
    }
    function setElAttributes(el, attributes) {
        for (var key in attributes) {
            if (attributes.hasOwnProperty(key)) {
                el.setAttribute(key, attributes[key]);
            }
        }
        return el;
    }

    function pluralise(text, count) {
        return text + (count > 1 ? 's' : '');
    }

    function render() {

        var gsSessionHistory = gsUtils.fetchGsSessionHistory(),
            currentDiv = document.getElementById('currentLinks'),
            sessionsDiv = document.getElementById('recoveryLinks'),
            historyDiv = document.getElementById('historyLinks'),
            clearHistoryEl = document.getElementById('clearHistory'),
            firstSession = true;

        hideModal();
        currentDiv.innerHTML = '';
        sessionsDiv.innerHTML = '';
        historyDiv.innerHTML = '';

        gsSessionHistory.forEach(function (session, index) {
            //saved sessions will all have a 'name' attribute
            if (session.name) {
                historyDiv.appendChild(createSessionHtml(session));
            } else if (firstSession) {
                currentDiv.appendChild(createSessionHtml(session));
                firstSession = false;
            } else {
                sessionsDiv.appendChild(createSessionHtml(session));
            }
        });

        clearHistoryEl.onclick = function (e) {
            gsUtils.clearGsSessionHistory();
            gsUtils.clearPreviews();
            render();
        };
    }

    window.onload = function () {
        render();
    };

}());
