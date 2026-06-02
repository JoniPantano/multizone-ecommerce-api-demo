# MultizonaProyect Demo

Este repositorio muestra una demo de backend para un e-commerce multi-zona.

La idea del proyecto es resolver una necesidad bastante concreta: operar varias tiendas o zonas dentro de una misma plataforma, manteniendo separacion de datos, flujo de compra y autenticacion, pero sin perder control central sobre la logica del negocio.

## Que demuestra esta demo

- Registro y login con JWT
- Verificacion de cuenta por codigo
- Catalogo de productos con imagenes
- Carrito persistente en base de datos
- Ordenes desde carrito y compra directa
- Integracion de pagos con Mercado Pago
- Base preparada para entornos multi-zona

## En que tipo de proyecto encaja

Este tipo de backend sirve como base para:

- marketplaces locales
- tiendas con cobertura por zonas
- negocios que necesitan separar stock, ordenes o usuarios por region
- proyectos que necesitan checkout, carrito y paneles administrativos como siguiente etapa

## Enfoque de trabajo

El objetivo de esta demo no es solo mostrar endpoints, sino mostrar criterio de implementacion:

- validaciones de negocio en backend
- control de stock
- manejo de errores util para frontend
- proteccion contra ordenes duplicadas
- estructura versionada con Prisma y migraciones
- preparacion para despliegue en la nube

## Stack utilizado

- Node.js
- Express
- PostgreSQL
- Prisma ORM
- JWT
- Swagger / OpenAPI
- Mercado Pago

## Estado del repositorio

Esta es una copia publica y sanitizada para portfolio.

- no incluye credenciales reales
- no incluye archivos `.env`
- no incluye backups de base de datos
- no incluye scripts internos de reconstruccion usados solo para QA

## Sobre el codigo

El proyecto esta pensado para ser una base realista, no un ejemplo minimo de laboratorio.  
Por eso incluye migraciones, manejo de errores, configuracion de entorno, integracion de pagos y estructura de modulos separada por responsabilidad.

## Si te interesa algo similar

Si queres un backend de este estilo para un proyecto propio, esta demo sirve como referencia de alcance, arquitectura y nivel de detalle de implementacion.
