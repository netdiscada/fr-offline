// FR Offline - banco de dados local (IndexedDB). Nada de servidor, nada de nuvem.
// Tudo fica neste celular. Exportar/importar opcional via arquivo JSON.

(function (global) {
  const NOME_BANCO = 'fr_offline';
  const VERSAO_BANCO = 1;

  const ST_PERFIL = 'perfil';       // { rgf, nome, cargo }
  const ST_VEICULOS = 'veiculos';   // { id, tombamento, marca, modelo, placa, ativo }
  const ST_FR = 'frs';              // frs completas
  const ST_LOCAIS = 'locais';       // { chave, texto, n }

  let dbPromise = null;

  function abrirBanco() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((ok, erro) => {
      const req = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
      req.onupgradeneeded = () => {
        const b = req.result;
        if (!b.objectStoreNames.contains(ST_PERFIL)) b.createObjectStore(ST_PERFIL, { keyPath: 'rgf' });
        if (!b.objectStoreNames.contains(ST_VEICULOS)) b.createObjectStore(ST_VEICULOS, { keyPath: 'id' });
        if (!b.objectStoreNames.contains(ST_FR)) b.createObjectStore(ST_FR, { keyPath: 'id' });
        if (!b.objectStoreNames.contains(ST_LOCAIS)) b.createObjectStore(ST_LOCAIS, { keyPath: 'chave' });
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
    return dbPromise;
  }

  async function loja(nome, modo = 'readonly') {
    const b = await abrirBanco();
    const t = b.transaction(nome, modo);
    return t.objectStore(nome);
  }

  // ---------- perfil ----------
  async function lerPerfil() {
    const s = await loja(ST_PERFIL);
    const lista = await new Promise((ok) => {
      const r = s.getAll(); r.onsuccess = () => ok(r.result);
    });
    return lista[0] || null;
  }
  async function gravarPerfil(p) {
    const s = await loja(ST_PERFIL, 'readwrite');
    await new Promise((ok) => { const r = s.put(p); r.onsuccess = () => ok(); });
  }
  async function limparPerfil() {
    const s = await loja(ST_PERFIL, 'readwrite');
    await new Promise((ok) => { const r = s.clear(); r.onsuccess = () => ok(); });
  }

  // ---------- veículos ----------
  async function lerVeiculos() {
    const s = await loja(ST_VEICULOS);
    return new Promise((ok) => {
      const r = s.getAll(); r.onsuccess = () => ok(r.result.filter(v => v.ativo !== false));
    });
  }
  async function salvarVeiculo(v) {
    if (!v.id) v.id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const s = await loja(ST_VEICULOS, 'readwrite');
    await new Promise((ok) => { const r = s.put(v); r.onsuccess = () => ok(v); });
    return v;
  }
  async function excluirVeiculo(id) {
    const s = await loja(ST_VEICULOS, 'readwrite');
    await new Promise((ok) => { const r = s.delete(id); r.onsuccess = () => ok(); });
  }

  // ---------- frs ----------
  async function lerFrs() {
    const s = await loja(ST_FR);
    return new Promise((ok) => {
      const r = s.getAll(); r.onsuccess = () => ok(r.result.sort((a, b) => (b.data || '').localeCompare(a.data || '')));
    });
  }
  async function salvarFr(fr) {
    if (!fr.id) fr.id = 'fr_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    fr.atualizadoEm = Date.now();
    const s = await loja(ST_FR, 'readwrite');
    await new Promise((ok) => { const r = s.put(fr); r.onsuccess = () => ok(fr); });
    return fr;
  }
  async function excluirFr(id) {
    const s = await loja(ST_FR, 'readwrite');
    await new Promise((ok) => { const r = s.delete(id); r.onsuccess = () => ok(); });
  }
  async function lerFr(id) {
    const s = await loja(ST_FR);
    return new Promise((ok) => { const r = s.get(id); r.onsuccess = () => ok(r.result); });
  }

  // ---------- locais ----------
  async function lerLocais() {
    const s = await loja(ST_LOCAIS);
    return new Promise((ok) => {
      const r = s.getAll(); r.onsuccess = () => ok(r.result.map(l => ({ chave: l.chave, texto: l.texto, n: l.n || 0 })));
    });
  }
  async function registrarLocal(texto, chave) {
    const s = await loja(ST_LOCAIS, 'readwrite');
    const existente = await new Promise((ok) => { const r = s.get(chave); r.onsuccess = () => ok(r.result); });
    if (existente) {
      existente.n = (existente.n || 0) + 1;
      await new Promise((ok) => { const r = s.put(existente); r.onsuccess = () => ok(); });
    } else {
      await new Promise((ok) => { const r = s.put({ chave, texto, n: 1 }); r.onsuccess = () => ok(); });
    }
  }

  // ---------- exportação / importação ----------
  async function exportarTudo() {
    const [perfil, veiculos, frs, locais] = await Promise.all([
      lerPerfil(), lerVeiculos(), lerFrs(), lerLocais(),
    ]);
    return {
      versao: '1.0.0',
      exportadoEm: Date.now(),
      perfil,
      veiculos,
      frs,
      locais,
    };
  }
  async function importarTudo(dados) {
    const b = await abrirBanco();
    await Promise.all([
      limparStore(ST_PERFIL), limparStore(ST_VEICULOS), limparStore(ST_FR), limparStore(ST_LOCAIS),
    ]);
    if (dados.perfil) await gravarPerfil(dados.perfil);
    if (dados.veiculos) for (const v of dados.veiculos) await salvarVeiculo(v);
    if (dados.frs) for (const fr of dados.frs) await salvarFr(fr);
    if (dados.locais) for (const l of dados.locais) await registrarLocal(l.texto, l.chave);
  }
  async function limparStore(nome) {
    const s = await loja(nome, 'readwrite');
    await new Promise((ok) => { const r = s.clear(); r.onsuccess = () => ok(); });
  }
  async function limparTudo() {
    await Promise.all([
      limparStore(ST_PERFIL), limparStore(ST_VEICULOS), limparStore(ST_FR), limparStore(ST_LOCAIS),
    ]);
  }

  // helpers
  function novoId(prefixo) {
    return prefixo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  global.FrDb = {
    lerPerfil, gravarPerfil, limparPerfil,
    lerVeiculos, salvarVeiculo, excluirVeiculo,
    lerFrs, salvarFr, excluirFr, lerFr,
    lerLocais, registrarLocal,
    exportarTudo, importarTudo, limparTudo,
    novoId,
  };
})(window);
