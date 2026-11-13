// Сторож заставки: если приложение не запустилось за 10 секунд (плохая связь, сбой загрузки),
// показываем понятное сообщение и кнопку «Обновить» вместо бесконечной загрузки.
(function () {
  setTimeout(function () {
    var root = document.getElementById('root');
    var boot = root && root.querySelector('.boot');
    if (!boot || boot.querySelector('.boot-help')) return;
    var box = document.createElement('div');
    box.className = 'boot-help';
    box.innerHTML = '<p>Загрузка идёт дольше обычного.</p><p class="boot-sub">Проверьте интернет. Если вы в мобильной сети — попробуйте Wi‑Fi или включите/выключите VPN.</p><button type="button">Обновить</button>';
    box.querySelector('button').onclick = function () { location.reload(); };
    boot.appendChild(box);
  }, 10000);
})();
