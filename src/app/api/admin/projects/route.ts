import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

interface Project {
    id: string
    name: string
    account_manager_id: string | null
    account_manager_name: string | null
    is_active: boolean
    created_at: string
}

interface ProjectsResponse {
    success: boolean
    items?: Project[]
    project?: Project
    error?: string
}

/**
 * Check if user is HR/Owner (via ADMIN_EMAILS or role)
 */
async function isHrOrOwner(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, userEmail: string | null): Promise<boolean> {
    if (ADMIN_EMAILS.includes(userEmail || '')) return true

    const { data: emp } = await supabase
        .from('employees')
        .select('role')
        .eq('id', userId)
        .single()

    return emp?.role === 'hr' || emp?.role === 'owner'
}

/**
 * GET /api/admin/projects
 * List all projects with AM name mapping
 */
export async function GET(request: NextRequest): Promise<NextResponse<ProjectsResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Fetch projects
        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, name, account_manager_id, is_active, created_at')
            .order('name', { ascending: true })

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        // 2-step mapping: get AM names
        const amIds = [...new Set((projects || []).map(p => p.account_manager_id).filter(Boolean))] as string[]
        let amMap = new Map<string, string>()

        if (amIds.length > 0) {
            const { data: ams } = await supabase
                .from('employees')
                .select('id, full_name')
                .in('id', amIds)

            if (ams) {
                amMap = new Map(ams.map(a => [a.id, a.full_name || 'Unknown']))
            }
        }

        const items: Project[] = (projects || []).map(p => ({
            id: p.id,
            name: p.name,
            account_manager_id: p.account_manager_id,
            account_manager_name: p.account_manager_id ? amMap.get(p.account_manager_id) || null : null,
            is_active: p.is_active,
            created_at: p.created_at,
        }))

        return NextResponse.json({ success: true, items })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * POST /api/admin/projects
 * Create new project (HR only)
 */
export async function POST(request: NextRequest): Promise<NextResponse<ProjectsResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        if (!await isHrOrOwner(supabase, user.id, user.email ?? null)) {
            return NextResponse.json({ success: false, error: 'HR/Owner only' }, { status: 403 })
        }

        const body = await request.json()
        const { name, account_manager_id, is_active = true } = body

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
        }

        const { data: project, error } = await supabase
            .from('projects')
            .insert({
                name: name.trim(),
                account_manager_id: account_manager_id || null,
                is_active,
            })
            .select()
            .single()

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ success: false, error: 'Project name already exists' }, { status: 400 })
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        // Get AM name
        let amName = null
        if (project.account_manager_id) {
            const { data: am } = await supabase
                .from('employees')
                .select('full_name')
                .eq('id', project.account_manager_id)
                .single()
            amName = am?.full_name || null
        }

        return NextResponse.json({
            success: true,
            project: {
                ...project,
                account_manager_name: amName,
            }
        })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * PATCH /api/admin/projects
 * Update project (HR only)
 */
export async function PATCH(request: NextRequest): Promise<NextResponse<ProjectsResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        if (!await isHrOrOwner(supabase, user.id, user.email ?? null)) {
            return NextResponse.json({ success: false, error: 'HR/Owner only' }, { status: 403 })
        }

        const body = await request.json()
        const { id, name, account_manager_id, is_active } = body

        if (!id) {
            return NextResponse.json({ success: false, error: 'Project ID required' }, { status: 400 })
        }

        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name.trim()
        if (account_manager_id !== undefined) updates.account_manager_id = account_manager_id || null
        if (is_active !== undefined) updates.is_active = is_active

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 })
        }

        updates.updated_at = new Date().toISOString()

        const { data: project, error } = await supabase
            .from('projects')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ success: false, error: 'Project name already exists' }, { status: 400 })
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        // Get AM name
        let amName = null
        if (project.account_manager_id) {
            const { data: am } = await supabase
                .from('employees')
                .select('full_name')
                .eq('id', project.account_manager_id)
                .single()
            amName = am?.full_name || null
        }

        return NextResponse.json({
            success: true,
            project: {
                ...project,
                account_manager_name: amName,
            }
        })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * DELETE /api/admin/projects
 * Soft-delete (set is_active=false) - HR only
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<ProjectsResponse>> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        if (!await isHrOrOwner(supabase, user.id, user.email ?? null)) {
            return NextResponse.json({ success: false, error: 'HR/Owner only' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ success: false, error: 'Project ID required' }, { status: 400 })
        }

        // Soft delete
        const { error } = await supabase
            .from('projects')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)

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
