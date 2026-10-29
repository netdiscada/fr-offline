# FR Offline — PLANO (Passo 2)

Fonte: `netdiscada/fr-apk` (branch main), cópia fiel já commitada no Passo 1 (`www/js/db.js` com Firebase).
Objetivo deste plano: trocar só o `db.js` (Firebase → IndexedDB) mantendo os mesmos nomes de função e
mesmo formato de retorno, para as telas não precisarem mudar. Depois, tirar o que só existe por causa
do servidor (login, ADM, chefe, regras do Firestore), um item por commit.

---

## 1. Funções de `www/js/db.js` que as telas usam

Todas expostas em `global.FrDb` (db.js, linhas 526-536). Formato de retorno: Promise que resolve com o
dado (ou `null`/vazio quando não há). Nenhuma função usa `await` dentro de transação.

| Função | Arquivo | O que recebe | O que devolve | Usado por (tela) |
|--------|---------|--------------|---------------|------------------|
| `usuario()` | db.js | nada | Promise do usuário (anônimo) | todas (interno) |
| `consultarRgf(rgf)` | db.js | RGF (string) | `{ situacao: 'novo'\|'pronto'\|'meu'\|'ocupado', dados?: {...} }` | app.js (tela rgf) |
| `vincularRgf({rgf, nome, cargo})` | db.js | RGF, nome, cargo | `{ ok: true, aprovado } \| { ok: false, motivo: 'ocupado', nome }` | app.js (tela rgf) |
| `pedirLiberacao(rgf, motivo)` | db.js | RGF, motivo | nada (Promise) | app.js (tela rgf) |
| `observarRgf(rgf, cb)` | db.js | RGF, callback | função para parar a escuta | app.js (vigia RGF) |
| `observarVeiculos(cb)` | db.js | callback | função para parar | app.js (inicio) |
| `salvarFr(fr)` | db.js | objeto FR | `{ enviado: Promise }` | dia.js, ui.js |
| `minhasFrs()` | db.js | nada | lista de FRs do usuário (máx 30) | ficha.js (Minhas FRs) |
| `observarLocais(cb)` | db.js | callback | função para parar | app.js (inicio), backup.js |
| `registrarLocal(texto, chave, rgf, existente)` | db.js | texto, chave, rgf, existente(bool) | Promise da gravação | ui.js |
| `chavesLocaisNoServidor()` | db.js | nada | Promise de lista de chaves | ui.js |
| `frAbertaDoRgf(rgf)` | db.js | RGF | Promise FR aberta ou null | app.js (recuperarFr) |
| `assumirFr(id)` | db.js | id da FR | nada (Promise) | app.js (recuperarFr, salvarFrFuncionario) |
| `observarFr(id, cb, erro)` | db.js | id, callback, callback erro | função para parar | app.js (acompanharFr) |
| `observarCompartilhadas(cb)` | db.js | callback | função para parar | app.js |
| `salvarItinerario(fr)` | db.js | objeto FR | Promise | ui.js |
| `sairDaFr(fr)` | db.js | objeto FR | Promise | ui.js |
| `colega(rgf)` | db.js | RGF | `{ uid, rgf, nome } \| { erro: '...' }` | dia.js |
| `observarPreparadas(rgf, cb)` | db.js | RGF, callback | função para parar | app.js |
| `passarFr(id, f, por)` | db.js | id, {rgf, nome, cargo}, quem passou | Promise | chefe.js |
| `marcarImpressas(ids, por)` | db.js | lista de ids, quem | Promise | dia.js |
| `frsDoRgf(rgf)` | db.js | RGF | lista de FRs (máx 80) | frlista.js (Minhas FRs anteriores) |
| `salvarFrFuncionario(fr, uidNoBanco, veiculo)` | db.js | FR, uid do banco, veículo | Promise (batch) | dia.js |
| `registrarChefe(p)` | db.js | {rgf, nome} | nada (Promise) | app.js (conferirChefe) |
| `deixarChefe()` | db.js | nada | nada (Promise) | app.js |
| `observarEquipe(cb, erro)` | db.js | callback, callback erro | função para parar | chefe.js |
| `observarPainel(hoje, cb, erro)` | db.js | data hoje, callback, callback erro | função para parar | chefe.js |
| `frsAnteriores(antesDe, depoisDe)` | db.js | datas | `{ lista, ultimo }` | frlista.js |
| `criarFrPreparada(fr)` | db.js | objeto FR | Promise | chefe.js |
| `salvarFrChefe(fr, por, veiculo, antes)` | db.js | FR, quem, veículo, antes | Promise (aviso cadeia) | chefe.js |
| `cancelarFrChefe(f, por)` | db.js | FR, quem | Promise | chefe.js |
| `excluirFr(id)` | db.js | id | Promise | app.js, chefe.js |
| `receberPapel(fr, dados, veiculo, por)` | db.js | FR, dados, veículo, quem | Promise | dia.js |
| `reabrirFrChefe(id)` | db.js | id | Promise | chefe.js |
| `fecharAntigas(lista)` | db.js | lista de FRs | Promise | chefe.js |
| `limparAntigas(base?)` | db.js | opcional base | Promise (quantidade) | chefe.js (adm) |
| `SO_BANCO` | db.js | constante | array de campos | ui.js |
| `entrarAdm(email, senha)` | db.js | email, senha | Promise usuário | adm.js |
| `sairAdm()` | db.js | nada | Promise | adm.js |
| `souAdm()` | db.js | nada | Promise boolean | app.js, adm.js |
| `adm.salvarFuncionario({rgf, nome, cargo, papel})` | db.js | dados do funcionário | Promise | adm.js |
| `adm.salvarVeiculo(v)` | db.js | objeto veículo | Promise | adm.js |
| `adm.excluirVeiculo(id)` | db.js | id | Promise | adm.js |
| `adm.excluirFr(id)` | db.js | id | Promise | adm.js |
| `adm.salvarFrAdm(fr, antes)` | db.js | FR, antes | Promise (aviso cadeia) | adm.js |
| `adm.reabrirFr(id)` | db.js | id | Promise | adm.js |
| `adm.compartilharFr(id, lista)` | db.js | id, lista de {uid} | Promise | adm.js |
| `adm.darBaixaDefeito(id, lista)` | db.js | id, lista de defeitos | Promise | adm.js |
| `novoId()` | db.js | nada | string id novo (Firestore) | ui.js |

Funções do `db.js` que são só de servidor/ADM e saem na versão offline:
`entrarAdm`, `sairAdm`, `souAdm`, `adm.*` (todas), `registrarChefe`, `deixarChefe`, `observarEquipe`,
`observarPainel`, `criarFrPreparada`, `salvarFrChefe`, `cancelarFrChefe`, `reabrirFrChefe`,
`fecharAntigas`, `limparAntigas`.

---

## 2. O que cada tela de servidor faz (e some na versão offline)

### Login / Primeiro acesso (`app.js`, tela `rgf`)
- Funcionário digita o RGF → `Db.consultarRgf(rgf)` diz se é 'novo', 'pronto', 'meu' ou 'ocupado'.
- Se 'pronto' ou 'meu': confirma nome/cargo e entra (`Db.vincularRgf`, depois `entrou()`).
- Se 'novo': pede nome e cargo, `Db.vincularRgf` com `aprovado: false`, fica esperando aprovação do ADM.
- Se 'ocupado': avisa que o RGF está em outro celular, opção de pedir liberação (`Db.pedirLiberacao`).
- Na versão offline: **somente primeiro acesso** (nome, RGF, cargo salvos no celular), sem servidor, sem
  aprovação, sem 'ocupado'.

### Área do ADM (`adm.js`, tela `adm`)
- Login com email/senha (`Db.entrarAdm`), verifica se é admin (`admins` collection).
- Gerencia funcionários: listar (`adm.observarFuncionarios`), salvar/editar (`adm.salvarFuncionario`),
  excluir (`adm.excluirFuncionario`), aprovar (`adm.aprovar`), vincular/desvincular aparelho
  (`adm.liberarPedido`, `adm.recusarPedido`, `adm.desvincular`), marcar visto (`adm.marcarVisto`).
- Gerencia veículos: listar, salvar, excluir (`adm.observarVeículos`, `adm.salvarVeículo`, `adm.excluirVeículo`).
- Gerencia FRs: listar todas (`adm.frs`), correção na ficha completa (`adm.salvarFrAdm` com km em cadeia),
  reabrir (`adm.reabrirFr`), compartilhar com colegas (`adm.compartilharFr`), dar baixa em defeitos
  (`adm.darBaixaDefeito`), excluir (`adm.excluirFr`).
- Controle de frota: FRs ativas ao vivo (`adm.observarFrsAtivas`), limpar antigas (`adm.limparAntigas`).
- Gerencia locais: listar, renomear, excluir (`adm.observarLocais`, `adm.renomearLocal`, `adm.excluirLocal`).
- Na versão offline: **toda a tela ADM sai** (não há servidor, não há ADM remoto, não há e-mail/senha).

### Painel do Chefe (`chefe.js`, tela `equipe`/`preparar`)
- Chefe se registra (`Db.registrarChefe`) para ver as FRs da equipe.
- Vê funcionários da equipe (`Db.observarEquipe`).
- Vê painel de FRs: hoje, abertas, preparadas (`Db.observarPainel`).
- Prepara FR para funcionário (`Db.criarFrPreparada`).
- Passa FR para outro funcionário (`Db.passarFr`).
- Corrige FR completa (`Db.salvarFrChefe` com km em cadeia).
- Cancela FR (`Db.cancelarFrChefe`), reabrir (`Db.reabrirFrChefe`).
- FRs anteriores (`Db.frsAnteriores`).
- Na versão offline: **tela de chefe sai** (um funcionário só, sem equipe, sem chefe remoto).

---

## 3. Ordem de execução (um item por vez, com prova e commit)

1. **Passo 1 (feito)** — Cópia fiel do fr-apk. Commit: "Cópia fiel do fr-apk".
2. **Passo 2 (este plano)** — PLANO.md com as funções e telas. Esperar "ok" do usuário.
3. **Passo 3** — Novo `db.js` (IndexedDB), mesmos nomes e retornos. Uma função por vez, cada uma com
   roteiro e commit. Prova: roteiro cadastra veículo, inicia FR, preenche km, recarrega (FR continua
   aberta) e encerra o dia.
4. **Passo 4** — Primeira acesso no lugar do login (nome, RGF, cargo no celular; cadastro de veículos;
   aviso se faltar nome). Prova no roteiro.
5. **Passo 5** — Tirar ADM, chefe, `firestore.rules`, `vendor/firebase-*`, `config.js` do Firebase.
   Um item por commit, fumaca.cjs sem erro de JS depois de cada um.
6. **Passo 6** — Abrir sem internet (service worker, precache de todos os arquivos incluindo fontes,
   `template_FR.pdf`, `vendor/pdf-lib`, versão no nome do cache). Prova: "abre sem internet: sim".
7. **Passo 7** — Backup: exportar/importar `.json`, validar inteiro antes de apagar. Prova: exportar,
   limpar, importar, FRs voltam.
8. **Passo 8** — Adaptar testes de `testes/casos/*.cjs` (km, cadeia, PDF, checklist, primeiro acesso,
   offline) e rodar 2× sem falha.

---

Aguardando seu "ok" para começar o Passo 3 (novo `db.js` IndexedDB).
