#!/bin/bash
# Testes do FR. Uso:
#   testes/testar.sh              -> tudo, 1 vez
#   testes/testar.sh 2            -> tudo, 2 vezes (antes de lançar)
#   testes/testar.sh 1 chefe adm  -> só esses
# Precisa: Node 22, Java (emulador do Firebase), Playwright com Chromium, pdftotext/pdfinfo (poppler).
# Primeira vez: cd testes && npm ci
T="$(cd "$(dirname "$0")" && pwd)"
N=${1:-1}; shift
TESTES=${*:-"regras regras-chefe chefe checklist anteriores e2e novidades locais medidor adm offline xss lento primeiro cadeia teclado"}
SAIDA="$T/.tmp/saida"; mkdir -p "$SAIDA"
# Playwright instalado globalmente também vale (como no ambiente da nuvem)
export NODE_PATH="$T/node_modules:$(npm root -g 2>/dev/null)"
[ -d "$T/node_modules" ] || (cd "$T" && npm ci --silent)
bash "$T/servidores.sh"
for i in $(seq 1 $N); do
  echo "== rodada $i"
  # Cada teste carrega o firestore.rules da raiz sozinho (o emulador não aceita arquivo fora desta pasta)
  LOG="$T/.tmp/emulador.log"
  (cd "$T" && timeout 1500 node_modules/.bin/firebase emulators:exec --project demo-fr --only auth,firestore \
    "cd casos && node rodar.cjs '$SAIDA' $TESTES" > "$LOG" 2>&1)
  grep -E "^(PASSOU|FALHOU|   )" "$LOG"
  # Nenhum grupo rodou = erro (não deixar passar em silêncio)
  grep -qE "^(PASSOU|FALHOU)" "$LOG" || { echo "FALHOU | emulador não rodou os testes:"; tail -5 "$LOG"; }
  if [ -z "$*" ]; then
    (cd "$T/casos" && node pdf.cjs "$SAIDA" >/dev/null 2>&1 && echo "PASSOU | pdf" || echo "FALHOU | pdf")
    (cd "$T/casos" && node imp.cjs "$SAIDA" >/dev/null 2>&1 && echo "PASSOU | impressao" || echo "FALHOU | impressao")
  fi
done
