// FR - backup por arquivo (.json): exportar/importar todos os dados do celular.
// Importacao valida o arquivo inteiro ANTES de apagar qualquer coisa.
(function (global) {
  const F = global.FR;
  const Db = global.FrDb;

  // ---------- exportar ----------
  // Devolve um objeto com tudo o que precisa ser restaurado.
  async function exportar() {
    const [funcionarios, veiculos, frs, locais, meta] = await Promise.all([
      lerTudo('funcionarios'),
      lerTudo('veiculos'),
      lerTudo('frs'),
      lerTudo('locais'),
      lerTudo('meta'),
    ]);
    return {
      versao: 1,
      exportadoEm: Date.now(),
      funcionarios,
      veiculos,
      frs,
      locais,
      meta,
    };
  }

  function lerTudo(lojaNome) {
    return global.indexedDB ? new Promise((ok, erro) => {
      const req = indexedDB.open('fr-offline', 1);
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction(lojaNome, 'readonly');
        const loja = tx.objectStore(lojaNome);
        const r = loja.getAll();
        r.onsuccess = () => ok(r.result);
        r.onerror = () => erro(r.error);
      };
      req.onerror = () => erro(req.error);
    }) : Promise.resolve([]);
  }

  // ---------- importar ----------
  // Valida o arquivo inteiro antes de apagar qualquer coisa.
  // Retorna { ok: true } ou { ok: false, motivo }.
  async function importar(dados) {
    // 1) Estrutura basica
    if (!dados || typeof dados !== 'object') return { ok: false, motivo: 'Arquivo vazio ou invalido' };
    if (dados.versao !== 1) return { ok: false, motivo: 'Versao do backup nao suportada' };

    // 2) Valida cada colecao antes de tocar em nada
    const erros = [];
    const validarLista = (nome, lista, camposObrigatorios) => {
      if (!Array.isArray(lista)) { erros.push(nome + ' nao eh uma lista'); return []; }
      return lista.map((item, i) => {
        for (const c of (camposObrigatorios || [])) {
          if (item[c] === undefined && item[c] !== null) {
            erros.push(nome + '[' + i + '] sem campo ' + c);
          }
        }
        return item;
      });
    };

    const funcionarios = validarLista('funcionarios', dados.funcionarios, ['rgf']);
    const veiculos = validarLista('veiculos', dados.veiculos, ['id']);
    const frs = validarLista('frs', dados.frs, ['id']);
    const locais = validarLista('locais', dados.locais, ['chave']);
    const meta = dados.meta;
    if (meta && !Array.isArray(meta)) erros.push('meta nao eh uma lista');

    if (erros.length) return { ok: false, motivo: erros.join('; ') };

    // 3) Tudo validado: apaga e grava numa transacao por loja
    const d = await abrirDb();
    const gravar = (lojaNome, registros) => new Promise((ok, erro) => {
      const tx = d.transaction(lojaNome, 'readwrite');
      const loja = tx.objectStore(lojaNome);
      // limpa a loja
      const clear = loja.clear();
      clear.onsuccess = () => {
        registros.forEach(r => loja.put(r));
        tx.oncomplete = () => ok();
        tx.onerror = () => erro(tx.error);
      };
      clear.onerror = () => erro(clear.error);
    });

    try {
      await gravar('funcionarios', funcionarios);
      await gravar('veiculos', veiculos);
      await gravar('frs', frs);
      await gravar('locais', locais);
      if (meta) await gravar('meta', meta);
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: 'Falha ao gravar: ' + (e.message || e) };
    }
  }

  function abrirDb() {
    return new Promise((ok, erro) => {
      const req = indexedDB.open('fr-offline', 1);
      req.onerror = () => erro(req.error);
      req.onsuccess = () => ok(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        ['funcionarios', 'veiculos', 'frs', 'locais', 'meta'].forEach(n => {
          if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: n === 'funcionarios' ? 'rgf' : 'id' });
        });
      };
    });
  }

  // ---------- expor ----------
  global.FrBackupOffline = { exportar, importar };
})(window);
