import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

interface InviteRequest {
    email: string
    full_name: string
    role?: string
    division_id?: string
    fingerprint_external_id?: string
}

interface InviteResponse {
    success: boolean
    user_id?: string
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
 * POST /api/admin/employees/invite
 * Invite a new employee (creates Supabase auth user + employees row)
 * Uses Resend SDK directly for reliable email delivery
 */
export async function POST(request: NextRequest): Promise<NextResponse<InviteResponse>> {
    try {
        // Validate service role key exists
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const resendApiKey = process.env.RESEND_API_KEY

        if (!serviceRoleKey || !supabaseUrl) {
            return NextResponse.json({
                success: false,
                error: 'Server configuration error: missing service role key'
            }, { status: 500 })
        }

        // Auth check with normal client
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        if (!await isHrOrOwner(supabase, user.id, user.email ?? null)) {
            return NextResponse.json({ success: false, error: 'HR/Owner only' }, { status: 403 })
        }

        // Parse body
        const body: InviteRequest = await request.json()
        const { email, full_name, role, division_id, fingerprint_external_id } = body

        // Validate required fields
        if (!email || !full_name) {
            return NextResponse.json({
                success: false,
                error: 'email and full_name are required'
            }, { status: 400 })
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid email format'
            }, { status: 400 })
        }

        // Validate role if provided
        const validRoles = ['employee', 'lead', 'hr', 'owner']
        if (role && !validRoles.includes(role)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid role'
            }, { status: 400 })
        }

        // Create admin client with service role
        const adminClient = createAdminClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })

        // Determine redirect URL
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        // Generate invite link (doesn't send email)
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'invite',
            email: email,
            options: {
                data: { full_name },
                redirectTo: `${siteUrl}/auth/callback`
            }
        })

        if (linkError) {
            if (linkError.message.includes('already been registered')) {
                return NextResponse.json({
                    success: false,
                    error: 'Email sudah terdaftar'
                }, { status: 409 })
            }
            console.error('Generate link error:', linkError)
            return NextResponse.json({
                success: false,
                error: linkError.message
            }, { status: 500 })
        }

        if (!linkData.user || !linkData.properties?.action_link) {
            return NextResponse.json({
                success: false,
                error: 'Failed to generate invite link'
            }, { status: 500 })
        }

        const newUserId = linkData.user.id
        const inviteLink = linkData.properties.action_link

        // Send email using Resend SDK directly
        if (resendApiKey) {
            const resend = new Resend(resendApiKey)
            const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@mail.visualisasi.site'

            const { error: emailError } = await resend.emails.send({
                from: `HR Admin <${fromEmail}>`,
                to: email,
                subject: 'Undangan Bergabung - HR App',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #1e293b;">Halo ${full_name}!</h2>
                        <p>Anda telah diundang untuk bergabung ke sistem HR App.</p>
                        <p>Klik tombol di bawah untuk mengaktifkan akun Anda:</p>
                        <div style="margin: 30px 0;">
                            <a href="${inviteLink}" 
                               style="background-color: #2563eb; color: white; padding: 12px 24px; 
                                      text-decoration: none; border-radius: 8px; display: inline-block;">
                                Aktifkan Akun
                            </a>
                        </div>
                        <p style="color: #64748b; font-size: 14px;">
                            Jika tombol tidak berfungsi, copy link berikut ke browser:<br>
                            <a href="${inviteLink}" style="color: #2563eb;">${inviteLink}</a>
                        </p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                        <p style="color: #94a3b8; font-size: 12px;">
                            Email ini dikirim otomatis. Jika Anda tidak merasa mendaftar, abaikan email ini.
                        </p>
                    </div>
                `
            })

            if (emailError) {
                console.error('Resend email error:', emailError)
                // User created but email failed - return success with warning
                // They can use resend feature later
            }
        } else {
            console.warn('RESEND_API_KEY not set, email not sent')
        }

        // Upsert employee record
        const { error: upsertError } = await adminClient
            .from('employees')
            .upsert({
                id: newUserId,
                full_name,
                role: role || 'employee',
                division_id: division_id || null,
                fingerprint_external_id: fingerprint_external_id || null,
                is_active: true,
            }, {
                onConflict: 'id'
            })

        if (upsertError) {
            console.error('Employee upsert error:', upsertError)
        }

        return NextResponse.json({
            success: true,
            user_id: newUserId
        })

    } catch (error) {
        console.error('Invite API error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
