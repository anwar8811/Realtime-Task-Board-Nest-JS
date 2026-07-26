# Realtime Task Board

A full-stack, role-aware task management app with live updates and AI-assisted task descriptions.

Users sign up, create and manage their own tasks, and see changes from other sessions appear instantly — no refresh needed. Admins see every task across all users. An optional AI assistant can generate a task description from its title with one click.

Built with **NestJS + Prisma + PostgreSQL** on the backend and **Next.js (App Router) + TypeScript + Tailwind CSS** on the frontend, connected over REST and **Socket.io** for realtime sync.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone and install](#1-clone-and-install)
  - [2. Configure environment variables](#2-configure-environment-variables)
  - [3. Set up the database](#3-set-up-the-database)
  - [4. Run the apps](#4-run-the-apps)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Realtime Events](#realtime-events)
- [Role-Based Access Control](#role-based-access-control)
- [Testing](#testing)
- [Scripts Reference](#scripts-reference)

---

## Features

- **Authentication** — email/password registration and login, JWT-based sessions, bcrypt-hashed passwords.
- **Role-based access control** — every user is `user` or `admin`. A `user` only ever sees and manages their own tasks; an `admin` sees and manages everyone's. Enforced server-side on every REST call and every realtime event — never trusted from the client.
- **Task management** — create, read, update, delete tasks with a title, optional description, and status (`todo` / `in_progress` / `done`), scoped to the signed-in user (or all users, for admins).
- **Live updates** — task creates/updates/deletes made in one browser tab (or by another user, for an admin) appear instantly in every other open, permitted session via Socket.io — no manual refresh, no polling.
- **AI-assisted descriptions** — an "AI Summarise" button generates a task description from its title (and any existing description) via an OpenRouter-backed LLM call, proxied server-side so no AI provider key ever reaches the browser. Fully optional — the app runs normally with this feature switched off.
- **Status filtering** — filter the task list by status.

## Tech Stack

**Backend**

- [NestJS 11](https://nestjs.com/) — modular Node.js framework (Express under the hood)
- [Prisma 6](https://www.prisma.io/) ORM + PostgreSQL
- [Socket.io](https://socket.io/) (`@nestjs/websockets`, `@nestjs/platform-socket.io`) for realtime
- `@nestjs/jwt` + `passport-jwt` for authentication, `bcrypt` for password hashing
- `class-validator` / `class-transformer` for request validation
- Native `fetch` + `AbortSignal.timeout` for the OpenRouter integration (no extra HTTP client dependency)
- Jest + Supertest (+ real `socket.io-client` sockets) for unit and e2e tests

**Frontend**

- [Next.js 16](https://nextjs.org/) (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- `socket.io-client` for the realtime connection
- Jest + React Testing Library for component/unit tests

## Architecture

```
┌────────────────────┐        REST (JWT bearer)         ┌──────────────────────┐
│                     │ ───────────────────────────────▶ │                      │
│   Next.js frontend  │                                   │   NestJS backend     │
│   (port 3001)       │ ◀─────────────────────────────── │   (port 3000)        │
│                     │        Socket.io (JWT handshake) │                      │
└────────────────────┘ ◀───────────────────────────────▶ └──────────┬───────────┘
                                                                      │
                                                          ┌───────────▼───────────┐
                                                          │   PostgreSQL (Prisma) │
                                                          └───────────────────────┘
                                                                      │
                                                          ┌───────────▼───────────┐
                                                          │  OpenRouter (optional) │
                                                          │  — summarize proxy    │
                                                          └───────────────────────┘
```

- The frontend never talks to Postgres or OpenRouter directly — every read/write and every AI call goes through the NestJS API.
- The JWT issued at login is used both as a REST `Authorization: Bearer` header and as the Socket.io handshake auth token, so REST scoping and realtime scoping share the exact same identity and role.
- A single shared `taskScopeWhere(user)` function (in `task-access.guard.ts`) is the one place ownership/role scoping is decided — reused by the REST controller, the realtime gateway's room-joining logic, and every Prisma query that touches tasks. There is deliberately no second, parallel scoping implementation to drift out of sync.

## Project Structure

```
.
├── backend/                     # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma        # User / Task models
│   │   ├── migrations/
│   │   └── seed.ts              # creates the bootstrap admin account
│   ├── src/
│   │   ├── auth/                 # register / login / JWT strategy & guard
│   │   ├── tasks/                 # CRUD controller/service, RBAC guard, Socket.io gateway
│   │   ├── ai/                    # OpenRouter summarize proxy (POST /tasks/summarize)
│   │   ├── config/                # env variable validation
│   │   ├── common/filters/        # global HTTP exception filter
│   │   └── prisma/                # PrismaService (global module)
│   └── test/                      # e2e specs (Supertest + real sockets)
│
└── frontend/                     # Next.js app
    ├── app/
    │   ├── login/                 # login page
    │   └── tasks/                 # main task board page
    ├── components/                # TaskForm, TaskList, StatusFilter
    ├── hooks/                     # useTasks (list state), useTaskSocket (realtime wiring)
    └── lib/                       # api client, auth context, socket factory
```

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- A running PostgreSQL instance (local install, Docker container, or a hosted instance)

### 1. Clone and install

```bash
git clone https://github.com/anwar8811/Realtime-Task-Board-Nest-JS.git
cd Realtime-Task-Board-Nest-JS

cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment variables

Copy the example env files and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

See the [Environment Variables](#environment-variables) section for what each value does. At minimum you must set `DATABASE_URL` and `JWT_SECRET` in `backend/.env`.

### 3. Set up the database

```bash
cd backend
npx prisma migrate deploy   # applies existing migrations
npx prisma db seed          # creates the bootstrap admin account from ADMIN_EMAIL/ADMIN_PASSWORD
```

### 4. Run the apps

In two separate terminals:

```bash
cd backend && npm run start:dev    # http://localhost:3000
```

```bash
cd frontend && npm run dev         # http://localhost:3001
```

Open `http://localhost:3001`, register a new account (or log in as the seeded admin), and start creating tasks. Open the same page in a second browser tab/window to see realtime sync in action.

## Environment Variables

### Backend (`backend/.env`)

| Variable                         | Required  | Default                          | Description                                                                                                                                          |
| -------------------------------- | --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | ✅        | —                                | PostgreSQL connection string                                                                                                                         |
| `JWT_SECRET`                     | ✅        | —                                | Secret used to sign JWTs. Must be at least 32 characters. Never log or expose this.                                                                  |
| `PORT`                           |           | `3000`                           | Port the NestJS server listens on                                                                                                                    |
| `NODE_ENV`                       |           | `development`                    | `development` \| `production` \| `test`                                                                                                              |
| `JWT_EXPIRES_IN`                 |           | `1h`                             | JWT access token lifetime                                                                                                                            |
| `FRONTEND_ORIGIN`                |           | `http://localhost:3001`          | Allowed CORS origin for both REST and Socket.io                                                                                                      |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed only | —                                | Used once by `prisma db seed` to create the single bootstrap admin account. There is no in-app way to promote a user to admin.                       |
| `OPENROUTER_API_KEY`             | optional  | —                                | OpenRouter API key. If unset, the app boots normally and `POST /tasks/summarize` returns `503` until it's configured. **Never commit a real value.** |
| `OPENROUTER_MODEL`               | optional  | `google/gemma-4-26b-a4b-it:free` | Which OpenRouter model to call for summarization                                                                                                     |

### Frontend (`frontend/.env.local`)

| Variable              | Required | Default                 | Description                                                                         |
| --------------------- | -------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` |          | `http://localhost:3000` | Base URL of the backend API (used for both REST calls and the Socket.io connection) |

## API Reference

All endpoints except registration and login require a valid JWT: `Authorization: Bearer <token>`.

| Method   | Path               | Description                                                                           | Auth   |
| -------- | ------------------ | ------------------------------------------------------------------------------------- | ------ |
| `POST`   | `/auth/register`   | Create a new account (always created with the `user` role)                            | Public |
| `POST`   | `/auth/login`      | Log in, returns `{ accessToken }`                                                     | Public |
| `GET`    | `/auth/me`         | Returns the decoded identity of the current token                                     | JWT    |
| `GET`    | `/tasks`           | List tasks — own tasks for a `user`, all tasks for an `admin`                         | JWT    |
| `POST`   | `/tasks`           | Create a task, owned by the current user                                              | JWT    |
| `GET`    | `/tasks/:id`       | Get a single task (must be owned by the caller, or caller is `admin`)                 | JWT    |
| `PATCH`  | `/tasks/:id`       | Update a task (same ownership rule)                                                   | JWT    |
| `DELETE` | `/tasks/:id`       | Delete a task (same ownership rule)                                                   | JWT    |
| `POST`   | `/tasks/summarize` | Generate a description from `{title, description?}` via OpenRouter — persists nothing | JWT    |
| `GET`    | `/health`          | Health check                                                                          | Public |

Errors are returned as `{ statusCode, message }` via a single global exception filter — all thrown error messages are fixed, safe strings (never raw upstream/provider errors), so no internal or secret detail ever reaches a client.

## Realtime Events

The frontend opens a `socket.io-client` connection at login, authenticated via the same JWT used for REST (`handshake.auth.token`), and disconnects on logout.

| Event          | Payload          | Fired when                                                   |
| -------------- | ---------------- | ------------------------------------------------------------ |
| `task.created` | the new task     | A task is created that the connected user is allowed to see  |
| `task.updated` | the updated task | A task is updated that the connected user is allowed to see  |
| `task.deleted` | `{ id }`         | A task is deleted that the connected user was allowed to see |

Server-side, each socket joins a room scoped to its identity (`user:<id>`, plus `admin` if the role qualifies) using the exact same scoping function as the REST layer — a `user` socket can never receive another user's task events, and reconnecting triggers a one-time list refetch to reconcile anything missed while disconnected.

## Role-Based Access Control

| Role    | Can see                     | Can create/edit/delete      |
| ------- | --------------------------- | --------------------------- |
| `user`  | Only their own tasks        | Only their own tasks        |
| `admin` | Every task, from every user | Every task, from every user |

There is exactly one place this rule is implemented (`taskScopeWhere` in the backend), reused by every REST query and the realtime room-joining logic — so REST and realtime can never drift out of sync with each other.

## Testing

**Backend:**

```bash
cd backend
npm run test         # unit tests
npm run test:e2e     # e2e tests (Supertest + real Socket.io connections against a test DB)
```

**Frontend:**

```bash
cd frontend
npm run test          # Jest + React Testing Library
```

## Scripts Reference

**Backend** (`backend/package.json`)

| Script                      | Description                 |
| --------------------------- | --------------------------- |
| `npm run start:dev`         | Start the API in watch mode |
| `npm run build`             | Compile for production      |
| `npm run start:prod`        | Run the compiled build      |
| `npm run lint`              | ESLint (with `--fix`)       |
| `npm run test` / `test:cov` | Unit tests / with coverage  |
| `npm run test:e2e`          | End-to-end tests            |

**Frontend** (`frontend/package.json`)

| Script          | Description                               |
| --------------- | ----------------------------------------- |
| `npm run dev`   | Start the Next.js dev server on port 3001 |
| `npm run build` | Production build                          |
| `npm run start` | Run the production build on port 3001     |
| `npm run lint`  | ESLint                                    |
| `npm run test`  | Jest test suite                           |
