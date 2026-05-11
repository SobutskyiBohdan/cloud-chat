# Cloud Chat

High-load real-time messenger with admin dashboard.

## Architecture

```
cloud-chat/
├── backend/          # Express.js + Socket.io + Prisma + Redis
│   ├── prisma/       # Schema + migrations + seed
│   └── src/
│       ├── index.ts      - HTTP server entry point
│       ├── socket.ts     - Socket.io + Redis Pub/Sub
│       ├── middleware/   - JWT auth, admin guard
│       ├── routes/       - auth / users / chats / admin
│       └── lib/          - prisma, redis, jwt, cloudinary
├── frontend/         # Next.js 15 App Router (UI only)
│   ├── app/          - Pages (auth, chat, admin)
│   ├── components/   - UI components
│   └── lib/
│       ├── api.ts    - Fetch wrapper → backend
│       └── jwt.ts    - Token verification for middleware
├── docker-compose.yml
└── k8s/              - Kubernetes manifests
```

## Tech Stack

| Layer        | Technology |
|-------------|-----------|
| Frontend     | Next.js 15, TypeScript, Tailwind, shadcn/ui |
| Backend      | Express.js, Socket.io, TypeScript |
| Database     | PostgreSQL 15 + Prisma ORM |
| Auth         | JWT (HTTP-only cookies), RBAC USER/ADMIN |
| Real-time    | Socket.io + Redis Pub/Sub (multi-instance) |
| Cache        | Redis |
| Media        | Cloudinary |
| Email (dev)  | MailHog |
| Infra        | Docker Compose + Kubernetes |

## Quick Start

### 1. Start infrastructure
```bash
docker-compose up postgres redis mailhog -d
```

### 2. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev       # → http://localhost:4000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev       # → http://localhost:3000
```

### Default accounts
| Email | Password | Role |
|-------|----------|------|
| admin@cloud-chat.app | admin123! | ADMIN |
| alice@example.com | user123! | USER |
| bob@example.com | user123! | USER |

### URLs
- App: http://localhost:3000
- API: http://localhost:4000
- MailHog: http://localhost:8025
- Admin: http://localhost:3000/admin

## Run with Docker

```bash
docker-compose up --build
```

## Deploy to Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml    # Edit secrets first!
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

**Ingress routes:**
- `cloud-chat.app` → frontend `:3000`
- `api.cloud-chat.app` → backend `:4000` (sticky sessions for WS)

## How real-time blocking works

1. Admin calls `POST /api/admin/users/:id/block`
2. Backend: `isBlocked=true` in PostgreSQL + `blocked:{userId}` key in Redis
3. Redis Pub/Sub publishes to all backend instances
4. Each instance disconnects the user's socket immediately via `io.in(room).disconnectSockets()`
5. Frontend receives `force:disconnect` event → redirected to `/login`

## Features

- **Search**: `@nickname` priority → fallback to full name
- **Nickname uniqueness**: enforced at registration and profile update
- **Admin Dashboard** (`/admin`): users, groups, settings, stats, audit logs
- **PWA**: installable via browser manifest
- **Mobile-first**: responsive layout and admin tables
