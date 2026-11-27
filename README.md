# HR App

HR App is a Next.js 16 application for tracking attendance, handling employee requests and approvals, and exporting monthly reports. It uses Tailwind CSS and Supabase for authentication and data storage.

## Getting Started

### Prerequisites

- Node.js 20.9 or later
- npm
- A separate [Supabase project](https://supabase.com) for development
- The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) to apply database migrations

### Install Dependencies and Configure the App

1. From the repository root, install the locked dependencies and copy the environment template.
   ```bash
   npm ci
   cp .env.local.example .env.local
   ```

2. In `.env.local`, set the project URL and anon key for your development Supabase project. Set `ADMIN_EMAILS` to the email you will use to sign in.
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ADMIN_EMAILS=admin@example.com
   ```

   The employee invitation feature also needs a Supabase service role key. Keep it server-side and store it in `.env.local`.

### Apply the Database Migrations

Link the repository to your development project and apply the migrations in `supabase/migrations/`.

```bash
supabase login
supabase link --project-ref YOUR_DEV_PROJECT_REF
supabase db push
```

### Supabase Dashboard Setup

1. In your development project's [Supabase Dashboard](https://supabase.com/dashboard), go to **Authentication → URL Configuration**.
2. Add the following URL to **Redirect URLs**.
   ```
   http://localhost:3000/auth/callback
   ```

For deployment, set `NEXT_PUBLIC_SITE_URL` to the deployed app's origin and add its corresponding `/auth/callback` URL to the deployed project's redirect allowlist.

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login), request a magic link using your configured admin email, and follow the link. Check that `/home` opens and that the same account can access `/admin`.

## Folder Structure

```
src/
├── app/
│   ├── (auth)/           # Public auth routes
│   │   ├── login/        # Magic link login
│   │   └── auth/callback # Auth callback handler
│   ├── (app)/            # Protected routes
│   │   └── home/         # Dashboard
│   └── (admin)/          # Admin routes
│       └── admin/        # Admin dashboard
├── lib/
│   ├── supabase/         # Supabase clients
│   └── auth/             # Auth utilities
└── middleware.ts         # Session refresh
```

## Contributing

If setup fails or a workflow behaves unexpectedly, [open an issue](https://github.com/brokkk/HR-App/issues) with the steps to reproduce it, what you expected, and the Node.js version you used. Use sample data in screenshots and logs.

Run the following checks before opening a pull request.

```bash
npm run lint
npm run build
```

For database changes, add a migration with `supabase migration new <name>` and apply it to your development project before opening a pull request.

## Available Routes

| Route | Protection | Description |
|-------|------------|-------------|
| `/login` | Public | Magic link login |
| `/home` | Auth required | User dashboard |
| `/admin` | Admin only | Admin dashboard |

## Admin Access

Admin access is controlled via the `ADMIN_EMAILS` environment variable.

```env
ADMIN_EMAILS=admin@example.com,manager@example.com
```

Users not in this list will be redirected to `/home` when accessing `/admin`.

## License

HR App is available under the [MIT License](LICENSE).
