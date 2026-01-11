import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeAuditLog } from '@/lib/audit/log'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export interface DivisionWithLead {
    id: string
    name: string
    lead_employee_id: string | null
    lead_name: string | null
}

export interface EmployeeOption {
    id: string
    full_name: string
    role: string
    is_active: boolean
}

export interface DivisionsResponse {
    success: boolean
    divisions?: DivisionWithLead[]
    employees?: EmployeeOption[]
    error?: string
}

/**
 * GET /api/admin/divisions
 * List all divisions with lead names + employee options for dropdown
 */
export async function GET(): Promise<NextResponse<DivisionsResponse>> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Fetch divisions
        const { data: divisions, error: divError } = await supabase
            .from('divisions')
            .select('id, name, lead_employee_id')
            .order('name')

        if (divError) {
            return NextResponse.json({ success: false, error: divError.message }, { status: 500 })
        }

        // Fetch all active employees for lead dropdown + mapping
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, role, is_active')
            .order('full_name')

        if (empError) {
            return NextResponse.json({ success: false, error: empError.message }, { status: 500 })
        }

        // Map lead names
        const empMap = new Map(employees?.map(e => [e.id, e.full_name]) || [])
        const divisionsWithLead: DivisionWithLead[] = (divisions || []).map(d => ({
            ...d,
            lead_name: d.lead_employee_id ? empMap.get(d.lead_employee_id) || null : null,
        }))

        return NextResponse.json({
            success: true,
            divisions: divisionsWithLead,
            employees: employees || [],
        })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * POST /api/admin/divisions
 * Create new division
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { name } = body as { name: string }

        if (!name || !name.trim()) {
            return NextResponse.json({ success: false, error: 'Division name required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('divisions')
            .insert({ name: name.trim() })
            .select()
            .single()

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ success: false, error: 'Division name already exists' }, { status: 400 })
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        // Audit log
        await safeAuditLog(supabase, {
            action: 'division_created',
            entity: 'divisions',
            entity_id: data.id,
            meta: { name: data.name },
        })

        return NextResponse.json({ success: true, data })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}

/**
 * PATCH /api/admin/divisions
 * Update division (name, lead_employee_id)
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user || !ADMIN_EMAILS.includes(user.email || '')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { id, name, lead_employee_id } = body as {
            id: string
            name?: string
            lead_employee_id?: string | null
        }

        if (!id) {
            return NextResponse.json({ success: false, error: 'Division id required' }, { status: 400 })
        }

        const updateData: Record<string, unknown> = {}
        if (name !== undefined) {
            if (!name.trim()) {
                return NextResponse.json({ success: false, error: 'Name cannot be empty' }, { status: 400 })
            }
            updateData.name = name.trim()
        }
        if (lead_employee_id !== undefined) {
            updateData.lead_employee_id = lead_employee_id
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 })
        }

        const { error } = await supabase
            .from('divisions')
            .update(updateData)
            .eq('id', id)

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ success: false, error: 'Division name already exists' }, { status: 400 })
            }
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        // Audit log
        await safeAuditLog(supabase, {
            action: 'division_updated',
            entity: 'divisions',
            entity_id: id,
            meta: { name: updateData.name, lead_employee_id: updateData.lead_employee_id },
        })

        return NextResponse.json({ success: true })

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}
