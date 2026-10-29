# Testes do FR

Rodam o app de verdade (www/) no Chromium contra os emuladores do Firebase (auth 9098, firestore 8086),
com as regras do `firestore.rules` da raiz. Nada aqui toca o banco de produção.

```bash
testes/testar.sh 2            # tudo, 2 vezes (obrigatório antes de lançar)
testes/testar.sh 1 checklist  # só um grupo, durante o trabalho
```

- `casos/`: um arquivo por grupo. `rodar.cjs` sobe o emulador uma vez e limpa o banco entre os grupos.
  Os grupos de tela rodam com as animações desligadas (`semanim.cjs`); o `e2e` roda com elas ligadas.
- `casos/ui.cjs`: ajudas para o visual atual (ações da FR com "⋯ Mais", visor do papel).
- `ferramentas/auditoria.cjs`: fotos de todas as telas (funcionário, chefe, ADM) em 320, 390 e 1440 px com
  dados no pior caso. Uso: `cd testes && node_modules/.bin/firebase emulators:exec --project demo-fr --only auth,firestore "node ferramentas/auditoria.cjs .tmp/fotos"`.
- PC (Windows): rodar no WSL ou Git Bash; precisa de Java e do Playwright (`npx playwright install chromium`).
