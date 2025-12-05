import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to fetch QDF files from external sources.
 * This server-side endpoint bypasses CORS restrictions by proxying requests.
 */
export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url || typeof url !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid URL parameter' },
                { status: 400 }
            );
        }

        // Validate that the URL is one of the allowed template sites
        const allowedDomains = [
            'mdb.quadroworld.com',
            'mynthquadro.github.io',
            'yougenmdb.com',
        ];

        const urlObj = new URL(url);
        const isAllowed = allowedDomains.some(domain => urlObj.hostname.includes(domain));

        if (!isAllowed) {
            return NextResponse.json(
                { error: 'URL domain not allowed' },
                { status: 403 }
            );
        }

        // Fetch the file from the external URL
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'QDF-Viewer/1.0',
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch from ${url}: ${response.statusText}` },
                { status: response.status }
            );
        }

        const text = await response.text();

        return NextResponse.json({ success: true, data: text });
    } catch (err) {
        console.error('Error in fetch-qdf endpoint:', err);
        return NextResponse.json(
            { error: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}` },
            { status: 500 }
        );
    }
}
