# HR App

HR Application built with Next.js 14 (App Router), Tailwind CSS, and Supabase Cloud.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase project ([supabase.com](https://supabase.com))

### Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your Supabase credentials in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ADMIN_EMAILS=admin@example.com
   ```

### Supabase Dashboard Setup

> **Important**: Add the auth callback URL to your Supabase project!

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication** → **URL Configuration**
3. Add to **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   ```
   
   For production, also add:
   ```
   https://your-domain.com/auth/callback
   ```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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

## Supabase CLI (Migrations)

The CLI is set up for migrations only (no local Docker stack).

```bash
# Login to Supabase CLI
supabase login

# Link to your project (optional until migrations needed)
supabase link --project-ref <PROJECT_REF>

# Create a new migration
supabase migration new <migration_name>

# Push migrations to remote (when ready)
supabase db push
```

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
