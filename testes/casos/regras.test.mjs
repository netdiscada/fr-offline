import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-fr',
  firestore: { rules: readFileSync(process.argv[2], 'utf8'), host: '127.0.0.1', port: 8086 },
});
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'admins/adm'), {});
  await setDoc(doc(db, 'funcionarios/100'), { rgf: '100', nome: 'Antonio', uid: 'celA2', aprovado: true }); // Antônio trocou de celular
  await setDoc(doc(db, 'funcionarios/200'), { rgf: '200', nome: 'Bruno', uid: 'celB', aprovado: true });
  await setDoc(doc(db, 'funcionarios/300'), { rgf: '300', nome: 'Fernando', uid: 'celF', aprovado: true });
  await setDoc(doc(db, 'veiculos/v1'), { placa: 'AAA-1111', ultimoKm: 1000 });
  await setDoc(doc(db, 'veiculos/v2'), { placa: 'BBB-2222', ultimoKm: 5000 });
  await setDoc(doc(db, 'frs/frF'), { rgf: '300', uid: 'celF', status: 'aberta', veiculoId: 'v1', itinerario: [] });
  await setDoc(doc(db, 'frs/fr1'), { rgf: '100', uid: 'celA1', status: 'aberta', itinerario: [], compartilhadoUids: ['celB'], compartilhadoCom: [{ uid: 'celB', rgf: '200', nome: 'Bruno' }] });
});
const db = uid => env.authenticatedContext(uid).firestore();
const r = async (nome, p) => { try { await p; console.log('OK  ', nome); } catch (e) { console.log('FALHA', nome, e.message.slice(0, 120)); process.exitCode = 1; } };

const A2 = db('celA2'), B = db('celB'), F = db('celF'), A1 = db('celA1');
await r('celular novo do Antônio acha a FR aberta do RGF', assertSucceeds(getDocs(query(collection(A2, 'frs'), where('rgf', '==', '100'), where('status', '==', 'aberta')))));
await r('Fernando NÃO lista FRs do RGF do Antônio', assertFails(getDocs(query(collection(F, 'frs'), where('rgf', '==', '100'), where('status', '==', 'aberta')))));
await r('Bruno lista FRs compartilhadas com ele', assertSucceeds(getDocs(query(collection(B, 'frs'), where('compartilhadoUids', 'array-contains', 'celB')))));
await r('Fernando NÃO lista compartilhadas do Bruno', assertFails(getDocs(query(collection(F, 'frs'), where('compartilhadoUids', 'array-contains', 'celB')))));
await r('Bruno registra parada', assertSucceeds(updateDoc(doc(B, 'frs/fr1'), { itinerario: [{ local: 'X' }] })));
await r('Bruno NÃO muda o km de partida', assertFails(updateDoc(doc(B, 'frs/fr1'), { partida_km: '1' })));
await r('Bruno NÃO vira dono', assertFails(updateDoc(doc(B, 'frs/fr1'), { uid: 'celB' })));
await r('Fernando NÃO registra parada', assertFails(updateDoc(doc(F, 'frs/fr1'), { itinerario: [] })));
await r('celular velho do Antônio (perdeu o RGF) NÃO grava', assertFails(updateDoc(doc(A1, 'frs/fr1'), { descricao: 'x' })));
await r('Fernando NÃO assume a FR do Antônio', assertFails(updateDoc(doc(F, 'frs/fr1'), { uid: 'celF' })));
await r('celular novo do Antônio assume a FR', assertSucceeds(updateDoc(doc(A2, 'frs/fr1'), { uid: 'celA2' })));
await r('Antônio (dono) grava a FR', assertSucceeds(setDoc(doc(A2, 'frs/fr1'), { descricao: 'serviço' }, { merge: true })));
await r('Antônio NÃO passa a FR para o RGF do Fernando', assertFails(setDoc(doc(A2, 'frs/fr1'), { rgf: '300' }, { merge: true })));
await r('Bruno devolve o carro', assertSucceeds(updateDoc(doc(B, 'frs/fr1'), { compartilhadoUids: [], compartilhadoCom: [] })));
await r('Bruno não registra mais depois de devolver', assertFails(updateDoc(doc(B, 'frs/fr1'), { itinerario: [] })));
await r('ADM troca o funcionário da FR', assertSucceeds(updateDoc(doc(db('adm'), 'frs/fr1'), { rgf: '300', condutor: 'Fernando' })));
// Auditoria (firebase-security-rules-auditor): veículo, tamanhos e tipos
const { writeBatch } = await import('firebase/firestore');
const estado = (fr, km) => ({ ultimoKm: km, ultimaFrId: fr, ultimoRgf: '300', ultimoCondutor: 'Fernando', ultimoCombustivel: '1/2' });
await r('Fernando encerra a FR dele e atualiza o veículo dela (mesma operação)', (async () => {
  const b = writeBatch(F); b.set(doc(F, 'frs/frF'), { status: 'fechada', retorno_km: '1050' }, { merge: true }); b.update(doc(F, 'veiculos/v1'), estado('frF', 1050));
  await assertSucceeds(b.commit());
})());
await r('Fernando NÃO muda o km de um veículo que não é o da FR dele', assertFails(updateDoc(doc(F, 'veiculos/v2'), estado('frF', 1))));
await r('Fernando NÃO usa a FR de outro RGF para mexer no veículo', assertFails(updateDoc(doc(F, 'veiculos/v1'), Object.assign(estado('fr1', 2000), { ultimoRgf: '100' }))));
await r('Km do veículo NÃO pode virar texto', assertFails(updateDoc(doc(F, 'veiculos/v1'), estado('frF', 'mil'))));
await r('Auto-cadastro NÃO aceita nome gigante', assertFails(setDoc(doc(db('celX'), 'funcionarios/777'), { rgf: '777', nome: 'x'.repeat(500), cargo: 'a', uid: 'celX', aprovado: false, visto: false })));
await r('Auto-cadastro com nome normal funciona', assertSucceeds(setDoc(doc(db('celX'), 'funcionarios/777'), { rgf: '777', nome: 'Maria da Silva', cargo: 'ASG', uid: 'celX', aprovado: false, visto: false })));
await r('Pedido de troca NÃO aceita motivo gigante', assertFails(updateDoc(doc(db('celY'), 'funcionarios/777'), { pedidoUid: 'celY', pedidoEm: 1, pedidoMotivo: 'y'.repeat(500) })));
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'funcionarios/888'), { rgf: '888', nome: 'Livre', cargo: 'ASG', uid: null, aprovado: true, visto: true }); });
await r('Celular assume um RGF livre gravando os campos de pedido vazios (null)', assertSucceeds(updateDoc(doc(db('celZ'), 'funcionarios/888'), { uid: 'celZ', vinculadoEm: 1, visto: false, pedidoUid: null, pedidoEm: null, pedidoMotivo: null })));
await r('FR NÃO aceita itinerário com 30 paradas', assertFails(setDoc(doc(F, 'frs/frF'), { itinerario: Array.from({ length: 30 }, () => ({ local: 'x' })) }, { merge: true })));
await r('FR aceita itinerário com 16 paradas', assertSucceeds(setDoc(doc(F, 'frs/frF'), { itinerario: Array.from({ length: 16 }, () => ({ local: 'x' })) }, { merge: true })));
const L = u => doc(db(u), 'listas/locais');
const novo = (k, t, rgf) => ({ itens: { [k]: { texto: t, n: 1 } }, ultimaChave: k, porRgf: rgf });
await r('Bruno cria a lista com o primeiro local', assertSucceeds(setDoc(L('celB'), novo('QUATINGA', 'Quatinga', '200'), { merge: true })));
await r('Bruno adiciona outro local', assertSucceeds(setDoc(L('celB'), novo('DIVISA', 'Divisa', '200'), { merge: true })));
await r('Bruno NÃO adiciona em nome de outro RGF', assertFails(setDoc(L('celB'), novo('X', 'X', '300'), { merge: true })));
await r('Bruno NÃO cria local com uso inflado', assertFails(setDoc(L('celB'), { itens: { Y: { texto: 'Y', n: 50 } }, ultimaChave: 'Y', porRgf: '200' }, { merge: true })));
await r('Bruno soma 1 no uso', assertSucceeds(setDoc(L('celB'), { itens: { QUATINGA: { n: 2 } }, ultimaChave: 'QUATINGA', porRgf: '200' }, { merge: true })));
await r('Bruno NÃO soma 10', assertFails(setDoc(L('celB'), { itens: { QUATINGA: { n: 12 } }, ultimaChave: 'QUATINGA', porRgf: '200' }, { merge: true })));
await r('Bruno NÃO mexe em outro local escondido', assertFails(setDoc(L('celB'), { itens: { QUATINGA: { n: 3 }, DIVISA: { n: 9 } }, ultimaChave: 'QUATINGA', porRgf: '200' }, { merge: true })));
await r('Bruno NÃO renomeia', assertFails(setDoc(L('celB'), { itens: { QUATINGA: { texto: 'Bobagem', n: 3 } }, ultimaChave: 'QUATINGA', porRgf: '200' }, { merge: true })));
await r('Bruno NÃO apaga', assertFails(deleteDoc(L('celB'))));
await r('Qualquer celular logado lê os locais', assertSucceeds(getDoc(L('qualquer'))));
await r('ADM corrige nome', assertSucceeds(updateDoc(L('adm'), { 'itens.QUATINGA': { texto: 'Quatinga', n: 2 } })));
await env.cleanup();
