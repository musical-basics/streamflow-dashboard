# Vercel Deployment

## Environment Variables

These are the **required** environment variables to configure in Vercel:

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://rhtshpewletapfcfrnvt.supabase.co` | Supabase project URL ("Lionel Projects") |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(your anon key)* | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | *(your service role key)* | **Required for video uploads** - find in Supabase Dashboard → Settings → API |

## Notes

- StreamFlow's tables (`videos`, `stream_config`) live in the **`streamflow` schema** of a Supabase project shared with other apps (e.g. `stream_overlay`). Every client passes `db: { schema: 'streamflow' }`. The schema is exposed to the API via the `authenticator` role's `pgrst.db_schemas` setting — if you add another schema, keep `streamflow` in that list.

- **`NEXT_PUBLIC_API_URL` is no longer needed** — API calls now use `/api/proxy` which is rewritten to the VPS at the server level via `next.config.mjs`.
- The rewrite proxies requests through Vercel's HTTPS server, avoiding mixed content errors when calling the HTTP VPS.
- Video uploads use Supabase Storage as an intermediate step (Client → Supabase → VPS).
