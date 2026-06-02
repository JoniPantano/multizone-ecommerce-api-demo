# Multizona E-Commerce API

Backend REST del proyecto Multizona (Etapa 1).  
Incluye autenticación con JWT, registro con verificación por código, manejo inicial multi-zona y módulos base de productos, carrito y órdenes.

## Tecnologías

- Node.js
- Express
- PostgreSQL
- Prisma ORM
- JWT
- Swagger (OpenAPI)
- Resend (envío de emails)

## Alcance de Etapa 1

- Registro con verificación por email
- Login con `zoneId`
- CRUD de productos
- Órdenes básicas
- Carrito básico
- Swagger para pruebas de endpoints
- Base multi-zona inicial

## Requisitos

- Node.js 20+ recomendado
- PostgreSQL activo
- pnpm (via Corepack)

## Instalación

```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate
pnpm install
```

## Variables de entorno

1. Crear archivo `.env` a partir de `.env.example`.
2. Completar valores según entorno local o producción.

Variables clave:

- `DATABASE_URL`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `CORS_ORIGIN`
- `PUBLIC_API_URL` (si se quiere exponer Swagger público)

## PostgreSQL y Prisma

1. Crear base de datos en PostgreSQL.
2. Configurar `DATABASE_URL` en `.env`.
3. Ejecutar migraciones:

```bash
pnpm prisma migrate dev
```

Para producción (Render), las migraciones se aplican con:

```bash
pnpm prisma migrate deploy
```

## Correr el backend

Desarrollo:

```bash
pnpm dev
```

Producción local:

```bash
pnpm start
```

## Scripts disponibles

- `pnpm dev` -> inicia API con nodemon
- `pnpm start` -> inicia API normal
- `pnpm start:render` -> arranque pensado para Render con migraciones
- `pnpm db:migrate` -> migración de desarrollo
- `pnpm db:generate` -> genera cliente Prisma
- `pnpm db:studio` -> abre Prisma Studio
- `pnpm db:status` -> estado de migraciones
- `pnpm db:reset` -> resetea DB de desarrollo
- `pnpm db:seed:products` -> carga productos de prueba para QA
- `pnpm tunnel` -> expone puerto local por ngrok

## Swagger

Con backend levantado:

- `http://localhost:3000/api-docs`
- `http://localhost:3000/api-docs.json`

Si se configura `PUBLIC_API_URL`, Swagger muestra también ese servidor público.

## Flujo de autenticación

1. `POST /api/auth/register`  
   Solicita registro y genera código de verificación.
2. `POST /api/auth/verify-email`  
   Verifica código y recién ahí crea el usuario.
3. `POST /api/auth/login`  
   Requiere `email`, `password` y `zoneId`. Devuelve JWT.
4. Usar JWT en endpoints protegidos  
   Header: `Authorization: Bearer <token>`.

## Endpoints principales

Auth:

- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/login`

Productos:

- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

Carrito:

- `GET /api/cart`
- `POST /api/cart/add`

Órdenes:

- `GET /api/orders`
- `POST /api/orders`

Salud:

- `GET /api/health`

## Notas para frontend

- Casi todos los módulos de negocio requieren JWT.
- `login` necesita `zoneId`.
- En QA puede habilitarse `EXPOSE_VERIFICATION_CODE=true` para facilitar pruebas del flujo de registro.
- Si usás entorno público, revisar `CORS_ORIGIN` y `PUBLIC_API_URL`.

## Emails y SMTP

Actualmente el backend usa **Resend** (`RESEND_API_KEY`, `RESEND_FROM`).

También se dejan variables SMTP en `.env.example` (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`) para compatibilidad futura.  
No se usan en la lógica actual, pero quedan documentadas para una migración de proveedor si se necesita.

## Entrega y seguridad (IMPORTANTE)

- No subir `.env` al repositorio.
- No incluir claves reales en documentación ni commits.
- Mantener migraciones Prisma versionadas dentro de `prisma/migrations`.

## Nota de portfolio

Esta copia está pensada para exhibición pública.
No incluye credenciales reales, backups de base de datos ni scripts internos de reconstrucción de entornos demo.
