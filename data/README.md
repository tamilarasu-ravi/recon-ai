# Data directory

Local datasets for seeding retrieval history and AP fixtures. Large CSVs stay gitignored; see `.gitignore`.

## Layout

| Path | Rows | In repo | Used by |
|------|------|---------|---------|
| `mock_invoices/tenant-a.json` | 5 | Yes | `pnpm db:seed` → AP pipeline |
| `mock_invoices/tenant-b.json` | 5 | Yes | `pnpm db:seed` |
| `kaggle-category-to-gl.json` | — | Yes | `pnpm db:import-data` |
| `archive/train_transactions.csv` | ~5,000 | No (local) | Import → labeled `transactions` + embeddings |
| `archive/test_transactions.csv` | ~1,000 | No (local) | Hold out for future offline benchmark |
| `personal_expense_classification.csv` | ~100 | No (local) | Import → `tenant-a` US-style vendors |

## Kaggle archive format

Columns: `transaction_text`, `category`

Example: `Netflix subscription INR 33127 TXN6001238b`

- **Vendor** — text before `INR`
- **Amount** — normalized with `/1000` for sane policy thresholds (see import script)
- **Categories skipped** — `investment`, `emi` (no GL mapping)

## Personal expense CSV

Columns: `expense_id`, `amount`, `merchant`, `description`, `category`

Mapped via `personal-expense` section in `kaggle-category-to-gl.json`.

## Commands

```bash
pnpm db:seed          # core tenants, 12 hand-labeled txns, policies, mock invoices
pnpm db:import-data   # optional: Kaggle train + personal CSV into tenant-a history
```

## License

Download Kaggle data under the dataset’s license. Do not commit `archive/*.csv` if redistribution is restricted.
