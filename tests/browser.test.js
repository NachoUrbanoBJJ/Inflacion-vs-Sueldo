const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT_DIR = path.join(os.tmpdir(), 'ticket-inflacion-tests');
fs.mkdirSync(OUT_DIR, { recursive: true });

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
      if(q){ if(c === '"'){ if(line[i+1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
      else { if(c === '"') q = true; else if(c === ';'){ fields.push(cur); cur = ''; } else cur += c; }
    }
    fields.push(cur); rows.push(fields);
  }
  return rows;
}
function numEs(s){ return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
function r2(n){ return Math.round(n * 100) / 100; }

(async () => {
  let browser;
  for(const channel of ['msedge', 'chrome']){
    try{
      browser = await chromium.launch({ channel, headless: true });
      console.log('usando canal: ' + channel);
      break;
    }catch(e){ console.log('canal ' + channel + ' no disponible');
      if(channel === 'chrome'){ fail++; console.log('[FAIL] no se pudo lanzar ningun navegador'); process.exit(1); }
    }
  }

  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  console.log('=== CARGA ===');
  await page.goto(APP_URL);
  await page.waitForSelector('#calcBtn', { timeout: 15000 });
  check('pagina carga sin errores JS de bloqueo', true, 'url=' + page.url());

  console.log('=== REGRESIÓN BUG 2: entradas rotas en localStorage antes de cargar ===');
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageB = await ctxB.newPage();
  const errsB = [];
  pageB.on('pageerror', e => errsB.push(e.message));
  await pageB.goto(APP_URL);
  await pageB.evaluate(() => {
    localStorage.setItem('calculo-basura-1', JSON.stringify({ ts: 1700000000100, viejo: 1, nuevo: 2 }));            // sin mesVigente ni pct
    localStorage.setItem('calculo-basura-2', JSON.stringify({ ts: 1700000000200, mesVigente: 'x', viejo: 1, nuevo: 3, diff: 'no' })); // mes raro + diff no numérico
  });
  await pageB.reload();
  await pageB.waitForSelector('#calcBtn', { timeout: 15000 });
  const histOk = await pageB.evaluate(() => ({
    items: document.querySelectorAll('#histList .hist-item').length,
    ganados: document.getElementById('aggGanados').textContent,
    perdidos: document.getElementById('aggPerdidos').textContent
  }));
  check('init no rompe con entradas rotas: 0 items renderizados, agg=0/0', histOk.items === 0 && histOk.ganados === '0' && histOk.perdidos === '0', JSON.stringify(histOk));
  check('init no rompe: sin pageerror', errsB.length === 0, errsB.join(' | ') || 'limpio');
  await ctxB.close();

  console.log('=== CALCULO 1 (ago/26) + GUARDAR ===');
  await page.fill('#viejo', '1036390');
  await page.fill('#nuevo', '1117862');
  await page.fill('#mes', '2026-08');
  await page.click('#calcBtn');
  await page.waitForSelector('#result.show', { timeout: 5000 });
  check('resultado 1 visible', await page.isVisible('#result'));
  const v1 = {
    aum: await page.textContent('#rAumento'),
    inf: await page.textContent('#rInflacion'),
    diff: await page.textContent('#rDiff')
  };
  console.log('   UI1 -> aumento=' + v1.aum + ' | inflacion=' + v1.inf + ' | diff=' + v1.diff);

  await page.locator('#guardarWrap button').filter({ hasText: 'Guardar en mi historial' }).click();
  await page.waitForFunction(() => {
    const t = document.getElementById('statusGuardar').textContent;
    return /Guardado/.test(t);
  }, null, { timeout: 5000 });
  check('guardado 1 confirmado', true, '"' + await page.textContent('#statusGuardar') + '"');

  console.log('=== CALCULO 2 (may/26) + GUARDAR ===');
  await page.fill('#viejo', '900000');
  await page.fill('#nuevo', '950000');
  await page.fill('#mes', '2026-05');
  await page.click('#calcBtn');
  await page.waitForSelector('#result.show', { timeout: 5000 });
  check('resultado 2 visible', await page.isVisible('#result'));
  const v2 = {
    aum: await page.textContent('#rAumento'),
    inf: await page.textContent('#rInflacion'),
    diff: await page.textContent('#rDiff')
  };
  console.log('   UI2 -> aumento=' + v2.aum + ' | inflacion=' + v2.inf + ' | diff=' + v2.diff);
  await page.locator('#guardarWrap button').filter({ hasText: 'Guardar en mi historial' }).click();
  await page.waitForFunction(() => /Guardado/.test(document.getElementById('statusGuardar').textContent), null, { timeout: 5000 });

  console.log('=== PERSISTENCIA (reload) ===');
  await page.reload();
  await page.waitForSelector('#calcBtn', { timeout: 15000 });
  const nKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('calculo-')).length);
  check('persistencia: 2 entradas en localStorage tras recargar', nKeys === 2, 'claves=' + nKeys);

  console.log('=== NOTA IZQUIERDA (inflación histórica + alquileres) ===');
  check('nota izquierda visible', await page.isVisible('#notaInflacion'));
  const fuenteTxt = await page.textContent('#fuenteStatus');
  check('fuenteStatus cargada (API o incrustada)', /INDEC|incrustados|Datos actualizados/.test(fuenteTxt), '"' + fuenteTxt + '"');
  const ipcAcumTxt = await page.textContent('#ipcAcum');
  check('ipcAcum con dato', ipcAcumTxt && ipcAcumTxt !== '—', '"' + ipcAcumTxt + '"');
  const nChips = await page.evaluate(() => document.querySelectorAll('#quickAcc .chip').length);
  check('quickAcc sin duplicar: 4 chips', nChips === 4, 'chips=' + nChips);
  const extraVent = await page.evaluate(() => ({
    botones: !!document.getElementById('periodoComparar'),
    linea: !!document.getElementById('rExtra'),
    pers: !!document.getElementById('persField')
  }));
  check('ventana extra 3/6/9/12M eliminada (era redundante y confusa)', !extraVent.botones && !extraVent.linea && !extraVent.pers, JSON.stringify(extraVent));
  check('bloque de alquileres dentro de la nota', await page.isVisible('#alqNote'));
  await page.waitForFunction(() => !/Cargando datos de alquileres/.test(document.getElementById('alqMeta').textContent), null, { timeout: 15000 });
  const alqTxt = await page.textContent('#alqMeta');
  if(/Sin conexi/.test(alqTxt)){
    check('alquileres: sin conexión (avisado)', true, '"' + alqTxt + '"');
  } else {
    const alqUlt = await page.textContent('#alqUltimo');
    const alq12 = await page.textContent('#alq12');
    check('alquileres: último mes con dato', /%/.test(alqUlt), '"' + alqUlt + '"');
    check('alquileres: 12M con dato', alq12 !== '—' && /%/.test(alq12), '"' + alq12 + '"');
  }
  const nNotas = await page.evaluate(() => document.querySelectorAll('.note-pin').length);
  check('no hay nota derecha duplicada (2º .note-pin es el de énfasis, total 2)', nNotas === 2, 'note-pin=' + nNotas);

  console.log('=== SEGUNDO TRABAJO ===');
  await page.click('#toggle2do');
  check('fields de 2º trabajo visibles tras toggle', await page.isVisible('#segTrabajo'));
  await page.fill('#viejo', '1036390');
  await page.fill('#nuevo', '1117862');
  await page.fill('#mes', '2026-08');
  await page.fill('#viejo2', '400000');
  await page.fill('#nuevo2', '480000');
  await page.click('#calcBtn');
  await page.waitForSelector('#rSep2', { state: 'visible', timeout: 5000 });
  check('rSep2 visible tras calcular', await page.isVisible('#rSep2'));
  const aumTxt = await page.textContent('#rAumentoT');
  const diffTxt = await page.textContent('#rDiffT');
  const inf2 = 1.66;
  const aumT = ((1117862 + 480000) / (1036390 + 400000) - 1) * 100;
  const diffT = ((1 + aumT / 100) / (1 + inf2 / 100) - 1) * 100;
  check('rAumentoT=' + r2(aumT).toFixed(1) + '%', /\+/.test(aumTxt) && Math.abs(parseFloat(aumTxt) - r2(aumT)) < 0.06, '"' + aumTxt + '"');
  check('rDiffT=' + r2(diffT).toFixed(1) + '%', /\+|-/.test(diffTxt) && Math.abs(parseFloat(diffTxt) - r2(diffT)) < 0.06, '"' + diffTxt + '"');
  check('nota de énfasis dentro del resultado visible', await page.isVisible('.note-pin.enfasis'));
  check('rTotSueldos muestra suma', /→/.test(await page.textContent('#rTotSueldos')), '"' + await page.textContent('#rTotSueldos') + '"');
  await page.click('#toggle2do');
  await page.waitForSelector('#rSep2', { state: 'hidden', timeout: 5000 });
  check('rSep2 oculto al quitar 2º trabajo', !(await page.isVisible('#rSep2')));

  console.log('=== EXPORT CSV ===');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.locator('button[onclick="exportarHistorial()"]').click()
  ]);
  check('nombre de archivo', download.suggestedFilename() === 'historial-aumentos.csv', download.suggestedFilename());
  const csvPath = path.join(OUT_DIR, download.suggestedFilename());
  await download.saveAs(csvPath);
  check('archivo guardado en disco', fs.existsSync(csvPath), csvPath);

  // ground truth = lo persistido (localStorage)
  const ref = await page.evaluate(() =>
    Object.entries(localStorage).filter(([k]) => k.startsWith('calculo-'))
      .map(([, v]) => JSON.parse(v)).sort((a, b) => a.ts - b.ts)
  );
  check('2 filas persistidas como referencia', ref.length === 2, 'refs=' + ref.length);

  const buf = fs.readFileSync(csvPath, 'utf8');
  console.log('   --- bytes del CSV descargado (' + buf.length + ' chars) ---');
  console.log(buf.split('\r\n').map(l => l.replace(/;/g, ' ; ')).join('\n    '));

  check('BOM presente', buf.charCodeAt(0) === 0xFEFF);
  check('usa CRLF', buf.includes('\r\n'));
  check('sin NaN/undefined en el CSV', !/NaN|undefined|null/.test(buf));

  const rows = parseCsv(buf);
  check('header exacto 11 cols', rows[0].join(',') === 'fecha_carga,mes_vigente,sueldo_anterior,sueldo_nuevo,aumento_nominal_pct,inflacion_acum_pct,diferencia_real_pct,sueldo_anterior_2,sueldo_nuevo_2,aumento_nominal_pct_2,diferencia_real_pct_2');
  check('2 filas de datos', rows.length === 3, 'filas=' + rows.length);

  // formato de fecha local (dentro del browser, no depender de TZ del proceso)
  const fechasLocal = ref.map(r => page.evaluate(ts => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }, r.ts));
  for(let i = 0; i < 2; i++){
    const r = rows[i + 1], d = ref[i];
    const fechaOk = await fechasLocal[i];
    const nombre = 'fila ' + (i + 1) + ' (mes ' + d.mesVigente + ')';
    check(nombre + ': fecha_carga local correcta', r[0] === fechaOk, r[0] + ' (esperado ' + fechaOk + ')');
    check(nombre + ': mes_vigente', r[1] === d.mesVigente, r[1]);
    check(nombre + ': sueldo_anterior', numEs(r[2]) === d.viejo, r[2]);
    check(nombre + ': sueldo_nuevo', numEs(r[3]) === d.nuevo, r[3]);
    check(nombre + ': aumento pct', numEs(r[4]) === r2(d.aumento), r[4]);
    const infEsp = typeof d.inflacion === 'number' && isFinite(d.inflacion) ? r2(d.inflacion) : null;
    check(nombre + ': inflacion pct', infEsp === null ? r[5] === '' : numEs(r[5]) === infEsp, '"' + r[5] + '"');
    const dif = (typeof d.aumento === 'number' && typeof d.inflacion === 'number')
      ? ((1 + d.aumento / 100) / (1 + d.inflacion / 100) - 1) * 100
      : d.diff;
    check(nombre + ': diferencia real pct', numEs(r[6]) === r2(dif), r[6]);
    check(nombre + ': celdas 2º trabajo vacías', r[7] === '' && r[8] === '' && r[9] === '' && r[10] === '', r[7] + ',' + r[8] + ',' + r[9] + ',' + r[10]);
  }
  const msj = await page.textContent('#statusExport');
  check('mensaje export: "Exportado: 2 entradas."', /Exportado: 2 entradas/.test(msj), '"' + msj + '"');

  console.log('=== ENTRADA CORRUPTA (debe saltearse) ===');
  await page.evaluate(() => {
    localStorage.setItem('calculo-corrupto-99', JSON.stringify({ ts: Date.now() - 1000, mesVigente: '2020-01', viejo: 3, nuevo: 4 }));
  });
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.locator('button[onclick="exportarHistorial()"]').click()
  ]);
  const csvPath2 = path.join(OUT_DIR, 'historial-corrupto.csv');
  await dl2.saveAs(csvPath2);
  const buf2 = fs.readFileSync(csvPath2, 'utf8');
  const rows2 = parseCsv(buf2);
  check('entrada corrupta NO aparece', !rows2.some(r => r[1] === '2020-01'));
  check('siguen siendo 2 filas validas', rows2.length === 3, 'filas=' + rows2.length);
  check('sin NaN tras entrada corrupta', !/NaN/.test(buf2), '');
  const msj2 = await page.textContent('#statusExport');
  check('mensaje sigue en 2 entradas', /Exportado: 2 entradas/.test(msj2), '"' + msj2 + '"');

  console.log('=== EXPORT VACIO ===');
  await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('calculo-')).forEach(k => localStorage.removeItem(k)));
  const [dl3] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.locator('button[onclick="exportarHistorial()"]').click()
  ]);
  check('sin datos no descarga archivo', dl3 === null);
  const msj3 = await page.textContent('#statusExport');
  check('mensaje de historial vacio', /Todav.{0,2} no hay nada para exportar/.test(msj3), '"' + msj3 + '"');

  console.log('=== MOVIL (375x667) ===');
  const ctxM = await browser.newContext({ acceptDownloads: true, viewport: { width: 375, height: 667 } });
  const pageM = await ctxM.newPage();
  pageM.on('pageerror', e => console.log('[pageerror mobile]', e.message));
  await pageM.goto(APP_URL);
  await pageM.waitForSelector('#calcBtn', { timeout: 15000 });
  await pageM.fill('#viejo', '800000');
  await pageM.fill('#nuevo', '830000');
  await pageM.fill('#mes', '2026-08');
  await pageM.click('#calcBtn');
  await pageM.waitForSelector('#result.show', { timeout: 5000 });
  check('movil: calculo ok', await pageM.isVisible('#result'));
  check('movil: boton acordeon visible', await pageM.isVisible('#notaBtn'));
  const histConv = await pageM.evaluate(() => ({ h: Math.round(document.getElementById('notaInflacion').getBoundingClientRect().height) }));
  check('movil: nota colapsada por defecto', histConv.h < 8, 'height=' + histConv.h);
  const ocultoNota = await pageM.evaluate(() => getComputedStyle(document.getElementById('notaInflacion')).overflow);
  check('movil: nota con overflow hidden (collapsable)', ocultoNota === 'hidden', 'overflow=' + ocultoNota);
  await pageM.click('#notaBtn');
  await pageM.waitForFunction(() => document.getElementById('notaInflacion').classList.contains('abierto'), null, { timeout: 5000 });
  await pageM.waitForTimeout(600);
  const histAbierta = await pageM.evaluate(() => Math.round(document.getElementById('notaInflacion').getBoundingClientRect().height));
  check('movil: nota se despliega con transición', histAbierta > 80, 'height=' + histAbierta);
  const acordeonOk = await pageM.evaluate(() => {
    const b = document.getElementById('notaBtn').getBoundingClientRect();
    const n = document.getElementById('notaInflacion').getBoundingClientRect();
    const ar = document.getElementById('notaBtn').getAttribute('aria-expanded');
    return { bArriba: b.top < n.top, bAbre: ar === 'true' };
  });
  check('movil: boton arriba del bloque y aria-expanded true', acordeonOk.bArriba && acordeonOk.bAbre, JSON.stringify(acordeonOk));
  check('movil: alquileres dentro de la nota visible (al abrir)', await pageM.isVisible('#alqNote'));
  const orderOk = await pageM.evaluate(() => {
    const r = document.querySelector('.receipt').getBoundingClientRect();
    const n = document.getElementById('notaInflacion').getBoundingClientRect();
    return r.top < n.top;
  });
  check('movil: el ticket queda arriba y la nota debajo', orderOk);
  await pageM.click('#notaBtn');
  await pageM.waitForFunction(() => !document.getElementById('notaInflacion').classList.contains('abierto'), null, { timeout: 5000 });
  await pageM.waitForTimeout(600);
  const histCerrada = await pageM.evaluate(() => Math.round(document.getElementById('notaInflacion').getBoundingClientRect().height));
  check('movil: nota vuelve a colapsar', histCerrada < 8, 'height=' + histCerrada);
  await pageM.locator('#guardarWrap button').filter({ hasText: 'Guardar en mi historial' }).click();
  await pageM.waitForFunction(() => /Guardado/.test(document.getElementById('statusGuardar').textContent), null, { timeout: 5000 });
  const [dlM] = await Promise.all([
    pageM.waitForEvent('download', { timeout: 10000 }),
    pageM.locator('button[onclick="exportarHistorial()"]').click()
  ]);
  const csvPathM = path.join(OUT_DIR, 'historial-movil.csv');
  await dlM.saveAs(csvPathM);
  const rowsM = parseCsv(fs.readFileSync(csvPathM, 'utf8'));
  check('movil: export genera 1 fila correcta', rowsM.length === 2 && rowsM[1].length === 11 && numEs(rowsM[1][3]) === 830000, rowsM.length + ' filas, csv=' + rowsM[1] ? rowsM[1].join(';') : '');

  await browser.close();
  console.log('--- RESUMEN ---');
  console.log('OK=' + ok + ' FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();