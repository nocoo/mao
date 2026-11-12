# Mao Poetry Room

See [README.md](README.md) for project setup and checks, and [Retrospective.md](Retrospective.md) for incident history.

For poem illustration work, use the [mao-poetry-illustration skill](.agents/skills/mao-poetry-illustration/SKILL.md).

## Local development

Open the project in Chrome at https://mao.dev.hexly.ai through Caddy, rather than a localhost URL.

On this machine, Caddy proxies the domain to `127.0.0.1:4173`, while `pnpm dev` defaults to port 7065. Reuse an existing project server on port 4173, or start one from the repository root:

```sh
pnpm build:data && pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort
```

If the domain does not reach the project, check the local Caddy mapping and the server before opening the page.
