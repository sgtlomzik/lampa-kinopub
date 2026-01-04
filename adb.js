/**
 * Lampa Ad Blocker v5-final
 */

(function() {
    'use strict';

    var DEBUG = false;

    function log() {
        if (DEBUG) console.log.apply(console, ['[AdBlocker]'].concat(Array.prototype.slice.call(arguments)));
    }

    // CSS: Скрываем ad-preroll
    function injectCSS() {
        if (document.getElementById('adblocker-css')) return;
        
        var style = document.createElement('style');
        style.id = 'adblocker-css';
        style.textContent = '\
            .ad-preroll,\
            .ad-notify,\
            .player-video__ad,\
            .player__advert {\
                display: none !important;\
                visibility: hidden !important;\
                opacity: 0 !important;\
                pointer-events: none !important;\
                width: 0 !important;\
                height: 0 !important;\
                position: absolute !important;\
                left: -9999px !important;\
            }\
        ';
        
        document.head.appendChild(style);
        log('CSS injected');
    }

    // MutationObserver: Удаляем ad-preroll сразу при появлении
    function setupObserver() {
        if (window._adObserver) return;
        if (!document.body) {
            setTimeout(setupObserver, 100);
            return;
        }
        
        window._adObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    
                    var cl = node.className || '';
                    if (typeof cl === 'string' && cl.indexOf('ad-preroll') !== -1) {
                        node.remove();
                        log('Removed ad-preroll element');
                    }
                });
            });
        });
        
        window._adObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        log('Observer started');
    }

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
                }
                log('Player.play clean');
                return originalPlay.call(this, element);
            };
            
            Lampa.Player._adblocked = true;
        }

        // Патч Storage.get
        if (Lampa.Storage && !Lampa.Storage._adblocked) {
            var originalGet = Lampa.Storage.get;
            
            var blockedKeys = [
                'vast', 'vast_url', 'vast_device_uid', 'vast_device_guid',
                'preroll', 'prerolls', 'ad_config', 'ads', 'advert',
                'ad_prerolls', 'ad_list', 'vast_config'
            ];
            
            Lampa.Storage.get = function(name, defaultValue) {
                if (name && blockedKeys.indexOf(name) !== -1) {
                    log('Storage.get blocked:', name);
                    return defaultValue !== undefined ? defaultValue : null;
                }
                return originalGet.apply(this, arguments);
            };
            
            Lampa.Storage._adblocked = true;
        }

        log('Patches applied');
    }

    // === ЗАПУСК ===
    
    // CSS сразу (до загрузки DOM)
    injectCSS();
    
    // Пробуем патчи
    applyPatches();

    // После загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            injectCSS();
            applyPatches();
            setupObserver();
        });
    } else {
        setupObserver();
    }

    // Ждём Lampa
    var attempts = 0;
    var waitInterval = setInterval(function() {
        attempts++;
        injectCSS();
        applyPatches();
        if (!window._adObserver && document.body) setupObserver();
        
        if (attempts > 30 || (Lampa && Lampa.Player && Lampa.Player._adblocked)) {
            clearInterval(waitInterval);
            log('Init complete');
        }
    }, 100);

})();
