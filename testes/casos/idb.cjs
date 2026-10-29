// Helper: ler tudo de uma loja IndexedDB no contexto da página (Playwright)
// Uso: const funcionarios = await page.evaluate(lerLoja('funcionarios'));
function lerLoja(nome) {
  return async () => {
    const db = await new Promise((ok, erro) => {
      const req = indexedDB.open('fr-offline', 1);
      req.onerror = () => erro(req.error);
      req.onsuccess = () => ok(req.result);
    });
    const tx = db.transaction(nome, 'readonly');
    const lista = await new Promise((ok, erro) => {
      const r = tx.objectStore(nome).getAll();
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
    db.close();
    return lista;
  };
}

module.exports = { lerLoja };
