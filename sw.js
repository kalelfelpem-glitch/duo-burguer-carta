// DUO BURGUER — el service worker de la vitrina CONECTADA (ORDEN-MAC-2026-09-29 §3.1,
// CONTRATO-API §3.9). Hace DOS cosas y nada más:
//
//   · push              pinta el aviso que manda el sistema cuando el pedido cambia de estado.
//   · notificationclick abre (o enfoca) la vitrina en el seguimiento de ese pedido.
//
// NO escucha `fetch` y NO guarda nada en caché, a propósito: una vitrina cacheada enseña la
// carta y los precios de ayer, y un service worker que intercepta la red es la forma más fácil
// de dejar a un cliente con una página vieja sin que nadie lo note. La página siempre sale de
// la red, como antes de que existiera este archivo.
//
// La url del aviso: el sistema hoy manda `${ORIGEN_VITRINA}/seguimiento?orden=<id>`, pero la
// vitrina no tiene esa ruta (sería un 404): su seguimiento es `/#pedido=<id>`. Aquí se traduce,
// y la orden al PC pide cambiar la constante de `lib/dominio/avisos.ts`.

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (ev) { ev.waitUntil(self.clients.claim()); });

// Siempre una url de ESTA vitrina: el camino del aviso sobre el origen propio, con
// /seguimiento?orden=<id> convertido al seguimiento real.
function urlDeLaVitrina(cruda) {
  var u;
  try { u = new URL(cruda || '/', self.location.origin); } catch (e) { u = new URL('/', self.location.origin); }
  var orden = /\/seguimiento\/?$/.test(u.pathname) ? u.searchParams.get('orden') : null;
  if (orden) return self.location.origin + '/#pedido=' + encodeURIComponent(orden);
  return self.location.origin + u.pathname + u.search + u.hash;
}

self.addEventListener('push', function (ev) {
  var d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { try { d = { cuerpo: ev.data.text() }; } catch (e2) { d = {}; } }
  var titulo = typeof d.titulo === 'string' && d.titulo ? d.titulo : 'Duo Burguer';
  var aviso = self.registration.showNotification(titulo, {
    body: typeof d.cuerpo === 'string' ? d.cuerpo : '',
    icon: '/icono-192.png',
    badge: '/insignia-96.png',
    tag: typeof d.etiqueta === 'string' && d.etiqueta ? d.etiqueta : 'duo-burguer',
    renotify: true,
    lang: 'es',
    data: { url: urlDeLaVitrina(d.url) }
  });
  // Si la vitrina está abierta, que repinte el seguimiento ya y no a los 15 s del sondeo.
  var repintar = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
    ventanas.forEach(function (v) { v.postMessage({ tipo: 'duo-aviso' }); });
  });
  ev.waitUntil(Promise.all([aviso, repintar]));
});

self.addEventListener('notificationclick', function (ev) {
  ev.notification.close();
  var destino = urlDeLaVitrina(ev.notification.data && ev.notification.data.url);
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
    var v = ventanas.filter(function (x) { return x.url.indexOf(self.location.origin + '/') === 0; })[0];
    if (!v) return self.clients.openWindow(destino);
    return v.focus().then(function (enfocada) {
      var w = enfocada || v;
      // navigate() solo sirve en una ventana que este service worker controla; si no, la
      // página misma cambia de lugar con el mensaje (la vitrina lo escucha).
      var porMensaje = function () { w.postMessage({ tipo: 'duo-abrir', url: destino }); };
      return w.navigate ? w.navigate(destino).then(function (n) { if (!n) porMensaje(); }, porMensaje) : porMensaje();
    });
  }));
});
