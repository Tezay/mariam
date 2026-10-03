# Third-party notices

Mariam ships third-party components under their own licences. This file lists those that are
not plain code dependencies, and where each licence travels with the software.

## Fonts

| Font | Licence | Copyright | Shipped at |
|---|---|---|---|
| [Inter](https://github.com/rsms/inter), through [`@fontsource-variable/inter`](https://fontsource.org/fonts/inter) | SIL Open Font License 1.1 | © 2016 The Inter Project Authors | `/licenses/Inter-OFL.txt` in the frontend image ([source](client/public/licenses/Inter-OFL.txt)) |

## Code dependencies

- **Frontend**: the packages listed in `client/package.json` and pinned by `client/bun.lock`.
- **Backend**: the packages listed in `server/pyproject.toml` and pinned by `server/uv.lock`. Each
  installed package keeps its licence files in the image's `site-packages`.
