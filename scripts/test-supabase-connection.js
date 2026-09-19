/**
 * Supabase Connection Test Script
 * 
 * Run with: node --env-file=.env.local scripts/test-supabase-connection.js
 * 
 * Make sure you have set the following environment variables:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testConnection() {
    console.log('🔌 Testing Supabase connection...\n');

    // Validate environment variables
    if (!supabaseUrl) {
        console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL is not set');
        console.log('\nPlease create a .env.local file with your Supabase credentials:');
        console.log('  NEXT_PUBLIC_SUPABASE_URL=your-project-url');
        console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key');
        process.exit(1);
    }

    if (!supabaseAnonKey) {
        console.error('❌ Error: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
        console.log('\nPlease create a .env.local file with your Supabase credentials:');
        console.log('  NEXT_PUBLIC_SUPABASE_URL=your-project-url');
        console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key');
        process.exit(1);
    }

    console.log(`📡 Supabase URL: ${supabaseUrl}`);
    console.log(`🔑 Anon Key: ${supabaseAnonKey.slice(0, 20)}...\n`);

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { db: { schema: 'streamflow' } });

    try {
        // Fetch the single row from stream_config table
        const { data, error } = await supabase
            .from('stream_config')
            .select('*')
            .single();

        if (error) {
            console.error('❌ Connection Failed:', error.message);
            console.error('\nFull error details:');
            console.error(JSON.stringify(error, null, 2));
            process.exit(1);
        }

        console.log('✅ Connection Successful: Found Config');
        console.log('\n📋 Stream Config Data:');
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('❌ Unexpected Error:', err.message);
        process.exit(1);
    }
}

testConnection();
