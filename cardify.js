(function () {
    'use strict';

    function cardify_details() {
        // Проверяем, загружен ли уже стиль
        if (window.cardify_details_loaded) return;
        window.cardify_details_loaded = true;

        // 1. Добавляем CSS для нового стиля
        var style = `
            /* Скрываем старый фон и настраиваем новый */
            .full-start__background {
                display: none;
            }
            .full-start.cardify-style {
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                position: relative;
            }
            .full-start.cardify-style::before {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: linear-gradient(to top, #000 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.4) 100%);
                z-index: 1;
            }
            
            /* Контент поверх фона */
            .full-start.cardify-style .full-start__body {
                position: relative;
                z-index: 2;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                height: 100%;
                padding-bottom: 3em;
            }

            /* Скрываем обычный постер слева, так как он теперь фон */
            .full-start.cardify-style .full-start__poster {
                display: none;
            }

            /* Настройки текста */
            .full-start.cardify-style .full-start__title {
                font-size: 3em;
                line-height: 1.1;
                margin-bottom: 0.3em;
                text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            }
            .full-start.cardify-style .full-start__original-title {
                opacity: 0.7;
                font-size: 1.2em;
            }
            .full-start.cardify-style .full-start__tagline {
                color: #fbc02d;
                font-style: italic;
                margin-bottom: 1em;
            }
            .full-start.cardify-style .description {
                max-width: 70%;
                font-size: 1.1em;
                line-height: 1.6;
                color: #ddd;
                margin-bottom: 2em;
                text-shadow: 0 1px 2px rgba(0,0,0,0.8);
            }

            /* Кнопки */
            .full-start.cardify-style .full-start__buttons {
                margin-top: 1em;
            }
        `;
        
        Lampa.Utils.addStyle(style);

        // 2. Перехватываем событие открытия полного описания
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var html = e.object.activity.render();
                
                // Добавляем наш класс
                html.addClass('cardify-style');

                // Устанавливаем фон из постера или бэкдропа
                var img = e.data.background_image || e.data.poster_path || e.data.img;
                if(img){
                    // Если путь не полный, добавляем базовый URL TMDB
                    if(img.indexOf('http') === -1) img = 'https://image.tmdb.org/t/p/original' + img;
                    html.css('background-image', 'url(' + img + ')');
                }
            }
        });
    }

    if (window.appready) cardify_details();
    else Lampa.Listener.follow('app', 'ready', cardify_details);

})();
