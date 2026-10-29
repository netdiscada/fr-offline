#!/bin/bash
# Sobe os servidores locais dos testes (se não estiverem no ar):
#   8090 e 8091 = www/ (no 8090 o config.js usa os emuladores sozinho)
#   8092 = cópia do www com o service worker ligado (teste offline)
T="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(dirname "$T")"
sobe() { curl -s -o /dev/null localhost:$1/index.html || (cd "$2" && setsid nohup python3 -m http.server $1 </dev/null >/dev/null 2>&1 &); }
rm -rf "$T/.tmp/teste-www" && mkdir -p "$T/.tmp" && cp -r "$RAIZ/www" "$T/.tmp/teste-www"
(cd "$T/.tmp/teste-www" \
  && sed -i "s/!global.FR_CONFIG.EMULADOR) {/(!global.FR_CONFIG.EMULADOR || location.port === '8092')) {/" js/app.js \
  && sed -i "s/location.port === '8090',/(location.port === '8090' || location.port === '8092'),/" js/config.js \
  && sed -i "s/location.port === '8090';/(location.port === '8090' || location.port === '8092');/" js/csp.js)
sobe 8090 "$RAIZ/www"; sobe 8091 "$RAIZ/www"; sobe 8092 "$T/.tmp/teste-www"
sleep 1
