import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This route creates a signed upload URL using the service role key
// which bypasses RLS policies
export async function POST(request: Request) {
    try {
        const { filename } = await request.json()

        if (!filename) {
            return NextResponse.json({ error: 'Missing filename' }, { status: 400 })
        }

        // Use service role key to bypass RLS
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

        if (!serviceRoleKey) {
            console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            )
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false }
        })

        // Create a signed URL for uploading
        const { data, error } = await supabaseAdmin.storage
            .from('dropzone')
            .createSignedUploadUrl(filename)

        if (error) {
            console.error('Signed URL error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            signedUrl: data.signedUrl,
            path: data.path,
            token: data.token
        })
    } catch (error) {
        console.error('Create signed URL error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
