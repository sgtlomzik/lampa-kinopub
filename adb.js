/**
 * Lampa Ad Blocker v4-safe
 * Минимальная версия без агрессивных патчей
 */

(function() {
    'use strict';

    var DEBUG = true; // Пока true, чтобы видеть что происходит

    function log() {
        if (DEBUG) console.log.apply(console, ['[AdBlocker]'].concat(Array.prototype.slice.call(arguments)));
    }

    // CSS: Скрываем надпись "РЕКЛАМА"
    function injectCSS() {
        if (document.getElementById('adblocker-css')) return;
        
        var style = document.createElement('style');
        style.id = 'adblocker-css';
        style.textContent = [
            '.ad-notify',
            '.player-video__ad',
            '.player__advert',
            '.player-video__advert',
            '.vast-block',
            '.preroll-notify'
        ].join(',') + '{ display:none!important; }';
        
        document.head.appendChild(style);
        log('✅ CSS injected');
    }

    function applyPatches() {
        if (!window.Lampa) return;

        injectCSS();

        // Патч 1: Player.play — убираем рекламные данные
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
                log('✅ Player.play clean');
                return originalPlay.call(this, element);
            };
            
            Lampa.Player._adblocked = true;
        }

        // Патч 2: Storage.get — ТОЧНЫЕ ключи (исправлено!)
        if (Lampa.Storage && !Lampa.Storage._adblocked) {
            var originalGet = Lampa.Storage.get;
            
            // Список ТОЧНЫХ ключей для блокировки
            var blockedKeys = [
                'vast', 'vast_url', 'vast_device_uid', 'vast_device_guid',
                'preroll', 'prerolls', 'ad_config', 'ads'
            ];
            
            Lampa.Storage.get = function(name, defaultValue) {
                if (name && blockedKeys.indexOf(name) !== -1) {
                    log('🚫 Storage.get blocked:', name);
                    return defaultValue !== undefined ? defaultValue : null;
                }
                return originalGet.apply(this, arguments);
            };
            
            Lampa.Storage._adblocked = true;
        }

        log('✅ Patches applied');
    }

    // Запуск
    injectCSS();
    applyPatches();

    // Ждём Lampa
    var attempts = 0;
    var waitInterval = setInterval(function() {
        attempts++;
        applyPatches();
        
        if (attempts > 30 || (Lampa && Lampa.Player && Lampa.Player._adblocked)) {
            clearInterval(waitInterval);
            log('✅ Init done');
        }
    }, 100);

    document.addEventListener('DOMContentLoaded', applyPatches);

})();
