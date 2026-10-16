# KeyFlux

**Control every API call.**

KeyFlux is a backend-focused API management SaaS project designed
to help developers manage API access, projects, keys, request limits,
and API usage.

## Project status

Milestone 1 — Project foundation.

The initial React frontend and Express backend are being established.
Features will be marked complete only after implementation and testing.

## Technology stack

### Frontend
- React
- Vite
- Tailwind CSS
- React Router
- Axios
- Recharts
- Lucide React

### Backend
- Node.js
- Express.js
- REST APIs
- Helmet
- CORS

### Planned infrastructure
- PostgreSQL
- Redis
- Docker
- GitHub Actions
- Render
- Vercel

## Architecture

The React frontend communicates with the Express backend over HTTP.
The backend will later use PostgreSQL for persistent data and Redis
for rate limiting and selective caching.

## Project structure

- `frontend/` — React application and browser assets.
- `backend/src/app.js` — Express configuration and routes.
- `backend/src/server.js` — HTTP server startup.
- `.env.example` — Example environment configuration.
- `.gitignore` — Files excluded from version control.

## Prerequisites

- Node.js LTS
- npm
- Git

## Local setup

Install frontend dependencies:

```bash
cd frontend
npm install