process.env.TZ = 'America/Argentina/Buenos_Aires';

const path = require('path');
const fs = require('fs');

function makeEl(id){
  const e = {
    id, value:'', textContent:'', title:'',
    style:{}, dataset:{}, _class:new Set(),
    children:[], childNodes:[], _handlers:{},
    appendChild(c){ e.children.push(c); e.childNodes.push(c); c.parentNode=e; return c; },
    addEventListener(ev,fn){ (e._handlers[ev]=e._handlers[ev]||[]).push(fn); },
    _fire(ev,arg){ (e._handlers[ev]||[]).forEach(fn=>fn.call(e,arg)); },
    offsetWidth:0,
    scrollIntoView(){},
    click(){},
    remove(){},
    _els:[],
    querySelectorAll(){ return e._els; },
    pushEl(child){ e._els.push(child); child._host=e; return child; },
    parentNode:null
  };
  let _html = '';
  Object.defineProperty(e, 'innerHTML', {
    get(){ return _html; },
    set(v){ _html = String(v); e.children = []; e.childNodes = []; }
  });
  e.classList = {
    add:(c)=>{ e._class.add(c); },
    remove:(c)=>{ e._class.delete(c); },
    toggle:(c,f)=>{ if(f===undefined){ e._class.has(c)?e._class.delete(c):e._class.add(c); } else { f?e._class.add(c):e._class.delete(c); } },
    contains:(c)=>{ return e._class.has(c); }
  };
  e.className='';
  return e;
}

const els = {};
const getElementById = (id) => { if(!els[id]) els[id]=makeEl(id); return els[id]; };
const createElement = (tag) => makeEl(tag);

global.document = { getElementById, createElement };

const store = new Map();
global.window = {
  storage: {
    set:   async (k,v)=>{ store.set(k,v); return { key:k, value:v }; },
    get:   async (k)=> store.has(k) ? { key:k, value:store.get(k) } : null,
    delete:async (k)=>{ store.delete(k); return { key:k, deleted:true }; },
    list:  async (prefix)=> ({ keys: [...store.keys()].filter(k=>k.startsWith(prefix)) })
  }
};

let lastParts = null;
global.Blob = class { constructor(parts){ lastParts = String(parts ? parts.join('') : ''); } };
URL.createObjectURL = () => 'blob:fake';

(function(){
  const seg = document.getElementById('periodoComparar');
  ['3','6','9','12','todo','pers'].forEach(p=>{ const b=makeEl('btn-'+p); b.dataset.p=p; seg.pushEl(b); });
  const th = document.getElementById('periodoToggle');
  ['semanal','quincenal','mensual'].forEach(p=>{ const b=makeEl('pt-'+p); b.dataset.p=p; th.pushEl(b); });
})();
document.body = makeEl('body');

const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
(0, eval)(code);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, fail = 0;
function check(name, cond, extra){
  if(cond){ ok++; console.log('[OK]   ' + name + (extra ? '  -> ' + extra : '')); }
  else    { fail++; console.log('[FAIL] ' + name + (extra ? '  -> ' + extra : '')); }
}

function parseCsv(text){
  text = text.replace(/^\uFEFF/, '');
  if(text.endsWith('\r\n')) text = text.slice(0, -2);
  const rows = [];
  for(const line of text.split('\r\n')){
    if(line === '') continue;
    const fields = []; let cur = '', q = false;
    for(let i=0;i<line.length;i++){
      const c = line[i];
      if(q){
        if(c === '"'){ if(line[i+1] === '"'){ cur += '"'; i++; } else q = false; }
        else cur += c;
      } else {
        if(c === '"') q = true;
        else if(c === ';'){ fields.push(cur); cur = ''; }
        else cur += c;
      }
    }
    fields.push(cur); rows.push(fields);
  }
  return rows;
}
function numEs(s){ return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
function r2(n){ return Math.round(n * 100) / 100; }

(async () => {

  // ---------------- 0) checks unitarios ----------
  console.log('--- checks unitarios ---');
  check('numCsv(1234567.5) es-AR', numCsv(1234567.5) === '1.234.567,5', JSON.stringify(numCsv(1234567.5)));
  check('numCsv(100) es-AR',       numCsv(100) === '100', JSON.stringify(numCsv(100)));
  check('numCsv(1289.999) cae a 2 dec', numCsv(1289.999) === '1.289,99' || numCsv(1289.999) === '1.290', JSON.stringify(numCsv(1289.999)));
  const undefRet = (()=>{ try{ return numCsv(undefined); }catch(e){ return 'THROWS'; } })();
  check('numCsv(undefined) lanza TypeError (la export ahora nunca lo recibe)', undefRet === 'THROWS', undefRet === 'THROWS' ? 'TypeError, evitado por el guard en exportarHistorial' : 'devuelve ' + undefRet);
  check('redondear2(7.86199)=7.86', redondear2(7.86199) === 7.86);
  const diffCheck = (1.042/1.058 - 1)*100;
  check('diffRealDe(aumento 4.2 / inflacion 5.8)', Math.abs(diffRealDe({aumento:4.2, inflacion:5.8}) - diffCheck) < 1e-9, String(diffRealDe({aumento:4.2, inflacion:5.8})));

  // ---------------- 1) entrada vieja sembrada en storage ----------
  store.set('calculo-1700000000000', JSON.stringify({
    ts: 1700000000000,
    mesVigente: '2026-03',
    viejo: 1000000, nuevo: 1042000,
    aumento: 4.2, inflacion: 3.4, diff: 0.77
  }));

  // ---------------- 2) pipeline: calcular -> guardar -> exportar ----------
  console.log('--- pipeline real ---');
  els['viejo'] = getElementById('viejo'); els['viejo'].value = '1.036.390';
  els['nuevo'] = getElementById('nuevo'); els['nuevo'].value = '1.117.862';
  els['mes'] = getElementById('mes'); els['mes'].value = '2026-08';
  calcular();
  const statusCalc = els['status'].textContent;
  check('calcular() genera resultado', els['result']._class.has('show'), 'status="' + statusCalc + '"');

  await guardarCalculo();
  check('guardarCalculo guarda una clave', store.size >= 2, 'claves=' + store.size);

  lastParts = null;
  exportarHistorial();
  await sleep(80);
  const csv = lastParts;
  check('exportarHistorial genero Blob', csv !== null && csv.length > 0, csv === null ? 'Blob null' : 'bytes=' + (csv.length * 2));

  console.log('--- contenido CSV crudo ---');
  console.log(JSON.stringify(csv));

  const rows = parseCsv(csv);
  check('existe BOM', csv.charCodeAt(0) === 0xFEFF);
  check('usa CRLF', !csv.replace(/^\uFEFF/,'').includes('\n') === false ? true : csv.includes('\r\n'));
  check('hay ' + (rows.length) + ' filas (header datos)', rows.length === 3, 'rows=' + rows.length);
  check('header con 11 columnas', rows[0].length === 11, JSON.stringify(rows[0]));
  check('header exacto', rows[0].join(',') === 'fecha_carga,mes_vigente,sueldo_anterior,sueldo_nuevo,aumento_nominal_pct,inflacion_acum_pct,diferencia_real_pct,sueldo_anterior_2,sueldo_nuevo_2,aumento_nominal_pct_2,diferencia_real_pct_2');

  check('fecha_carga formato ISO', /^\d{4}-\d{2}-\d{2}$/.test(rows[1][0]), rows[1][0]);
  check('mes_vigente legible (ISO)', rows[1][1] === '2026-03', rows[1][1]);
  check('fila vieja: sueldo_anterior=1.000.000', rows[1][2] === '1.000.000', rows[1][2]);
  check('fila vieja: sueldo_nuevo=1.042.000', rows[1][3] === '1.042.000', rows[1][3]);
  check('fila vieja: aumento=4,2%', rows[1][4] === '4,2%', rows[1][4]);
  check('fila vieja: inflacion=3,4% (es-AR decimal coma)', rows[1][5] === '3,4%', rows[1][5]);
  const expDiffVieja = r2(((1+4.2/100)/(1+3.4/100)-1)*100);
  check('fila vieja: diferencia real=' + expDiffVieja.toFixed(2) + '%', numEs(rows[1][6].replace('%','')) === expDiffVieja, rows[1][6]);

  const a = (1117862/1036390 - 1) * 100;
  const i = 1.66; // IPC incrustado ago/26
  const d = ((1 + a/100)/(1 + i/100) - 1) * 100;
  check('pipeline: aumento nominal=' + r2(a).toFixed(2) + '%', numEs(rows[2][4].replace('%','')) === r2(a), rows[2][4]);
  check('pipeline: inflacion acum=' + i.toFixed(2) + '%', numEs(rows[2][5].replace('%','')) === i, rows[2][5]);
  check('pipeline: diferencia real=' + r2(d).toFixed(2) + '%', numEs(rows[2][6].replace('%','')) === r2(d), rows[2][6]);
  check('pipeline: sueldos con miles', numEs(rows[2][2]) === 1036390 && numEs(rows[2][3]) === 1117862, rows[2][2] + ' ; ' + rows[2][3]);
  check('orden cronologico ascendente', rows[1][0] <= rows[2][0], rows[1][0] + ' <= ' + rows[2][0]);

  const haySaltos = !csv.replace(/^\uFEFF/,'').split('\r\n').some(l => l.includes('\n'));
  check('sin saltos de linea sueltos unicos (solo CRLF)', haySaltos);

  // ---------------- 3) entrada corrupta/legacy (sin aumento/inflacion/diff) ----------
  console.log('--- entrada legacy incompleta (debe saltarse) ---');
  store.set('calculo-1700000000001', JSON.stringify({ ts: 1700000000001, mesVigente: '2026-02', viejo: 999, nuevo: 1010 }));
  lastParts = null;
  exportarHistorial();
  await sleep(80);
  const statusExp = els['statusExport'].textContent;
  check('entrada incompleta se saltea del export', !parseCsv(lastParts).some(r => r[1] === '2026-02'), statusExp);
  check('mensaje cuenta solo filas validas (2)', statusExp === 'Exportado: 2 entradas.', statusExp);
  check('ningun valor NaN% en el CSV', !/NaN/.test(String(lastParts)), '');

  // entrada "media": aumento + diff, sin inflacion -> se exporta con celda vacia
  store.set('calculo-1700000000002', JSON.stringify({ ts: 1700000000002, mesVigente: '2026-01', viejo: 5000, nuevo: 5200, aumento: 4, diff: 3 }));
  lastParts = null;
  exportarHistorial();
  await sleep(80);
  const filaHalf = parseCsv(lastParts).find(r => r[1] === '2026-01');
  check('entrada con diff pero sin inflacion: fila exportada, inflacion vacia', filaHalf && filaHalf[4] === '4%' && filaHalf[5] === '' && filaHalf[6] === '3%', filaHalf ? filaHalf.join(';') : 'sin fila');

  // ---------------- 4) zona horaria en fecha_carga ----------
  const tsTarde = new Date('2026-09-23T22:30:00-03:00').getTime();
  store.set('calculo-' + tsTarde, JSON.stringify({ ts: tsTarde, mesVigente:'2026-08', viejo: 100, nuevo: 110, aumento: 10, inflacion: 1.66, diff: 8.2 }));
  lastParts = null;
  exportarHistorial();
  await sleep(80);
  const filaTarde = parseCsv(lastParts).filter(r => r[1] === '2026-08' && r[2] === '100')[0];
  check('fecha_carga usa dia LOCAL: 22:30 -03:00 ARG queda en 2026-09-23', filaTarde && filaTarde[0] === '2026-09-23', filaTarde ? filaTarde[0] : 'sin fila');

  // ---------------- 5) segundo trabajo: celdas 7-10 en CSV ----------
  console.log('--- segundo trabajo en CSV ---');
  const a2 = (480000/400000 - 1) * 100;
  const d2 = ((1 + a2/100)/(1 + 1.66/100) - 1) * 100;
  store.set('calculo-1700000000003', JSON.stringify({
    ts: 1700000000003, mesVigente: '2026-08',
    viejo: 1036390, nuevo: 1117862, aumento: 7.86, inflacion: 1.66, diff: 6.1,
    viejo2: 400000, nuevo2: 480000, aumento2: a2, inflacion2: 1.66, diff2: d2
  }));
  lastParts = null;
  exportarHistorial();
  await sleep(80);
  const fila2 = parseCsv(lastParts).filter(r => r[1] === '2026-08' && r[2] === '1.036.390')[0];
  check('segundo trabajo: fila con 11 celdas', fila2 && fila2.length === 11, fila2 ? 'celdas=' + fila2.length : 'sin fila');
  check('segundo trabajo: sueldo_anterior_2=400.000', fila2 && fila2[7] === '400.000', fila2 ? fila2[7] : '');
  check('segundo trabajo: sueldo_nuevo_2=480.000', fila2 && fila2[8] === '480.000', fila2 ? fila2[8] : '');
  check('segundo trabajo: aumento_nominal_pct_2=' + r2(a2).toFixed(2) + '%', fila2 && numEs(fila2[9].replace('%','')) === r2(a2), fila2 ? fila2[9] : '');
  check('segundo trabajo: diferencia_real_pct_2=' + r2(d2).toFixed(2) + '%', fila2 && numEs(fila2[10].replace('%','')) === r2(d2), fila2 ? fila2[10] : '');
  const filaSin2 = parseCsv(lastParts).find(r => r[1] === '2026-03');
  check('sin segundo trabajo: celdas 7-10 vacias', filaSin2 && filaSin2[7] === '' && filaSin2[8] === '' && filaSin2[9] === '' && filaSin2[10] === '', filaSin2 ? filaSin2.join(';') : 'sin fila');

  console.log('--- resumen ---');
  console.log('OK=' + ok + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();