# FR Offline — PLANO (estado atual)

Fonte: `netdiscada/fr-apk` (branch main). Projeto em `/home/ubuntu/projeto-FR-Offline`.
Site publicado: `https://netdiscada.github.io/fr-offline/` (HTTP 200, service worker, abre sem internet).
Último commit: `948ed20` na branch `main`.

## O que já está feito (8 passos concluídos)

1. **Passo 1 — Cópia fiel do fr-apk.** `www/`, `testes/`, `android/`, `package*.json`, `capacitor.config.json` copiados sem mudar nada. Commit "Cópia fiel do fr-apk".
2. **Passo 2 — PLANO.md** (este documento).
3. **Passo 3 — db.js → IndexedDB.** 42 funções, mesmos nomes e retornos do Firebase, sem servidor. Commit "db.js IndexedDB".
4. **Passo 4 — Primeiro acesso local.** Tela RGF → nome/cargo, salvos no celular, entra sem servidor. Commit `7e915aa`.
5. **Passo 5 — Remoção de servidor/ADM/chefe.** `firestore.rules`, `vendor/firebase-*`, `config.js`, referências no `index.html`, `csp.js`, `sw.js`, ADM e chefe de `app.js` e `dia.js`. Commits `403d642`, `9aa8b2b`, `6b665d89`.
6. **Passo 6 — Abrir sem internet.** `sw.js` com precache de todas as fontes, `template_FR.pdf`, `vendor/pdf-lib`. Commit. Prova: "abre sem internet: sim".
7. **Passo 7 — Backup .json.** Exportar/importar, validação antes de apagar. Commit `2ddc6f1`.
8. **Passo 8 — Testes adaptados.** 5 testes (primeiro, cadeia, checklist, offline, pdf) + `idb.cjs`, todos passam 2× sem falha contra o site publicado. Commit `aee0d50`.

## Trabalho restante (não começou ainda)

- **Cadastro de veículos pelo menu.** Botão "Cadastrar veículo" já adicionado ao menu (`index.html` linha 272, `app.js` linhas 345-377). Grava via `FrDb.salvarVeiculo` no IndexedDB. **Precisa de teste real no navegador** (Playwright local travava no clique do menu — não validado ainda).
- **Editar perfil (nome, RGF, cargo).** Não existe ainda. Usuário quer editar depois do primeiro acesso.
- **Aviso de "sem veículos" no "Começar dia".** Quando não há veículo cadastrado, o app precisa guiar para o menu "Cadastrar veículo".
- **Teste end-to-end completo:** entrar → cadastrar veículo → começar dia → preencher FR → encerrar → gerar PDF.
- Commit + push para `main`.

## Regra de quem escreve código (obrigatória)

**Nunca edite código de produção diretamente.** Toda tarefa que envolva alterar arquivos do projeto vai primeiro para o **subagent com o modelo de code** (`nemotron-3.5-bolt-e4b`, provedor `nvidia`). Ele é o programador. Você (o cérebro) planeja, passa o contexto detalhado (caminhos, regras do FR, o que não mudar, como provar), o subagent edita, e você testa e commita.

O subagent **NÃO** comita, não faz push e não gera provas finais — isso fica com você.

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
