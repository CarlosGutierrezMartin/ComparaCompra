# ComparaCompra

Tu lista de la compra, lo más barata posible.

PWA que, a partir del código postal, dice dónde sale más barata la compra y ayuda a decidir qué cocinar con lo que está barato esa semana. Especificación: [`docs/SPEC.md`](docs/SPEC.md). Decisiones: [`docs/DECISIONS.md`](docs/DECISIONS.md). Guía de desarrollo: [`CLAUDE.md`](CLAUDE.md).

## Puesta en marcha

```bash
cp .env.example .env              # y apps/web/.env.local
pnpm install
pnpm exec supabase start          # Supabase local (Docker)
pnpm dev
```
