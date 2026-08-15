# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/7abb2c2a-f78c-4be6-b1cd-d9d294bff530

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/7abb2c2a-f78c-4be6-b1cd-d9d294bff530) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/26d02784-653d-45ba-ba7e-54f9c19707fe) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Edge-function authorisation

Every user-JWT edge function gates the caller through
`public.check_permission` via `supabase/functions/_shared/requireCaller.ts`.
Do not add new `unicorn_role` / `global_role` / `is_vivacity_internal` /
`role_type` allowlists. `public.users` has no `role_type` column — that
legacy check failed closed.

```ts
import { requireCaller, FeatureKeys, allowTenantMember } from "../_shared/requireCaller.ts";

const caller = await requireCaller(req, admin, {
  featureKey: FeatureKeys.staffEmailSend,
  orAllow: ({ userId, admin }) => allowTenantMember(admin, userId, tenant_id),
});
if (!caller.ok) return caller.response;
```

`check_permission` always admits Super Admin. Other roles come from
`role_permissions`. Unknown feature keys return false (fail closed).

### Feature-key taxonomy

`module.feature.action`. Reuse an existing key when the allowed-set matches;
add a new key (and seed `role_permissions` in the same PR) when the
capability is distinct.

| Prefix | Meaning | Typical grants |
|---|---|---|
| `admin.*` | Privileged administration | Super Admin `full`; others `none` unless noted |
| `staff.*` | Any Vivacity internal staff | All internal roles `full` (incl. Team Member) |
| `staff.addin.use` | Outlook add-in | Super Admin / Team Leader / Team Member |
| `admin.integrations.xero_connect` | Connect/disconnect Xero | Super Admin + Integrator |
| `clients.*` / `packages.*` / `audits.*` / `academy.*` / `eos.*` | Product modules | Per the Role Permissions editor |

Staff capability keys (prefer the specific one):

- `staff.internal` — generic fallback for `is_vivacity_internal`
- `staff.sharepoint.use`
- `staff.email.send` — composed + Graph send; tenant members via `orAllow`
- `staff.documents.generate`
- `staff.ai.use`
- `staff.research.use`
- `staff.meetings.use`
- `staff.billing.xero_view`
- `staff.integrations.tga`

Do **not** put a user-JWT gate on cron / webhook / token-redeem workers.

Leave mixed staff-OR-tenant-admin paths as `requireCaller` + `orAllow`
(`allowClientAdmin` / `allowTenantMember`). Do not fold client Admin into
`role_permissions` — they are not `is_vivacity_internal`.
