# Agent 6

A self-hosted support agent for one organization. It answers questions about your Applications using their code, read-only databases and logs, and reports faults through GitHub issues.

- [Administrator setup guide](docs/setup.md): Docker deployment, connections, HTTPS, backups and upgrades.
- [Usage and development notes](docs/usage.md).
- [Domain model](CONTEXT.md).
- [Implementation plans](docs/plans/00-README.md).

With `compose.yaml` and a completed `.env` copied from `.env.example`:

```bash
docker compose up -d --wait
```

Compose pulls `marcelaritonang/agent-6:latest` and keeps data in a named volume. See the setup guide before exposing the service.

For local development, use Node.js 24 and git: `npm ci`, configure `.env`, then `npm run dev`. Run `npm run typecheck`, `npm run lint` and `npm test` before contributing. `npm run build` and `npm start` run the production server.
