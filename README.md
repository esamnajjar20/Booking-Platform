# Booking Platform API

[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-ioredis-DC382D?logo=redis)](https://redis.io/)
[![Vitest](https://img.shields.io/badge/Vitest-3.x-6E9F18?logo=vitest)](https://vitest.dev/)

Production-ready REST API for booking services, built with Node.js, Express, TypeScript, Prisma, PostgreSQL, and Redis.

## Features

- JWT authentication (access + refresh flow)
- Role-based authorization (`USER`, `ADMIN`)
- Booking lifecycle endpoints (create, cancel, confirm)
- Service CRUD endpoints (admin for write operations)
- Redis integration for caching and account lock tracking
- Security middleware: Helmet, CORS, rate limiting, cookies
- Validation layer with Zod
- Swagger docs at `/api-docs`
- Health and readiness endpoints
- Unit and integration tests with Vitest + Supertest

## Tech stack

- Runtime: Node.js
- Framework: Express
- Language: TypeScript
- Database: PostgreSQL + Prisma
- Cache: Redis (`ioredis`)
- Auth: `jsonwebtoken` + `bcrypt`
- Logging: Winston + Morgan
- Testing: Vitest + Supertest

## Project structure

```txt
booking-platform/
├── prisma/
├── scripts/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── jobs/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── tests/
│   ├── utils/
│   └── server.ts
├── .env.example
├── package.json
└── vitest.config.ts
```

## Prerequisites

- Node.js 18+ (LTS recommended)
- PostgreSQL
- Redis

## Environment setup

1. Copy `.env.example` to `.env`.
2. Set environment values for your local setup.

All environment values are validated at startup in `src/config/env.ts`.

## Installation and database

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Run the app

```bash
# Development
npm run dev

# Build
npm run build

# Production run
npm start
```

## API and health endpoints

- Base API: `/api/v1`
- Swagger UI: `/api-docs`
- Health: `/health`
- Readiness: `/ready`
- Detailed checks: `/health/db`, `/health/redis`

## Main endpoint groups

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

### Services

- `GET /api/v1/services`
- `GET /api/v1/services/:id`
- `POST /api/v1/services` (ADMIN)
- `PUT /api/v1/services/:id` (ADMIN)
- `DELETE /api/v1/services/:id` (ADMIN)

### Bookings

- `GET /api/v1/bookings` (authenticated)
- `GET /api/v1/bookings/:id` (authenticated)
- `POST /api/v1/bookings` (authenticated)
- `PATCH /api/v1/bookings/:id/cancel` (authenticated)
- `PATCH /api/v1/bookings/:id/confirm` (ADMIN)

## Testing

```bash
# Watch mode
npm test

# Run once
npm test -- --run

# Coverage
npm run test:coverage
```

## Useful scripts

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:migrate:prod`
- `npm run db:seed`
- `npm run db:studio`
- `npm test`
- `npm run lint`
- `npm run format`

## Architecture notes

- Controllers: HTTP layer only
- Services: business logic
- Middleware: auth, authorization, validation, error handling, security
- Centralized config with startup validation
