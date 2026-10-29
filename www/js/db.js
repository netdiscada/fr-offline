// FR - acesso local (IndexedDB). Sem servidor, sem Firebase.
// Mesmos nomes de função e mesmo formato de retorno do db.js original do fr-apk,
// para as telas não precisarem mudar.
//
// Regras do IndexedDB (skill portador-projeto):
//  - Toda requisição tem onerror que rejeita a Promise.
//  - Não usa await no meio de uma transação: lê tudo antes, abre a transação,
//    faz as escritas juntas, a transação auto-commite ao fim do bloco síncrono.

(function (global) {
  const DB_NAME = 'fr-offline';
  const DB_VERSION = 1;

  // ---------- abertura do banco ----------
  function abrirDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('funcionarios'))
          db.createObjectStore('funcionarios', { keyPath: 'rgf' });
        if (!db.objectStoreNames.contains('veiculos'))
          db.createObjectStore('veiculos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('frs'))
          db.createObjectStore('frs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('locais'))
          db.createObjectStore('locais', { keyPath: 'chave' });
        if (!db.objectStoreNames.contains('meta'))
          db.createObjectStore('meta', { keyPath: 'chave' });
      };
    });
  }

  let dbPromise = null;
  function dbAberto() {
    if (!dbPromise) dbPromise = abrirDb();
    return dbPromise;
  }

  // ---------- helpers ----------
  function lerTudo(lojaNome, chave) {
    return dbAberto().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(lojaNome, 'readonly');
      const loja = tx.objectStore(lojaNome);
      const req = chave === undefined ? loja.getAll() : loja.get(chave);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function gravarVarios(lojaNome, registros) {
    // registros: array de { chave, valor } ou objetos diretos (com keyPath da loja)
    return dbAberto().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(lojaNome, 'readwrite');
      const loja = tx.objectStore(lojaNome);
      registros.forEach(r => {
        if (r.chave !== undefined) loja.put(r.valor, r.chave);
        else loja.put(r);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function apagar(lojaNome, chave) {
    return dbAberto().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(lojaNome, 'readwrite');
      const loja = tx.objectStore(lojaNome);
      const req = loja.delete(chave);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  // ---------- usuário do aparelho ----------
  // Sem Firebase Auth: uid é fixo deste aparelho, gravado em 'meta'.
  let usuarioPronto = null;
  function usuario() {
    if (!usuarioPronto) {
      usuarioPronto = new Promise((resolve, reject) => {
        dbAberto().then(d => {
          const tx = d.transaction('meta', 'readonly');
          const loja = tx.objectStore('meta');
          const req = loja.get('usuario');
          req.onsuccess = () => {
            const u = req.result;
            if (u) { resolve(u.valor); return; }
            // Ainda não há usuário: cria um uid fixo deste aparelho
            const novo = {
              uid: 'aparelho_' + Date.now().toString(36),
              nome: '', rgf: '', cargo: '', papel: '',
            };
            const tx2 = d.transaction('meta', 'readwrite');
            const loja2 = tx2.objectStore('meta');
            const req2 = loja2.put({ chave: 'usuario', valor: novo });
            req2.onsuccess = () => resolve(novo);
            req2.onerror = () => reject(req2.error);
          };
          req.onerror = () => reject(req.error);
        }).catch(reject);
      });
    }
    return usuarioPronto;
  }

  // ---------- funcionário / RGF ----------
  const refFunc = rgf => lerTudo('funcionarios', rgf);

  async function consultarRgf(rgf) {
    const u = await usuario();
    const d = await refFunc(rgf);
    if (!d) return { situacao: 'novo' };
    if (d.uid === u.uid) return { situacao: 'meu', dados: d };
    if (!d.uid) return { situacao: d.aprovado ? 'pronto' : 'novo', dados: d };
    return { situacao: 'ocupado', dados: d };
  }

  async function vincularRgf({ rgf, nome, cargo }) {
    const u = await usuario();
    const d = await refFunc(rgf);
    if (!d) {
      await gravarVarios('funcionarios', [{
        rgf, nome, cargo, uid: u.uid, aprovado: false,
        vinculadoEm: Date.now(), atualizadoEm: Date.now(), visto: false,
      }]);
      return { ok: true, aprovado: false };
    }
    if (d.uid === u.uid) return { ok: true, aprovado: !!d.aprovado };
    if (!d.uid) {
      const dados = {
        uid: u.uid, vinculadoEm: Date.now(), atualizadoEm: Date.now(), visto: false,
        pedidoUid: null, pedidoEm: null, pedidoMotivo: null,
      };
      if (!d.aprovado) Object.assign(dados, { nome, cargo });
      await gravarVarios('funcionarios', [{ rgf, ...dados }]);
      return { ok: true, aprovado: !!d.aprovado };
    }
    return { ok: false, motivo: 'ocupado', nome: d.nome };
  }

  async function pedirLiberacao(rgf, motivo) {
    const u = await usuario();
    const d = await refFunc(rgf);
    if (d) {
      await gravarVarios('funcionarios', [{ rgf,
        ...d, pedidoUid: u.uid, pedidoEm: Date.now(), pedidoMotivo: motivo }]);
    }
  }

  async function observarRgf(rgf, cb) {
    // IndexedDB é local: lê uma vez, avisa, e expõe função para parar (não faz nada).
    const d = await refFunc(rgf);
    const u = await usuario();
    cb({
      existe: !!d,
      meu: !!d && d.uid === u.uid,
      aprovado: !!d && !!d.aprovado,
      dados: d,
      cache: false,
    });
    return () => {};
  }

  // ---------- veículos ----------
  function ouvir(nome, consulta, cb) {
    // ÍndicoDB local: consulta uma vez, avisa, retorna função para parar.
    consulta().then(lista => cb(lista));
    return () => {};
  }

  function observarVeiculos(cb) {
    return ouvir('veiculos', () => lerTudo('veiculos').then(lista =>
      lista.filter(v => v.ativo !== false)
        .sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '')
          || (a.placa || '').localeCompare(b.placa || ''))), cb);
  }

  // ---------- FRs ----------
  const SO_BANCO = ['uid', 'criadoEm', 'atualizadoEm', 'editadoAdmEm', 'reabertaEm',
    'impressaEm', 'recebidaEm', 'preparadaEm', 'fechadaAutoEm'];

  function semControle(fr, manter = []) {
    const dados = {};
    Object.keys(fr).forEach(k => {
      if (k[0] !== '_' && k !== 'id' && (!SO_BANCO.includes(k) || manter.includes(k)))
        dados[k] = fr[k];
    });
    return dados;
  }

  const estadoVeiculo = (fr, comDefeitos) => {
    const km = window.FR.medidor(fr).ler(fr.retorno_km);
    const atual = {
      ultimaFrEm: Date.now(), ultimaFrId: fr.id,
      ultimoCondutor: fr.condutor || '', ultimoRgf: fr.rgf,
      ultimoCombustivel: fr.combustivel_retorno || fr.combustivel || '',
    };
    if (comDefeitos) atual.defeitosAbertos = fr.defeitosAbertos || [];
    if (km != null) atual.ultimoKm = km;
    return atual;
  };

  async function salvarFr(fr) {
    const u = await usuario();
    const dados = Object.assign(semControle(fr), { uid: u.uid, atualizadoEm: Date.now() });
    if (!fr._enviada) { dados.criadoEm = Date.now(); fr._enviada = true; }
    const registros = [{ id: fr.id, ...dados }];
    if (fr.veiculoId && fr.status === 'fechada') {
      const v = await lerTudo('veiculos', fr.veiculoId);
      if (v) registros.push({ id: v.id, ...estadoVeiculo(fr, true) });
    }
    await gravarVarios('frs', registros);
    const enviado = Promise.resolve();
    enviado.catch = () => enviado; // compatível com .catch() nas telas
    return { enviado };
  }

  async function frAbertaDoRgf(rgf) {
    try {
      const frs = await lerTudo('frs');
      const lista = frs.filter(f => f.rgf === rgf && f.status === 'aberta')
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
      return lista[0] || null;
    } catch (e) {
      console.warn('[db] frAbertaDoRgf', e);
      return null;
    }
  }

  async function assumirFr(id) {
    const u = await usuario();
    const fr = await lerTudo('frs', id);
    if (fr) {
      fr.uid = u.uid;
      fr.atualizadoEm = Date.now();
      await gravarVarios('frs', [fr]);
    }
  }

  function observarFr(id, cb, erro) {
    // ÍndicoDB local: lê uma vez, avisa, expõe parar.
    lerTudo('frs', id).then(r => cb(r ? Object.assign({ id: r.id }, r) : null, { fromCache: false }))
      .catch(e => { console.warn('[db] observarFr', e.code || e); if (erro) erro(e); });
    return () => {};
  }

  async function observarCompartilhadas(cb) {
    const u = await usuario();
    const frs = await lerTudo('frs');
    cb(frs.filter(f => f.status === 'aberta'
      && (f.compartilhadoUids || []).includes(u.uid)));
    return () => {};
  }

  function salvarItinerario(fr) {
    return dbAberto().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction('frs', 'readwrite');
      const loja = tx.objectStore('frs');
      const req = loja.get(fr.id);
      req.onsuccess = () => {
        const atual = req.result;
        if (!atual) { resolve(); return; }
        atual.itinerario = fr.itinerario;
        atual.atualizadoEm = Date.now();
        const req2 = loja.put(atual);
        req2.onsuccess = () => resolve();
        req2.onerror = () => reject(req2.error);
      };
      req.onerror = () => reject(req.error);
    }));
  }

  async function sairDaFr(fr) {
    const u = await usuario();
    const f = await lerTudo('frs', fr.id);
    if (!f) return;
    f.compartilhadoUids = (f.compartilhadoUids || []).filter(x => x !== u.uid);
    f.compartilhadoCom = (f.compartilhadoCom || []).filter(c => c.uid !== u.uid);
    f.atualizadoEm = Date.now();
    await gravarVarios('frs', [f]);
  }

  async function colega(rgf) {
    const d = await refFunc(rgf);
    if (!d) return { erro: 'RGF não encontrado' };
    if (!d.uid || !d.aprovado) return { erro: `${d.nome} ainda não está usando o app` };
    return { uid: d.uid, rgf, nome: d.nome };
  }

  function observarPreparadas(rgf, cb) {
    lerTudo('frs').then(lista =>
      cb(lista.filter(f => f.rgf === rgf && f.status === 'preparada')
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''))));
    return () => {};
  }

  async function passarFr(id, f, por) {
    const alvo = await lerTudo('frs', id);
    if (!alvo) return;
    alvo.rgf = f.rgf;
    alvo.condutor = f.nome || '';
    alvo.cargo = f.cargo || '';
    alvo.passadaPor = por || null;
    alvo.atualizadoEm = Date.now();
    await gravarVarios('frs', [alvo]);
  }

  async function marcarImpressas(ids, por) {
    for (const id of ids) {
      const f = await lerTudo('frs', id);
      if (f) {
        f.impressaEm = Date.now();
        f.impressaPor = por || '';
        f.atualizadoEm = Date.now();
        await gravarVarios('frs', [f]);
      }
    }
  }

  async function frsDoRgf(rgf) {
    const frs = await lerTudo('frs');
    return frs.filter(f => f.rgf === rgf)
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      .slice(0, 80);
  }

  async function salvarFrFuncionario(fr, uidNoBanco, veiculo) {
    const u = await usuario();
    const ref = await lerTudo('frs', fr.id);
    if (ref && uidNoBanco !== u.uid) {
      ref.uid = u.uid;
      ref.atualizadoEm = Date.now();
      await gravarVarios('frs', [ref]);
    }
    const dados = Object.assign(semControle(fr), { uid: u.uid, atualizadoEm: Date.now() });
    await gravarVarios('frs', [{ id: fr.id, ...dados }]);
    if (veiculo && veiculo.ultimaFrId === fr.id && fr.status === 'fechada') {
      const v = await lerTudo('veiculos', veiculo.id);
      if (v) {
        Object.assign(v, estadoVeiculo(fr, false));
        await gravarVarios('veiculos', [v]);
      }
    }
  }

  async function registrarChefe(p) {
    const u = await usuario();
    await gravarVarios('meta', [{ chave: 'chefe_' + u.uid, valor: { rgf: p.rgf, nome: p.nome || '', em: Date.now() } }]);
  }

  async function deixarChefe() {
    const u = await usuario();
    await apagar('meta', 'chefe_' + u.uid);
  }

  function observarEquipe(cb, erro) {
    lerTudo('funcionarios').then(cb).catch(e => { console.warn('[db] equipe', e.code || e); if (erro) erro(e); });
    return () => {};
  }

  function observarPainel(hoje, cb, erro) {
    lerTudo('frs').then(frs => {
      const hojeLista = frs.filter(f => f.data === hoje);
      const abertas = frs.filter(f => f.status === 'aberta');
      const preparadas = frs.filter(f => f.status === 'preparada');
      cb([...hojeLista, ...abertas, ...preparadas], { fromCache: false });
    }).catch(e => { console.warn('[db] painel', e.code || e); if (erro) erro(e); });
    return () => {};
  }

  async function frsAnteriores(antesDe, depoisDe) {
    let frs = await lerTudo('frs');
    frs = frs.filter(f => f.data < antesDe);
    frs.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    if (depoisDe) {
      const idx = frs.findIndex(f => f.data === depoisDe);
      if (idx >= 0) frs = frs.slice(idx + 1);
    }
    const lista = frs.slice(0, 40);
    return { lista, ultimo: lista[lista.length - 1] || null };
  }

  async function criarFrPreparada(fr) {
    const u = await usuario();
    const dados = Object.assign(semControle(fr), {
      uid: u.uid, preparadaEm: Date.now(), criadoEm: Date.now(), atualizadoEm: Date.now(),
    });
    await gravarVarios('frs', [{ id: fr.id, ...dados }]);
  }

  function kmMaisNovo(fr, veiculo) {
    if (veiculo.ultimaFrId === fr.id) return true;
    const km = window.FR.medidor(fr).ler(fr.retorno_km);
    return km != null && (veiculo.ultimoKm == null || km >= veiculo.ultimoKm);
  }

  async function salvarFrChefe(fr, por, veiculo, antes) {
    const dados = semControle(fr);
    ['rgf', 'preparadaPor'].forEach(k => delete dados[k]);
    Object.assign(dados, { editadoAdmEm: Date.now(), editadoPor: por, atualizadoEm: Date.now() });
    await gravarVarios('frs', [{ id: fr.id, ...dados }]);
    if (veiculo && fr.status === 'fechada' && kmMaisNovo(fr, veiculo)) {
      const v = await lerTudo('veiculos', veiculo.id);
      if (v) {
        Object.assign(v, estadoVeiculo(fr, false));
        await gravarVarios('veiculos', [v]);
      }
    }
    const n = await corrigirKmEmCadeia(null, fr, antes, por).catch(e => {
      console.warn('[db] km em cadeia', e.code || e);
      return 0;
    });
    return avisoCadeia(n);
  }

  async function corrigirKmEmCadeia(base, fr, antes, por) {
    // base ignorada (não há servidor). Usa frs locais.
    const m = window.FR.medidor(fr);
    const de = m.ler(antes && antes.retorno_km);
    const para = m.ler(fr.retorno_km);
    if (!fr.veiculoId || fr.status !== 'fechada' || de == null || para == null || de === para) return 0;
    const frs = await lerTudo('frs');
    const alvo = frs.filter(f => f.id !== fr.id
      && ['aberta', 'preparada'].includes(f.status)
      && m.ler(f.partida_km) === de);
    if (!alvo.length) return 0;
    const registros = alvo.map(f => {
      const copia = Object.assign({}, f);
      if (f.status === 'preparada') {
        copia.partida_km = m.texto(para);
        copia.kmEsperado = m.texto(para);
        copia.atualizadoEm = Date.now();
      } else {
        copia.correcaoKm = { de: m.texto(de), para: m.texto(para), por: por || 'O ADM', em: Date.now() };
        copia.atualizadoEm = Date.now();
      }
      return { id: f.id, ...copia };
    });
    await gravarVarios('frs', registros);
    return alvo.length;
  }

  const avisoCadeia = n => (n ? `Correção salva. O km de saída também foi corrigido em ${n === 1 ? 'uma FR em aberto' : n + ' FRs em aberto'} deste veículo.` : 'Correção salva');

  async function excluirFr(id) {
    await apagar('frs', id);
  }

  async function receberPapel(fr, dados, veiculo, por) {
    const x = Object.assign({}, fr, dados);
    const alvo = await lerTudo('frs', fr.id);
    if (alvo) {
      Object.assign(alvo, dados, { status: 'fechada', recebidaEm: Date.now(), recebidaPor: por, atualizadoEm: Date.now() });
      await gravarVarios('frs', [alvo]);
    }
    const m = window.FR.medidor(x);
    const km = m.ler(x.retorno_km);
    if (veiculo && km != null && (veiculo.ultimoKm == null || km >= veiculo.ultimoKm)) {
      const v = await lerTudo('veiculos', veiculo.id);
      if (v) {
        Object.assign(v, estadoVeiculo(x, false));
        await gravarVarios('veiculos', [v]);
      }
    }
    return avisoCadeia(await corrigirKmEmCadeia(null, Object.assign({}, x, { status: 'fechada' }), fr, por).catch(() => 0));
  }

  function reabrirFrChefe(id) {
    return lerTudo('frs', id).then(f => {
      if (!f) return;
      f.status = 'aberta';
      f.reabertaEm = Date.now();
      f.atualizadoEm = Date.now();
      return gravarVarios('frs', [f]);
    });
  }

  function cancelarFrChefe(f, por) {
    const id = f.id;
    if (f.status === 'preparada') return apagar('frs', id);
    return lerTudo('frs', id).then(alvo => {
      if (!alvo) return;
      alvo.status = 'cancelada';
      alvo.canceladaPor = por;
      alvo.atualizadoEm = Date.now();
      return gravarVarios('frs', [alvo]);
    });
  }

  function fecharAntigas(lista) {
    if (!lista.length) return Promise.resolve();
    const registros = lista.map(f => {
      const c = Object.assign({}, f);
      c.status = 'fechada';
      c.fechadaAuto = true;
      c.fechadaAutoEm = Date.now();
      c.atualizadoEm = Date.now();
      return { id: f.id, ...c };
    });
    return gravarVarios('frs', registros);
  }

  async function limparAntigas(base) {
    const limite = Date.now() - 31 * 86400000;
    const frs = await lerTudo('frs');
    const canceladas = frs.filter(f => f.status === 'cancelada').slice(0, 300);
    const velhas = frs.filter(f => f.status === 'fechada' && (f.criadoEm || 0) < limite)
      .slice(0, 300).concat(canceladas);
    for (let i = 0; i < velhas.length; i += 400) {
      const lote = velhas.slice(i, i + 400);
      const d2 = await dbAberto();
      const tx = d2.transaction('frs', 'readwrite');
      const lojaFr = tx.objectStore('frs');
      lote.forEach(f => lojaFr.delete(f.id));
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    return velhas.length;
  }

  // ---------- locais (lista compartilhada) ----------
  const paraLista = itens => Object.entries(itens || {}).map(([chave, l]) => ({ chave, texto: l.texto, n: l.n || 0 }));

  function observarLocais(cb) {
    lerTudo('locais').then(lista => cb(paraLista(Object.fromEntries(lista.map(l => [l.chave, l])))));
    return () => {};
  }

  function registrarLocal(texto, chave, rgf, existente) {
    // Se existente, soma no n; caso contrário, cria novo
    return lerTudo('locais', chave).then(atual => {
      const n = atual ? (atual.n || 0) + 1 : 1;
      const registro = {
        chave,
        texto: existente && atual ? atual.texto : texto,
        n,
        porRgf: rgf,
        atualizadoEm: Date.now(),
      };
      return gravarVarios('locais', [registro]);
    });
  }

  async function chavesLocaisNoServidor() {
    const locais = await lerTudo('locais');
    return locais.map(l => l.chave);
  }

  async function minhasFrs() {
    const u = await usuario();
    const frs = await lerTudo('frs');
    return frs.filter(f => f.uid === u.uid)
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      .slice(0, 30);
  }

  // ---------- ADM (mantém a interface, sem servidor) ----------
  async function entrarAdm(email, senha) {
    throw new Error('Área do ADM removida na versão offline');
  }

  async function sairAdm() { /* nada */ }

  async function souAdm() { return false; }

  const adm = {
    observarFuncionarios(cb) {
      lerTudo('funcionarios').then(cb);
      return () => {};
    },
    marcarVisto: rgf => {
      return lerTudo('funcionarios', rgf).then(d => {
        if (d) { d.visto = true; return gravarVarios('funcionarios', [d]); }
      });
    },
    liberarPedido: f => lerTudo('funcionarios', f.rgf).then(d => {
      if (!d) return;
      d.uid = f.pedidoUid;
      d.vinculadoEm = Date.now();
      d.visto = true;
      d.pedidoUid = null; d.pedidoEm = null; d.pedidoMotivo = null;
      return gravarVarios('funcionarios', [d]);
    }),
    recusarPedido: rgf => lerTudo('funcionarios', rgf).then(d => {
      if (!d) return;
      d.pedidoUid = null; d.pedidoEm = null; d.pedidoMotivo = null;
      return gravarVarios('funcionarios', [d]);
    }),
    desvincular: rgf => lerTudo('funcionarios', rgf).then(d => {
      if (!d) return;
      d.uid = null; d.pedidoUid = null; d.pedidoEm = null; d.pedidoMotivo = null;
      return gravarVarios('funcionarios', [d]);
    }),
    excluirFuncionario: rgf => apagar('funcionarios', rgf),
    aprovar: rgf => lerTudo('funcionarios', rgf).then(d => {
      if (!d) return;
      d.aprovado = true; d.visto = true;
      return gravarVarios('funcionarios', [d]);
    }),
    async salvarFuncionario({ rgf, nome, cargo, papel }) {
      const ref = await lerTudo('funcionarios', rgf);
      const dados = { rgf, nome, cargo, papel: papel || '', atualizadoEm: Date.now() };
      if (ref) return gravarVarios('funcionarios', [{ rgf, ...dados }]);
      return gravarVarios('funcionarios', [{
        rgf, nome, cargo, papel: papel || '', uid: null, aprovado: true,
        visto: true, criadoEm: Date.now(), atualizadoEm: Date.now(),
      }]);
    },
    observarVeiculos(cb) {
      observarVeiculos(cb);
      return () => {};
    },
    salvarVeiculo(v) {
      const { id, ...dados } = v;
      const ref = id ? lerTudo('veiculos', id) : Promise.resolve(null);
      return ref.then(existente => {
        const dadosCompleto = Object.assign(dados, { atualizadoEm: Date.now() });
        if (existente) return gravarVarios('veiculos', [{ id, ...dadosCompleto }]);
        const novoIdVeiculo = id || 'veic_' + Date.now().toString(36);
        return gravarVarios('veiculos', [{ id: novoIdVeiculo, ...dadosCompleto }]);
      });
    },
    excluirVeiculo: id => apagar('veiculos', id),
    excluirFr: id => apagar('frs', id),
    trocarFuncionario: (id, f) => lerTudo('frs', id).then(alvo => {
      if (!alvo) return;
      alvo.rgf = f.rgf;
      alvo.condutor = f.nome || '';
      alvo.cargo = f.cargo || '';
      alvo.atualizadoEm = Date.now();
      return gravarVarios('frs', [alvo]);
    }),
    observarLocais(cb) {
      observarLocais(cb);
      return () => {};
    },
    renomearLocal: (l, texto, chave, usoDoCerto) => lerTudo('locais', l.chave).then(atual => {
      if (!atual) return;
      const item = { texto, n: (atual.n || 0) + (usoDoCerto || 0) };
      if (chave === l.chave) return gravarVarios('locais', [{ chave, ...item, porRgf: atual.porRgf, atualizadoEm: Date.now() }]);
      return apagar('locais', l.chave).then(() => gravarVarios('locais', [{
        chave, ...item, porRgf: atual.porRgf, atualizadoEm: Date.now(),
      }]));
    }),
    excluirLocal: l => apagar('locais', l.chave),
    async salvarFrAdm(fr, antes) {
      const dados = semControle(fr);
      delete dados.rgf;
      dados.editadoPor = 'O ADM';
      dados.editadoAdmEm = Date.now();
      dados.atualizadoEm = Date.now();
      await gravarVarios('frs', [{ id: fr.id, ...dados }]);
      if (fr.veiculoId && fr.status === 'fechada') {
        const v = await lerTudo('veiculos', fr.veiculoId);
        if (v && kmMaisNovo(fr, Object.assign({ id: v.id }, v))) {
          Object.assign(v, estadoVeiculo(fr, false));
          await gravarVarios('veiculos', [v]);
        }
      }
      const n = await corrigirKmEmCadeia(null, fr, antes, 'O ADM').catch(e => {
        console.warn('[adm] km em cadeia', e.code || e);
        return 0;
      });
      return avisoCadeia(n);
    },
    reabrirFr: id => reabrirFrChefe(id),
    compartilharFr: (id, lista) => lerTudo('frs', id).then(alvo => {
      if (!alvo) return;
      alvo.compartilhadoUids = lista.map(c => c.uid);
      alvo.compartilhadoCom = lista;
      alvo.atualizadoEm = Date.now();
      return gravarVarios('frs', [alvo]);
    }),
    darBaixaDefeito: (id, lista) => lerTudo('veiculos', id).then(v => {
      if (!v) return;
      v.defeitosAbertos = lista;
      return gravarVarios('veiculos', [v]);
    }),
    async frs() {
      const frs = await lerTudo('frs');
      return frs.sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 100);
    },
    observarFrsAtivas(cb) {
      lerTudo('frs').then(frs =>
        cb(frs.filter(f => f.status === 'aberta' || f.status === 'preparada')));
      return () => {};
    },
    limparAntigas: () => limparAntigas(),
  };

  window.FrDb = {
    usuario, consultarRgf, vincularRgf, pedirLiberacao, observarRgf,
    observarVeiculos, salvarFr, minhasFrs,
    observarLocais, registrarLocal, chavesLocaisNoServidor,
    frAbertaDoRgf, assumirFr, observarFr, observarCompartilhadas, salvarItinerario, sairDaFr, colega,
    observarPreparadas, passarFr, marcarImpressas, frsDoRgf, salvarFrFuncionario,
    registrarChefe, deixarChefe, observarEquipe, observarPainel, frsAnteriores, criarFrPreparada, salvarFrChefe,
    cancelarFrChefe, excluirFr, receberPapel, reabrirFrChefe, fecharAntigas, limparAntigas, SO_BANCO,
    entrarAdm, sairAdm, souAdm, adm,
    novoId: () => 'fr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
  };
})(window);
