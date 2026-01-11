import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface LatePermission {
    id: string
    employee_id: string
    date: string
    category: 'urgent' | 'hujan' | 'habis_lembur'
    max_check_in_time: string
    reason: string
    status: 'pending_lead' | 'pending_coo' | 'approved' | 'rejected'
    proof_path: string | null
    created_at: string
}

interface LatePermissionResponse {
    success: boolean
    data?: LatePermission | LatePermission[]
    id?: string  // For POST, return the created ID
    error?: string
}

/**
 * POST /api/late-permissions
 * Create a new late permission via RPC (today-only, pending_lead)
 */
export async function POST(request: NextRequest): Promise<NextResponse<LatePermissionResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse form data (supports multipart for file upload)
        const contentType = request.headers.get('content-type') || ''

        let category: string
        let maxTime: string
        let reason: string
        let proofFile: File | null = null

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData()
            category = formData.get('category') as string
            maxTime = formData.get('max_time') as string
            reason = formData.get('reason') as string
            const file = formData.get('proof')
            if (file instanceof File && file.size > 0) {
                proofFile = file
            }
        } else {
            const body = await request.json()
            category = body.category
            maxTime = body.max_time
            reason = body.reason
        }

        // Validate required fields (no date - RPC sets it to today)
        if (!category || !maxTime || !reason) {
            return NextResponse.json({
                success: false,
                error: 'category, max_time, and reason are required'
            }, { status: 400 })
        }

        // Validate category
        if (!['urgent', 'hujan', 'habis_lembur'].includes(category)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid category'
            }, { status: 400 })
        }

        // Upload proof if provided
        let proofPath: string | null = null
        if (proofFile) {
            const ext = proofFile.name.split('.').pop() || 'jpg'
            // Use today's date in WIB for filename
            const today = new Date().toISOString().split('T')[0]
            const fileName = `${user.id}/${today}_${Date.now()}.${ext}`

            const { error: uploadError } = await supabase.storage
                .from('late-proofs')
                .upload(fileName, proofFile, {
                    cacheControl: '3600',
                    upsert: true
                })

            if (uploadError) {
                console.error('Upload error:', uploadError)
                // Continue without proof if upload fails
            } else {
                proofPath = fileName
            }
        }

        // Call RPC to submit late permission (today-only, auto-clamps time)
        const { data: permissionId, error } = await supabase.rpc('submit_late_permission', {
            p_category: category,
            p_reason: reason,
            p_max_time: maxTime,
            p_proof_path: proofPath,
            p_meta: {}
        })

        if (error) {
            // Handle specific error messages
            if (error.message.includes('already exists')) {
                return NextResponse.json({
                    success: false,
                    error: 'Izin telat sudah ada untuk hari ini'
                }, { status: 409 })
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, id: permissionId })

    } catch (error) {
        console.error('Late permission API error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * GET /api/late-permissions
 * List own late permissions
 */
export async function GET(): Promise<NextResponse<LatePermissionResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { data, error } = await supabase
            .from('late_permissions')
            .select('*')
            .eq('employee_id', user.id)
            .order('date', { ascending: false })
            .limit(50)

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data: data || [] })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * DELETE /api/late-permissions?id=xxx
 * Delete own late permission (only if pending_lead + today via RLS)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<LatePermissionResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('late_permissions')
            .delete()
            .eq('id', id)
            .eq('employee_id', user.id)

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
