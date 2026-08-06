# Deploying the JMS web app to Vercel

The backend is already live at **`https://jms-api.98.70.37.83.nip.io`** (Azure VM).
This app is pre-configured to talk to it.

## IMPORTANT: deploy from the repo root, not from `apps/web`

This is a monorepo. `apps/web` depends on the local `@jms/shared` workspace, which
only exists at the repo root. If you run `vercel` from inside `apps/web`, only that
folder is uploaded and the build fails with `404 @jms/shared is not in this registry`.

### CLI (fastest)

```bash
rm -rf apps/web/.vercel          # unlink the earlier (wrong) project
cd ~/Developer/jms               # <-- repo ROOT, not apps/web
vercel                           # first deploy (preview)
#   ? In which directory is your code located?  ->  apps/web
#   (accept the detected Next.js settings)
vercel --prod                    # production deploy
```

Answering `apps/web` sets the project's **Root Directory** while still uploading the
whole monorepo, so npm can link `@jms/shared` and the build succeeds.

### Or via Git import (dashboard)

Push the repo to GitHub, then in Vercel → New Project → import it and set
**Root Directory = `apps/web`**. Deploy.

## What's already configured for you

| Concern | Handling |
|---|---|
| **API URL** | Baked into `next.config.ts` → `https://jms-api.98.70.37.83.nip.io`. Override with a `NEXT_PUBLIC_API_URL` env var in Vercel if needed. |
| **`@jms/shared`** | Compiled from TS source via `transpilePackages` — no build step. |
| **Install** | `vercel.json` installs only `apps/web` + `packages/shared` (skips the API's native deps). |
| **Node version** | `24.x`, pinned via `engines` in `apps/web/package.json` (Vercel deprecated 20.x). |

## Log in

- Admin: **`admin@jms.local`** / **`Password@123`**

## Known limitation — cross-site session refresh

The API's refresh-token cookie is `sameSite: 'lax'`, so after the 30-minute access
token expires the browser won't send it from the Vercel domain to the `nip.io` API
and the user is logged out. Login itself works. One-line backend fix
(`sameSite: 'none'`, `secure: true` in `apps/api/src/modules/auth/auth.routes.ts`) —
ask and I'll apply it and redeploy the API.
