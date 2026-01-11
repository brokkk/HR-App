import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface RequestItem {
    id: string
    employee_id: string
    type: 'leave' | 'overtime'
    status: 'draft' | 'pending' | 'pending_am' | 'pending_hr' | 'approved' | 'rejected'
    start_date: string
    end_date: string | null
    reason: string
    meta: Record<string, unknown>
    project_id: string | null
    project_name?: string | null
    created_at: string
    updated_at: string
}

export interface RequestsListResponse {
    success: boolean
    data?: RequestItem[]
    page?: number
    pageSize?: number
    total?: number
    error?: string
}

export interface CreateRequestResponse {
    success: boolean
    data?: RequestItem
    error?: string
}

/**
 * GET /api/requests
 * List current user's requests (filtered by RLS)
 */
export async function GET(request: NextRequest): Promise<NextResponse<RequestsListResponse>> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Parse query params
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')
        const type = searchParams.get('type')
        const tab = searchParams.get('tab') // 'active' or 'history'
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '20')), 100)
        const offset = (page - 1) * pageSize

        // Count total (for pagination)
        let countQuery = supabase
            .from('requests')
            .select('*', { count: 'exact', head: true })
            .eq('employee_id', user.id) // Only own requests

        // Build data query - ALWAYS filter by employee_id
        let query = supabase
            .from('requests')
            .select('*')
            .eq('employee_id', user.id) // Force filter to own requests only
            .order('created_at', { ascending: false })

        // Tab-based filtering
        if (tab === 'active') {
            const activeStatuses = ['draft', 'pending', 'pending_am', 'pending_hr']
            query = query.in('status', activeStatuses)
            countQuery = countQuery.in('status', activeStatuses)
        } else if (tab === 'history') {
            const historyStatuses = ['approved', 'rejected']
            query = query.in('status', historyStatuses)
            countQuery = countQuery.in('status', historyStatuses)
        }

        // Additional filters
        if (status && !tab) {
            query = query.eq('status', status)
            countQuery = countQuery.eq('status', status)
        }
        if (type) {
            query = query.eq('type', type)
            countQuery = countQuery.eq('type', type)
        }

        // Date range filter
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        if (startDate) {
            query = query.gte('created_at', startDate)
            countQuery = countQuery.gte('created_at', startDate)
        }
        if (endDate) {
            query = query.lte('created_at', endDate + 'T23:59:59')
            countQuery = countQuery.lte('created_at', endDate + 'T23:59:59')
        }

        // Apply pagination
        query = query.range(offset, offset + pageSize - 1)

        // Execute queries
        const [countResult, dataResult] = await Promise.all([
            countQuery,
            query
        ])

        if (dataResult.error) {
            console.error('Fetch requests error:', dataResult.error)
            return NextResponse.json({ success: false, error: dataResult.error.message }, { status: 500 })
        }

        const total = countResult.count || 0

        // 2-step mapping for project names
        const projectIds = [...new Set((dataResult.data || []).map(r => r.project_id).filter(Boolean))] as string[]
        let projectMap = new Map<string, string>()

        if (projectIds.length > 0) {
            const { data: projects } = await supabase
                .from('projects')
                .select('id, name')
                .in('id', projectIds)

            if (projects) {
                projectMap = new Map(projects.map(p => [p.id, p.name]))
            }
        }

        const items: RequestItem[] = (dataResult.data || []).map(r => ({
            ...r,
            project_name: r.project_id ? projectMap.get(r.project_id) || null : null,
        }))

        return NextResponse.json({
            success: true,
            data: items,
            page,
            pageSize,
            total
        })

    } catch (error) {
        console.error('Requests GET error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * POST /api/requests
 * Create a new request for current user
 * - Leave: status = 'pending'
 * - Overtime: requires project_id, status = 'pending_am'
 */
export async function POST(request: NextRequest): Promise<NextResponse<CreateRequestResponse>> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { type, start_date, end_date, reason, meta, project_id } = body as {
            type: 'leave' | 'overtime'
            start_date: string
            end_date?: string | null
            reason?: string
            meta?: Record<string, unknown>
            project_id?: string
        }

        // Validation
        if (!type || !['leave', 'overtime'].includes(type)) {
            return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 })
        }
        if (!start_date) {
            return NextResponse.json({ success: false, error: 'start_date required' }, { status: 400 })
        }

        // Overtime requires project_id
        if (type === 'overtime' && !project_id) {
            return NextResponse.json({ success: false, error: 'Overtime requires project_id' }, { status: 400 })
        }

        // Verify project exists and is active (for overtime)
        if (type === 'overtime' && project_id) {
            const { data: project } = await supabase
                .from('projects')
                .select('id, is_active')
                .eq('id', project_id)
                .single()

            if (!project) {
                return NextResponse.json({ success: false, error: 'Project not found' }, { status: 400 })
            }
            if (!project.is_active) {
                return NextResponse.json({ success: false, error: 'Project is not active' }, { status: 400 })
            }
        }

        // Determine status: leave=pending, overtime=pending_am
        const finalStatus = type === 'overtime' ? 'pending_am' : 'pending'

        const { data, error } = await supabase
            .from('requests')
            .insert({
                employee_id: user.id,
                type,
                status: finalStatus,
                start_date,
                end_date: end_date || null,
                reason: reason || '',
                meta: meta || {},
                project_id: type === 'overtime' ? project_id : null,
            })
            .select()
            .single()

        if (error) {
            console.error('Create request error:', error)
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        // Get project name for response
        let projectName = null
        if (data.project_id) {
            const { data: project } = await supabase
                .from('projects')
                .select('name')
                .eq('id', data.project_id)
                .single()
            projectName = project?.name || null
        }

        return NextResponse.json({
            success: true,
            data: { ...data, project_name: projectName } as RequestItem
        })

    } catch (error) {
        console.error('Requests POST error:', error)
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
