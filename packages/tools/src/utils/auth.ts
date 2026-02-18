import { google } from 'googleapis';
import { supabase } from '@hive/db';

export async function getGoogleAuth(integrationName: string = 'gmail') {
    const { data: connection, error } = await supabase
        .from('connections')
        .select('tokens')
        .eq('name', integrationName)
        .single();

    if (error || !connection) {
        throw new Error(`Integration "${integrationName}" not connected or unauthorized.`);
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(connection.tokens as any);

    return oauth2Client;
}
