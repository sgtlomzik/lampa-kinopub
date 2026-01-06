(function () {
    'use strict';

    var PLUGIN_VERSION = '2.0.0';
    var DEBUG = true;

    // ==================== КОНФИГУРАЦИЯ ====================
    var CONFIG = {
        VIDEO_SKIP_SECONDS: 5,
        VIDEO_MIN_DURATION_FOR_SKIP: 10,
        MAX_TRAILER_DURATION: 300,        // 5 минут
        CACHE_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 дней
        AJAX_TIMEOUT: 10000,
        ROOTU_TIMEOUT: 3000,
        SCALE_BASE: 1.35,
        SCALE_MIN: 1.1,
        ASPECT_THRESHOLD: 1.77
    };

    // ==================== ПРОВЕРКА ЗАВИСИМОСТЕЙ ====================
    if (typeof $ === 'undefined' && typeof jQuery === 'undefined') {
        console.error('[Cardify] jQuery is required');
        return;
    }
    var $ = window.$ || window.jQuery;

    // ==================== HLS.JS LOADER (Promise-based) ====================
    var hlsReady = new Promise(function(resolve) {
        if (typeof Hls !== 'undefined') {
            resolve(true);
            return;
        }
        
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.4.12'; // Фиксированная версия
        script.onload = function() {
            log('HLS.js загружен');
            resolve(true);
        };
        script.onerror = function() {
            log('HLS.js не удалось загрузить');
            resolve(false);
        };
        document.head.appendChild(script);
    });

    // ==================== ЛОГИРОВАНИЕ ====================
    function log() {
        if (DEBUG) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[Cardify v' + PLUGIN_VERSION + ']');
            console.log.apply(console, args);
        }
    }

    log('Загрузка плагина...');

    // ==================== УТИЛИТЫ ====================
    var Utils = {
        // Уникальный ID генератор
        _counter: 0,
        generateId: function(prefix) {
            return (prefix || 'cardify') + '_' + (++this._counter) + '_' + Date.now();
        },
        
        // Очистка строки для поиска
        cleanString: function(str) {
            return (str || '').replace(/[^a-zA-Z\dа-яА-ЯёЁ]+/g, ' ').trim().toLowerCase();
        },
        
        // Извлечение video ID из URL Rutube
        extractVideoId: function(url) {
            if (!url) return null;
            var m = url.match(/rutube\.ru\/(play\/embed|video\/private|video|shorts)\/([\da-f]{32,})/i);
            return m ? m[2] : null;
        }
    };

    // ==================== AJAX MANAGER (с поддержкой отмены) ====================
    var AjaxManager = {
        _requests: {},
        
        request: function(options, groupId) {
            var self = this;
            var requestId = Utils.generateId('ajax');
            
            var xhr = $.ajax($.extend({}, options, {
                complete: function(jqXHR, status) {
                    delete self._requests[requestId];
                    if (options.complete) options.complete(jqXHR, status);
                }
            }));
            
            this._requests[requestId] = { xhr: xhr, groupId: groupId };
            return requestId;
        },
        
        abortGroup: function(groupId) {
            var self = this;
            Object.keys(this._requests).forEach(function(id) {
                if (self._requests[id].groupId === groupId) {
                    self._requests[id].xhr.abort();
                    delete self._requests[id];
                }
            });
        },
        
        abortAll: function() {
            var self = this;
            Object.keys(this._requests).forEach(function(id) {
                self._requests[id].xhr.abort();
                delete self._requests[id];
            });
        }
    };

    // ==================== DEBOUNCED STORAGE ====================
    var DebouncedStorage = {
        _pending: {},
        _timeouts: {},
        
        set: function(key, value, delay) {
            var self = this;
            delay = delay || 1000;
            
            this._pending[key] = value;
            
            if (this._timeouts[key]) {
                clearTimeout(this._timeouts[key]);
            }
            
            this._timeouts[key] = setTimeout(function() {
                Lampa.Storage.set(key, self._pending[key]);
                delete self._pending[key];
                delete self._timeouts[key];
            }, delay);
        },
        
        flush: function(key) {
            if (key && this._pending[key] !== undefined) {
                clearTimeout(this._timeouts[key]);
                Lampa.Storage.set(key, this._pending[key]);
                delete this._pending[key];
                delete this._timeouts[key];
            } else if (!key) {
                var self = this;
                Object.keys(this._pending).forEach(function(k) {
                    self.flush(k);
                });
            }
        }
    };

    // ==================== RUTUBE STREAM API ====================
    var RutubeStream = (function() {
        function getStreamUrl(videoId, callback, groupId) {
            var apiUrl = 'https://rutube.ru/api/play/options/' + videoId + '/?no_404=true&referer=&pver=v2';
            
            AjaxManager.request({
                url: apiUrl,
                dataType: 'json',
                timeout: CONFIG.AJAX_TIMEOUT,
                success: function(data) {
                    if (data && data.video_balancer && data.video_balancer.m3u8) {
                        callback({ m3u8: data.video_balancer.m3u8 });
                    } else {
                        callback(null);
                    }
                },
                error: function(xhr) {
                    if (xhr.statusText === 'abort') {
                        callback(null);
                        return;
                    }
                    tryWithProxy(videoId, callback, groupId);
                }
            }, groupId);
        }
        
        function tryWithProxy(videoId, callback, groupId) {
            var proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(
                'https://rutube.ru/api/play/options/' + videoId + '/?no_404=true&referer=&pver=v2'
            );
            
            AjaxManager.request({
                url: proxyUrl,
                dataType: 'json',
                timeout: CONFIG.AJAX_TIMEOUT,
                success: function(data) {
                    if (data && data.video_balancer && data.video_balancer.m3u8) {
                        callback({ m3u8: data.video_balancer.m3u8 });
                    } else {
                        callback(null);
                    }
                },
                error: function() {
                    callback(null);
                }
            }, groupId);
        }
        
        return { getStreamUrl: getStreamUrl };
    })();

    // ==================== RUTUBE SEARCH ====================
    var RutubeTrailer = (function() {
        var rootuTrailerApi = Lampa.Utils.protocol() + 'trailer.rootu.top/search/';
        var proxy = '';

        function search(movie, isTv, callback, groupId) {
            var title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            if (!title || title.length < 2) {
                callback(null);
                return;
            }

            var year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
            var cleanSearch = Utils.cleanString(title);
            var query = Utils.cleanString([title, year, 'русский трейлер', isTv ? 'сезон 1' : ''].join(' '));
            var cacheKey = 'cardify_rutube_' + movie.id;
            
            // Проверяем кэш
            try {
                var cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    var parsed = JSON.parse(cached);
                    callback(parsed.videoId ? parsed : null);
                    return;
                }
            } catch (e) {
                log('Cache parse error:', e);
            }

            var tmdbId = movie.id ? ('000000' + movie.id) : '';
            if (tmdbId.length > 7) {
                tmdbId = tmdbId.slice(-Math.max(7, (movie.id + '').length));
            }
            var type = isTv ? 'tv' : 'movie';

            if (tmdbId && /^\d+$/.test(tmdbId)) {
                AjaxManager.request({
                    url: rootuTrailerApi + type + '/' + tmdbId + '.json',
                    dataType: 'json',
                    timeout: CONFIG.ROOTU_TIMEOUT,
                    success: function(data) {
                        if (data && data.length && data[0].url) {
                            var videoId = Utils.extractVideoId(data[0].url);
                            if (videoId) {
                                var result = { title: data[0].title, videoId: videoId };
                                safeSessionStorage(cacheKey, result);
                                callback(result);
                                return;
                            }
                        }
                        searchRutubeApi(query, cleanSearch, year, cacheKey, callback, groupId);
                    },
                    error: function(xhr) {
                        if (xhr.statusText === 'abort') {
                            callback(null);
                            return;
                        }
                        searchRutubeApi(query, cleanSearch, year, cacheKey, callback, groupId);
                    }
                }, groupId);
            } else {
                searchRutubeApi(query, cleanSearch, year, cacheKey, callback, groupId);
            }
        }

        function safeSessionStorage(key, value) {
            try {
                sessionStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                log('SessionStorage write error:', e);
            }
        }

        function searchRutubeApi(query, cleanSearch, year, cacheKey, callback, groupId) {
            var url = (proxy || '') + 'https://rutube.ru/api/search/video/?query=' + 
                      encodeURIComponent(query) + '&format=json';
            
            AjaxManager.request({
                url: url,
                dataType: 'json',
                timeout: CONFIG.AJAX_TIMEOUT,
                success: function(data) {
                    if (!data || !data.results || !data.results.length) {
                        safeSessionStorage(cacheKey, { videoId: null });
                        callback(null);
                        return;
                    }
                    
                    var found = null;
                    for (var i = 0; i < data.results.length; i++) {
                        var r = data.results[i];
                        var rTitle = Utils.cleanString(r.title || '');
                        
                        if (!r.embed_url) continue;
                        
                        var isTrailer = rTitle.indexOf('трейлер') >= 0 || 
                                       rTitle.indexOf('trailer') >= 0 || 
                                       rTitle.indexOf('тизер') >= 0;
                        if (!isTrailer) continue;
                        if (r.duration && r.duration > CONFIG.MAX_TRAILER_DURATION) continue;
                        if (rTitle.indexOf(cleanSearch) < 0) continue;
                        
                        var videoId = Utils.extractVideoId(r.embed_url || r.video_url);
                        if (videoId) {
                            found = { title: r.title, videoId: videoId };
                            break;
                        }
                    }
                    
                    safeSessionStorage(cacheKey, found || { videoId: null });
                    callback(found);
                },
                error: function(xhr) {
                    if (xhr.statusText === 'abort') {
                        callback(null);
                        return;
                    }
                    
                    if (!proxy && xhr.status === 0) {
                        proxy = 'https://rutube-search.root-1a7.workers.dev/';
                        searchRutubeApi(query, cleanSearch, year, cacheKey, callback, groupId);
                        return;
                    }
                    
                    safeSessionStorage(cacheKey, { videoId: null });
                    callback(null);
                }
            }, groupId);
        }
        
        return { search: search };
    })();

    // ==================== RATINGS RENDERER ====================
    var RatingsRenderer = {
        render: function(container, card) {
            var $container = $(container);
            var $existing = $container.find('.cardify-ratings-list');
            $existing.remove();
            
            var ratings = [];

            // TMDB
            if (card.vote_average > 0) {
                ratings.push({ name: 'TMDB', value: card.vote_average });
            }
            
            // KP
            var kp = card.kp_rating || card.rating_kinopoisk || (card.ratings && card.ratings.kp);
            if (kp && kp > 0) {
                ratings.push({ name: 'KP', value: kp });
            }

            // IMDB
            var imdb = card.imdb_rating || (card.ratings && card.ratings.imdb);
            if (imdb && imdb > 0) {
                ratings.push({ name: 'IMDb', value: imdb });
            }

            // REACTION (FIRE)
            var fireCount = 0;
            if (card.reactions) {
                fireCount = card.reactions['0'] || card.reactions['fire'] || card.reactions['like'] || 0;
            }

            if (ratings.length === 0 && fireCount === 0) return;

            var html = '<div class="cardify-ratings-list">';
            
            ratings.forEach(function(r) {
                html += '<div class="cardify-rate-item">' +
                        '<span class="cardify-rate-icon">' + r.name + '</span>' +
                        '<span class="cardify-rate-value">' + parseFloat(r.value).toFixed(1) + '</span>' +
                        '</div>';
            });
            
            if (fireCount > 0) {
                var fireIcon = '<svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:0.3em;margin-bottom:2px;"><path d="M6 0C6 0 0 2.91667 0 8.16667C0 11.3887 2.68629 14 6 14C9.31371 14 12 11.3887 12 8.16667C12 2.91667 6 0 6 0ZM6 12.25C4.39167 12.25 3.08333 10.9417 3.08333 9.33333C3.08333 8.35625 3.63417 7.48417 4.445 7.00583C4.24667 7.5075 4.39833 8.16667 4.83333 8.16667C5.26833 8.16667 5.625 7.72625 5.5125 7.2275C5.355 6.52458 5.7575 5.64958 6.4575 5.25C6.18333 6.125 6.78417 7 7.58333 7C7.9975 7 8.365 7.21875 8.58083 7.55417C8.79958 8.085 8.91667 8.68292 8.91667 9.33333C8.91667 10.9417 7.60833 12.25 6 12.25Z" fill="white"/></svg>';
                html += '<div class="cardify-rate-item reaction">' + fireIcon + 
                        '<span class="cardify-rate-value">' + fireCount + '</span></div>';
            }

            html += '</div>';

            var $rateLine = $container.find('.full-start-new__rate-line');
            if ($rateLine.length) {
                $rateLine.before(html);
            } else {
                $container.find('.cardify__right').append(html);
            }
        }
    };

    // ==================== BACKGROUND TRAILER ====================
    var BackgroundTrailer = function(render, video, onDestroy) {
        var self = this;
        this.destroyed = false;
        this.hls = null;
        this.groupId = Utils.generateId('trailer');
        
        // Кэшируем DOM элементы
        this.$render = $(render);
        this.$background = this.$render.find('.full-start__background');
        
        this.$html = $('\
            <div class="cardify-bg-video">\
                <video class="cardify-bg-video__player" muted autoplay playsinline loop preload="auto"></video>\
                <div class="cardify-bg-video__overlay"></div>\
            </div>\
        ');
        
        this.videoElement = this.$html.find('video')[0];
        this.videoElement.muted = true;
        
        this.$background.after(this.$html);
        
        // Bind функции один раз для корректного удаления
        this._boundUpdateScale = this._updateScale.bind(this);
        this._boundOnMetadata = this._onMetadata.bind(this);
        this._boundOnPlaying = this._onPlaying.bind(this);
        this._boundOnError = this._onError.bind(this);
        
        window.addEventListener('resize', this._boundUpdateScale);
        
        // Загружаем стрим
        RutubeStream.getStreamUrl(video.videoId, function(stream) {
            if (self.destroyed) return;
            if (!stream || !stream.m3u8) {
                self.destroy();
                return;
            }
            self._loadStream(stream.m3u8);
        }, this.groupId);
    };
    
    BackgroundTrailer.prototype._updateScale = function() {
        if (this.destroyed || !this.videoElement) return;
        
        var screenRatio = window.innerWidth / window.innerHeight;
        var scale = CONFIG.SCALE_BASE;
        
        if (screenRatio > 1.8) {
            scale = Math.max(CONFIG.SCALE_MIN, CONFIG.SCALE_BASE - (screenRatio - CONFIG.ASPECT_THRESHOLD));
        }
        
        this.videoElement.style.transform = 'scale(' + scale + ')';
    };
    
    BackgroundTrailer.prototype._loadStream = function(m3u8Url) {
        var self = this;
        var video = this.videoElement;
        
        // TV FIX: Try Native HLS first
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            log('BackgroundTrailer: Native HLS detected');
            video.src = m3u8Url;
            this._setupVideoEvents();
            return;
        }
        
        // Ждём загрузки HLS.js
        hlsReady.then(function(loaded) {
            if (self.destroyed) return;
            
            if (loaded && typeof Hls !== 'undefined' && Hls.isSupported()) {
                log('BackgroundTrailer: Using hls.js');
                self.hls = new Hls({ 
                    autoStartLoad: true, 
                    startLevel: -1,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60
                });
                self.hls.loadSource(m3u8Url);
                self.hls.attachMedia(video);
                self.hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    self._tryPlay();
                });
                self.hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        log('BackgroundTrailer: HLS fatal error', data);
                        self.destroy();
                    }
                });
                self._setupVideoEvents();
            } else {
                // Last resort - native fallback
                log('BackgroundTrailer: Native fallback');
                video.src = m3u8Url;
                self._setupVideoEvents();
            }
        });
    };
    
    BackgroundTrailer.prototype._setupVideoEvents = function() {
        var video = this.videoElement;
        video.addEventListener('loadedmetadata', this._boundOnMetadata);
        video.addEventListener('playing', this._boundOnPlaying);
        video.addEventListener('error', this._boundOnError);
    };
    
    BackgroundTrailer.prototype._removeVideoEvents = function() {
        if (!this.videoElement) return;
        this.videoElement.removeEventListener('loadedmetadata', this._boundOnMetadata);
        this.videoElement.removeEventListener('playing', this._boundOnPlaying);
        this.videoElement.removeEventListener('error', this._boundOnError);
    };
    
    BackgroundTrailer.prototype._onMetadata = function() {
        if (this.destroyed) return;
        
        var video = this.videoElement;
        if (video.duration > CONFIG.VIDEO_MIN_DURATION_FOR_SKIP) {
            video.currentTime = CONFIG.VIDEO_SKIP_SECONDS;
        }
        this._updateScale();
        this._tryPlay();
    };
    
    BackgroundTrailer.prototype._onPlaying = function() {
        if (this.destroyed) return;
        this.$html.addClass('cardify-bg-video--visible');
        this.$background.addClass('cardify-bg-hidden');
    };
    
    BackgroundTrailer.prototype._onError = function(e) {
        log('BackgroundTrailer: Video Error', e);
    };
    
    BackgroundTrailer.prototype._tryPlay = function() {
        var self = this;
        var video = this.videoElement;
        
        if (!video || this.destroyed) return;
        
        var playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(function(error) {
                log('BackgroundTrailer: Play failed, retrying muted', error);
                video.muted = true;
                video.play().catch(function(e) {
                    log('BackgroundTrailer: Muted play also failed', e);
                });
            });
        }
    };
    
    BackgroundTrailer.prototype.destroy = function() {
        if (this.destroyed) return;
        this.destroyed = true;
        
        log('BackgroundTrailer: Destroying...');
        
        // Отменяем все AJAX запросы этой группы
        AjaxManager.abortGroup(this.groupId);
        
        // Удаляем event listeners
        window.removeEventListener('resize', this._boundUpdateScale);
        this._removeVideoEvents();
        
        // Уничтожаем HLS
        if (this.hls) {
            try {
                this.hls.destroy();
            } catch (e) {
                log('HLS destroy error:', e);
            }
            this.hls = null;
        }
        
        // Останавливаем видео
        if (this.videoElement) {
            try {
                this.videoElement.pause();
                this.videoElement.src = '';
                this.videoElement.load();
            } catch (e) {
                log('Video cleanup error:', e);
            }
            this.videoElement = null;
        }
        
        // Восстанавливаем фон
        if (this.$background) {
            this.$background.removeClass('cardify-bg-hidden');
        }
        
        // Удаляем HTML
        if (this.$html) {
            this.$html.remove();
            this.$html = null;
        }
        
        // Callback
        if (typeof this._onDestroy === 'function') {
            this._onDestroy();
        }
    };
    
    // Фабричный метод для создания с callback
    BackgroundTrailer.create = function(render, video, onDestroy) {
        var trailer = new BackgroundTrailer(render, video);
        trailer._onDestroy = onDestroy;
        return trailer;
    };

    // ==================== ORIGINAL TITLE ====================
    var OriginalTitle = (function() {
        var storageKey = "cardify_title_cache";
        var titleCache = null;

        function loadCache() {
            if (titleCache === null) {
                titleCache = Lampa.Storage.get(storageKey) || {};
            }
            return titleCache;
        }

        function cleanOldCache() {
            var cache = loadCache();
            var now = Date.now();
            var changed = false;
            
            for (var id in cache) {
                if (cache.hasOwnProperty(id) && now - cache[id].timestamp > CONFIG.CACHE_TTL_MS) {
                    delete cache[id];
                    changed = true;
                }
            }
            
            if (changed) {
                DebouncedStorage.set(storageKey, cache);
            }
        }

        function fetchTitles(card) {
            return new Promise(function(resolve) {
                var cache = loadCache();
                var orig = card.original_title || card.original_name || '';
                var alt = [];
                
                if (card.alternative_titles) {
                    alt = card.alternative_titles.titles || card.alternative_titles.results || [];
                }
                
                var translitObj = alt.find(function(t) { 
                    return t.type === "Transliteration" || t.type === "romaji"; 
                });
                var translit = '';
                if (translitObj) {
                    translit = translitObj.title || 
                              (translitObj.data && (translitObj.data.title || translitObj.data.name)) || '';
                }
                
                var ruObj = alt.find(function(t) { return t.iso_3166_1 === "RU"; });
                var ru = ruObj ? ruObj.title : '';
                
                var enObj = alt.find(function(t) { return t.iso_3166_1 === "US"; });
                var en = enObj ? enObj.title : '';

                var now = Date.now();
                var cachedData = cache[card.id];
                
                if (cachedData && now - cachedData.timestamp < CONFIG.CACHE_TTL_MS) {
                    ru = ru || cachedData.ru || '';
                    en = en || cachedData.en || '';
                    translit = translit || cachedData.translit || '';
                }

                if (!ru || !en || !translit) {
                    var type = card.first_air_date ? "tv" : "movie";
                    
                    Lampa.Api.sources.tmdb.get(
                        type + "/" + card.id + "?append_to_response=translations",
                        {},
                        function(data) {
                            try {
                                var tr = (data.translations && data.translations.translations) || [];
                                
                                var translitData = tr.find(function(t) { 
                                    return t.type === "Transliteration" || t.type === "romaji"; 
                                });
                                if (translitData) {
                                    translit = translitData.title || 
                                              (translitData.data && (translitData.data.title || translitData.data.name)) || 
                                              translit;
                                }
                                
                                if (!ru) {
                                    var ruData = tr.find(function(t) { 
                                        return t.iso_3166_1 === "RU" || t.iso_639_1 === "ru"; 
                                    });
                                    if (ruData && ruData.data) {
                                        ru = ruData.data.title || ruData.data.name || '';
                                    }
                                }
                                
                                if (!en) {
                                    var enData = tr.find(function(t) { 
                                        return t.iso_3166_1 === "US" || t.iso_639_1 === "en"; 
                                    });
                                    if (enData && enData.data) {
                                        en = enData.data.title || enData.data.name || '';
                                    }
                                }
                                
                                cache[card.id] = { ru: ru, en: en, translit: translit, timestamp: now };
                                DebouncedStorage.set(storageKey, cache);
                                
                            } catch (e) {
                                log('OriginalTitle parse error:', e);
                            }
                            
                            resolve({ original: orig, ru: ru, en: en, translit: translit });
                        },
                        function(error) {
                            log('OriginalTitle fetch error:', error);
                            resolve({ original: orig, ru: ru, en: en, translit: translit });
                        }
                    );
                } else {
                    resolve({ original: orig, ru: ru, en: en, translit: translit });
                }
            });
        }

        function render(container, titles) {
            var $container = $(container);
            $container.find('.cardify-original-titles').remove();
            
            var items = [];
            if (titles.original) {
                items.push({ title: titles.original, label: 'Original' });
            }
            if (titles.translit && titles.translit !== titles.original && titles.translit !== titles.en) {
                items.push({ title: titles.translit, label: 'Translit' });
            }
            
            if (!items.length) return;
            
            var html = '<div class="cardify-original-titles">';
            items.forEach(function(item) {
                html += '<div class="cardify-original-titles__item">' +
                        '<span class="cardify-original-titles__text">' + item.title + '</span>' +
                        '<span class="cardify-original-titles__label">' + item.label + '</span>' +
                        '</div>';
            });
            html += '</div>';
            
            var $details = $container.find('.full-start-new__details');
            if ($details.length) {
                $details.after(html);
            } else {
                $container.find('.full-start-new__title').after(html);
            }
        }
        
        return { 
            init: cleanOldCache, 
            fetch: fetchTitles, 
            render: render 
        };
    })();

    // ==================== CSS (минифицированный) ====================
    var CARDIFY_CSS = '\
.cardify .full-start-new__body{height:80vh}\
.cardify .full-start-new__right{display:flex;align-items:flex-end}\
.cardify .full-start-new__title{text-shadow:0 0 10px rgba(0,0,0,0.8);font-size:5em!important;line-height:1.1!important;margin-bottom:0.15em;position:relative;z-index:2}\
.cardify .full-start-new__details{margin-bottom:0.5em;font-size:1.3em;opacity:0.9;text-shadow:0 1px 2px rgba(0,0,0,0.8);position:relative;z-index:2}\
.cardify .full-start-new__head{margin-bottom:0.3em;position:relative;z-index:2}\
.cardify img.full--logo,.cardify .full-start__title-img{max-height:24em!important;max-width:90%!important;height:auto!important;width:auto!important;object-fit:contain!important}\
.cardify__left{flex-grow:1;max-width:70%;position:relative;z-index:2}\
.cardify__right{display:flex;align-items:center;flex-shrink:0;position:relative;z-index:2}\
.cardify__background{left:0;transition:opacity 1s ease}\
.cardify__background.cardify-bg-hidden{opacity:0!important}\
.cardify .full-start-new__reactions{display:none!important}\
.cardify .full-start-new__rate-line{margin:0 0 0 1em;display:flex;align-items:center}\
.cardify-bg-video{position:absolute;top:-20%;left:0;right:0;bottom:-20%;z-index:0;opacity:0;transition:opacity 2s ease;overflow:hidden;pointer-events:none}\
.cardify-bg-video--visible{opacity:1}\
.cardify-bg-video__player{width:100%;height:100%;object-fit:cover;transition:transform 1s ease;will-change:transform;filter:brightness(0.85) saturate(1.1)}\
.cardify-bg-video__overlay{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.5) 40%,transparent 100%),linear-gradient(to top,rgba(0,0,0,0.9) 0%,transparent 30%);pointer-events:none}\
.cardify-ratings-list{display:flex;gap:0.8em;align-items:center}\
.cardify-rate-item{display:flex;flex-direction:row;align-items:center;gap:0.4em;border:2px solid rgba(255,255,255,0.5);border-radius:6px;padding:0.4em 0.8em;background:transparent;color:#fff}\
.cardify-rate-icon{font-size:0.9em;opacity:0.8;font-weight:normal;margin:0}\
.cardify-rate-value{font-size:1.1em;font-weight:bold;color:#fff!important}\
.cardify-rate-item.reaction{border-color:rgba(255,255,255,0.5)}\
.cardify-original-titles{margin-bottom:1em;display:flex;flex-direction:column;gap:0.3em;position:relative;z-index:2}\
.cardify-original-titles__item{display:flex;align-items:center;gap:0.8em;font-size:1.4em;opacity:0.9}\
.cardify-original-titles__text{color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.8)}\
.cardify-original-titles__label{font-size:0.7em;padding:0.2em 0.5em;background:rgba(255,255,255,0.2);border-radius:0.3em;text-transform:uppercase}\
.cardify .original_title{display:none!important}\
';

    // ==================== PLUGIN START ====================
    function startPlugin() {
        log('Инициализация...');
        OriginalTitle.init();

        Lampa.Lang.add({
            cardify_enable_sound: { ru: 'Включить звук', en: 'Enable sound', uk: 'Увімкнути звук' },
            cardify_enable_trailer: { ru: 'Фоновый трейлер', en: 'Background trailer', uk: 'Фоновий трейлер' },
            cardify_show_original_title: { ru: 'Оригинальное название', en: 'Original title', uk: 'Оригінальна назва' }
        });

        Lampa.Template.add('full_start_new', '<div class="full-start-new cardify"><div class="full-start-new__body"><div class="full-start-new__left hide"><div class="full-start-new__poster"><img class="full-start-new__img full--poster" /></div></div><div class="full-start-new__right"><div class="cardify__left"><div class="full-start-new__head"></div><div class="full-start-new__title">{title}</div><div class="full-start-new__details"></div><div class="full-start-new__buttons"><div class="full-start__button selector button--play"><svg width="28" height="29" viewBox="0 0 28 29" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14.5" r="13" stroke="currentColor" stroke-width="2.7"/><path d="M18.0739 13.634C18.7406 14.0189 18.7406 14.9811 18.0739 15.366L11.751 19.0166C11.0843 19.4015 10.251 18.9204 10.251 18.1506L10.251 10.8494C10.251 10.0796 11.0843 9.5985 11.751 9.9834L18.0739 13.634Z" fill="currentColor"/></svg><span>#{title_watch}</span></div><div class="full-start__button selector button--book"><svg width="21" height="32" viewBox="0 0 21 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 1.5H19C19.2761 1.5 19.5 1.72386 19.5 2V27.9618C19.5 28.3756 19.0261 28.6103 18.697 28.3595L12.6212 23.7303C11.3682 22.7757 9.63183 22.7757 8.37885 23.7303L2.30302 28.3595C1.9739 28.6103 1.5 28.3756 1.5 27.9618V2C1.5 1.72386 1.72386 1.5 2 1.5Z" stroke="currentColor" stroke-width="2.5"/></svg><span>#{settings_input_links}</span></div><div class="full-start__button selector button--reaction"><svg width="38" height="34" viewBox="0 0 38 34" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M37.208 10.97L12.07 0.11C11.72-0.04 11.32-0.04 10.97 0.11C10.63 0.25 10.35 0.53 10.2 0.88L0.11 25.25C0.04 25.42 0 25.61 0 25.8C0 25.98 0.04 26.17 0.11 26.34C0.18 26.51 0.29 26.67 0.42 26.8C0.55 26.94 0.71 27.04 0.88 27.11L17.25 33.89C17.59 34.04 17.99 34.04 18.34 33.89L29.66 29.2C29.83 29.13 29.99 29.03 30.12 28.89C30.25 28.76 30.36 28.6 30.43 28.43L37.21 12.07C37.28 11.89 37.32 11.71 37.32 11.52C37.32 11.33 37.28 11.15 37.21 10.97ZM20.43 29.94L21.88 26.43L25.39 27.89L20.43 29.94ZM28.34 26.02L21.65 23.25C21.3 23.11 20.91 23.11 20.56 23.25C20.21 23.4 19.93 23.67 19.79 24.02L17.02 30.71L3.29 25.02L12.29 3.29L34.03 12.29L28.34 26.02Z" fill="currentColor"/></svg><span>#{title_reactions}</span></div><div class="full-start__button selector button--subscribe hide"></div><div class="full-start__button selector button--options"><svg width="38" height="10" viewBox="0 0 38 10" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="4.89" cy="4.99" r="4.75" fill="currentColor"/><circle cx="18.97" cy="4.99" r="4.75" fill="currentColor"/><circle cx="33.06" cy="4.99" r="4.75" fill="currentColor"/></svg></div></div></div><div class="cardify__right"><div class="full-start-new__reactions selector"><div>#{reactions_none}</div></div><div class="full-start-new__rate-line"><div class="full-start__pg hide"></div><div class="full-start__status hide"></div></div></div></div></div><div class="hide buttons--container"><div class="full-start__button view--torrent hide"></div><div class="full-start__button selector view--trailer"></div></div></div>');

        // Добавляем CSS
        if (!document.getElementById('cardify-css')) {
            var style = document.createElement('style');
            style.id = 'cardify-css';
            style.textContent = CARDIFY_CSS;
            document.head.appendChild(style);
        }

        Lampa.SettingsApi.addComponent({ 
            component: 'cardify', 
            icon: '<svg width="36" height="28" viewBox="0 0 36 28" fill="none"><rect x="1.5" y="1.5" width="33" height="25" rx="3.5" stroke="white" stroke-width="3"/></svg>', 
            name: 'Cardify v' + PLUGIN_VERSION 
        });
        
        Lampa.SettingsApi.addParam({ 
            component: 'cardify', 
            param: { name: 'cardify_run_trailers', type: 'trigger', default: true }, 
            field: { name: Lampa.Lang.translate('cardify_enable_trailer') } 
        });
        
        Lampa.SettingsApi.addParam({ 
            component: 'cardify', 
            param: { name: 'cardify_show_original_title', type: 'trigger', default: true }, 
            field: { name: Lampa.Lang.translate('cardify_show_original_title') } 
        });

        var activeTrailers = {};

        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                var render = e.object.activity.render();
                var activityId = e.object.activity.id || Utils.generateId('activity');
                
                render.find('.full-start__background').addClass('cardify__background');

                if (e.data.movie) {
                    RatingsRenderer.render(render, e.data.movie);
                }

                if (Lampa.Storage.field('cardify_show_original_title') !== false && e.data.movie) {
                    OriginalTitle.fetch(e.data.movie).then(function(titles) {
                        OriginalTitle.render(render.find('.cardify__left'), titles);
                    }).catch(function(err) {
                        log('OriginalTitle error:', err);
                    });
                }

                if (Lampa.Storage.field('cardify_run_trailers') !== false && e.data.movie) {
                    var isTv = !!(e.object.method && e.object.method === 'tv');
                    
                    RutubeTrailer.search(e.data.movie, isTv, function(video) {
                        if (video && video.videoId) {
                            // Уничтожаем предыдущий трейлер если есть
                            if (activeTrailers[activityId]) {
                                activeTrailers[activityId].destroy();
                            }
                            
                            activeTrailers[activityId] = BackgroundTrailer.create(
                                render, 
                                video, 
                                function() { 
                                    delete activeTrailers[activityId]; 
                                }
                            );
                        }
                    }, 'search_' + activityId);
                }
            }
            
            if (e.type === 'destroy') {
                var activityId = e.object.activity.id || 0;
                
                // Отменяем поиск
                AjaxManager.abortGroup('search_' + activityId);
                
                // Уничтожаем трейлер
                if (activeTrailers[activityId]) {
                    activeTrailers[activityId].destroy();
                    delete activeTrailers[activityId];
                }
            }
        });

        // Cleanup при закрытии приложения
        window.addEventListener('beforeunload', function() {
            DebouncedStorage.flush();
            AjaxManager.abortAll();
            Object.keys(activeTrailers).forEach(function(id) {
                activeTrailers[id].destroy();
            });
        });

        log('Плагин успешно инициализирован');
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) { 
            if (e.type === 'ready') startPlugin(); 
        });
    }
})();
