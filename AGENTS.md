# FR Offline: instruções para o agente (Hermes ou Claude)

Objetivo: **o mesmo app do `netdiscada/fr-apk`**, só que sem servidor: sem Firebase, sem login, dados
guardados no celular (IndexedDB), backup por arquivo. Responder sempre em português.

## A versão atual está descartada

A primeira versão foi reescrita do zero e saiu quebrada (PDF sempre com erro, sem como encerrar a FR,
não abre sem internet, cadastro trava). **Não corrigir em cima dela.** Refazer seguindo a skill
`portar-projeto`:

1. Copiar `www/`, `android/`, `testes/`, `package*.json` e `capacitor.config.json` do fr-apk sem mudar nada.
   **Fonte: só `netdiscada/fr-apk` (main).** A pasta `fr/` do PC-DO-HERMES está desatualizada: não copiar dela.
2. Trocar só o `www/js/db.js` (Firebase → IndexedDB) mantendo os mesmos nomes de função e formato de retorno.
3. Tirar o que só existe por causa do servidor (login, ADM, chefe, regras), um item por commit.
4. Plano e andamento em `PLANO.md`, um item por vez.

## Regras que não mudam (vêm do fr-apk)

- Km sempre digitado. Km de retorno menor que a saída **bloqueia** com "Verifique a quilometragem".
- Km em cadeia: a saída da FR nova vem do retorno da última FR daquele veículo.
- O PDF é o `assets/template_FR.pdf` oficial preenchido com pdf-lib. Assinaturas do condutor e da portaria em branco.
- "Após os serviços" começa em branco e só tem X.
- Campos de número com `inputmode="numeric"`. Nada de `alert`/`prompt`/`confirm` do navegador.
- Abrir sem internet desde o primeiro uso (service worker registrado; skill `pwa-offline-first`).
- Nada que gere cobrança.

## Antes de cada commit

Skill `entregar-com-prova`: `python3 -m http.server 8090` na pasta `www`, depois
`node <skills>/entregar-com-prova/scripts/fumaca.cjs http://localhost:8090/ fotos roteiro.cjs`
tem que terminar com **"Nenhuma falha"**. Colar a saída e descrever as fotos para o usuário.
