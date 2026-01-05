(function () {
    'use strict';

    function cardify_pro() {
        if (window.cardify_pro_loaded) return;
        window.cardify_pro_loaded = true;

        // 1. Агрессивные CSS стили
        var css = `
            /* --- Основа: скрываем стандартный фон и постер --- */
            .cardify-active .full-start__background { display: none !important; }
            .cardify-active .full-start__poster { display: none !important; }
            
            /* --- Настраиваем контейнер --- */
            .cardify-active.full-start {
                position: relative !important;
                background: #000 !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: flex-end !important; /* Прижимаем контент к низу */
            }

            /* --- Наш новый фон --- */
            .cardify-backdrop {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                z-index: 0;
                background-size: cover;
                background-position: center top;
                background-repeat: no-repeat;
                opacity: 1;
                transition: transform 10s ease; /* Эффект зума */
            }
            /* Градиент поверх фона, чтобы текст читался */
            .cardify-backdrop::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 20%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%);
            }

            /* --- Контент (Текст) --- */
            .cardify-active .full-start__body {
                position: relative !important;
                z-index: 5 !important;
                width: 100% !important;
                padding: 2em 3em 3em 3em !important; /* Отступы: верх, право, низ, лево */
                box-sizing: border-box !important;
                margin-top: 40vh !important; /* Отступаем сверху, чтобы было место для картинки */
            }

            /* Заголовок */
            .cardify-active .full-start__title {
                font-size: 3.5em !important;
                font-weight: 800 !important;
                text-shadow: 0 4px 8px rgba(0,0,0,0.8);
                margin-bottom: 0.2em !important;
                line-height: 1 !important;
            }

            /* Мета-информация (год, страны) */
            .cardify-active .full-start__original-title,
            .cardify-active .full-start__tagline {
                font-size: 1.2em !important;
                opacity: 0.9;
                text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            }

            /* Описание */
            .cardify-active .description {
                font-size: 1.1em !important;
                line-height: 1.5 !important;
                max-width: 65% !important; /* Ограничиваем ширину текста, как в оригинале */
                color: #e0e0e0 !important;
                margin-top: 1em !important;
                text-shadow: 0 2px 2px rgba(0,0,0,1);
            }

            /* Кнопки */
            .cardify-active .full-start__buttons {
                margin-top: 2em !important;
            }
            
            /* Скроллбар (если описание длинное) */
            .cardify-active .scroll__content {
                opacity: 1 !important;
            }
        `;

        Lampa.Utils.addStyle(css);

        // 2. Логика внедрения
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                // Получаем jQuery объект отрендеренной страницы
                var render = e.object.activity.render();
                
                // Ищем основной блок .full-start
                var full_start = render.find('.full-start');
                
                // Добавляем наш класс-активатор CSS
                full_start.addClass('cardify-active');

                // Получаем данные о фильме
                var data = e.data.movie || e.data;
                
                // Ищем самую качественную картинку (Backdrop)
                var img = data.backdrop_path || data.poster_path || data.img;
                var img_url = '';

                if (img) {
                    // Формируем ссылку на оригинал (максимальное качество)
                    if (img.indexOf('http') >= 0) {
                        img_url = img;
                    } else {
                        img_url = 'https://image.tmdb.org/t/p/original' + img;
                    }
                }

                // Удаляем старый фон Cardify, если он вдруг есть
                full_start.find('.cardify-backdrop').remove();

                // Вставляем наш фон В НАЧАЛО блока
                if (img_url) {
                    full_start.prepend('<div class="cardify-backdrop" style="background-image: url(' + img_url + ');"></div>');
                }
            }
        });
        
        console.log('Cardify Pro: Loaded & Ready');
    }

    if (window.appready) cardify_pro();
    else Lampa.Listener.follow('app', 'ready', cardify_pro);
})();
