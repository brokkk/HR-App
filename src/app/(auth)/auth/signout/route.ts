import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
    const supabase = await createClient()

    await supabase.auth.signOut()

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    return NextResponse.redirect(`${origin}/login`, {
        status: 303, // See Other - proper status for POST to GET redirect
    })
}
