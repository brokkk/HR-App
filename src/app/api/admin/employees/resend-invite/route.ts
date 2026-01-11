import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

interface ResendRequest {
    employee_id: string
}

interface ResendResponse {
    success: boolean
    error?: string
}

/**
 * Check if user is HR/Owner
 */
async function isHrOrOwner(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    userEmail: string | null
): Promise<boolean> {
    if (ADMIN_EMAILS.includes(userEmail || '')) return true

    const { data: emp } = await supabase
        .from('employees')
        .select('role')
        .eq('id', userId)
        .single()

    return emp?.role === 'hr' || emp?.role === 'owner'
}

/**
 * POST /api/admin/employees/resend-invite
 * Resend invitation email to an existing employee
 */
export async function POST(request: NextRequest): Promise<NextResponse<ResendResponse>> {
    try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

        if (!serviceRoleKey || !supabaseUrl) {
            return NextResponse.json({
                success: false,
                error: 'Server configuration error'
            }, { status: 500 })
        }

        // Auth check
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        if (!await isHrOrOwner(supabase, user.id, user.email ?? null)) {
            return NextResponse.json({ success: false, error: 'HR/Owner only' }, { status: 403 })
        }

        const body: ResendRequest = await request.json()
        const { employee_id } = body

        if (!employee_id) {
            return NextResponse.json({ success: false, error: 'employee_id required' }, { status: 400 })
        }

        // Create admin client
        const adminClient = createAdminClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // Get user from Supabase Auth
        const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(employee_id)

        if (getUserError || !authUser.user) {
            return NextResponse.json({
                success: false,
                error: 'User not found in auth system'
            }, { status: 404 })
        }

        const email = authUser.user.email
        if (!email) {
            return NextResponse.json({
                success: false,
                error: 'User has no email'
            }, { status: 400 })
        }

        // Determine redirect URL
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        // Generate a new magic link and send invite email
        const { error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
            options: {
                redirectTo: `${siteUrl}/auth/callback`
            }
        })

        if (linkError) {
            console.error('Generate link error:', linkError)
            return NextResponse.json({
                success: false,
                error: linkError.message
            }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Resend invite error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
