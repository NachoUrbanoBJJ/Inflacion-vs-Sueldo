  // decorative barcode
  const bc = document.getElementById('barcode');
  for(let i=0;i<40;i++){
    const d = document.createElement('div');
    d.style.height = (10 + Math.random()*14) + 'px';
    d.style.width = (Math.random()>0.7 ? '3px':'1px');
    bc.appendChild(d);
  }

  // set default months to current month
  const today = new Date();
  const currentMonthStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0');
  document.getElementById('mesHora').value = currentMonthStr;

  // ---------- Datos de inflación (INDEC, incrustados: no dependen de fetch) ----------
  let inflacionData = [
    {fecha:'2024-01-01', valor:20.6}, {fecha:'2024-02-01', valor:13.2}, {fecha:'2024-03-01', valor:11.0},
    {fecha:'2024-04-01', valor:8.8},  {fecha:'2024-05-01', valor:4.2},  {fecha:'2024-06-01', valor:4.6},
    {fecha:'2024-07-01', valor:4.0},  {fecha:'2024-08-01', valor:4.2},  {fecha:'2024-09-01', valor:3.5},
    {fecha:'2024-10-01', valor:2.7},  {fecha:'2024-11-01', valor:2.4},  {fecha:'2024-12-01', valor:2.7},
    {fecha:'2025-01-01', valor:2.2},  {fecha:'2025-02-01', valor:2.4},  {fecha:'2025-03-01', valor:3.7},
    {fecha:'2025-04-01', valor:2.8},  {fecha:'2025-05-01', valor:1.5},  {fecha:'2025-06-01', valor:1.6},
    {fecha:'2025-07-01', valor:1.9},  {fecha:'2025-08-01', valor:1.9},  {fecha:'2025-09-01', valor:2.1},
    {fecha:'2025-10-01', valor:2.3},  {fecha:'2025-11-01', valor:2.5},  {fecha:'2025-12-01', valor:2.8},
    {fecha:'2026-01-01', valor:2.88}, {fecha:'2026-02-01', valor:2.90}, {fecha:'2026-03-01', valor:3.38},
    {fecha:'2026-04-01', valor:2.58}, {fecha:'2026-05-01', valor:2.15}, {fecha:'2026-06-01', valor:1.89},
    {fecha:'2026-07-01', valor:2.11}, {fecha:'2026-08-01', valor:1.66}
  ];

  function fmtPct(n){
    if(Math.abs(n) < 0.05) n = 0;
    const s = n.toFixed(1);
    return (n>=0 ? '+' : '') + s + '%';
  }

  // Convierte números escritos en formato local ("1.000.000", "999.951,50")
  // a números reales. parseFloat solo cortaría en "1.000.000" como 1.
  function parseNum(v){
    if(typeof v === 'number' && isFinite(v)) return v;
    if(v === null || v === undefined) return NaN;
    const s = String(v).replace(/\s/g, '').trim();
    if(s === '') return NaN;
    const neg = s.charAt(0) === '-';
    const t = s.replace(/^-/, '').replace(/[^\d.,]/g, '');
    if(!t) return NaN;
    let body;
    const c = t.lastIndexOf(',');
    const d = t.lastIndexOf('.');
    if(c > d){
      body = t.replace(/\./g, '').replace(',', '.');
    } else {
      body = (t.match(/\./g) || []).length > 1 ? t.replace(/\./g, '') : t;
    }
    const r = parseFloat(body);
    return isNaN(r) ? NaN : (neg ? -r : r);
  }

  const UMBRAL_EMPATE = 1;
  function estadoDiff(diff){
    if(diff >= UMBRAL_EMPATE) return 'win';
    if(diff <= -UMBRAL_EMPATE) return 'lose';
    return 'draw';
  }
  function fmtMonth(fecha){
    const [y,m] = fecha.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return meses[parseInt(m,10)-1] + " '" + y.slice(2);
  }

  function acumularRango(list){
    let acumulado = 1;
    list.forEach(d => { acumulado *= (1 + d.valor / 100); });
    return (acumulado - 1) * 100;
  }

  let ultimoCalculo = null; // guarda el resultado calculado para poder persistirlo
  let segundoTrabajoActivo = false;

  function toggleSegundoTrabajo(){
    segundoTrabajoActivo = !segundoTrabajoActivo;
    const wrap = document.getElementById('segTrabajo');
    const btn = document.getElementById('toggle2do');
    const sep = document.getElementById('rSep2');
    if(segundoTrabajoActivo){
      wrap.style.display = 'block';
      btn.textContent = '− Quitar segundo trabajo';
      btn.classList.add('on');
    } else {
      wrap.style.display = 'none';
      btn.textContent = '+ Agregar segundo trabajo';
      btn.classList.remove('on');
      document.getElementById('viejo2').value = '';
      document.getElementById('nuevo2').value = '';
      if(sep) sep.style.display = 'none';
    }
    if(document.getElementById('result').classList.contains('show')) calcular();
  }

  function leerSegundoTrabajo(){
    if(!segundoTrabajoActivo) return null;
    const viejo2 = parseNum(document.getElementById('viejo2').value);
    const nuevo2 = parseNum(document.getElementById('nuevo2').value);
    const completo = isFinite(viejo2) && viejo2 > 0 && isFinite(nuevo2) && nuevo2 > 0;
    return completo ? { viejo2, nuevo2 } : null;
  }

  function calcular(){
    const viejo = parseNum(document.getElementById('viejo').value);
    const nuevo = parseNum(document.getElementById('nuevo').value);
    const mes = document.getElementById('mes').value; // YYYY-MM

    const status = document.getElementById('status');
    status.className = 'status';
    document.getElementById('guardarWrap').classList.remove('show');
    ultimoCalculo = null;

    if(!mes){
      status.textContent = 'Completá la fecha de tu último aumento: es el punto de partida de la comparación.';
      return;
    }
    if(!isFinite(viejo) || viejo <= 0){
      status.textContent = 'El sueldo anterior tiene que ser mayor a 0.';
      return;
    }
    if(!isFinite(nuevo) || nuevo <= 0){
      status.textContent = 'El sueldo nuevo tiene que ser mayor a 0.';
      return;
    }

    const desde = mes;
    const firstFecha = inflacionData[0].fecha.slice(0,7);
    const lastFecha = inflacionData[inflacionData.length - 1].fecha.slice(0,7);
    let aviso = '';

    // ---- CUENTA PRINCIPAL: siempre desde tu último aumento ----
    if(desde > lastFecha){
      status.textContent = 'El último dato publicado es ' + fmtMonth(lastFecha + '-01') +
        ' y tu aumento es de ' + fmtMonth(desde + '-01') +
        ': todavía no hay inflación publicada para comparar.';
      return;
    }
    let relevantes = inflacionData.filter(d => d.fecha.slice(0,7) >= desde);
    if(relevantes.length === 0){
      status.textContent = 'Sin datos de inflación en ese período (disponibles de ' +
        fmtMonth(firstFecha + '-01') + ' a ' + fmtMonth(lastFecha + '-01') + ').';
      return;
    }
    if(desde < firstFecha){
      aviso = ' Los datos arrancan en ' + fmtMonth(firstFecha + '-01') + ', así que el acumulado usa desde ahí.';
    }

    const inflacionAcum = acumularRango(relevantes);

    const aumentoNominal = ((nuevo / viejo) - 1) * 100;
    const diff = ((1 + aumentoNominal / 100) / (1 + inflacionAcum / 100) - 1) * 100;

    document.getElementById('rAumento').textContent = fmtPct(aumentoNominal);
    document.getElementById('rInflacionLab').textContent = 'Inflación acumulada desde ' + fmtMonth(desde + '-01');
    document.getElementById('rInflacion').textContent = fmtPct(inflacionAcum);
    document.getElementById('rDiff').textContent = fmtPct(diff);

    // ---- TRABAJO 2 (opcional): resultado individual + total de ambos ----
    let segRes = null;
    const sep2 = document.getElementById('rSep2');
    if(segundoTrabajoActivo){
      const seg = leerSegundoTrabajo();
      sep2.style.display = 'block';
      document.getElementById('rAumento2').textContent = fmtPct(aumentoNominal);
      document.getElementById('rDiff2').textContent = fmtPct(diff);
      if(!seg){
        document.getElementById('rTotSueldos').textContent = '—';
        document.getElementById('rAumentoT').textContent = '—';
        document.getElementById('rDiffT').textContent = '—';
        aviso += ' Trabajo 2 activo: completá su sueldo anterior y nuevo para ver el resultado de ambos.';
      } else {
        const aumento2 = ((seg.nuevo2 / seg.viejo2) - 1) * 100;
        const diff2 = ((1 + aumento2 / 100) / (1 + inflacionAcum / 100) - 1) * 100;
        const vT = viejo + seg.viejo2;
        const nT = nuevo + seg.nuevo2;
        const aumT = ((nT / vT) - 1) * 100;
        const diffT = ((1 + aumT / 100) / (1 + inflacionAcum / 100) - 1) * 100;
        segRes = { viejo2: seg.viejo2, nuevo2: seg.nuevo2, aumento2, inflacion2: inflacionAcum, diff2, vT, nT, aumT, diffT };
        document.getElementById('rTotSueldos').textContent = '$' + Math.round(vT).toLocaleString('es-AR') + ' → $' + Math.round(nT).toLocaleString('es-AR');
        document.getElementById('rAumentoT').textContent = fmtPct(aumT);
        document.getElementById('rDiffT').textContent = fmtPct(diffT);
      }
    } else {
      sep2.style.display = 'none';
    }

    const stamp = document.getElementById('stamp');
    const estado = estadoDiff(diff);
    stamp.className = 'stamp' + (estado === 'win' ? ' win' : estado === 'lose' ? '' : ' draw');
    stamp.innerHTML = (estado === 'win' ? 'GANASTE' : estado === 'lose' ? 'PERDISTE' : 'EMPATE') +
      '<small>' + (estado === 'draw' ? 'dentro de ±' + UMBRAL_EMPATE + '%' : Math.abs(diff).toFixed(1) + '% de poder de compra') + '</small>';
    stamp.style.animation = 'none';
    void stamp.offsetWidth;
    stamp.style.animation = '';

    // ---- GRÁFICA: siempre la cuenta principal (desde tu último aumento) ----
    let baseAcum = 1;
    const serie = relevantes.map(d => {
      baseAcum *= (1 + d.valor / 100);
      return { fecha: d.fecha, acum: (baseAcum - 1) * 100 };
    });
    let showSeries = serie;
    if(serie.length > 14){
      const paso = Math.ceil(serie.length / 14);
      showSeries = serie.filter((_, i) => i % paso === 0);
      const last = serie[serie.length - 1];
      if(showSeries[showSeries.length - 1] !== last) showSeries.push(last);
    }
    const max = Math.max(...showSeries.map(d => Math.abs(d.acum)), 1);

    document.getElementById('chartTitle').textContent = 'Inflación acumulada (' + fmtMonth(showSeries[0].fecha) + ' → ' + fmtMonth(showSeries[showSeries.length-1].fecha) + ')';

    const bars = document.getElementById('bars');
    const labels = document.getElementById('barLabels');
    bars.innerHTML = '';
    labels.innerHTML = '';
    showSeries.forEach(d => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = Math.max(3, (Math.abs(d.acum)/max)*90) + 'px';
      bar.title = fmtMonth(d.fecha) + ': acumulado ' + d.acum.toFixed(1) + '%';
      bars.appendChild(bar);

      const lab = document.createElement('span');
      lab.textContent = fmtMonth(d.fecha);
      labels.appendChild(lab);
    });

    document.getElementById('result').classList.add('show');
    status.textContent = 'Último dato disponible: ' + fmtMonth(lastFecha + '-01') + '.' + aviso;

    ultimoCalculo = Object.assign({
      ts: Date.now(),
      mesVigente: mes,
      viejo, nuevo,
      aumento: aumentoNominal,
      inflacion: inflacionAcum,
      diff
    }, segRes || {});
    document.getElementById('guardarWrap').classList.add('show');
  }

  // ---------- BLOQUE 2b: aumento en escalones (opcional) ----------

  const ESCALONES = [];

  function pctEscalones(){
    let f = 1;
    ESCALONES.forEach(e => { if(e.mes && e.pct > 0) f *= (1 + e.pct / 100); });
    return f;
  }

  function actualizarEscalones(){
    const res = document.getElementById('escalonRes');
    const f = pctEscalones();
    const acum = (f - 1) * 100;
    if(ESCALONES.every(e => !e.mes && !e.pct)){
      res.textContent = 'Cargá al menos un tramo con mes y % para calcular el acumulado.';
      return;
    }
    const viejo = parseNum(document.getElementById('viejo').value);
    res.textContent = 'Acumulado: ' + fmtPct(acum) +
      (isFinite(viejo) && viejo > 0 ? ' · con sueldo anterior de $' + Math.round(viejo).toLocaleString('es-AR') +
        ' → $' + Math.round(viejo * f).toLocaleString('es-AR') : '');
  }

  function agregarEscalon(){
    ESCALONES.push({ mes: '', pct: '' });
    renderEscalones();
    actualizarEscalones();
  }

  function borrarEscalon(i){
    ESCALONES.splice(i, 1);
    renderEscalones();
    actualizarEscalones();
  }

  function renderEscalones(){
    const wrap = document.getElementById('escalonRows');
    wrap.innerHTML = '';
    ESCALONES.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'escalon-row';
      const fMes = document.createElement('div');
      fMes.className = 'field';
      const lMes = document.createElement('label');
      lMes.textContent = 'Mes';
      lMes.htmlFor = 'esc-mes-' + i;
      const iMes = document.createElement('input');
      iMes.type = 'month';
      iMes.id = 'esc-mes-' + i;
      iMes.value = e.mes;
      iMes.addEventListener('input', () => { e.mes = iMes.value; actualizarEscalones(); });
      fMes.appendChild(lMes); fMes.appendChild(iMes);

      const fPct = document.createElement('div');
      fPct.className = 'field';
      const lPct = document.createElement('label');
      lPct.textContent = '%';
      lPct.htmlFor = 'esc-pct-' + i;
      const iPct = document.createElement('input');
      iPct.type = 'number';
      iPct.id = 'esc-pct-' + i;
      iPct.step = '0.1'; iPct.min = '0';
      iPct.value = e.pct;
      iPct.addEventListener('input', () => { e.pct = parseFloat(iPct.value); actualizarEscalones(); });
      fPct.appendChild(lPct); fPct.appendChild(iPct);

      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.title = 'Quitar';
      del.textContent = '✕';
      del.addEventListener('click', () => borrarEscalon(i));

      row.appendChild(fMes); row.appendChild(fPct); row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function usarEscalones(){
    const viejo = parseNum(document.getElementById('viejo').value);
    const res = document.getElementById('escalonRes');
    if(!isFinite(viejo) || viejo <= 0){
      res.textContent = 'Primero cargá tu sueldo anterior en el formulario.';
      return;
    }
    const f = pctEscalones();
    if(f === 1){
      res.textContent = 'Cargá al menos un tramo con mes y % para calcular.';
      return;
    }
    const nuevo = Math.round(viejo * f);
    if(nuevo <= viejo){
      res.textContent = 'Los tramos cargados dan un total igual o menor al sueldo anterior: revisá los porcentajes.';
      return;
    }
    document.getElementById('nuevo').value = nuevo;
    document.getElementById('nuevo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    res.textContent = 'Sueldo nuevo cargado: $' + nuevo.toLocaleString('es-AR');
  }

  // ---------- BLOQUE 1: valor hora ----------

  const DIAS = [
    { key: 'lun', label: 'L', default: 9 },
    { key: 'mar', label: 'M', default: 9 },
    { key: 'mie', label: 'M', default: 9 },
    { key: 'jue', label: 'J', default: 9 },
    { key: 'vie', label: 'V', default: 8 },
    { key: 'sab', label: 'S', default: 4 },
    { key: 'dom', label: 'D', default: 0 },
  ];

  const weekGrid = document.getElementById('weekGrid');
  DIAS.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'week-cell' + (d.default === 0 ? ' off' : '');
    cell.innerHTML =
      '<label for="dia-' + d.key + '">' + d.label + '</label>' +
      '<input type="number" id="dia-' + d.key + '" min="0" max="24" step="0.5" value="' + d.default + '">';
    weekGrid.appendChild(cell);
  });

  let periodoActual = 'mensual';
  const periodoToggle = document.getElementById('periodoToggle');
  periodoToggle.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      periodoToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      periodoActual = btn.dataset.p;

      document.getElementById('mesHoraField').style.display = (periodoActual === 'semanal') ? 'none' : 'block';
      document.getElementById('quincenaField').classList.toggle('show', periodoActual === 'quincenal');
      document.getElementById('valorHoraOut').classList.remove('show');
    });
  });

  function horasPorDiaSemana(){
    return DIAS.map(d => parseFloat(document.getElementById('dia-' + d.key).value) || 0);
  }

  function calcularValorHora(){
    const valorHora = parseNum(document.getElementById('valorHora').value);
    const status = document.getElementById('statusHora');
    status.className = 'status';

    if(!valorHora || valorHora <= 0){
      status.textContent = 'Cargá el valor de tu hora para calcular.';
      return;
    }

    const horasSemana = horasPorDiaSemana();
    let totalHoras = 0;
    let periodoLabel = '';

    if(periodoActual === 'semanal'){
      totalHoras = horasSemana.reduce((a,b) => a+b, 0);
      periodoLabel = 'esta semana';
    } else {
      const mesHora = document.getElementById('mesHora').value;
      if(!mesHora){
        status.textContent = 'Elegí el mes a calcular.';
        return;
      }
      const [anio, mesNum] = mesHora.split('-').map(Number);
      const diasEnMes = new Date(anio, mesNum, 0).getDate();

      let diaInicio = 1, diaFin = diasEnMes;
      if(periodoActual === 'quincenal'){
        const q = document.getElementById('quincenaNum').value;
        if(q === '1'){ diaInicio = 1; diaFin = 15; periodoLabel = 'la 1ª quincena'; }
        else { diaInicio = 16; diaFin = diasEnMes; periodoLabel = 'la 2ª quincena'; }
      } else {
        periodoLabel = 'el mes';
      }

      for(let dia = diaInicio; dia <= diaFin; dia++){
        const fecha = new Date(anio, mesNum - 1, dia);
        const jsDay = fecha.getDay();
        const idx = (jsDay + 6) % 7;
        totalHoras += horasSemana[idx];
      }
    }

    if(totalHoras <= 0){
      status.textContent = 'Cargá al menos un día con horas trabajadas.';
      return;
    }

    const sueldoTotal = valorHora * totalHoras;

    document.getElementById('vhValor').textContent =
      '$' + sueldoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 });
    document.getElementById('vhHoras').textContent = totalHoras + ' hs (' + periodoLabel + ')';
    document.getElementById('valorHoraOut').classList.add('show');
    document.getElementById('valorHoraOut').dataset.sueldo = sueldoTotal;

    status.textContent = '';
  }

  function usarComo(campo){
    const out = document.getElementById('valorHoraOut');
    const sueldo = out.dataset.sueldo;
    if(!sueldo) return;
    document.getElementById(campo).value = Math.round(parseNum(sueldo));
    document.getElementById(campo).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- BLOQUE 3: historial persistente ----------
  //
  // window.storage solo existe dentro del entorno de artifacts de Claude.
  // Si este archivo se abre suelto (doble click) o se aloja en Netlify/Vercel,
  // esa función no existe. Por eso detectamos qué hay disponible y elegimos
  // el mejor mecanismo, con un último respaldo en memoria para que la app
  // nunca se rompa, aunque en el peor caso no persista entre recargas.

  const memoriaFallback = {}; // último respaldo: dura solo mientras la pestaña esté abierta

  function crearStorageBackend(){
    // 1) window.storage (entorno de artifacts de Claude)
    if(typeof window.storage !== 'undefined' && window.storage && typeof window.storage.set === 'function'){
      return {
        modo: 'claude',
        async set(key, value){
          try{ return await window.storage.set(key, value, false); }
          catch(e){ console.warn('storage.set falló:', e); return null; }
        },
        async get(key){
          try{ return await window.storage.get(key, false); }
          catch(e){ console.warn('storage.get falló:', e); return null; }
        },
        async delete(key){
          try{ return await window.storage.delete(key, false); }
          catch(e){ console.warn('storage.delete falló:', e); return null; }
        },
        async list(prefix){
          // La plataforma a veces tira "Unexpected response type" cuando
          // todavía no hay ninguna clave guardada con ese prefijo.
          // Lo tratamos como "sin resultados" en vez de dejar que rompa la app.
          try{
            const res = await window.storage.list(prefix, false);
            if(!res || !Array.isArray(res.keys)) return { keys: [] };
            return res;
          }catch(e){
            console.warn('storage.list falló, se asume historial vacío:', e);
            return { keys: [] };
          }
        }
      };
    }
    // 2) localStorage (funciona cuando la página está alojada normal, ej. Netlify)
    try{
      const testKey = '__test_storage__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return {
        modo: 'local',
        async set(key, value){ localStorage.setItem(key, value); return { key, value }; },
        async get(key){
          const value = localStorage.getItem(key);
          if(value === null) return null;
          return { key, value };
        },
        async delete(key){ localStorage.removeItem(key); return { key, deleted:true }; },
        async list(prefix){
          const keys = [];
          for(let i=0;i<localStorage.length;i++){
            const k = localStorage.key(i);
            if(k && k.startsWith(prefix)) keys.push(k);
          }
          return { keys };
        }
      };
    }catch(e){
      // localStorage puede fallar en navegación privada de algunos navegadores
    }
    // 3) memoria: último respaldo, no persiste al recargar
    return {
      modo: 'memoria',
      async set(key, value){ memoriaFallback[key] = value; return { key, value }; },
      async get(key){
        if(!(key in memoriaFallback)) return null;
        return { key, value: memoriaFallback[key] };
      },
      async delete(key){ delete memoriaFallback[key]; return { key, deleted:true }; },
      async list(prefix){
        const keys = Object.keys(memoriaFallback).filter(k => k.startsWith(prefix));
        return { keys };
      }
    };
  }

  const storageBackend = crearStorageBackend();

  async function guardarCalculo(){
    if(!ultimoCalculo) return;
    const statusG = document.getElementById('statusGuardar');
    statusG.className = 'status';
    statusG.textContent = 'Guardando...';
    try{
      const key = 'calculo-' + ultimoCalculo.ts;
      const result = await storageBackend.set(key, JSON.stringify(ultimoCalculo));
      if(!result) throw new Error('no se pudo guardar');
      statusG.className = 'status ok';
      statusG.textContent = storageBackend.modo === 'memoria'
        ? 'Guardado (solo por esta sesión: tu navegador no permite guardado persistente acá).'
        : 'Guardado en tu historial.';
      await renderHistorial();
    }catch(err){
      statusG.className = 'status error';
      statusG.textContent = 'No se pudo guardar: ' + err.message;
      console.error(err);
    }
  }

  async function borrarCalculo(key){
    try{
      await storageBackend.delete(key);
      await renderHistorial();
    }catch(err){
      console.error(err);
    }
  }

  async function cargarHistorial(){
    try{
      const listado = await storageBackend.list('calculo-');
      if(!listado || !listado.keys || listado.keys.length === 0) return [];
      const entries = [];
      for(const key of listado.keys){
        try{
          const r = await storageBackend.get(key);
          if(r && r.value){
            const data = JSON.parse(r.value);
            entries.push({ key, data });
          }
        }catch(e){ /* entrada corrupta, se ignora */ }
      }
      entries.sort((a,b) => a.data.ts - b.data.ts);
      return entries;
    }catch(err){
      console.error(err);
      return [];
    }
  }

  function diffRealDe(data){
    if(typeof data.aumento === 'number' && typeof data.inflacion === 'number'){
      return ((1 + data.aumento / 100) / (1 + data.inflacion / 100) - 1) * 100;
    }
    return data.diff;
  }

  function toggleNotaMovil(){
    const n = document.getElementById('notaInflacion');
    if(!n) return;
    const abierto = n.classList.toggle('abierto');
    const b = document.getElementById('notaBtn');
    if(b) b.setAttribute('aria-expanded', String(abierto));
  }

  function diffRealDe2(data){
    if(typeof data.diff2 === 'number') return data.diff2;
    if(typeof data.aumento2 === 'number' && typeof data.inflacion2 === 'number'){
      return ((1 + data.aumento2 / 100) / (1 + data.inflacion2 / 100) - 1) * 100;
    }
    return null;
  }

  async function renderHistorial(){
    const entries = await cargarHistorial();
    const list = document.getElementById('histList');
    const empty = document.getElementById('histEmpty');
    const agg = document.getElementById('historialAgg');
    list.innerHTML = '';

    if(entries.length === 0){
      empty.style.display = 'block';
      agg.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    agg.style.display = 'flex';

    const anioActual = new Date().getFullYear();
    const conMes = e => typeof e.data.mesVigente === 'string' && e.data.mesVigente.length >= 7;
    const delAnio = entries.filter(e => conMes(e) && e.data.mesVigente.slice(0,4) === String(anioActual));
    const base = delAnio.length > 0 ? delAnio : entries;
    if(base.length === 0){
      empty.style.display = 'block';
      agg.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    const ganados = base.filter(e => isFinite(diffRealDe(e.data)) && estadoDiff(diffRealDe(e.data)) === 'win').length;
    const perdidos = base.filter(e => isFinite(diffRealDe(e.data)) && estadoDiff(diffRealDe(e.data)) === 'lose').length;
    const validos = base.filter(e => isFinite(diffRealDe(e.data)));
    const promedio = validos.length > 0 ? validos.reduce((a,e) => a + diffRealDe(e.data), 0) / validos.length : 0;

    document.getElementById('aggGanados').textContent = ganados;
    document.getElementById('aggPerdidos').textContent = perdidos;
    document.getElementById('aggPromedio').textContent = fmtPct(promedio);

    entries.slice().reverse().forEach(e => {
      const li = document.createElement('li');
      li.className = 'hist-item';
      const real = diffRealDe(e.data);
      if(!isFinite(real)) return; // entrada incompleta: no renderiza basura ni rompe la lista
      const est = estadoDiff(real);
      const cls = est === 'win' ? 'win' : est === 'lose' ? 'lose' : 'draw';
      const palabra = est === 'win' ? 'GANÓ ' : est === 'lose' ? 'PERDIÓ ' : 'EMPATÓ ';
      const metaBits = [];
      if(typeof e.data.aumento === 'number') metaBits.push('aumento ' + fmtPct(e.data.aumento));
      if(typeof e.data.inflacion === 'number') metaBits.push('inflación ' + fmtPct(e.data.inflacion));
      const d2 = diffRealDe2(e.data);
      let linea2 = '';
      if(d2 !== null && isFinite(d2)){
        const est2 = estadoDiff(d2);
        linea2 = '<span class="sub">2º trabajo: ' +
          (est2 === 'win' ? 'GANÓ ' : est2 === 'lose' ? 'PERDIÓ ' : 'EMPATÓ ') + fmtPct(d2) + ' real</span>';
      }
      li.innerHTML =
        '<span class="info"><span class="meta">' + (conMes(e) ? fmtMonth(e.data.mesVigente + '-01') : '—') + '</span>' +
        (metaBits.length ? '<span class="sub">' + metaBits.join(' · ') + '</span>' : '') +
        linea2 + '</span>' +
        '<span class="res ' + cls + '">' + palabra + fmtPct(real) + '</span>' +
        '<button class="del" title="Borrar" onclick="borrarCalculo(\'' + e.key + '\')">✕</button>';
      list.appendChild(li);
    });
  }

  // ---------- BLOQUE 3: inflación histórica ----------

  function renderQuickAcc(){
    const wrap = document.getElementById('quickAcc');
    wrap.innerHTML = '';
    const slice = inflacionData.slice(-12);
    [3,6,9,12].forEach(n => {
      const part = slice.slice(-n);
      if(part.length === 0) return;
      const el = document.createElement('div');
      el.className = 'chip';
      el.innerHTML = '<span class="chip-l">Últimos ' + n + 'M</span><span class="chip-v">' + fmtPct(acumularRango(part)) + '</span>';
      el.title = fmtMonth(part[0].fecha) + ' → ' + fmtMonth(part[part.length - 1].fecha);
      wrap.appendChild(el);
    });
  }

  function renderAnioInflacion(anio){
    const rows = inflacionData.filter(d => d.fecha.slice(0,4) === String(anio));
    const list = document.getElementById('ipcList');
    const empty = document.getElementById('ipcEmpty');
    document.getElementById('ipcAnioLabel').textContent = anio;
    list.innerHTML = '';

    if(rows.length === 0){
      empty.style.display = 'block';
      document.getElementById('ipcAcum').textContent = '—';
      document.getElementById('ipcProm').textContent = '—';
      return;
    }
    empty.style.display = 'none';

    const acum = acumularRango(rows);
    const prom = rows.reduce((s,d) => s + d.valor, 0) / rows.length;
    const max = Math.max(...rows.map(d => d.valor), 1);

    document.getElementById('ipcAcum').textContent = fmtPct(acum);
    document.getElementById('ipcProm').textContent = '+' + prom.toFixed(1) + '%';

    rows.forEach(d => {
      const li = document.createElement('li');
      li.className = 'hist-item ipc-item';
      li.innerHTML =
        '<span class="meta">' + fmtMonth(d.fecha) + '</span>' +
        '<span class="ipc-track"><span class="ipc-fill" style="width:' + Math.max(4, (d.valor / max) * 100) + '%"></span></span>' +
        '<span class="res">' + d.valor.toFixed(1) + '%</span>';
      list.appendChild(li);
    });
  }

  function buildInflacionHistorica(){
    const sel = document.getElementById('anioSel');
    sel.innerHTML = '';
    const anios = [...new Set(inflacionData.map(d => d.fecha.slice(0,4)))].sort();
    anios.forEach(anio => {
      const opt = document.createElement('option');
      opt.value = anio;
      opt.textContent = anio;
      sel.appendChild(opt);
    });
    sel.value = anios[anios.length - 1];
    sel.onchange = () => renderAnioInflacion(sel.value);
    renderAnioInflacion(sel.value);
    renderQuickAcc();
    actualizarFooter();
  }

  const MESES_FULL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function fmtMesLargo(fecha){
    const [y,m] = fecha.split('-');
    return MESES_FULL[parseInt(m,10)-1] + ' ' + y;
  }

  function actualizarFooter(){
    const last = inflacionData[inflacionData.length - 1];
    const el = document.getElementById('pieFooter');
    if(!el || !last) return;
    el.textContent = 'FUENTE: INDEC · datos hasta ' + fmtMesLargo(last.fecha.slice(0,7));
  }

  function setFuente(modo, fecha){
    const el = document.getElementById('fuenteStatus');
    if(modo === 'api'){
      el.className = 'status ok';
      el.textContent = 'Datos actualizados vía API Datos Argentina · último: ' + fmtMonth(fecha + '-01');
    } else {
      el.className = 'status';
      el.textContent = 'Sin conexión a la API: usando datos incrustados hasta ' + fmtMonth(inflacionData[inflacionData.length - 1].fecha) + '.';
    }
  }

  // ---------- API INDEC (Datos Argentina) con fallback a datos incrustados ----------

  const API_SERIE = '148.3_INIVELNAL_DICI_M_26';
  const API_URL = 'https://apis.datos.gob.ar/series/api/series?ids=' + API_SERIE + '&limit=300';

  async function cargarInflacionDesdeAPI(){
    if(typeof window.fetch !== 'function'){
      setFuente('offline');
      return;
    }
    try{
      const res = await fetch(API_URL);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const data = json && json.data;
      if(!Array.isArray(data) || data.length < 2) throw new Error('La API no devolvió una serie válida.');
      const serie = [];
      let prev = null;
      data.forEach(item => {
        const fecha = String(item[0]).slice(0,10);
        const idx = Number(item[1]);
        if(prev !== null && !isNaN(idx) && !isNaN(prev) && prev > 0){
          serie.push({ fecha: fecha, valor: (idx / prev - 1) * 100 });
        }
        prev = idx;
      });
      if(serie.length === 0) throw new Error('No se pudieron derivar variaciones mensuales.');
      inflacionData = serie;
      buildInflacionHistorica();
      setFuente('api', inflacionData[inflacionData.length - 1].fecha);
    }catch(e){
      console.warn('API INDEC no disponible, se usan datos incrustados:', e);
      setFuente('offline');
    }
  }

  // ---------- Nota izquierda: índice de alquiler de la vivienda (API) ----------

  const ALQ_SERIE = '104.1_I2RE_2016_M_25';
  const ALQ_URL = 'https://apis.datos.gob.ar/series/api/series?ids=' + ALQ_SERIE + '&limit=125';

  async function cargarAlquiler(){
    const meta = document.getElementById('alqMeta');
    if(typeof window.fetch !== 'function'){
      meta.className = 'status';
      meta.textContent = 'Sin conexión: no se pudieron cargar los datos de alquileres.';
      return;
    }
    try{
      const res = await fetch(ALQ_URL);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const data = json && json.data;
      if(!Array.isArray(data) || data.length < 2) throw new Error('La API no devolvió una serie válida.');
      const serie = [];
      let prev = null;
      data.forEach(item => {
        const fecha = String(item[0]).slice(0,10);
        const idx = Number(item[1]);
        if(prev !== null && !isNaN(idx) && !isNaN(prev) && prev > 0){
          serie.push({ fecha, valor: (idx / prev - 1) * 100 });
        }
        prev = idx;
      });
      if(serie.length === 0) throw new Error('No se pudieron derivar variaciones de alquiler.');
      const f = v => (v === null || !isFinite(v)) ? '—' : fmtPct(v);
      const acum = n => {
        const part = serie.slice(-n);
        return part.length ? acumularRango(part) : null;
      };
      const ult = serie[serie.length - 1];
      document.getElementById('alqUltimo').textContent = f(ult.valor);
      document.getElementById('alq3').textContent = f(acum(3));
      document.getElementById('alq6').textContent = f(acum(6));
      document.getElementById('alq12').textContent = f(acum(12));
      meta.className = 'status ok';
      meta.textContent = 'Último dato de alquiler: ' + fmtMonth(ult.fecha) + ' · IPC-GBA base dic 2016 (AMBA-Buenos Aires).';
    }catch(e){
      console.warn('API alquileres no disponible:', e);
      meta.className = 'status';
      meta.textContent = 'Sin conexión a la API de alquileres: activá internet para ver este dato.';
    }
  }

  // ---------- Exportar historial a CSV ----------

  function redondear2(n){ return Math.round(n * 100) / 100; }

  function numCsv(n){ return n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }

  function exportarHistorial(){
    const statusE = document.getElementById('statusExport');
    statusE.className = 'status';
    cargarHistorial().then(entries => {
      if(entries.length === 0){
        statusE.className = 'status error';
        statusE.textContent = 'Todavía no hay nada para exportar.';
        return;
      }
      const filas = [
        ['fecha_carga','mes_vigente','sueldo_anterior','sueldo_nuevo','aumento_nominal_pct','inflacion_acum_pct','diferencia_real_pct','sueldo_anterior_2','sueldo_nuevo_2','aumento_nominal_pct_2','diferencia_real_pct_2']
      ];
      entries.sort((a,b) => a.data.ts - b.data.ts);
      const esNum = v => typeof v === 'number' && isFinite(v);
      entries.forEach(e => {
        const d = e.data;
        if(!esNum(d.ts) || !esNum(d.aumento) || !esNum(d.viejo) || !esNum(d.nuevo)) return;
        const dif = diffRealDe(d);
        if(!isFinite(dif)) return; // entrada incompleta/corrupta: no se exporta basura
        const dt = new Date(d.ts);
        const dia = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
        filas.push([
          dia,
          d.mesVigente === undefined ? '' : d.mesVigente,
          numCsv(d.viejo),
          numCsv(d.nuevo),
          numCsv(redondear2(d.aumento)) + '%',
          esNum(d.inflacion) ? numCsv(redondear2(d.inflacion)) + '%' : '',
          numCsv(redondear2(dif)) + '%',
          esNum(d.viejo2) ? numCsv(d.viejo2) : '',
          esNum(d.nuevo2) ? numCsv(d.nuevo2) : '',
          esNum(d.aumento2) ? numCsv(redondear2(d.aumento2)) + '%' : '',
          esNum(d.diff2) ? numCsv(redondear2(d.diff2)) + '%' : ''
        ]);
      });
      const csv = '\uFEFF' + filas.map(f => f.join(';')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'historial-aumentos.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
      statusE.className = 'status ok';
      statusE.textContent = 'Exportado: ' + (filas.length - 1) + ' entradas.';
    }).catch(err => {
      statusE.className = 'status error';
      statusE.textContent = 'No se pudo exportar: ' + err.message;
    });
  }

  // ---------- Descargar ticket como imagen (PNG) ----------

  function nombreTicket(){
    const d = new Date();
    return 'ticket-inflacion-' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + '.png';
  }

  async function descargarTicket(){
    const res = document.getElementById('result');
    const st = document.getElementById('statusGuardar');
    if(!res.classList.contains('show')) return;

    if(typeof html2canvas === 'undefined'){
      st.className = 'status error';
      st.textContent = 'La descarga como imagen necesita conexión a internet (carga html2canvas).';
      return;
    }

    st.className = 'status';
    st.textContent = 'Generando el ticket…';

    try{
      if(document.fonts && document.fonts.ready) await document.fonts.ready;
      const canvas = await html2canvas(document.querySelector('.receipt'), {
        backgroundColor: '#0E1015',
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
        useCORS: true,
        onclone(doc){
          const r = doc.querySelector('.receipt');
          if(!r) return;
          const nota = r.querySelector('.note-card');
          if(nota) nota.style.display = 'none';
          const secciones = r.querySelectorAll('section.block');
          secciones.forEach((s, i) => { if(i !== 1) s.remove(); });
          const sec2 = r.querySelector('section.block');
          if(sec2){
            Array.from(sec2.children).forEach(ch => {
              if(ch.id === 'result') return;
              ch.style.display = 'none';
            });
          }
          const gw = doc.getElementById('guardarWrap');
          if(gw) gw.style.display = 'none';
          const stG = doc.getElementById('statusGuardar');
          if(stG) stG.style.display = 'none';
          doc.querySelectorAll('.bar-labels span').forEach(s => {
            s.style.writingMode = 'horizontal-tb';
            s.style.transform = 'none';
            s.style.height = 'auto';
          });
          const stamp = doc.getElementById('stamp');
          if(stamp){
            stamp.style.animation = 'none';
            stamp.style.opacity = '1';
            stamp.style.transform = 'rotate(-6deg) scale(1)';
          }
        }
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombreTicket();
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
      st.className = 'status ok';
      st.textContent = 'Ticket descargado (PNG).';
    }catch(err){
      console.error(err);
      st.className = 'status error';
      st.textContent = 'No se pudo generar la imagen: ' + err.message;
    }
  }

  buildInflacionHistorica();
  renderHistorial();
  cargarInflacionDesdeAPI();
  cargarAlquiler();
