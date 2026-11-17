# SettleUp

## Run locally

1. Install Node.js 18+ and start a local MongoDB instance (or provide a hosted URI).
2. Copy `.env.example` to `.env` and set a random `JWT_SECRET` (32+ characters).
3. Install dependencies: `npm install`
4. Start the API: `npm run server`
5. Start the Vite client in another terminal: `npm run dev`

The API is available at `http://localhost:4000/api`; use `Authorization: Bearer <token>` for protected routes. Run `npm run check` for a server syntax check and `npm run build` for the client build.
