(function () {
    'use strict';

    var DEBUG = true;
    
    function log() {
        if (DEBUG) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[Cardify]');
            console.log.apply(console, args);
        }
    }

    // Рабочие Invidious API с CORS
    var INVIDIOUS_INSTANCES = [
        'https://iv.ggtyler.dev',
        'https://invidious.nerdvpn.de', 
        'https://yt.artemislena.eu',
        'https://invidious.privacyredirect.com',
        'https://invidious.protokolla.fi',
        'https://inv.nadeko.net'
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

    // Класс Player
    var Player = function(object, video) {
        var self = this;
        
        this.paused = false;
        this.display = false;
        this.loaded = false;
        this.timer = null;
        this.listener = Lampa.Subscribe();
        this.videoId = video.id;
        this.videoTitle = video.title;
        
        log('Player создан для видео:', video.id);
        
        this.html = $('\
            <div class="cardify-trailer">\
                <div class="cardify-trailer__player">\
                    <video class="cardify-trailer__video" playsinline muted></video>\
                    <div class="cardify-trailer__loading">\
                        <div class="cardify-trailer__spinner"></div>\
                        <div class="cardify-trailer__status">Загрузка...</div>\
                    </div>\
                </div>\
                <div class="cardify-trailer__controlls">\
                    <div class="cardify-trailer__title">' + (video.title || '') + '</div>\
                    <div class="cardify-trailer__remote">\
                        <div class="cardify-trailer__remote-icon">\
                            <svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg">\
                                <path d="M32.52 7.22L26.8 12.94C27.85 14.52 28.46 16.42 28.46 18.46C28.46 20.86 27.61 23.06 26.2 24.78L31.87 30.46C34.72 27.27 36.46 23.07 36.46 18.46C36.46 14.21 34.98 10.3 32.52 7.22Z" fill="white" fill-opacity="0.28"/>\
                                <circle cx="18.46" cy="18.46" r="7" fill="white"/>\
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

        this.setStatus = function(text) {
            this.statusElement.text(text);
        };

        // Пробуем получить видео через Invidious API
        this.tryGetVideo = function(instances, index, callback) {
            if (index >= instances.length) {
                log('Все инстансы недоступны');
                callback(null);
                return;
            }

            var instance = instances[index];
            var apiUrl = instance + '/api/v1/videos/' + self.videoId + '?fields=formatStreams,adaptiveFormats';
            
            self.setStatus('Пробуем ' + (index + 1) + '/' + instances.length + '...');
            log('Запрос:', apiUrl);

            $.ajax({
                url: apiUrl,
                timeout: 10000,
                dataType: 'json',
                success: function(data) {
                    log('Ответ от', instance);
                    
                    var videoUrl = null;
                    
                    // Сначала ищем в formatStreams (со звуком)
                    if (data.formatStreams && data.formatStreams.length) {
                        var streams = data.formatStreams.sort(function(a, b) {
                            var qA = parseInt(a.qualityLabel) || 0;
                            var qB = parseInt(b.qualityLabel) || 0;
                            return qB - qA;
                        });
                        
                        // Берём 720p или ниже для скорости
                        for (var i = 0; i < streams.length; i++) {
                            var q = parseInt(streams[i].qualityLabel) || 0;
                            if (q <= 720 && streams[i].url) {
                                videoUrl = streams[i].url;
                                log('Выбран formatStream:', streams[i].qualityLabel);
                                break;
                            }
                        }
                        
                        if (!videoUrl && streams[0].url) {
                            videoUrl = streams[0].url;
                        }
                    }
                    
                    if (videoUrl) {
                        callback(videoUrl);
                    } else {
                        log('Нет видео в ответе, пробуем следующий');
                        self.tryGetVideo(instances, index + 1, callback);
                    }
                },
                error: function(xhr, status, error) {
                    log('Ошибка', instance, status, error);
                    self.tryGetVideo(instances, index + 1, callback);
                }
            });
        };

        // Инициализация
        this.initVideo = function() {
            self.setStatus('Поиск трейлера...');
            
            self.tryGetVideo(INVIDIOUS_INSTANCES, 0, function(url) {
                if (url) {
                    log('Загружаем видео');
                    self.setStatus('Загрузка видео...');
                    
                    self.videoElement.src = url;
                    self.videoElement.muted = true;
                    
                    $(self.videoElement).one('loadeddata canplay', function() {
                        log('Видео готово');
                        self.loadingElement.hide();
                        self.loaded = true;
                        self.listener.send('loaded');
                    });
                    
                    $(self.videoElement).one('error', function(e) {
                        log('Ошибка загрузки видео:', e);
                        self.listener.send('error');
                    });
                    
                    self.videoElement.load();
                } else {
                    log('Не удалось получить ссылку на видео');
                    self.listener.send('error');
                }
            });
        };

        // События видео
        $(this.videoElement).on('playing', function() {
            log('Видео играет');
            self.paused = false;
            
            clearInterval(self.timer);
            self.timer = setInterval(function() {
                if (!self.videoElement.duration) return;
                
                var left = self.videoElement.duration - self.videoElement.currentTime;
                
                // Fade out за 5 секунд до конца
                if (left <= 18) {
                    var vol = Math.max(0, (left - 13) / 5);
                    if (!self.videoElement.muted) {
                        self.videoElement.volume = vol;
                    }
                    
                    if (left <= 13) {
                        clearInterval(self.timer);
                        self.listener.send('ended');
                    }
                }
            }, 200);

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

        // Запуск
        this.initVideo();

        this.play = function() {
            log('play()');
            try { 
                var p = this.videoElement.play();
                if (p) p.catch(function(e) { log('Autoplay blocked:', e.message); });
            } catch (e) {}
        };

        this.pause = function() {
            try { this.videoElement.pause(); } catch (e) {}
        };

        this.unmute = function() {
            this.videoElement.muted = false;
            this.videoElement.volume = 1;
            this.html.find('.cardify-trailer__remote').remove();
            window.cardify_fist_unmute = true;
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
            this.loaded = false;
            this.display = false;
            clearInterval(this.timer);
            try { 
                this.videoElement.pause();
                this.videoElement.src = '';
            } catch (e) {}
            this.html.remove();
        };
    };

    // Класс Trailer
    var Trailer = function(object, video) {
        var self = this;
        
        log('Trailer создан');
        
        object.activity.trailer_ready = true;
        
        this.object = object;
        this.video = video;
        this.player = null;
        this.background = this.object.activity.render().find('.full-start__background');
        this.startblock = this.object.activity.render().find('.cardify');
        this.head = $('.head');
        this.timelauch = 1500;
        this.firstlauch = false;

        this.state = new State({
            state: 'start',
            transitions: {
                start: function(state) {
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
                    if (self.player.loaded && Lampa.Controller.enabled().name == 'full_start' && self.same()) {
                        state.dispath('play');
                    }
                },
                play: function() {
                    self.player.play();
                },
                toggle: function(state) {
                    clearTimeout(self.timer_load);
                    if (Lampa.Controller.enabled().name == 'cardify_trailer') {
                        // nothing
                    } else if (Lampa.Controller.enabled().name == 'full_start' && self.same()) {
                        state.start();
                    } else if (self.player.display) {
                        state.dispath('hide');
                    }
                },
                hide: function() {
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
                var elapsed = Date.now() - started;
                if (elapsed > self.timelauch) clearInterval(self.timer_anim);
                loader.width(Math.round(elapsed / self.timelauch * 100) + '%');
            }, 50);
        };

        this.preview = function() {
            var preview = $('\
                <div class="cardify-preview">\
                    <div>\
                        <img class="cardify-preview__img" src="https://img.youtube.com/vi/' + this.video.id + '/mqdefault.jpg" />\
                        <div class="cardify-preview__loader"></div>\
                    </div>\
                </div>\
            ');

            var target = this.object.activity.render().find('.cardify__right');
            if (target.length) {
                target.append(preview);
            }
        };

        this.controll = function() {
            var out = function() {
                self.state.dispath('hide');
                Lampa.Controller.toggle('full_start');
            };

            Lampa.Controller.add('cardify_trailer', {
                toggle: function() { Lampa.Controller.clear(); },
                enter: function() { self.player.unmute(); },
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
            var toggle = function() { self.state.dispath('toggle'); };

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

            this.player = new Player(this.object, this.video);

            this.player.listener.follow('loaded', function() {
                log('Player loaded');
                self.preview();
                self.state.start();
            });

            this.player.listener.follow('play', function() {
                log('Player play');
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
                log('Player ended/error');
                self.state.dispath('hide');

                if (Lampa.Controller.enabled().name !== 'full_start') {
                    Lampa.Controller.toggle('full_start');
                }

                self.object.activity.render().find('.cardify-preview').remove();
                setTimeout(remove, 300);
            });

            this.object.activity.render().find('.activity__body').prepend(this.player.render());
            this.state.start();
        };

        this.destroy = function() {
            clearTimeout(this.timer_load);
            clearTimeout(this.timer_show);
            clearInterval(this.timer_anim);
            if (this.player) this.player.destroy();
        };

        this.start();
    };

    function startPlugin() {
        log('Запуск плагина');

        // Переводы
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
            }
        });

        // ШАБЛОН КАРТОЧКИ (из оригинала)
        Lampa.Template.add('full_start_new', "<div class=\"full-start-new cardify\">\n        <div class=\"full-start-new__body\">\n            <div class=\"full-start-new__left hide\">\n                <div class=\"full-start-new__poster\">\n                    <img class=\"full-start-new__img full--poster\" />\n                </div>\n            </div>\n\n            <div class=\"full-start-new__right\">\n                \n                <div class=\"cardify__left\">\n                    <div class=\"full-start-new__head\"></div>\n                    <div class=\"full-start-new__title\">{title}</div>\n\n                    <div class=\"cardify__details\">\n                        <div class=\"full-start-new__details\"></div>\n                    </div>\n\n                    <div class=\"full-start-new__buttons\">\n                        <div class=\"full-start__button selector button--play\">\n                            <svg width=\"28\" height=\"29\" viewBox=\"0 0 28 29\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                                <circle cx=\"14\" cy=\"14.5\" r=\"13\" stroke=\"currentColor\" stroke-width=\"2.7\"/>\n                                <path d=\"M18.0739 13.634C18.7406 14.0189 18.7406 14.9811 18.0739 15.366L11.751 19.0166C11.0843 19.4015 10.251 18.9204 10.251 18.1506L10.251 10.8494C10.251 10.0796 11.0843 9.5985 11.751 9.9834L18.0739 13.634Z\" fill=\"currentColor\"/>\n                            </svg>\n\n                            <span>#{title_watch}</span>\n                        </div>\n\n                        <div class=\"full-start__button selector button--book\">\n                            <svg width=\"21\" height=\"32\" viewBox=\"0 0 21 32\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                            <path d=\"M2 1.5H19C19.2761 1.5 19.5 1.72386 19.5 2V27.9618C19.5 28.3756 19.0261 28.6103 18.697 28.3595L12.6212 23.7303C11.3682 22.7757 9.63183 22.7757 8.37885 23.7303L2.30302 28.3595C1.9739 28.6103 1.5 28.3756 1.5 27.9618V2C1.5 1.72386 1.72386 1.5 2 1.5Z\" stroke=\"currentColor\" stroke-width=\"2.5\"/>\n                            </svg>\n\n                            <span>#{settings_input_links}</span>\n                        </div>\n\n                        <div class=\"full-start__button selector button--reaction\">\n                            <svg width=\"38\" height=\"34\" viewBox=\"0 0 38 34\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                                <path d=\"M37.208 10.9742C37.1364 10.8013 37.0314 10.6441 36.899 10.5117C36.7666 10.3794 36.6095 10.2744 36.4365 10.2028L12.0658 0.108375C11.7166 -0.0361828 11.3242 -0.0361227 10.9749 0.108542C10.6257 0.253206 10.3482 0.530634 10.2034 0.879836L0.108666 25.2507C0.0369593 25.4236 3.37953e-05 25.609 2.3187e-08 25.7962C-3.37489e-05 25.9834 0.0368249 26.1688 0.108469 26.3418C0.180114 26.5147 0.28514 26.6719 0.417545 26.8042C0.54995 26.9366 0.707139 27.0416 0.880127 27.1131L17.2452 33.8917C17.5945 34.0361 17.9869 34.0361 18.3362 33.8917L29.6574 29.2017C29.8304 29.1301 29.9875 29.0251 30.1199 28.8928C30.2523 28.7604 30.3573 28.6032 30.4289 28.4303L37.2078 12.065C37.2795 11.8921 37.3164 11.7068 37.3164 11.5196C37.3165 11.3325 37.2796 11.1471 37.208 10.9742ZM20.425 29.9407L21.8784 26.4316L25.3873 27.885L20.425 29.9407ZM28.3407 26.0222L21.6524 23.252C21.3031 23.1075 20.9107 23.1076 20.5615 23.2523C20.2123 23.3969 19.9348 23.6743 19.79 24.0235L17.0194 30.7123L3.28783 25.0247L12.2918 3.28773L34.0286 12.2912L28.3407 26.0222Z\" fill=\"currentColor\"/>\n                                <path d=\"M25.3493 16.976L24.258 14.3423L16.959 17.3666L15.7196 14.375L13.0859 15.4659L15.4161 21.0916L25.3493 16.976Z\" fill=\"currentColor\"/>\n                            </svg>                \n\n                            <span>#{title_reactions}</span>\n                        </div>\n\n                        <div class=\"full-start__button selector button--subscribe hide\">\n                            <svg width=\"25\" height=\"30\" viewBox=\"0 0 25 30\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                            <path d=\"M6.01892 24C6.27423 27.3562 9.07836 30 12.5 30C15.9216 30 18.7257 27.3562 18.981 24H15.9645C15.7219 25.6961 14.2632 27 12.5 27C10.7367 27 9.27804 25.6961 9.03542 24H6.01892Z\" fill=\"currentColor\"/>\n                            <path d=\"M3.81972 14.5957V10.2679C3.81972 5.41336 7.7181 1.5 12.5 1.5C17.2819 1.5 21.1803 5.41336 21.1803 10.2679V14.5957C21.1803 15.8462 21.5399 17.0709 22.2168 18.1213L23.0727 19.4494C24.2077 21.2106 22.9392 23.5 20.9098 23.5H4.09021C2.06084 23.5 0.792282 21.2106 1.9273 19.4494L2.78317 18.1213C3.46012 17.0709 3.81972 15.8462 3.81972 14.5957Z\" stroke=\"currentColor\" stroke-width=\"2.5\"/>\n                            </svg>\n\n                            <span>#{title_subscribe}</span>\n                        </div>\n\n                        <div class=\"full-start__button selector button--options\">\n                            <svg width=\"38\" height=\"10\" viewBox=\"0 0 38 10\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                                <circle cx=\"4.88968\" cy=\"4.98563\" r=\"4.75394\" fill=\"currentColor\"/>\n                                <circle cx=\"18.9746\" cy=\"4.98563\" r=\"4.75394\" fill=\"currentColor\"/>\n                                <circle cx=\"33.0596\" cy=\"4.98563\" r=\"4.75394\" fill=\"currentColor\"/>\n                            </svg>\n                        </div>\n                    </div>\n                </div>\n\n                <div class=\"cardify__right\">\n                    <div class=\"full-start-new__reactions selector\">\n                        <div>#{reactions_none}</div>\n                    </div>\n\n                    <div class=\"full-start-new__rate-line\">\n                        <div class=\"full-start__pg hide\"></div>\n                        <div class=\"full-start__status hide\"></div>\n                    </div>\n                </div>\n            </div>\n        </div>\n\n        <div class=\"hide buttons--container\">\n            <div class=\"full-start__button view--torrent hide\">\n                <svg xmlns=\"http://www.w3.org/2000/svg\"  viewBox=\"0 0 50 50\" width=\"50px\" height=\"50px\">\n                    <path d=\"M25,2C12.317,2,2,12.317,2,25s10.317,23,23,23s23-10.317,23-23S37.683,2,25,2z M40.5,30.963c-3.1,0-4.9-2.4-4.9-2.4 S34.1,35,27,35c-1.4,0-3.6-0.837-3.6-0.837l4.17,9.643C26.727,43.92,25.874,44,25,44c-2.157,0-4.222-0.377-6.155-1.039L9.237,16.851 c0,0-0.7-1.2,0.4-1.5c1.1-0.3,5.4-1.2,5.4-1.2s1.475-0.494,1.8,0.5c0.5,1.3,4.063,11.112,4.063,11.112S22.6,29,27.4,29 c4.7,0,5.9-3.437,5.7-3.937c-1.2-3-4.993-11.862-4.993-11.862s-0.6-1.1,0.8-1.4c1.4-0.3,3.8-0.7,3.8-0.7s1.105-0.163,1.6,0.8 c0.738,1.437,5.193,11.262,5.193,11.262s1.1,2.9,3.3,2.9c0.464,0,0.834-0.046,1.152-0.104c-0.082,1.635-0.348,3.221-0.817,4.722 C42.541,30.867,41.756,30.963,40.5,30.963z\" fill=\"currentColor\"/>\n                </svg>\n\n                <span>#{full_torrents}</span>\n            </div>\n\n            <div class=\"full-start__button selector view--trailer\">\n                <svg height=\"70\" viewBox=\"0 0 80 70\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                    <path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M71.2555 2.08955C74.6975 3.2397 77.4083 6.62804 78.3283 10.9306C80 18.7291 80 35 80 35C80 35 80 51.2709 78.3283 59.0694C77.4083 63.372 74.6975 66.7603 71.2555 67.9104C65.0167 70 40 70 40 70C40 70 14.9833 70 8.74453 67.9104C5.3025 66.7603 2.59172 63.372 1.67172 59.0694C0 51.2709 0 35 0 35C0 35 0 18.7291 1.67172 10.9306C2.59172 6.62804 5.3025 3.2395 8.74453 2.08955C14.9833 0 40 0 40 0C40 0 65.0167 0 71.2555 2.08955ZM55.5909 35.0004L29.9773 49.5714V20.4286L55.5909 35.0004Z\" fill=\"currentColor\"></path>\n                </svg>\n\n                <span>#{full_trailers}</span>\n            </div>\n        </div>\n    </div>");

        // CSS СТИЛИ (из оригинала + увеличенный логотип)
        var style = $('<style>\
            .cardify{transition:all .3s}\
            .cardify .full-start-new__body{height:80vh}\
            .cardify .full-start-new__right{display:flex;align-items:flex-end}\
            .cardify .full-start-new__title{text-shadow:0 0 .1em rgba(0,0,0,0.3);font-size:4.5em !important;line-height:1.1 !important}\
            .cardify .full-start-new__title img,.cardify .full-start-new__head img,.cardify img.full--logo{max-height:12em !important;max-width:80% !important;height:auto !important;width:auto !important;object-fit:contain !important}\
            .cardify__left{flex-grow:1}\
            .cardify__right{display:flex;align-items:center;flex-shrink:0;position:relative}\
            .cardify__details{display:flex}\
            .cardify .full-start-new__reactions{margin:0;margin-right:-2.8em}\
            .cardify .full-start-new__reactions:not(.focus){margin:0}\
            .cardify .full-start-new__reactions:not(.focus)>div:not(:first-child){display:none}\
            .cardify .full-start-new__rate-line{margin:0;margin-left:3.5em}\
            .cardify__background{left:0}\
            .cardify__background.loaded:not(.dim){opacity:1}\
            .cardify__background.nodisplay{opacity:0 !important}\
            .cardify.nodisplay{transform:translate3d(0,50%,0);opacity:0}\
            .cardify-trailer{opacity:0;transition:opacity .3s;position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#000}\
            .cardify-trailer.display{opacity:1}\
            .cardify-trailer__player{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center}\
            .cardify-trailer__video{width:100%;height:100%;object-fit:contain;background:#000}\
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
            .cardify-preview__loader{position:absolute;left:0;bottom:0;height:4px;background:rgba(255,255,255,0.9);width:0;transition:width .05s linear}\
            .head.nodisplay{transform:translateY(-100%)}\
            body:not(.menu--open) .cardify__background{mask-image:linear-gradient(to bottom,white 50%,rgba(255,255,255,0) 100%)}\
        </style>');
        
        $('head').append(style);

        // Настройки
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
                default: true
            },
            field: {
                name: Lampa.Lang.translate('cardify_enable_trailer')
            }
        });

        // Получение трейлера
        function getVideo(data) {
            if (!data.videos || !data.videos.results) return null;
            
            var items = data.videos.results.filter(function(v) {
                return v.site === 'YouTube' && v.key;
            }).map(function(v) {
                return {
                    title: v.name || '',
                    id: v.key,
                    code: v.iso_639_1,
                    time: new Date(v.published_at).getTime()
                };
            });

            if (!items.length) return null;

            items.sort(function(a, b) { return b.time - a.time; });

            var lang = Lampa.Storage.field('tmdb_lang') || 'ru';
            var myLang = items.filter(function(v) { return v.code === lang; });
            var enLang = items.filter(function(v) { return v.code === 'en'; });

            return myLang[0] || enLang[0] || items[0];
        }

        // Слушаем событие
        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                log('Full complite');
                
                e.object.activity.render().find('.full-start__background').addClass('cardify__background');

                if (!Lampa.Storage.field('cardify_run_trailers')) return;

                var trailer = getVideo(e.data);
                log('Trailer:', trailer);

                if (!trailer) return;

                if (Lampa.Activity.active().activity === e.object.activity) {
                    new Trailer(e.object, trailer);
                } else {
                    var follow = function(a) {
                        if (a.type == 'start' && a.object.activity === e.object.activity && !e.object.activity.trailer_ready) {
                            Lampa.Listener.remove('activity', follow);
                            new Trailer(e.object, trailer);
                        }
                    };
                    Lampa.Listener.follow('activity', follow);
                }
            }
        });

        log('Плагин инициализирован');
    }

    // Запуск
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type == 'ready') startPlugin();
        });
    }

})();
