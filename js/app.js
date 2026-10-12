/* Otra Vuelta · app.js v1
   Lee data/products.json y dibuja pestañas, filtros, tarjetas y fichas.
   Comportamiento: diseno.md §4, §6 y §7. Datos: catalogo-schema.md. Sin dependencias. */

(() => {
  'use strict';

  // iOS 13 y anteriores no tienen replaceChildren (los iPhone 6 y 5s se quedaron en iOS 12).
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function replaceChildren(...nodos) {
      this.textContent = '';
      this.append(...nodos);
    };
  }

  /* ---------- Configuración ---------- */

  // WhatsApp de la tienda: formato internacional, solo dígitos (54 + 9 + característica + número).
  const WHATSAPP_NUMERO = '5491126072121';

  // Rangos del filtro de precio, en pesos. Revisarlos si los precios del catálogo cambian de escala.
  // "Hasta" incluye 50.000; "De … a …" va de 50.001 a 150.000; "Más de" arranca en 150.001.
  const RANGOS_PRECIO = [
    { valor: 'hasta-50000', etiqueta: 'Hasta $ 50.000', cumple: (p) => p.moneda === 'ARS' && p.precio <= 50000 },
    { valor: '50000-150000', etiqueta: 'De $ 50.000 a $ 150.000', cumple: (p) => p.moneda === 'ARS' && p.precio > 50000 && p.precio <= 150000 },
    { valor: 'mas-150000', etiqueta: 'Más de $ 150.000', cumple: (p) => p.moneda === 'ARS' && p.precio > 150000 },
  ];
  const OPCION_DOLARES = { valor: 'usd', etiqueta: 'En dólares', cumple: (p) => p.moneda === 'USD' };

  // Días que un vendido sigue en la lista; la ficha sigue abriendo por link.
  const DIAS_VENDIDO_EN_LISTA = 60;

  const CATALOGO = 'data/products.json';
  const TITULO = 'Otra Vuelta';

  /* ---------- Valores del esquema (catalogo-schema.md §4) ---------- */

  const CATEGORIAS = [
    ['muebles', 'Muebles'],
    ['electrodomesticos', 'Electrodomésticos'],
    ['tecnologia', 'Tecnología'],
    ['hogar', 'Hogar y cocina'],
    ['deco', 'Decoración'],
    ['indumentaria', 'Indumentaria y accesorios'],
    ['libros-musica', 'Libros, música y películas'],
    ['juguetes', 'Juguetes y juegos'],
    ['deportes', 'Deportes y aire libre'],
    ['herramientas-jardin', 'Herramientas y jardín'],
    ['otros', 'Otros'],
  ];
  const ETIQUETA_CATEGORIA = new Map(CATEGORIAS);
  const ORDEN_CATEGORIA = new Map(CATEGORIAS.map(([valor], i) => [valor, i]));

  const PESTANAS = {
    'con-historia': { condicion: 'usado', nombre: 'Con historia' },
    'a-estrenar': { condicion: 'nuevo', nombre: 'A estrenar' },
  };
  const PESTANA_DE = { usado: 'con-historia', nuevo: 'a-estrenar' };
  const ESTADOS = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido' };
  const CONDICIONES = { usado: 'Usado', nuevo: 'Nuevo' };

  const RE_ID = /^[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const RE_ID_PARECIDO = /^[0-9]{4}-/;
  const RE_FOTO = /^0[1-6]\.webp$/;
  const RE_ML = /^https:\/\/(www|articulo)\.mercadolibre\.com\.ar\//;
  const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
  const RE_TELEFONO = /^[1-9][0-9]{7,14}$/;

  /* ---------- Estado ---------- */

  const estado = {
    productos: [],
    listo: false,
    vista: null, // { tipo: 'lista', pestana } o { tipo: 'ficha', id }
    filtros: { pestana: null, categoria: null, precio: 'todos' },
    scroll: {}, // posición de cada lista, para volver desde una ficha
    volverConHistorial: false,
  };

  const $ = (id) => document.getElementById(id);
  const main = $('contenido');
  const encabezado = $('encabezado');
  const barraFicha = $('barra-ficha');
  const volver = $('volver');
  const volverTexto = $('volver-texto');
  const pestanas = Array.from(document.querySelectorAll('.pestana'));

  /* ---------- Utilidades de DOM ---------- */

  // Crea elementos sin innerHTML: todo texto del catálogo entra como texto plano.
  function el(tag, attrs, ...hijos) {
    const nodo = document.createElement(tag);
    if (attrs) {
      for (const [clave, valor] of Object.entries(attrs)) {
        if (valor === null || valor === undefined || valor === false) continue;
        if (clave === 'class') nodo.className = valor;
        else if (clave.startsWith('on')) nodo.addEventListener(clave.slice(2), valor);
        else nodo.setAttribute(clave, valor === true ? '' : String(valor));
      }
    }
    for (const hijo of hijos.flat()) {
      if (hijo === null || hijo === undefined || hijo === false) continue;
      nodo.append(hijo instanceof Node ? hijo : String(hijo));
    }
    return nodo;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONOS = {
    isotipo: [2.5, [['path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3' }], ['path', { d: 'M13.8 6.7h3.5V3.2' }]]],
    chat: [2, [['path', { d: 'M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.6A8.4 8.4 0 1 1 21 11.5z' }]]],
    derecha: [2, [['path', { d: 'M5 12h14M12 5l7 7-7 7' }]]],
    chevron: [2, [['path', { d: 'M6 9l6 6 6-6' }]]],
    tilde: [2.5, [['path', { d: 'M20 6L9 17l-5-5' }]]],
    aviso: [2, [['circle', { cx: '12', cy: '12', r: '9' }], ['path', { d: 'M12 8v4M12 16h.01' }]]],
  };

  function icono(nombre, clase) {
    const [trazo, partes] = ICONOS[nombre];
    const svg = document.createElementNS(SVG_NS, 'svg');
    const attrs = {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': String(trazo),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
    };
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
    if (clase) svg.setAttribute('class', clase);
    for (const [tag, props] of partes) {
      const parte = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(props)) parte.setAttribute(k, v);
      svg.append(parte);
    }
    return svg;
  }

  /* ---------- Formatos ---------- */

  const NUMERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

  function formatoPrecio(valor, moneda) {
    return (moneda === 'USD' ? 'US$ ' : '$ ') + NUMERO.format(valor);
  }

  function formatoFecha(iso) {
    const m = RE_FECHA.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  function plural(n) {
    return n === 1 ? '1 cosa' : `${n} cosas`;
  }

  function diasDesde(iso) {
    const m = RE_FECHA.exec(iso || '');
    if (!m) return 0;
    const hoy = new Date();
    const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.floor((hoyUTC - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) / 86400000);
  }

  const esTexto = (v) => typeof v === 'string' && v.trim() !== '';
  const textos = (lista) => (Array.isArray(lista) ? lista.filter(esTexto) : []);
  const etiquetaCategoria = (valor) => ETIQUETA_CATEGORIA.get(valor) || 'Otros';
  const rutaFoto = (p, foto) => `img/${p.id}/${foto.archivo}`;

  /* ---------- Catálogo ---------- */

  // Descarta lo que no se puede dibujar bien y avisa en la consola (para quien carga productos).
  function normalizar(lista) {
    const vistos = new Set();
    const validos = [];
    for (const p of Array.isArray(lista) ? lista : []) {
      if (!p || typeof p !== 'object') continue;
      const id = p.id;
      const problemas = [];
      if (typeof id !== 'string' || !RE_ID.test(id)) problemas.push('id inválido');
      else if (vistos.has(id)) problemas.push('id repetido');
      if (!esTexto(p.nombre)) problemas.push('sin nombre');
      if (!PESTANA_DE[p.condicion]) problemas.push('condicion inválida');
      if (!ESTADOS[p.estado]) problemas.push('estado inválido');
      if (!Number.isFinite(p.precio) || p.precio <= 0) problemas.push('precio inválido');
      if (p.moneda !== 'ARS' && p.moneda !== 'USD') problemas.push('moneda inválida');
      const fotos = Array.isArray(p.fotos)
        ? p.fotos.filter((f) => f && typeof f.archivo === 'string' && RE_FOTO.test(f.archivo) && esTexto(f.alt))
        : [];
      if (!fotos.length) problemas.push('sin fotos válidas');
      if (problemas.length) {
        console.warn(`Otra Vuelta: no se muestra el producto ${String(id)} (${problemas.join(', ')}).`);
        continue;
      }
      let categoria = p.categoria;
      if (!ETIQUETA_CATEGORIA.has(categoria)) {
        console.warn(`Otra Vuelta: categoría desconocida en ${id}; se muestra como "Otros".`);
        categoria = 'otros';
      }
      vistos.add(id);
      validos.push({ ...p, categoria, fotos });
    }
    return validos;
  }

  function visibleEnLista(p) {
    if (p.estado !== 'vendido') return true;
    return diasDesde(p.fecha_vendido) <= DIAS_VENDIDO_EN_LISTA;
  }

  // Destacados primero, después disponibles y reservados, vendidos al final; en cada grupo, lo más nuevo arriba.
  function comparar(a, b) {
    const grupo = (p) => {
      if (p.estado === 'vendido') return 4;
      return (p.destacado === true ? 0 : 2) + (p.estado === 'reservado' ? 1 : 0);
    };
    const diferencia = grupo(a) - grupo(b);
    if (diferencia) return diferencia;
    const fa = a.fecha_publicacion || '';
    const fb = b.fecha_publicacion || '';
    if (fa !== fb) return fa < fb ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  }

  function productosDe(pestana) {
    const condicion = PESTANAS[pestana].condicion;
    return estado.productos.filter((p) => p.condicion === condicion && visibleEnLista(p)).sort(comparar);
  }

  /* ---------- WhatsApp ---------- */

  // Saca mitades sueltas de un emoji partido: con ellas encodeURIComponent falla.
  const sinSueltos = (texto) => Array.from(texto).filter((c) => c.length > 1 || c < '\uD800' || c > '\uDFFF').join('');

  function mensajeWhatsApp(p) {
    return sinSueltos(`Hola, Otra Vuelta. Me interesa: ${p.nombre} (${p.id}). ¿Sigue disponible?`);
  }

  function urlWhatsApp(p) {
    if (!RE_TELEFONO.test(WHATSAPP_NUMERO)) return null;
    return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensajeWhatsApp(p))}`;
  }

  function botonWhatsApp(p, grande, describidoPor) {
    const url = urlWhatsApp(p);
    if (!url) {
      console.error('Otra Vuelta: falta configurar WHATSAPP_NUMERO en js/app.js.');
      return null;
    }
    return el('a', {
      class: grande ? 'boton-wa grande' : 'boton-wa',
      href: url,
      target: '_blank',
      rel: 'noopener',
      'aria-describedby': describidoPor,
    }, icono('chat'), 'Escribinos por WhatsApp');
  }

  /* ---------- Piezas ---------- */

  function chipsDe(p, id) {
    return el('p', { class: 'chips', id },
      el('span', { class: `chip chip-${p.estado}` }, ESTADOS[p.estado]),
      ' ',
      el('span', { class: `chip chip-${p.condicion}` }, CONDICIONES[p.condicion]));
  }

  function precioDe(p, clase) {
    const anterior = Number.isFinite(p.precio_anterior) && p.precio_anterior > p.precio
      ? el('s', { class: 'precio-anterior' }, el('span', { class: 'sr' }, 'Antes: '), formatoPrecio(p.precio_anterior, p.moneda))
      : null;
    return el('p', { class: clase ? `precio ${clase}` : 'precio' },
      el('span', { class: 'precio-actual' }, formatoPrecio(p.precio, p.moneda)),
      anterior ? ' ' : null,
      anterior);
  }

  function linkBoton(pestana) {
    return el('a', { class: 'boton-link', href: `#${pestana}` }, `Ver ${PESTANAS[pestana].nombre}`, icono('derecha'));
  }

  function tarjeta(p, i) {
    const href = `#${p.id}`;
    const idNombre = `nombre-${p.id}`;
    const idChips = `chips-${p.id}`;
    const portada = p.fotos[0];
    const vendido = p.estado === 'vendido';
    return el('article', { class: vendido ? 'tarjeta es-vendido' : 'tarjeta' },
      el('a', { class: 'tarjeta-foto', href, tabindex: '-1' },
        el('img', {
          src: rutaFoto(p, portada),
          alt: portada.alt,
          width: '1200',
          height: '1200',
          loading: i < 2 ? null : 'lazy',
          fetchpriority: i === 0 ? 'high' : null,
          decoding: 'async',
        })),
      chipsDe(p, idChips),
      el('div', { class: 'tarjeta-titulo' },
        el('h2', { class: 'tarjeta-nombre', id: idNombre },
          el('a', { href, 'data-producto': p.id, 'aria-describedby': idChips }, p.nombre)),
        el('p', { class: 'categoria' }, etiquetaCategoria(p.categoria))),
      precioDe(p),
      vendido ? el('p', { class: 'salio' }, 'Este ya salió.') : botonWhatsApp(p, false, idNombre));
  }

  function quienesSomos() {
    return el('section', { class: 'quienes', 'aria-labelledby': 'quienes-titulo' },
      el('div', { class: 'quienes-caja' },
        el('h2', { id: 'quienes-titulo' }, 'Quiénes somos'),
        el('p', {}, 'Otra Vuelta es la tienda de una familia de Buenos Aires que vende lo que ya no usa: objetos cuidados, bien descriptos y a precio justo. Elegís, nos escribís por WhatsApp y coordinamos la entrega.')));
  }

  function vacio(titulo, texto, accion) {
    return el('section', { class: 'vacio', 'aria-labelledby': 'vacio-titulo' },
      el('div', { class: 'vacio-caja' },
        el('div', { class: 'vacio-circulo' }, icono('isotipo')),
        el('h2', { id: 'vacio-titulo' }, titulo),
        el('p', {}, texto),
        accion));
  }

  /* ---------- Vista: lista (una pestaña) ---------- */

  function reiniciarFiltros(pestana) {
    estado.filtros = { pestana, categoria: null, precio: 'todos' };
  }

  function mostrarLista(pestana) {
    modoLista(pestana);
    document.title = TITULO;
    const base = productosDe(pestana);

    if (!base.length) {
      if (pestana === 'a-estrenar') {
        main.replaceChildren(vacio('Todavía no hay nada a estrenar.', 'Mientras tanto, mirá lo que tiene historia.', linkBoton('con-historia')));
      } else {
        main.replaceChildren(vacio('Por ahora no queda nada con historia.', 'Volvé a pasar en unos días.', null), quienesSomos());
      }
      return;
    }

    const filtros = estado.filtros;
    const categorias = [...new Set(base.map((p) => p.categoria))]
      .sort((a, b) => ORDEN_CATEGORIA.get(a) - ORDEN_CATEGORIA.get(b));
    const hayDolares = base.some((p) => p.moneda === 'USD');
    const opciones = [{ valor: 'todos', etiqueta: 'Precio: todos' }, ...RANGOS_PRECIO];
    if (hayDolares) opciones.push(OPCION_DOLARES);
    if (filtros.categoria && !categorias.includes(filtros.categoria)) filtros.categoria = null;
    if (!opciones.some((o) => o.valor === filtros.precio)) filtros.precio = 'todos';

    const chips = [null, ...categorias].map((categoria) => el('button', {
      type: 'button',
      class: 'chip-filtro',
      'data-categoria': categoria,
      'aria-pressed': 'false',
      onclick: () => {
        filtros.categoria = categoria && filtros.categoria !== categoria ? categoria : null;
        actualizar();
      },
    }, categoria ? etiquetaCategoria(categoria) : 'Todo'));

    const selector = el('select', {
      'aria-label': 'Filtrar por precio',
      onchange: (e) => {
        filtros.precio = e.target.value;
        actualizar();
      },
    }, opciones.map((o) => el('option', { value: o.valor }, o.etiqueta)));

    const limpiar = () => {
      filtros.categoria = null;
      filtros.precio = 'todos';
      actualizar();
      chips[0].focus();
    };

    const conteo = el('span', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    const quitar = el('span', { class: 'quitar-filtros' },
      el('span', { 'aria-hidden': 'true' }, '·'),
      el('button', { type: 'button', class: 'link-accion', onclick: limpiar }, 'Quitar filtros'));
    const lista = el('div', { class: 'lista' });

    main.replaceChildren(
      el('section', { class: 'filtros', 'aria-label': 'Filtros' },
        el('div', { class: 'chips-categoria', role: 'group', 'aria-label': 'Categoría' }, chips),
        el('div', { class: 'filtros-fila' },
          el('span', { class: 'selector-precio' }, selector, icono('chevron')),
          el('p', { class: 'contador' }, conteo, quitar))),
      lista,
      quienesSomos());

    function actualizar() {
      const precio = opciones.find((o) => o.valor === filtros.precio);
      const resultado = base.filter((p) => (!filtros.categoria || p.categoria === filtros.categoria) && (!precio.cumple || precio.cumple(p)));
      for (const chip of chips) {
        chip.setAttribute('aria-pressed', String((chip.dataset.categoria || null) === filtros.categoria));
      }
      selector.value = filtros.precio;
      conteo.textContent = plural(resultado.length);
      quitar.hidden = !filtros.categoria && filtros.precio === 'todos';
      const tarjetas = [];
      resultado.forEach((p, i) => {
        try {
          tarjetas.push(tarjeta(p, i));
        } catch (error) {
          console.warn(`Otra Vuelta: no se pudo dibujar ${p.id}.`, error);
        }
      });
      lista.replaceChildren(...(resultado.length
        ? tarjetas
        : [el('div', { class: 'sin-resultados' },
          el('p', {}, 'No hay nada con esos filtros.'),
          el('button', { type: 'button', class: 'link-accion', onclick: limpiar }, 'Quitar filtros'))]));
    }

    actualizar();

    // En celular la fila de chips scrollea: al volver de una ficha, el chip elegido queda a la vista.
    const elegido = chips.find((chip) => chip.getAttribute('aria-pressed') === 'true');
    if (elegido && elegido !== chips[0]) {
      const fila = elegido.parentNode;
      fila.scrollLeft = elegido.offsetLeft - fila.offsetLeft - 20;
    }
  }

  /* ---------- Vista: ficha ---------- */

  function galeria(p) {
    const total = p.fotos.length;
    let actual = 0;

    const carrusel = el('div', {
      class: 'carrusel',
      tabindex: '0',
      role: 'group',
      'aria-roledescription': 'carrusel',
      'aria-label': total > 1 ? 'Fotos del producto. Usá las flechas para pasar de foto.' : 'Foto del producto',
    }, p.fotos.map((foto, i) => el('img', {
      src: rutaFoto(p, foto),
      alt: foto.alt,
      width: '1200',
      height: '1200',
      loading: i === 0 ? null : 'lazy',
      fetchpriority: i === 0 ? 'high' : null,
      decoding: 'async',
    })));

    const contadorVisible = el('span', { 'aria-hidden': 'true' }, `1 / ${total}`);
    const contadorLeido = el('span', { class: 'sr' }, `Foto 1 de ${total}`);
    const marco = el('div', { class: 'galeria-marco' }, carrusel);
    if (total > 1) marco.append(el('p', { class: 'contador-fotos', 'aria-live': 'polite' }, contadorVisible, contadorLeido));

    const miniaturas = total > 1 ? p.fotos.map((foto, i) => el('button', {
      type: 'button',
      class: 'miniatura',
      'aria-label': `Foto ${i + 1}: ${foto.alt}`,
      'aria-current': i === 0 ? 'true' : null,
      onclick: () => ir(i),
    }, el('img', { src: rutaFoto(p, foto), alt: '', width: '1200', height: '1200', loading: 'lazy', decoding: 'async' }))) : [];

    function marcar(i) {
      actual = i;
      const activa = miniaturas[i];
      const fila = activa && activa.parentNode;
      if (fila && fila.isConnected) {
        const caja = fila.getBoundingClientRect();
        const borde = activa.getBoundingClientRect();
        if (borde.left < caja.left) fila.scrollLeft -= caja.left - borde.left + 6;
        else if (borde.right > caja.right) fila.scrollLeft += borde.right - caja.right + 6;
      }
      contadorVisible.textContent = `${i + 1} / ${total}`;
      contadorLeido.textContent = `Foto ${i + 1} de ${total}`;
      miniaturas.forEach((boton, j) => {
        if (j === i) boton.setAttribute('aria-current', 'true');
        else boton.removeAttribute('aria-current');
      });
    }

    function ir(i) {
      const destino = Math.max(0, Math.min(total - 1, i));
      carrusel.scrollTo({ left: destino * carrusel.clientWidth, behavior: 'auto' });
      marcar(destino);
      return destino;
    }

    let pendiente = false;
    carrusel.addEventListener('scroll', () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        const i = Math.round(carrusel.scrollLeft / Math.max(1, carrusel.clientWidth));
        if (i !== actual && i >= 0 && i < total) marcar(i);
      });
    }, { passive: true });

    carrusel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        ir(actual + (e.key === 'ArrowRight' ? 1 : -1));
      }
    });

    const galeriaEl = el('section', { class: 'galeria', 'aria-label': 'Fotos' }, marco);
    if (miniaturas.length) {
      const fila = el('div', { class: 'miniaturas' }, miniaturas);
      fila.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const desde = Math.max(0, miniaturas.indexOf(document.activeElement));
        miniaturas[ir(desde + (e.key === 'ArrowRight' ? 1 : -1))].focus();
      });
      galeriaEl.append(fila);
    }
    return galeriaEl;
  }

  function descripcionDe(texto) {
    if (!esTexto(texto)) return null;
    return el('div', { class: 'descripcion' }, texto.trim().split(/\n\s*\n/).map((parrafo) => {
      const nodo = el('p');
      parrafo.split('\n').forEach((linea, i) => {
        if (i) nodo.append(el('br'));
        nodo.append(linea);
      });
      return nodo;
    }));
  }

  function seccion(clave, titulo, contenido) {
    const id = `titulo-${clave}`;
    return el('section', { class: `seccion seccion-${clave}`, 'aria-labelledby': id }, el('h2', { id }, titulo), contenido);
  }

  function listaConIconos(items, nombreIcono) {
    return el('ul', { class: 'lista-iconos' },
      items.map((texto) => el('li', {}, icono(nombreIcono, `icono-${nombreIcono}`), el('span', {}, texto))));
  }

  function seccionesDe(p) {
    const partes = [];
    if (esTexto(p.medidas)) partes.push(seccion('medidas', 'Medidas', el('p', { class: 'medidas' }, p.medidas)));
    const detalles = textos(p.detalles);
    if (detalles.length) partes.push(seccion('tiene', 'Lo que tiene', listaConIconos(detalles, 'tilde')));
    const defectos = p.condicion === 'usado' ? textos(p.defectos) : [];
    if (defectos.length) partes.push(seccion('marcas', 'Marcas de uso', listaConIconos(defectos, 'aviso')));
    if (esTexto(p.entrega)) partes.push(seccion('entrega', 'Entrega', el('p', {}, p.entrega)));
    return partes.length ? el('div', { class: 'secciones' }, partes) : null;
  }

  function ficha(p) {
    const vendido = p.estado === 'vendido';
    const pestana = PESTANA_DE[p.condicion];
    const fecha = formatoFecha(p.fecha_publicacion);

    const cabecera = el('div', { class: 'ficha-cabecera' },
      chipsDe(p),
      el('div', { class: 'ficha-titulo' },
        el('h1', { class: 'ficha-nombre', id: 'ficha-nombre' }, p.nombre),
        el('p', { class: 'meta' }, fecha ? `${etiquetaCategoria(p.categoria)} · Publicado el ${fecha}` : etiquetaCategoria(p.categoria))),
      precioDe(p, 'precio-ficha'));

    if (vendido) {
      cabecera.append(el('div', { class: 'caja-aviso' }, el('p', {}, 'Este ya salió. Mirá lo demás.'), linkBoton(pestana)));
    } else {
      const boton = botonWhatsApp(p, true, null);
      if (boton) {
        cabecera.append(boton);
        if (p.estado === 'reservado') {
          cabecera.append(el('p', { class: 'nota-reservado' }, 'Está reservado. Si querés, preguntá igual: a veces se libera.'));
        }
        cabecera.append(el('div', { class: 'mensaje-caja' },
          el('p', { class: 'mensaje-etiqueta' }, 'Te abrimos WhatsApp con este mensaje ya escrito:'),
          el('p', { class: 'mensaje' }, mensajeWhatsApp(p))));
      }
    }

    const datos = el('div', { class: 'ficha-datos' }, cabecera, descripcionDe(p.descripcion), seccionesDe(p));
    if (typeof p.ml_url === 'string' && RE_ML.test(p.ml_url)) {
      datos.append(el('a', { class: 'link-ml', href: p.ml_url, target: '_blank', rel: 'noopener' },
        'Ver la publicación en Mercado Libre', icono('derecha')));
    }

    // El foco va a la ficha entera (nombrada por el h1) para que el Tab siga el orden visual: fotos y después datos.
    return el('article', {
      class: vendido ? 'ficha es-vendido' : 'ficha',
      tabindex: '-1',
      'aria-labelledby': 'ficha-nombre',
    }, galeria(p), datos);
  }

  function mostrarFicha(id, enfocar) {
    const p = estado.productos.find((x) => x.id === id);
    modoFicha(p ? PESTANA_DE[p.condicion] : 'con-historia');
    let foco;
    if (p) {
      document.title = `${p.nombre} · ${TITULO}`;
      foco = ficha(p);
      main.replaceChildren(foco);
    } else {
      document.title = TITULO;
      foco = el('h1', { tabindex: '-1' }, 'Ese producto no está más.');
      main.replaceChildren(el('div', { class: 'ficha ficha-vacia' },
        el('div', { class: 'caja-aviso' }, foco, linkBoton('con-historia'))));
    }
    window.scrollTo(0, 0);
    if (enfocar) foco.focus({ preventScroll: true });
  }

  /* ---------- Encabezado según la vista ---------- */

  function modoLista(pestana) {
    encabezado.hidden = false;
    barraFicha.hidden = true;
    for (const a of pestanas) {
      if (a.dataset.pestana === pestana) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }

  function modoFicha(pestana) {
    const nombre = PESTANAS[pestana].nombre;
    encabezado.hidden = true;
    barraFicha.hidden = false;
    volver.setAttribute('href', `#${pestana}`);
    volver.setAttribute('aria-label', `Volver a ${nombre}`);
    volverTexto.textContent = nombre;
  }

  /* ---------- Navegación por hash ---------- */

  function leerRuta() {
    let hash = location.hash.replace(/^#/, '');
    try {
      hash = decodeURIComponent(hash);
    } catch (e) {
      hash = '';
    }
    // Un link pegado con mayúsculas o con puntuación al final ("…patrick).") abre igual la ficha;
    // si parece un id pero no existe, la ficha avisa "Ese producto no está más.".
    hash = hash.trim().toLowerCase().replace(/[^a-z0-9]+$/, '');
    if (hash === 'a-estrenar') return { tipo: 'lista', pestana: 'a-estrenar' };
    if (RE_ID.test(hash) || RE_ID_PARECIDO.test(hash)) return { tipo: 'ficha', id: hash };
    return { tipo: 'lista', pestana: 'con-historia' };
  }

  function navegar() {
    const anterior = estado.vista;
    const ruta = leerRuta();
    if (anterior && anterior.tipo === 'lista') estado.scroll[anterior.pestana] = window.scrollY;

    if (ruta.tipo === 'ficha') {
      // La entrada del historial recuerda si a esta ficha se llegó desde la lista:
      // así "Volver" sigue andando después de Atrás, Adelante o recargar.
      const marca = history.state && history.state.otraVuelta;
      if (marca) {
        estado.volverConHistorial = marca.desdeLista === true;
      } else {
        estado.volverConHistorial = Boolean(anterior && anterior.tipo === 'lista');
        try {
          history.replaceState({ otraVuelta: { desdeLista: estado.volverConHistorial } }, '');
        } catch (e) {
          estado.volverConHistorial = false;
        }
      }
      estado.vista = ruta;
      mostrarFicha(ruta.id, Boolean(anterior));
    } else {
      const desdeFicha = Boolean(anterior && anterior.tipo === 'ficha');
      if (!desdeFicha || estado.filtros.pestana !== ruta.pestana) reiniciarFiltros(ruta.pestana);
      estado.vista = ruta;
      mostrarLista(ruta.pestana);
      if (desdeFicha) {
        const y = estado.scroll[ruta.pestana];
        window.scrollTo(0, y || 0);
        // Si la lista nunca se vio (se entró por el link de la ficha), el foco va al contenido, arriba.
        const link = y === undefined ? null : main.querySelector(`a[data-producto="${CSS.escape(anterior.id)}"]`);
        (link || main).focus({ preventScroll: true });
      } else if (anterior) {
        window.scrollTo(0, 0);
        const activo = document.activeElement;
        if (!activo || activo === document.body || !activo.isConnected) main.focus({ preventScroll: true });
      }
    }
    main.removeAttribute('aria-busy');
  }

  // Un error al dibujar no deja la página en blanco.
  function navegarSeguro() {
    try {
      navegar();
    } catch (error) {
      console.error('Otra Vuelta: error al dibujar la vista.', error);
      mostrarError();
    }
  }

  function mostrarError() {
    main.removeAttribute('aria-busy');
    main.replaceChildren(vacio('No pudimos cargar los productos.', 'Revisá la conexión y probá de nuevo.',
      el('button', { type: 'button', class: 'boton-link', onclick: () => location.reload() }, 'Probar de nuevo')));
  }

  async function cargar() {
    try {
      const respuesta = await fetch(CATALOGO, { cache: 'no-cache' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      if (!datos || datos.version_esquema !== 1) {
        console.warn('Otra Vuelta: version_esquema distinta de 1; revisar catalogo-schema.md.');
      }
      estado.productos = normalizar(datos && datos.productos);
    } catch (error) {
      console.error('Otra Vuelta: no se pudo cargar el catálogo.', error);
      if (leerRuta().tipo === 'ficha') modoLista('con-historia');
      mostrarError();
      return;
    }
    estado.listo = true;
    navegarSeguro();
  }

  /* ---------- Arranque ---------- */

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Encabezado correcto antes de que llegue el catálogo (evita que parpadee al abrir el link de una ficha).
  const rutaInicial = leerRuta();
  if (rutaInicial.tipo === 'ficha') modoFicha('con-historia');
  else modoLista(rutaInicial.pestana);

  window.addEventListener('hashchange', () => {
    if (estado.listo) navegarSeguro();
  });

  $('saltar').addEventListener('click', (e) => {
    e.preventDefault();
    main.focus();
  });

  $('marca-link').addEventListener('click', (e) => {
    const ruta = leerRuta();
    if (!estado.listo || ruta.tipo !== 'lista' || ruta.pestana !== 'con-historia') return;
    e.preventDefault();
    reiniciarFiltros('con-historia');
    try {
      mostrarLista('con-historia');
    } catch (error) {
      console.error('Otra Vuelta: error al dibujar la vista.', error);
      mostrarError();
    }
    window.scrollTo(0, 0);
  });

  volver.addEventListener('click', (e) => {
    if (estado.volverConHistorial) {
      e.preventDefault();
      history.back();
    }
  });

  // iOS solo muestra el estado presionado (:active, ladrillo oscuro) si la página escucha toques.
  document.addEventListener('touchstart', () => {}, { passive: true });

  cargar();
})();
