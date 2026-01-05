(function () {
    'use strict';

    var Cardify = {
        name: 'cardify',
        version: '1.0.0',
        debug: false,

        // Настройки по умолчанию
        defaults: {
            show_kinopoisk: true,
            show_imdb: true,
            show_age_rating: true,
            show_country: true,
            show_budget: true,
            show_premiere: true,
            card_style: 'default', // default, compact, extended
            rating_colors: true
        },

        log: function(msg, data) {
            if (this.debug) {
                console.log('[Cardify]', msg, data || '');
            }
        },

        // Инициализация плагина
        init: function() {
            var _this = this;
            this.log('Инициализация плагина v' + this.version);

            // Добавляем настройки
            this.addSettings();

            // Добавляем стили
            this.addStyles();

            // Подписываемся на события
            this.bindEvents();

            // Добавляем компонент в меню настроек
            Lampa.SettingsApi.addComponent({
                component: 'cardify',
                name: 'Cardify',
                icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 3H5C3.89 3 3 3.89 3 5V19C3 20.11 3.89 21 5 21H19C20.11 21 21 20.11 21 19V5C21 3.89 20.11 3 19 3ZM19 19H5V5H19V19ZM17 12H7V14H17V12ZM17 8H7V10H17V8ZM14 16H7V18H14V16Z" fill="currentColor"/></svg>'
            });
        },

        // Добавление настроек
        addSettings: function() {
            var _this = this;

            Lampa.SettingsApi.addParam({
                component: 'cardify',
                param: {
                    name: 'cardify_enabled',
                    type: 'trigger',
                    default: true
                },
                field: {
                    name: 'Включить Cardify',
                    description: 'Расширенная информация на карточке'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'cardify',
                param: {
                    name: 'cardify_kinopoisk',
                    type: 'trigger',
                    default: true
                },
                field: {
                    name: 'Рейтинг Кинопоиска',
                    description: 'Показывать рейтинг КП'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'cardify',
                param: {
                    name: 'cardify_imdb',
                    type: 'trigger',
                    default: true
                },
                field: {
                    name: 'Рейтинг IMDb',
                    description: 'Показывать рейтинг IMDb'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'cardify',
                param: {
                    name: 'cardify_country',
                    type: 'trigger',
                    default: true
                },
                field: {
                    name: 'Страна',
                    description: 'Показывать страну производства'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'cardify',
                param: {
                    name: 'cardify_budget',
                    type: 'trigger',
                    default: false
                },
                field: {
                    name: 'Бюджет',
                    description: 'Показывать бюджет фильма'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'cardify',
                param: {
                    name: 'cardify_colors',
                    type: 'trigger',
                    default: true
                },
                field: {
                    name: 'Цветные рейтинги',
                    description: 'Подсветка рейтингов цветом'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'cardify',
                param: {
                    name: 'cardify_style',
                    type: 'select',
                    values: {
                        'default': 'Стандартный',
                        'compact': 'Компактный',
                        'extended': 'Расширенный'
                    },
                    default: 'default'
                },
                field: {
                    name: 'Стиль карточки',
                    description: 'Внешний вид карточки'
                }
            });
        },

        // Добавление CSS стилей
        addStyles: function() {
            var css = `
                .cardify-info {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5em;
                    margin-top: 0.8em;
                }
                
                .cardify-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 0.2em 0.6em;
                    border-radius: 0.3em;
                    font-size: 0.85em;
                    font-weight: 500;
                    background: rgba(255,255,255,0.1);
                }
                
                .cardify-badge svg {
                    width: 1em;
                    height: 1em;
                    margin-right: 0.4em;
                }
                
                .cardify-rating {
                    font-weight: 700;
                }
                
                .cardify-rating--high {
                    background: rgba(76, 175, 80, 0.3);
                    color: #81c784;
                }
                
                .cardify-rating--medium {
                    background: rgba(255, 193, 7, 0.3);
                    color: #ffd54f;
                }
                
                .cardify-rating--low {
                    background: rgba(244, 67, 54, 0.3);
                    color: #e57373;
                }
                
                .cardify-kp {
                    color: #ff6600;
                }
                
                .cardify-imdb {
                    color: #f5c518;
                }
                
                .cardify-country {
                    color: #90caf9;
                }
                
                .cardify-budget {
                    color: #a5d6a7;
                }
                
                /* Компактный стиль */
                .cardify-compact .cardify-badge {
                    padding: 0.15em 0.4em;
                    font-size: 0.75em;
                }
                
                /* Расширенный стиль */
                .cardify-extended .cardify-info {
                    flex-direction: column;
                    gap: 0.3em;
                }
                
                .cardify-extended .cardify-badge {
                    justify-content: flex-start;
                }

                /* Анимация появления */
                .cardify-info {
                    animation: cardifyFadeIn 0.3s ease-out;
                }
                
                @keyframes cardifyFadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Адаптация для full страницы */
                .full-start-new__details .cardify-info {
                    margin-top: 1em;
                }
            `;

            var style = document.createElement('style');
            style.id = 'cardify-styles';
            style.textContent = css;
            document.head.appendChild(style);
        },

        // Подписка на события Lampa
        bindEvents: function() {
            var _this = this;

            // Событие открытия карточки фильма
            Lampa.Listener.follow('full', function(e) {
                if (e.type === 'complite') {
                    _this.log('Карточка открыта', e);
                    setTimeout(function() {
                        _this.modifyCard(e);
                    }, 100);
                }
            });

            // Событие получения данных о фильме
            Lampa.Listener.follow('activity', function(e) {
                if (e.type === 'archive' && e.object && e.object.source === 'full') {
                    _this.log('Activity archive', e);
                }
            });
        },

        // Проверка настроек
        isEnabled: function(param) {
            return Lampa.Storage.field('cardify_' + param) !== false;
        },

        // Получение стиля
        getStyle: function() {
            return Lampa.Storage.get('cardify_style', 'default');
        },

        // Модификация карточки
        modifyCard: function(event) {
            var _this = this;
            
            if (!this.isEnabled('enabled')) {
                this.log('Плагин отключен');
                return;
            }

            var card = event.object;
            if (!card || !card.card) {
                this.log('Нет данных карточки');
                return;
            }

            var movie = card.card;
            var element = event.object.activity.render();
            
            this.log('Данные фильма:', movie);

            // Находим место для вставки информации
            var target = element.find('.full-start-new__details');
            if (!target.length) {
                target = element.find('.full-start__details');
            }
            if (!target.length) {
                target = element.find('.full-descr');
            }

            if (!target.length) {
                this.log('Не найден целевой элемент');
                return;
            }

            // Удаляем старую информацию если есть
            target.find('.cardify-info').remove();

            // Создаем контейнер
            var container = $('<div class="cardify-info"></div>');
            
            // Применяем стиль
            var style = this.getStyle();
            if (style !== 'default') {
                container.addClass('cardify-' + style);
            }

            // Собираем дополнительную информацию
            this.fetchAdditionalInfo(movie, function(info) {
                _this.renderInfo(container, movie, info);
                target.append(container);
            });
        },

        // Получение дополнительной информации
        fetchAdditionalInfo: function(movie, callback) {
            var _this = this;
            var info = {
                kp_rating: null,
                imdb_rating: null,
                country: null,
                budget: null
            };

            // Пробуем получить данные из самого объекта
            if (movie.vote_average) {
                info.imdb_rating = movie.vote_average;
            }

            if (movie.production_countries && movie.production_countries.length) {
                info.country = movie.production_countries.map(function(c) {
                    return c.name || c.iso_3166_1;
                }).join(', ');
            }

            if (movie.budget) {
                info.budget = movie.budget;
            }

            // Пробуем получить рейтинг КП через TMDB external IDs
            var tmdb_id = movie.id;
            var media_type = movie.name ? 'tv' : 'movie';

            // Используем API Lampa для получения доп. информации
            if (tmdb_id) {
                this.getExternalIds(tmdb_id, media_type, function(external) {
                    if (external) {
                        if (external.imdb_id) {
                            _this.getKinopoiskRating(external.imdb_id, function(kp) {
                                info.kp_rating = kp;
                                callback(info);
                            });
                        } else {
                            callback(info);
                        }
                    } else {
                        callback(info);
                    }
                });
            } else {
                callback(info);
            }
        },

        // Получение внешних ID
        getExternalIds: function(tmdb_id, media_type, callback) {
            var url = Lampa.TMDB.api(media_type + '/' + tmdb_id + '/external_ids');
            
            Lampa.Utils.request(url, function(data) {
                callback(data);
            }, function() {
                callback(null);
            });
        },

        // Получение рейтинга Кинопоиска (через прокси или напрямую)
        getKinopoiskRating: function(imdb_id, callback) {
            var _this = this;
            
            // Способ 1: Через неофициальный API
            var url = 'https://kinopoisk.dev/api/v2.2/films?imdbId=' + imdb_id;
            
            // Способ 2: Через TMDB find
            var tmdb_url = Lampa.TMDB.api('find/' + imdb_id + '?external_source=imdb_id');
            
            // Пробуем получить через сохраненные данные в Lampa
            try {
                var network = new Lampa.Reguest();
                network.timeout(5000);
                
                // Используем прокси или альтернативный источник
                network.silent('https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=' + imdb_id, function(data) {
                    if (data && data.films && data.films.length) {
                        callback(data.films[0].rating);
                    } else {
                        callback(null);
                    }
                }, function() {
                    callback(null);
                });
            } catch(e) {
                _this.log('Ошибка получения рейтинга КП', e);
                callback(null);
            }
        },

        // Рендеринг информации
        renderInfo: function(container, movie, info) {
            var useColors = this.isEnabled('colors');

            // Рейтинг Кинопоиска
            if (this.isEnabled('kinopoisk') && (info.kp_rating || movie.kp_rating)) {
                var kp = info.kp_rating || movie.kp_rating;
                if (kp) {
                    container.append(this.createRatingBadge('КП', kp, 'kp', useColors));
                }
            }

            // Рейтинг IMDb
            if (this.isEnabled('imdb') && (info.imdb_rating || movie.vote_average)) {
                var imdb = info.imdb_rating || movie.vote_average;
                if (imdb) {
                    container.append(this.createRatingBadge('IMDb', parseFloat(imdb).toFixed(1), 'imdb', useColors));
                }
            }

            // Страна
            if (this.isEnabled('country')) {
                var country = info.country || this.getCountryFromMovie(movie);
                if (country) {
                    container.append(this.createBadge(this.icons.globe, country, 'country'));
                }
            }

            // Бюджет
            if (this.isEnabled('budget') && (info.budget || movie.budget)) {
                var budget = info.budget || movie.budget;
                if (budget && budget > 0) {
                    container.append(this.createBadge(this.icons.money, this.formatBudget(budget), 'budget'));
                }
            }
        },

        // Получение страны из объекта фильма
        getCountryFromMovie: function(movie) {
            if (movie.production_countries && movie.production_countries.length) {
                return movie.production_countries.map(function(c) {
                    return c.name || c.iso_3166_1;
                }).slice(0, 2).join(', ');
            }
            if (movie.origin_country && movie.origin_country.length) {
                return movie.origin_country.slice(0, 2).join(', ');
            }
            return null;
        },

        // Форматирование бюджета
        formatBudget: function(budget) {
            if (budget >= 1000000000) {
                return '$' + (budget / 1000000000).toFixed(1) + 'B';
            }
            if (budget >= 1000000) {
                return '$' + (budget / 1000000).toFixed(0) + 'M';
            }
            return '$' + budget.toLocaleString();
        },

        // Создание бейджа рейтинга
        createRatingBadge: function(label, rating, type, useColors) {
            var ratingNum = parseFloat(rating);
            var colorClass = '';
            
            if (useColors) {
                if (ratingNum >= 7) {
                    colorClass = 'cardify-rating--high';
                } else if (ratingNum >= 5) {
                    colorClass = 'cardify-rating--medium';
                } else {
                    colorClass = 'cardify-rating--low';
                }
            }

            var icon = type === 'kp' ? this.icons.kp : this.icons.imdb;
            
            return $('<span class="cardify-badge cardify-rating cardify-' + type + ' ' + colorClass + '">' +
                icon +
                '<span>' + label + ': ' + rating + '</span>' +
            '</span>');
        },

        // Создание обычного бейджа
        createBadge: function(icon, text, type) {
            return $('<span class="cardify-badge cardify-' + type + '">' +
                icon +
                '<span>' + text + '</span>' +
            '</span>');
        },

        // Иконки
        icons: {
            kp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
            imdb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>',
            globe: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
            money: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>'
        }
    };

    // Запуск плагина
    function startPlugin() {
        window.cardify_plugin = Cardify;
        Cardify.init();
    }

    // Ожидание готовности приложения
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                startPlugin();
            }
        });
    }

})();
