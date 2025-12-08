import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to fetch QDF files from goods database.
 * Takes a keyword, searches for a matching item, and returns the associated file.
 */
export async function POST(request: NextRequest) {
    try {
        const { keyword } = await request.json();

        if (!keyword || typeof keyword !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid keyword parameter' },
                { status: 400 }
            );
        }

        // Step 1: Fetch the goods list
        const listUrl = `https://duimu.ji000.cn/api/goods/getlist?page=1&rows=1&keyword=${encodeURIComponent(keyword)}&user_id=12345`;

        console.log('Fetching goods list from:', listUrl);
        const listResponse = await fetch(listUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'QDF-Viewer/1.0',
            },
        });

        if (!listResponse.ok) {
            return NextResponse.json(
                { error: `Failed to fetch goods list: ${listResponse.statusText}` },
                { status: listResponse.status }
            );
        }

        const responseData = await listResponse.json();
        const listData = responseData?.list;

        // Step 2: Check if we have exactly one entry
        if (!Array.isArray(listData) || listData.length !== 1) {
            console.log('List data:', listData);
            return NextResponse.json(
                { error: `Expected exactly 1 result, got ${Array.isArray(listData) ? listData.length : 0}` },
                { status: 404 }
            );
        }

        const entry = listData[0];
        const qdfPath = entry?.fujian;

        if (!qdfPath) {
            console.log('entry:', entry);
            return NextResponse.json(
                { error: 'No fujian field found in the response' },
                { status: 404 }
            );
        }

        // Step 3: Fetch the file from OSS
        const fileUrl = `https://haha9000.oss-cn-shanghai.aliyuncs.com/${qdfPath}`;

        const fileResponse = await fetch(fileUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'QDF-Viewer/1.0',
            },
        });

        if (!fileResponse.ok) {
            return NextResponse.json(
                { error: `Failed to fetch file: ${fileResponse.statusText}` },
                { status: fileResponse.status }
            );
        }

        const text = await fileResponse.text();

        return NextResponse.json({ success: true, data: text });
    } catch (err) {
        console.error('Error in fetch-goods endpoint:', err);
        return NextResponse.json(
            { error: `Server error: ${err instanceof Error ? err.message : 'Unknown error'}` },
            { status: 500 }
        );
    }
}
