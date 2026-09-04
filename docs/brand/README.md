# Sift Brand Kit

Ready-to-use flat logo, icon, favicon, palette, and Tailwind CSS v4 assets.

All artwork is flat. No gradients are used in the supplied masters.

## Where these live in this repository

The kit arrived as one `sift-brand-kit/` drop and was split by role: design
masters stay here under `docs/`; only the handful of files a browser actually
requests were installed into the served web root.

### Design masters and documentation (this directory)

- `svg/` — scalable logo/symbol/wordmark/app-icon masters
- `png/` — transparent logos and platform icon sizes (`logos/`, `symbols/`, `app-icons/`)
- `reference/sift-brand-sheet.png` — one-page visual reference sheet
- `BRAND-GUIDE.md` — direction, clear space, small-size rules, typography
- `palette.json` — the canonical hex values
- `sift-tokens.css` — the kit's own CSS custom properties
- `tailwind/` — the kit's Tailwind v4 theme, standalone drop-in CSS, and TS token export

Nothing in this directory is imported, bundled, or served. It is excluded
from the Docker build context (`.dockerignore`) because the runtime never
reads it.

`tailwind/sift-theme.css` in particular is **not** wired into the app. Its
`@theme inline` block collides with names `apps/web/src/styles/tailwind.css`
already owns (`--color-background`, `--color-foreground`, `--color-muted`,
`--color-border`, `--color-ring`) and redefines `--radius-md`/`-lg`/`-xl` with
different values than `apps/web/src/styles/tokens.css` uses, and its
`@layer base` rule repaints `html`, `body`, and `:focus-visible`. Sift uses a
token-first integration (arbitrary-value `var(--…)` references), not a
`@theme` bridge — see the header comments in `tailwind.css` and
`docs/design-system.md`.

### Served runtime assets (`apps/web/public/`)

Vite copies `apps/web/public/**` verbatim into `apps/web/dist/`, which
`apps/agent/src/app.ts` serves as the single static origin in production.

| File | Served path |
| --- | --- |
| `apps/web/public/favicon.ico` | `/favicon.ico` |
| `apps/web/public/favicon-32x32.png` | `/favicon-32x32.png` |
| `apps/web/public/favicon-16x16.png` | `/favicon-16x16.png` |
| `apps/web/public/apple-touch-icon.png` | `/apple-touch-icon.png` |
| `apps/web/public/android-chrome-192x192.png` | `/android-chrome-192x192.png` |
| `apps/web/public/android-chrome-512x512.png` | `/android-chrome-512x512.png` |
| `apps/web/public/site.webmanifest` | `/site.webmanifest` |
| `apps/web/public/brand/sift-logo.svg` | `/brand/sift-logo.svg` |
| `apps/web/public/brand/sift-mark.svg` | `/brand/sift-mark.svg` |

`apps/web/index.html` links the icons and the manifest; the manifest's icon
`src` values are root-absolute and resolve against that same origin.

### Brand color in the token layer

`palette.json`'s green ramp is mirrored into
`apps/web/src/styles/tokens.css` as `--sift-green-50` … `--sift-green-950`
plus `--sift-brand*`, for anything that renders the brand identity itself.
The product interface keeps its own "paper and ink" palette with an ink-blue
`--color-brand`; the two are deliberately separate. See that file's
`Color — Sift brand identity` block.
