# ShagunWala — Next.js shop and verified checkout

A mobile-friendly storefront and protected admin dashboard for pooja/festival products. The order flow uses Supabase Phone OTP: customers browse freely, enter their details, verify their Indian mobile number, pass a bot/security check, and place an order. Orders are created as `pending_confirmation`; stock is reduced only when the admin confirms an order.

## Features

- Next.js App Router + TypeScript + responsive storefront.
- Product catalogue, category filter, search, stock labels and cart.
- Checkout requires customer name, Indian mobile number and delivery address.
- SMS OTP through Supabase Auth; order API checks the server-side user session and verified phone.
- Cloudflare Turnstile server-side validation for order submission. Use Supabase Auth CAPTCHA/rate limits as well to protect OTP sending and SMS spend.
- Database-side validation of product IDs, stock, price, duplicate items, idempotency and order attempts.
- Admin email/password login; server-side admin membership checks on every admin API.
- Admin product add/edit/delete, hide/unhide, price/stock changes, image/video upload or HTTPS URL.
- Admin order list with customer details and order status actions.
- Inventory decreases only when an admin confirms; cancelling a confirmed order restores stock.
- QR code downloads the current website URL. Print only after deployment to your permanent domain.
- Supabase RLS policies and storage policies are included.

## Requirements

- Node.js 20.9 or newer (as required by current Next.js installation docs).
- A Supabase project.
- An SMS provider configured for Supabase Phone Auth. For Indian numbers, check your provider's pricing and applicable TRAI/DLT sender/template registration requirements.
- A Cloudflare account with Turnstile configured for your local/deployed hostname before production launch.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Without Supabase configuration, you can inspect the storefront preview, but real OTP orders and admin data require a backend.

## Configure Supabase

1. Create a Supabase project.
2. In **SQL Editor**, run `supabase/schema.sql` in full.
3. In **Project Settings → API / Connect**, copy the project URL and publishable key into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The publishable key is designed for client apps when RLS is enabled. **Never add a Supabase secret/service-role key to a `NEXT_PUBLIC_` variable or browser code.**

### Enable Phone OTP

1. Go to **Authentication → Sign In / Providers** and enable Phone sign-in.
2. Configure an SMS provider supported by your Supabase Auth project and verify its credentials.
3. Keep Supabase Auth SMS rate limits enabled and configure CAPTCHA in the Auth security settings.
4. Use the `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for the Turnstile widget used when requesting OTP.
5. Test OTP delivery with your own test number before opening the website to customers. SMS costs and country-specific registration requirements may apply.

Add the public Turnstile site key to `.env.local`:

```dotenv
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_public_site_key
```

### Turnstile server verification

Create a Turnstile widget in Cloudflare for `localhost` during development and your final website hostname in production. Add the matching secret key only to the server environment:

```dotenv
TURNSTILE_SECRET_KEY=your_private_secret_key
NEXT_PUBLIC_SITE_URL=https://your-final-domain.example
```

For production, `TURNSTILE_SECRET_KEY` is required by the order API. Do not use the example hostname above. Set the actual deployed URL and add it to your Turnstile hostname allowlist. OTP sending has a separate Supabase CAPTCHA integration, so configure it in Supabase Auth too. Server verification is important because browser-only CAPTCHA checks can be bypassed.

## Create the admin login

1. In Supabase **Authentication → Users**, create an email/password account for the shop owner. Use a strong unique password.
2. In Supabase **SQL Editor**, run the following with the exact admin email:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
on conflict (user_id) do nothing;
```

3. Visit `/admin/login` and sign in. If your account is not in `public.admin_users`, access to the admin APIs is denied. Only add trusted shop administrators to that table. For additional protection, enable MFA for your admin account if your operating process supports it.

## Product uploads

The SQL creates public-read buckets named `product-media` (images up to 4 MB) and `product-videos` (MP4/WEBM/MOV up to 25 MB). Public read is intentional so customers can view product photos; only admin accounts can upload, update or delete those objects. Uploads are stored using randomized file names. You can also paste direct HTTPS image/video URLs.

## Order and stock behaviour

- Customers can browse without an account.
- Checkout asks for name, 10-digit Indian mobile number, address, then sends OTP.
- After successful phone verification, customers complete a second Turnstile check and place the order.
- The browser does not choose product prices or totals; the database reads authoritative prices and validates stock.
- A verified customer may create at most 3 orders per 10 minutes per account. Admin can tune this in the `create_customer_order` SQL function.
- Orders are pending until the admin reviews them. Confirming an order re-checks all stock and deducts it atomically. Cancelling a confirmed order restores stock.
- OTP verification proves access to the phone number, not genuine purchase intent. For COD/high-value orders, call or WhatsApp the customer before dispatch.
- This version does not take online payments, calculate delivery charges or send order-confirmation SMS automatically.

## Deploy

Deploy this project as a **Next.js Node.js app** (for example on Vercel). Do not use static export because OTP, cookie-backed sessions and API routes need server functionality. Add the `.env.local` values to the hosting provider's environment-variable settings, run `npm run build`, deploy, then:

1. Set `NEXT_PUBLIC_SITE_URL` to your final HTTPS domain.
2. Add that domain to Cloudflare Turnstile and Supabase Auth redirect/site configuration as appropriate.
3. Test an OTP request, wrong OTP, valid OTP, out-of-stock order, repeated submission, admin login, product editing and order confirmation.
4. Generate the shop QR code from `/admin` after the site is live. The QR points at the homepage, so it stays the same when the catalogue changes.

## Security notes

- Admin APIs verify Supabase user sessions and `public.admin_users` membership server-side.
- Database RLS denies customers direct product mutation and order insertion.
- The `create_customer_order` RPC requires a confirmed phone on the authenticated Supabase user and never trusts a phone number sent in the order payload.
- The service-role/secret key is not used by this app and must never be exposed to the browser.
- Use HTTPS in production, keep dependencies updated, and test policies before launch.
