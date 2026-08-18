# Krishivaas Tools (local)

Two local tools combined into one website with a sidebar, served by a single
Express server. Every krishivaas API call goes **server → krishivaas**, so
there is no browser CORS and no preflight round-trip.

| Sidebar tab | What it does |
|---|---|
| 🌱 **Crop Allocation** | The 620+ record, 5-at-a-time bulk crop-allocation ledger. Progress is saved to `data.json`. |
| 🌴 **Tree Count Checker** | Upload an Excel of `crop_id` / `org_id`, pulls `tree_count` and `acres` per crop, and flags crops with more than `acres × 60` trees. |
| 🩺 **Crop / Tree Health** | Upload the same Excel, calls `crop-health-horti` per crop, and classifies each: `tree_count == 0` → **Crop Health**, otherwise **Tree Health**. Exports `crop_id, org_id, health_type, sowing_date`. |

## Run

```bash
npm install
npm start
```

Then open **http://localhost:5175**. Use `PORT=4000 npm start` for another port.

## Structure

```
krishivaas-tools/
  server.js              Express server + all API proxies
  data.json              Crop Allocation progress (created/updated automatically)
  check-tree-count.xlsx  Sample sheet for the Tree Count Checker
  public/
    index.html           Sidebar shell (loads each tool in an iframe)
    allocation.html      Crop Allocation Ledger
    tree-count.html      Tree Count Checker
    health-check.html    Crop / Tree Health Check
```

Each tool lives in its own HTML file and runs inside an isolated iframe, so
their styles and scripts never collide. The sidebar swaps the iframe and
remembers the tab in the URL hash (`#allocation` / `#tree-count`).

## Server API routes

| Route | Used by | Proxies to |
|---|---|---|
| `GET/POST /api/state` | Allocation | reads/writes `data.json` |
| `POST /api/submit` | Allocation | `add-crop-allocation` |
| `POST /api/tree-count` | Tree Checker | `crop-health-horti` |
| `POST /api/crop-details` | Tree Checker | `get-single-crop-details` |

## Notes

- **Tree Count Checker rule:** each acre should hold 57–60 trees, so the whole
  plot should hold `acres × 57` to `acres × 60`. A crop is flagged when
  `tree_count > acres × 60`.
- **Concurrency:** `crop-health-horti` keeps per-user server state — concurrent
  requests under one token return the first crop's `tree_count` for all of
  them. The Tree Checker therefore serialises those calls (one at a time).
- **Tokens** are typically valid ~30 days. If calls start failing with an auth
  error, paste a fresh token into the tool's token field / Defaults.
- Bearer tokens and progress live in `data.json` (plain text). `.gitignore`
  already excludes it — don't commit or share it, and don't expose the port to
  the open internet.
