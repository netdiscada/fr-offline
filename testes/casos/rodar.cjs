// Roda várias baterias com o emulador ligado UMA vez: entre uma e outra, só limpa o banco e as contas.
// Uso (dentro do emulators:exec): node rodar.cjs <pasta de fotos> teste1 teste2 ...
const { spawnSync } = require('child_process');
const [pasta, ...testes] = process.argv.slice(2);
const REGRAS = require('path').resolve(__dirname, '../../firestore.rules');
const limpar = async () => {
  await fetch('http://127.0.0.1:8086/emulator/v1/projects/demo-fr/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9098/emulator/v1/projects/demo-fr/accounts', { method: 'DELETE' });
};
const ARGS = {
  regras: ['regras.test.mjs', REGRAS], 'regras-chefe': ['regras-chefe.test.mjs', REGRAS],
  adm: ['adm.cjs', pasta + '/adm.png'], novidades: ['novidades.cjs', pasta], locais: ['locais.cjs', pasta],
  chefe: ['chefe.cjs', pasta], checklist: ['checklist.cjs', pasta], anteriores: ['anteriores.cjs', pasta], pc: ['pc.cjs', pasta],
};
(async () => {
  let falhou = 0;
  for (const t of testes) {
    await limpar();
    const ini = Date.now();
    const r = spawnSync('node', (t === 'e2e' || t.startsWith('regras') ? [] : ['-r', './semanim.cjs']).concat(ARGS[t] || [t + '.cjs']), { encoding: 'utf8', timeout: 300000 });
    const saida = (r.stdout || '') + (r.stderr || '');
    const linhas = saida.split('\n').filter(l => /^(OK|FALHA|ERRO|pageerror)|pageerror/.test(l));
    const nf = linhas.filter(l => !l.startsWith('OK')).length + (r.status !== 0 ? 1 : 0);
    if (nf) falhou++;
    console.log(`${nf ? 'FALHOU' : 'PASSOU'} | ${t} | ok=${linhas.filter(l => l.startsWith('OK')).length} | ${Math.round((Date.now() - ini) / 1000)}s`);
    linhas.filter(l => !l.startsWith('OK')).forEach(l => console.log('   ' + l.slice(0, 300)));
  }
  process.exit(falhou ? 1 : 0);
})();
