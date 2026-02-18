import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
        realtime: {
            log_level: 'info'
        }
    }
)

async function testRealtime() {
    console.log('Testing Supabase Realtime...')
    const channel = supabase.channel('room-1')

    channel
        .on('broadcast', { event: 'test' }, payload => {
            console.log('Received broadcast:', payload)
        })
        .subscribe((status, err) => {
            console.log(`Subscription status: ${status}`, err ?? '')
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed!')
                setTimeout(() => {
                    console.log('Sending broadcast...')
                    channel.send({
                        type: 'broadcast',
                        event: 'test',
                        payload: { message: 'hello world' }
                    })
                }, 1000)
            }
        })

    // Keep alive for a bit
    setTimeout(() => {
        console.log('Closing...')
        process.exit(0)
    }, 10000)
}

testRealtime()
