/**
 * Lampa Ad Blocker
 * https://github.com/sgtlomzik
 * Blocks VAST/preroll ads in Lampa media player
 */

(function() {
    'use strict';

    var AD_PATTERNS = [
        '/vast',
        '/vpaid',
        '/preroll',
        '/adv?',
        '/ads?',
        'ad_place_type=',
        'content_type=avod',
        'cachebuster=',
        'getcode?p1=',
        'adfox',
        'betweendigital.com',
        'yandex.ru/ads',
        'an.yandex.ru',
        'doubleclick.net',
        'googlesyndication',
        'mc.yandex.ru/watch',
        'ad.mail.ru'
    ];

    var BLOCKED_STORAGE_KEYS = [
        'vast',
        'vast_url',
        'vast_device_uid',
        'vast_device_guid',
        'preroll',
        'prerolls',
        'ads'
    ];

    function isAdRequest(url) {
        if (!url) return false;
        var lowerUrl = url.toLowerCase();
        for (var i = 0; i < AD_PATTERNS.length; i++) {
            if (lowerUrl.indexOf(AD_PATTERNS[i]) !== -1) return true;
        }
        return false;
    }

    function patchXHR() {
        var Original = window.XMLHttpRequest;

        window.XMLHttpRequest = function() {
            var xhr = new Original();
            var originalOpen = xhr.open;
            var originalSend = xhr.send;
            var blocked = false;

            xhr.open = function(method, url) {
                blocked = isAdRequest(url);
                return originalOpen.apply(this, arguments);
            };

            xhr.send = function() {
                if (blocked) {
                    var self = this;
                    setTimeout(function() {
                        Object.defineProperty(self, 'status', { value: 0 });
                        Object.defineProperty(self, 'readyState', { value: 4 });
                        if (self.onerror) self.onerror();
                        if (self.onloadend) self.onloadend();
                        if (self.onreadystatechange) self.onreadystatechange();
                    }, 1);
                    return;
                }
                return originalSend.apply(this, arguments);
            };

            return xhr;
        };

        window.XMLHttpRequest.UNSENT = 0;
        window.XMLHttpRequest.OPENED = 1;
        window.XMLHttpRequest.HEADERS_RECEIVED = 2;
        window.XMLHttpRequest.LOADING = 3;
        window.XMLHttpRequest.DONE = 4;
    }

    function patchFetch() {
        if (!window.fetch) return;

        var originalFetch = window.fetch;

        window.fetch = function(resource, options) {
            var url = (typeof resource === 'string') ? resource : (resource && resource.url) || '';
            if (isAdRequest(url)) {
                return Promise.resolve(new Response('', { status: 200 }));
            }
            return originalFetch.apply(this, arguments);
        };
    }

    function injectCSS() {
        var style = document.createElement('style');
        style.id = 'lampa-adblocker';
        style.textContent = '.ad-preroll,.ad-notify,.player-video__ad,.player__advert{display:none!important}';
        document.head.appendChild(style);
    }

    function patchLampa() {
        if (!window.Lampa) return false;

        if (Lampa.Player && Lampa.Player.play && !Lampa.Player._adBlockerPatched) {
            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function(element) {
                if (element) {
                    element.vast = null;
                    element.vast_url = null;
                    element.vast_msg = null;
                    element.vast_region = null;
                    element.vast_platform = null;
                    element.vast_screen = null;
                    element.preroll = null;
                }
                return originalPlay.call(this, element);
            };

            Lampa.Player._adBlockerPatched = true;
        }

        if (Lampa.Storage && !Lampa.Storage._adBlockerPatched) {
            var originalGet = Lampa.Storage.get;

            Lampa.Storage.get = function(key, defaultValue) {
                if (key && BLOCKED_STORAGE_KEYS.indexOf(key) !== -1) {
                    return defaultValue !== undefined ? defaultValue : null;
                }
                return originalGet.apply(this, arguments);
            };

            Lampa.Storage._adBlockerPatched = true;
        }

        return Lampa.Player && Lampa.Player._adBlockerPatched;
    }

    function init() {
        patchXHR();
        patchFetch();
        injectCSS();
        patchLampa();

        var attempts = 0;
        var interval = setInterval(function() {
            if (patchLampa() || ++attempts > 50) {
                clearInterval(interval);
            }
        }, 100);
    }

    init();

})();
