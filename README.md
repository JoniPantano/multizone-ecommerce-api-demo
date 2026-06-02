# MultizonaProyect Demo

This repository showcases a backend demo for a multi-zone e-commerce platform.

The project is designed around a practical business need: running multiple stores or sales zones inside the same platform while keeping products, orders, carts, and payment flows under control.

## What this demo includes

- JWT-based authentication
- Email verification with code confirmation
- Product catalog with image support
- Persistent shopping cart stored in the database
- Order creation from cart and direct purchase flow
- Mercado Pago payment integration
- Backend structure prepared for multi-zone commerce scenarios

## What kind of project this fits

This type of backend can serve as a foundation for:

- local marketplaces
- regional e-commerce platforms
- businesses that need separate stock, orders, or users by location
- projects that need checkout, carts, and admin features as the next step

## Development approach

The goal of this demo is not only to expose endpoints, but to show implementation quality and business logic handling:

- backend-side validation
- stock control
- frontend-friendly error responses
- duplicate order protection
- versioned database structure with Prisma migrations
- cloud-ready deployment flow

## Stack

- Node.js
- Express
- PostgreSQL
- Prisma ORM
- JWT
- Swagger / OpenAPI
- Mercado Pago

## Public repository note

This is a sanitized public portfolio copy.

- no real credentials are included
- no `.env` files are included
- no database backups are included
- no internal QA-only environment rebuild scripts are included

## About the codebase

This project is meant to reflect a realistic backend foundation rather than a minimal tutorial example.  
That is why it includes migrations, environment configuration, payment integration, business validation, and a modular structure organized by responsibility.

## If you need something similar

If you are looking for a backend of this kind for your own project, this demo works as a reference for scope, architecture, and implementation detail.
