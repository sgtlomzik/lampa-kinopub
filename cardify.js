(function () {
    'use strict';

    var DEBUG = true; // Включаем отладку
    
    function log() {
        if (DEBUG) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[Cardify]');
            console.log.apply(console, args);
        }
    }

    // Список рабочих Invidious инстансов (проверены на март 2024)
    var PROXY_INSTANCES = [
        'https://inv.nadeko.net',
        'https://invidious.nerdvpn.de',
        'https://invidious.privacyredirect.com',
        'https://iv.nboez.com',
        'https://invidious.protokolla.fi'
    ];

    // Простая машина состояний
    function State(object) {
        this.state = object.state;

        this.start = function () {
            this.dispath(this.state);
        };

        this.dispath = function (action_name) {
            var action = object.transitions[action_name];
            if (action) {
                action.call(this, this);
            }
        };
    }

    // Класс Player для видео
    var Player = function(object, video) {
        var self = this;
        
        this.paused = false;
        this.display = false;
        this.ended = false;
        this.loaded = false;
        this.timer = null;
        this.listener = Lampa.Subscribe();
        this.videoUrl = null;
        this.currentInstanceIndex = 0;
        this.videoId = video.id;
        
        log('Player создан для видео:', video.id, video.title);
        
        this.html = $('\
            <div class="cardify-trailer">\
                <div class="cardify-trailer__player">\
                    <video class="cardify-trailer__video" playsinline></video>\
                    <div class="cardify-trailer__loading">\
                        <div class="cardify-trailer__spinner"></div>\
                        <div class="cardify-trailer__status">Загрузка трейлера...</div>\
                    </div>\
                </div>\
                <div class="cardify-trailer__controlls">\
                    <div class="cardify-trailer__title">' + (video.title || '') + '</div>\
                    <div class="cardify-trailer__remote">\
                        <div class="cardify-trailer__remote-icon">\
                            <svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg">\
                                <path d="M32.5196 7.22042L26.7992 12.9408C27.8463 14.5217 28.4561 16.4175 28.4561 18.4557C28.4561 20.857 27.6098 23.0605 26.1991 24.7844L31.8718 30.457C34.7226 27.2724 36.4561 23.0667 36.4561 18.4561C36.4561 14.2059 34.983 10.2998 32.5196 7.22042Z" fill="white" fill-opacity="0.28"/>\
                                <path d="M29.6917 32.5196L23.971 26.7989C22.3901 27.846 20.4943 28.4557 18.4561 28.4557C16.4179 28.4557 14.5221 27.846 12.9412 26.7989L7.22042 32.5196C10.2998 34.983 14.2059 36.4561 18.4561 36.4561C22.7062 36.4561 26.6123 34.983 29.6917 32.5196Z" fill="white" fill-opacity="0.28"/>\
                                <path d="M5.04033 30.4571L10.7131 24.7844C9.30243 23.0605 8.4561 20.857 8.4561 18.4557C8.4561 16.4175 9.06588 14.5217 10.113 12.9408L4.39251 7.22037C1.9291 10.2998 0.456055 14.2059 0.456055 18.4561C0.456054 23.0667 2.18955 27.2724 5.04033 30.4571Z" fill="white" fill-opacity="0.28"/>\
                                <path d="M6.45507 5.04029C9.63973 2.18953 13.8455 0.456055 18.4561 0.456055C23.0667 0.456054 27.2724 2.18955 30.4571 5.04034L24.7847 10.7127C23.0609 9.30207 20.8573 8.45575 18.4561 8.45575C16.0549 8.45575 13.8513 9.30207 12.1275 10.7127L6.45507 5.04029Z" fill="white" fill-opacity="0.28"/>\
                                <circle cx="18.4565" cy="18.4561" r="7" fill="white"/>\
                            </svg>\
                        </div>\
                        <div class="cardify-trailer__remote-text">' + Lampa.Lang.translate('cardify_enable_sound') + '</div>\
                    </div>\
                </div>\
            </div>\
        ');

        this.videoElement = this.html.find('.cardify-trailer__video')[0];
        this.loadingElement = this.html.find('.cardify-trailer__loading');
        this.statusElement = this.html.find('.cardify-trailer__status');

        // Обновление статуса
        this.setStatus = function(text) {
            log('Статус:', text);
            this.statusElement.text(text);
        };

        // Получаем URL видео через Invidious API
        this.getVideoUrl = function(callback) {
            var instances = Lampa.Storage.get('cardify_proxy_instance', '') 
                ? [Lampa.Storage.get('cardify_proxy_instance', '')]
                : PROXY_INSTANCES;
            
            var tryNextInstance = function(index) {
                if (index >= instances.length) {
                    log('Все инстансы не работают');
                    callback(null);
                    return;
                }

                var instance = instances[index];
                var apiUrl = instance + '/api/v1/videos/' + self.videoId;
                
                self.setStatus('Пробуем: ' + instance.replace('https://', ''));
                log('Запрос к:', apiUrl);

                $.ajax({
                    url: apiUrl,
                    timeout: 15000,
                    dataType: 'json',
                    success: function(data) {
                        log('Ответ от', instance, data);
                        
                        var videoUrl = null;
                        
                        // Ищем прямую ссылку на видео
                        if (data.formatStreams && data.formatStreams.length) {
                            // Сортируем по качеству (720p, 360p и т.д.)
                            var streams = data.formatStreams.filter(function(s) {
                                return s.url;
                            }).sort(function(a, b) {
                                var qualA = parseInt(a.qualityLabel) || 0;
                                var qualB = parseInt(b.qualityLabel) || 0;
                                return qualB - qualA;
                            });
                            
                            if (streams.length) {
                                videoUrl = streams[0].url;
                                log('Найден formatStream:', streams[0].qualityLabel, videoUrl.substring(0, 100));
                            }
                        }
                        
                        // Альтернатива - adaptive formats
                        if (!videoUrl && data.adaptiveFormats) {
                            var videos = data.adaptiveFormats.filter(function(f) {
                                return f.url && f.type && f.type.indexOf('video/mp4') !== -1;
                            }).sort(function(a, b) {
                                return (b.bitrate || 0) - (a.bitrate || 0);
                            });
                            
                            if (videos.length) {
                                videoUrl = videos[0].url;
                                log('Найден adaptiveFormat:', videos[0].qualityLabel);
                            }
                        }

                        if (videoUrl) {
                            callback(videoUrl);
                        } else {
                            log('Нет подходящих стримов, пробуем следующий инстанс');
                            tryNextInstance(index + 1);
                        }
                    },
                    error: function(xhr, status, error) {
                        log('Ошибка', instance, ':', status, error);
                        tryNextInstance(index + 1);
                    }
                });
            };

            tryNextInstance(0);
        };

        // Альтернативный метод - использовать iframe с Invidious
        this.useIframe = function() {
            var instance = Lampa.Storage.get('cardify_proxy_instance', '') || PROXY_INSTANCES[0];
            var embedUrl = instance + '/embed/' + this.videoId + '?autoplay=1&mute=1';
            
            log('Используем iframe:', embedUrl);
            
            var iframe = $('<iframe class="cardify-trailer__iframe" src="' + embedUrl + '" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>');
            
            this.html.find('.cardify-trailer__player').empty().append(iframe);
            this.loadingElement.hide();
            
            this.loaded = true;
            this.listener.send('loaded');
            
            // Для iframe управление ограничено
            setTimeout(function() {
                self.listener.send('play');
            }, 2000);
        };

        // Инициализация видео
        this.initVideo = function() {
            self.setStatus('Поиск трейлера...');
            
            self.getVideoUrl(function(url) {
                if (url) {
                    log('Загружаем видео:', url.substring(0, 100));
                    self.setStatus('Загрузка видео...');
                    
                    self.videoUrl = url;
                    self.videoElement.src = url;
                    self.videoElement.muted = true;
                    self.videoElement.load();
                    
                    // Ждём загрузки метаданных
                    $(self.videoElement).one('loadedmetadata', function() {
                        log('Видео готово к воспроизведению');
                        self.loadingElement.hide();
                        self.loaded = true;
                        self.listener.send('loaded');
                    });
                    
                    $(self.videoElement).one('error', function(e) {
                        log('Ошибка загрузки видео, пробуем iframe');
                        self.useIframe();
                    });
                } else {
                    log('Прямая ссылка не найдена, используем iframe');
                    self.useIframe();
                }
            });
        };

        // События видео
        $(this.videoElement).on('play playing', function() {
            log('Видео играет');
            self.paused = false;
            clearInterval(self.timer);
            
            self.timer = setInterval(function() {
                if (!self.videoElement.duration) return;
                
                var left = self.videoElement.duration - self.videoElement.currentTime;
                var toend = 13;
                var fade = 5;

                if (left <= toend + fade) {
                    var vol = 1 - (toend + fade - left) / fade;
                    self.videoElement.volume = Math.max(0, vol);

                    if (left <= toend) {
                        clearInterval(self.timer);
                        self.listener.send('ended');
                    }
                }
            }, 100);

            self.listener.send('play');

            if (window.cardify_fist_unmute) self.unmute();
        });

        $(this.videoElement).on('pause', function() {
            self.paused = true;
            clearInterval(self.timer);
            self.listener.send('paused');
        });

        $(this.videoElement).on('ended', function() {
            self.listener.send('ended');
        });

        // Запускаем загрузку
        this.initVideo();

        this.play = function() {
            log('Запуск воспроизведения');
            try { 
                var playPromise = this.videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.then(function() {
                        log('Воспроизведение начато');
                    }).catch(function(e) {
                        log('Autoplay заблокирован:', e.message);
                    });
                }
            } catch (e) {
                log('Ошибка play():', e);
            }
        };

        this.pause = function() {
            try { this.videoElement.pause(); } catch (e) {}
        };

        this.unmute = function() {
            try {
                this.videoElement.muted = false;
                this.videoElement.volume = 1;
                this.html.find('.cardify-trailer__remote').remove();
                window.cardify_fist_unmute = true;
            } catch (e) {}
        };

        this.show = function() {
            log('Показываем трейлер');
            this.html.addClass('display');
            this.display = true;
        };

        this.hide = function() {
            log('Скрываем трейлер');
            this.html.removeClass('display');
            this.display = false;
        };

        this.render = function() {
            return this.html;
        };

        this.destroy = function() {
            log('Уничтожаем плеер');
            this.loaded = false;
            this.display = false;
            try { 
                this.videoElement.pause();
                this.videoElement.src = '';
                this.videoElement.load();
            } catch (e) {}
            clearInterval(this.timer);
            this.html.remove();
        };
    };

    // Класс Trailer
    var Trailer = function(object, video) {
        var self = this;
        
        log('Trailer создан:', video);
        
        object.activity.trailer_ready = true;
        
        this.object = object;
        this.video = video;
        this.player = null;
        this.background = this.object.activity.render().find('.full-start__background');
        this.startblock = this.object.activity.render().find('.cardify, .full-start-new, .full-start');
        this.head = $('.head');
        this.timelauch = 1200;
        this.firstlauch = false;
        this.timer_load = null;
        this.timer_show = null;
        this.timer_anim = null;

        this.state = new State({
            state: 'start',
            transitions: {
                start: function(state) {
                    log('State: start, loaded:', self.player.loaded, 'display:', self.player.display);
                    clearTimeout(self.timer_load);
                    if (self.player.display) {
                        state.dispath('play');
                    } else if (self.player.loaded) {
                        self.animate();
                        self.timer_load = setTimeout(function() {
                            state.dispath('load');
                        }, self.timelauch);
                    }
                },
                load: function(state) {
                    log('State: load');
                    if (self.player.loaded && Lampa.Controller.enabled().name == 'full_start' && self.same()) {
                        state.dispath('play');
                    }
                },
                play: function() {
                    log('State: play');
                    self.player.play();
                },
                toggle: function(state) {
                    clearTimeout(self.timer_load);

                    if (Lampa.Controller.enabled().name == 'cardify_trailer') {
                        // do nothing
                    } else if (Lampa.Controller.enabled().name == 'full_start' && self.same()) {
                        state.start();
                    } else if (self.player.display) {
                        state.dispath('hide');
                    }
                },
                hide: function() {
                    log('State: hide');
                    self.player.pause();
                    self.player.hide();
                    self.background.removeClass('nodisplay');
                    self.startblock.removeClass('nodisplay');
                    self.head.removeClass('nodisplay');
                    self.object.activity.render().find('.cardify-preview__loader').width(0);
                }
            }
        });

        this.same = function() {
            return Lampa.Activity.active().activity === this.object.activity;
        };

        this.animate = function() {
            var loader = this.object.activity.render().find('.cardify-preview__loader').width(0);
            var started = Date.now();
            
            clearInterval(this.timer_anim);
            this.timer_anim = setInterval(function() {
                var left = Date.now() - started;
                if (left > self.timelauch) clearInterval(self.timer_anim);
                loader.width(Math.round(left / self.timelauch * 100) + '%');
            }, 100);
        };

        this.preview = function() {
            log('Создаём превью');
            var preview = $('\
                <div class="cardify-preview">\
                    <div>\
                        <img class="cardify-preview__img" />\
                        <div class="cardify-preview__line one"></div>\
                        <div class="cardify-preview__line two"></div>\
                        <div class="cardify-preview__loader"></div>\
                    </div>\
                </div>\
            ');

            var imgUrl = 'https://img.youtube.com/vi/' + this.video.id + '/mqdefault.jpg';
            
            $('img', preview).attr('src', imgUrl).addClass('loaded');

            // Ищем место для превью
            var rightBlock = this.object.activity.render().find('.cardify__right, .full-start-new__rate-line');
            if (rightBlock.length) {
                rightBlock.first().append(preview);
            } else {
                this.object.activity.render().find('.full-start-new__buttons, .full-start__buttons').after(preview);
            }
        };

        this.controll = function() {
            var out = function() {
                self.state.dispath('hide');
                Lampa.Controller.toggle('full_start');
            };

            Lampa.Controller.add('cardify_trailer', {
                toggle: function() {
                    Lampa.Controller.clear();
                },
                enter: function() {
                    self.player.unmute();
                },
                left: out,
                up: out,
                down: out,
                right: out,
                back: function() {
                    self.player.destroy();
                    self.object.activity.render().find('.cardify-preview').remove();
                    out();
                }
            });

            Lampa.Controller.toggle('cardify_trailer');
        };

        this.start = function() {
            log('Trailer.start()');
            
            // Events
            var toggle = function(e) {
                self.state.dispath('toggle');
            };

            var destroy = function(e) {
                if (e.type == 'destroy' && e.object.activity === self.object.activity) {
                    remove();
                }
            };

            var remove = function() {
                Lampa.Listener.remove('activity', destroy);
                Lampa.Controller.listener.remove('toggle', toggle);
                self.destroy();
            };

            Lampa.Listener.follow('activity', destroy);
            Lampa.Controller.listener.follow('toggle', toggle);

            // Player
            this.player = new Player(this.object, this.video);

            this.player.listener.follow('loaded', function() {
                log('Player loaded event');
                self.preview();
                self.state.start();
            });

            this.player.listener.follow('play', function() {
                log('Player play event');
                clearTimeout(self.timer_show);

                if (!self.firstlauch) {
                    self.firstlauch = true;
                    self.timelauch = 5000;
                }

                self.timer_show = setTimeout(function() {
                    self.player.show();
                    self.background.addClass('nodisplay');
                    self.startblock.addClass('nodisplay');
                    self.head.addClass('nodisplay');
                    self.controll();
                }, 500);
            });

            this.player.listener.follow('ended,error', function() {
                log('Player ended/error event');
                self.state.dispath('hide');

                if (Lampa.Controller.enabled().name !== 'full_start') {
                    Lampa.Controller.toggle('full_start');
                }

                self.object.activity.render().find('.cardify-preview').remove();
                setTimeout(remove, 300);
            });

            this.object.activity.render().find('.activity__body').prepend(this.player.render());

            // Start
            this.state.start();
        };

        this.destroy = function() {
            clearTimeout(this.timer_load);
            clearTimeout(this.timer_show);
            clearInterval(this.timer_anim);
            if (this.player) this.player.destroy();
        };

        // Автозапуск
        this.start();
    };

    function startPlugin() {
        log('Запуск плагина Cardify Free');
        log('Lampa.Manifest:', Lampa.Manifest);
        
        // Добавляем переводы
        Lampa.Lang.add({
            cardify_enable_sound: {
                ru: 'Включить звук',
                en: 'Enable sound',
                uk: 'Увімкнути звук'
            },
            cardify_enable_trailer: {
                ru: 'Показывать трейлер',
                en: 'Show trailer',
                uk: 'Показувати трейлер'
            },
            cardify_proxy_instance: {
                ru: 'Прокси-сервер',
                en: 'Proxy server',
                uk: 'Проксі-сервер'
            }
        });

        // CSS стили
        var style = '\
            <style>\
            .cardify .full-start-new__title{font-size:4.5em !important;line-height:1.1 !important}\
            .cardify .full-start-new__title img,.cardify .full-start-new__head img,.cardify img.full--logo{max-height:12em !important;max-width:80% !important;height:auto !important;width:auto !important;object-fit:contain !important}\
            .cardify-trailer{opacity:0;transition:opacity .3s;position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#000}\
            .cardify-trailer.display{opacity:1}\
            .cardify-trailer__player{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center}\
            .cardify-trailer__video,.cardify-trailer__iframe{width:100%;height:100%;object-fit:contain;background:#000;border:0}\
            .cardify-trailer__loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#fff}\
            .cardify-trailer__spinner{width:50px;height:50px;border:4px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:cardify-spin 1s linear infinite;margin:0 auto 1em}\
            .cardify-trailer__status{font-size:1.2em;opacity:0.7}\
            @keyframes cardify-spin{to{transform:rotate(360deg)}}\
            .cardify-trailer__controlls{position:fixed;left:1.5em;right:1.5em;bottom:1.5em;display:flex;align-items:flex-end;transform:translateY(100%);opacity:0;transition:all .3s}\
            .cardify-trailer.display .cardify-trailer__controlls{transform:translateY(0);opacity:1}\
            .cardify-trailer__title{flex-grow:1;padding-right:2em;font-size:2.5em;font-weight:600;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,0.5)}\
            .cardify-trailer__remote{display:flex;align-items:center;color:#fff}\
            .cardify-trailer__remote-icon{width:2.5em;height:2.5em}\
            .cardify-trailer__remote-icon svg{width:100%;height:100%}\
            .cardify-trailer__remote-text{margin-left:1em;font-size:1.2em}\
            .cardify-preview{position:relative;border-radius:.3em;width:8em;height:5em;background:#000;overflow:hidden;margin-left:1em}\
            .cardify-preview>div{position:relative;width:100%;height:100%}\
            .cardify-preview__img{width:100%;height:100%;object-fit:cover}\
            .cardify-preview__loader{position:absolute;left:0;bottom:0;height:3px;background:#fff;width:0;transition:width .1s linear}\
            .cardify-preview__line{display:none}\
            .cardify__background.nodisplay,.cardify.nodisplay,.full-start-new.nodisplay,.full-start.nodisplay{opacity:0!important;pointer-events:none}\
            .head.nodisplay{transform:translateY(-100%)}\
            </style>\
        ';
        
        $('head').append(style);

        // Иконка настроек
        var icon = '<svg width="36" height="28" viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="1.5" width="33" height="25" rx="3.5" stroke="white" stroke-width="3"/><rect x="5" y="14" width="17" height="4" rx="2" fill="white"/><rect x="5" y="20" width="10" height="3" rx="1.5" fill="white"/><rect x="25" y="20" width="6" height="3" rx="1.5" fill="white"/></svg>';

        Lampa.SettingsApi.addComponent({
            component: 'cardify',
            icon: icon,
            name: 'Cardify Free'
        });

        Lampa.SettingsApi.addParam({
            component: 'cardify',
            param: {
                name: 'cardify_run_trailers',
                type: 'trigger',
                default: true  // ВКЛЮЧЕНО ПО УМОЛЧАНИЮ для теста
            },
            field: {
                name: Lampa.Lang.translate('cardify_enable_trailer')
            }
        });

        // Настройка прокси
        var proxyValues = {};
        PROXY_INSTANCES.forEach(function(url) {
            proxyValues[url] = url.replace('https://', '');
        });

        Lampa.SettingsApi.addParam({
            component: 'cardify',
            param: {
                name: 'cardify_proxy_instance',
                type: 'select',
                values: proxyValues,
                default: PROXY_INSTANCES[0]
            },
            field: {
                name: Lampa.Lang.translate('cardify_proxy_instance')
            }
        });

        // Функция получения видео трейлера
        function getVideo(data) {
            log('getVideo, videos:', data.videos);
            
            if (data.videos && data.videos.results && data.videos.results.length) {
                var items = [];
                
                data.videos.results.forEach(function(element) {
                    if (element.site === 'YouTube') {  // Только YouTube
                        items.push({
                            title: element.name || '',
                            id: element.key,
                            code: element.iso_639_1,
                            time: new Date(element.published_at).getTime()
                        });
                    }
                });

                log('YouTube трейлеры:', items.length);

                if (!items.length) return null;

                items.sort(function(a, b) {
                    return b.time - a.time;
                });

                // Предпочитаем язык пользователя
                var userLang = Lampa.Storage.field('tmdb_lang') || 'ru';
                
                var myLang = items.filter(function(n) {
                    return n.code == userLang;
                });

                var enLang = items.filter(function(n) {
                    return n.code == 'en';
                });

                if (myLang.length) {
                    log('Найден трейлер на языке:', userLang);
                    return myLang[0];
                }
                
                if (enLang.length) {
                    log('Найден трейлер на английском');
                    return enLang[0];
                }

                log('Используем первый доступный трейлер');
                return items[0];
            }
            
            log('Трейлеры не найдены');
            return null;
        }

        // Слушаем событие загрузки карточки фильма
        Lampa.Listener.follow('full', function(e) {
            log('Event full:', e.type);
            
            if (e.type == 'complite') {
                log('Full complite, data:', e.data ? e.data.title || e.data.name : 'no data');
                
                // Добавляем класс для фона
                e.object.activity.render().find('.full-start__background').addClass('cardify__background');

                // Проверяем настройку
                var enabled = Lampa.Storage.field('cardify_run_trailers');
                log('Трейлеры включены:', enabled);
                
                if (!enabled) return;

                var trailer = getVideo(e.data);
                log('Выбранный трейлер:', trailer);

                if (trailer) {
                    // Проверяем версию Lampa
                    var version = Lampa.Manifest ? Lampa.Manifest.app_digital : 0;
                    log('Версия Lampa:', version);

                    if (version >= 220 || !version) {
                        if (Lampa.Activity.active().activity === e.object.activity) {
                            log('Создаём Trailer сразу');
                            new Trailer(e.object, trailer);
                        } else {
                            log('Ждём активации activity');
                            var follow = function(a) {
                                if (a.type == 'start' && a.object.activity === e.object.activity && !e.object.activity.trailer_ready) {
                                    Lampa.Listener.remove('activity', follow);
                                    log('Activity активирована, создаём Trailer');
                                    new Trailer(e.object, trailer);
                                }
                            };
                            Lampa.Listener.follow('activity', follow);
                        }
                    }
                }
            }
        });

        log('Плагин Cardify Free инициализирован');
    }

    // Запуск плагина
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type == 'ready') startPlugin();
        });
    }

})();
