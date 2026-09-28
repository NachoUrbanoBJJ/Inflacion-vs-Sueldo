# Tests

Dos suites autocontenidas. Ningún archivo del proyecto se modifica al correrlas.

- `csv.test.js` — unit/CSV sobre el motor de cálculo y exportación (sin navegador).
- `browser.test.js` — E2E con Playwright sobre el `index.html` real, usando el navegador instalado (Edge o Chrome).

## Requisitos

- Node.js 16+

## Cómo correr

```sh
cd tests
npm install        # una vez (instala playwright-core)
npm test           # unit (38 asserts) + E2E (64 asserts)
```

O por separado:

```sh
npm run test:unit  # solo unit/CSV
npm run test:e2e   # solo navegador
```

## Qué cubre cada suite

**`csv.test.js`** (38 asserts) — con un DOM mínimo emulado:
- formato es-AR del CSV (coma decimal, `;`, BOM, CRLF);
- pipeline real `calcular → guardarCalculo → exportarHistorial`;
- header y contenido de las 11 columnas;
- entradas legacy incompletas o corruptas que deben saltearse;
- zona horaria local (`America/Argentina/Buenos_Aires`) en `fecha_carga`;
- segundo trabajo en las columnas 7–10.

**`browser.test.js`** (64 asserts) — navegador real (Playwright + canal Edge o Chrome):
- carga sin errores JS y regresión de entradas rotas en `localStorage`;
- cálculos (1 y 2), persistencia tras recargar;
- nota izquierda: inflación histórica, chips sin duplicar, alquileres, ausencia de la ventana extra descartada;
- segundo trabajo (totales y aviso);
- export CSV descargable y comparado contra la referencia persistida;
- entradas corruptas, export vacío;
- mobile 375×667: acordeón de la nota, orden ticket→nota, cálculo y export.

> Requiere tener instalado Microsoft Edge o Google Chrome (se detecta automáticamente).