// FR - regra de segurança do navegador (CSP) na versão site: só roda código do próprio site.
// No APK não entra (o Capacitor injeta o próprio script e o app já roda isolado no celular).
(function () {
  if (window.Capacitor) return;
  const emulador = location.hostname === 'localhost' && location.port === '8090';
  const teste = emulador ? ' http://localhost:9098 http://localhost:8086 http://127.0.0.1:9098 http://127.0.0.1:8086' : '';
  const regras = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "connect-src 'self'" + teste,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = regras;
  document.head.prepend(meta);
})();
