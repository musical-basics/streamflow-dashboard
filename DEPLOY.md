# Vercel Deployment

## Environment Variables

These are the **required** environment variables to configure in Vercel:

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://famnafyxsrniegreezxl.supabase.co` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(your anon key)* | Supabase anonymous/public key |

## Notes

- **`NEXT_PUBLIC_API_URL` is no longer needed** — API calls now use `/api/proxy` which is rewritten to the VPS at the server level via `next.config.mjs`.
- The rewrite proxies requests through Vercel's HTTPS server, avoiding mixed content errors when calling the HTTP VPS.
