/**
 * Lampa Ad Blocker v8
 * Устойчив к смене доменов
 */

(function() {
    'use strict';

    var DEBUG = false;

    function log() {
        if (DEBUG) console.log.apply(console, ['[AdBlocker]'].concat(Array.prototype.slice.call(arguments)));
    }

    // ============================================================
    // БЛОКИРОВКА ПО КОНТЕНТУ/ПАТТЕРНАМ URL (не только домены!)
    // ============================================================
    
    function isAdUrl(url) {
        if (!url || typeof url !== 'string') return false;
        var lowerUrl = url.toLowerCase();
        
        // Паттерны в URL которые указывают на рекламу
        var patterns = [
            // Ключевые слова в пути
            '/vast',
            '/vpaid', 
            '/preroll',
            '/adv?',
            '/ads?',
            '/ad/',
            'ad_place_type=preroll',
            'ad_place_type=midroll',
            'content_type=avod',
            
            // Параметры VAST
            'cachebuster=',
            'maxd=300',        // max duration — типичный параметр рекламы
            'mind=5',          // min duration
            
            // adfox специфика
            'getcode?p1=',
            'adfox',
            
            // Известные домены (как fallback)
            'betweendigital.com',
            'yandex.ru/ads',
            'an.yandex.ru',
            'doubleclick.net',
            'googlesyndication'
        ];
        
        for (var i = 0; i < patterns.length; i++) {
            if (lowerUrl.indexOf(patterns[i]) !== -1) {
                return true;
            }
        }
        
        return false;
    }

    // ============================================================
    // ПЕРЕХВАТ XHR
    // ============================================================
    if (!window._xhrAdBlocked) {
        var OriginalXHR = window.XMLHttpRequest;
        
        window.XMLHttpRequest = function() {
            var xhr = new OriginalXHR();
            var originalOpen = xhr.open;
            var originalSend = xhr.send;
            var isBlocked = false;
            
            xhr.open = function(method, url) {
                if (isAdUrl(url)) {
                    isBlocked = true;
                    log('XHR blocked:', url.substring(0, 100));
                }
                return originalOpen.apply(this, arguments);
            };
            
            xhr.send = function() {
                if (isBlocked) {
                    var self = this;
                    setTimeout(function() {
                        Object.defineProperty(self, 'status', { value: 0 });
                        Object.defineProperty(self, 'readyState', { value: 4 });
                        Object.defineProperty(self, 'responseText', { value: '' });
                        Object.defineProperty(self, 'response', { value: '' });
                        
                        if (self.onerror) self.onerror(new Error('blocked'));
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
        
        window._xhrAdBlocked = true;
    }

    // ============================================================
    // ПЕРЕХВАТ FETCH
    // ============================================================
    if (!window._fetchAdBlocked && window.fetch) {
        var originalFetch = window.fetch;
        
        window.fetch = function(url, options) {
            var urlString = (typeof url === 'string') ? url : (url && url.url) || '';
            
            if (isAdUrl(urlString)) {
                log('fetch blocked:', urlString.substring(0, 100));
                return Promise.resolve(new Response('', { status: 200 }));
            }
            
            return originalFetch.apply(this, arguments);
        };
        
        window._fetchAdBlocked = true;
    }

    // ============================================================
    // CSS
    // ============================================================
    function injectCSS() {
        if (document.getElementById('adblocker-css')) return;
        
        var style = document.createElement('style');
        style.id = 'adblocker-css';
        style.textContent = '.ad-preroll, .ad-notify, .player-video__ad, .player__advert { display:none!important; }';
        document.head.appendChild(style);
    }

    // ============================================================
    // ПАТЧИ LAMPA
    // ============================================================
    function applyPatches() {
        if (!window.Lampa) return;

        // Патч Player.play
        if (Lampa.Player && Lampa.Player.play && !Lampa.Player._adblocked) {
            var originalPlay = Lampa.Player.play;
            
            Lampa.Player.play = function(element) {
                if (element) {
                    element.vast = null;
                    element.vast_url = null;
                    element.vast_msg = null;
                    element.vast_region = null;
                    element.vast_platform = null;
                    element.vast_screen = null;
                    element.advert = null;
                    element.preroll = null;
                }
                return originalPlay.call(this, element);
            };
            
            Lampa.Player._adblocked = true;
        }

        // Патч Storage.get
        if (Lampa.Storage && !Lampa.Storage._adblocked) {
            var originalGet = Lampa.Storage.get;
            
            var blockedKeys = [
                'vast', 'vast_url', 'vast_device_uid', 'vast_device_guid',
                'preroll', 'prerolls', 'ad_config', 'ads', 'advert'
            ];
            
            Lampa.Storage.get = function(name, defaultValue) {
                if (name && blockedKeys.indexOf(name) !== -1) {
                    return defaultValue !== undefined ? defaultValue : null;
                }
                return originalGet.apply(this, arguments);
            };
            
            Lampa.Storage._adblocked = true;
        }
    }

    // ============================================================
    // ЗАПУСК
    // ============================================================
    
    injectCSS();
    applyPatches();

    document.addEventListener('DOMContentLoaded', function() {
        injectCSS();
        applyPatches();
    });

    var attempts = 0;
    var waitInterval = setInterval(function() {
        attempts++;
        applyPatches();
        if (attempts > 50 || (Lampa && Lampa.Player && Lampa.Player._adblocked)) {
            clearInterval(waitInterval);
        }
    }, 50);

    console.log('[AdBlocker] v8 loaded');

})();
