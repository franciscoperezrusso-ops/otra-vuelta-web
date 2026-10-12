# Otra Vuelta · web

Cosas de familia, listas para otra vuelta.
Sitio: https://franciscoperezrusso-ops.github.io/otra-vuelta-web/

Sitio estático en GitHub Pages: HTML, CSS y JS planos, sin build y sin dependencias (solo las fuentes de Google Fonts). Se publica solo con cada commit a `main`.

## Estructura

```
index.html                 el sitio entero: el JS dibuja pestañas, filtros, tarjetas y fichas
404.html                   página para direcciones que no existen
css/styles.css             estilos (mobile-first)
js/app.js                  lógica; arriba de todo, la configuración (número de WhatsApp, rangos de precio)
data/products.json         el catálogo
data/products.schema.json  esquema para validar el catálogo
img/<id>/01.webp …         fotos de cada producto
img/og.png                 imagen de la vista previa al compartir el link
img/favicon.svg, img/favicon-32.png, img/apple-touch-icon.png   íconos
.nojekyll                  le dice a GitHub Pages que publique los archivos tal cual
```

## Cómo se actualiza el catálogo

Para sumar, cambiar o vender un producto se tocan **solo** `data/products.json` e `img/<id>/`. El código no se toca.

- Las reglas de cada campo, los ids y las fotos están en `catalogo-schema.md` (documento del proyecto).
- Validar antes de cada commit:

  ```
  python -c "import json, jsonschema; jsonschema.validate(json.load(open('data/products.json', encoding='utf-8')), json.load(open('data/products.schema.json', encoding='utf-8'))); print('OK')"
  ```

- Un vendido no se borra: cambia `estado` a `"vendido"` y suma `fecha_vendido`. La lista lo muestra al final 60 días; la ficha sigue abriendo por link.

## Links

- Inicio: `.../otra-vuelta-web/`
- Pestañas: `.../otra-vuelta-web/#con-historia` y `.../otra-vuelta-web/#a-estrenar`
- Ficha de un producto: `.../otra-vuelta-web/#<id>`, por ejemplo `#0001-lavarropas-patrick`

## Lo que no va en este repo

El repo es público y `data/products.json` lo puede leer cualquiera. Acá no va nada interno: ni precio mínimo, ni costos, ni de quién es cada cosa, ni datos de compradores. Eso vive en el repo privado del inventario.
