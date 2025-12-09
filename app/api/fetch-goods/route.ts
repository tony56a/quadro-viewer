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

        // Randomize User-Agent to avoid blocking
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ];
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

        // Step 1: Fetch the goods list
        const listUrl = `https://duimu.ji000.cn/api/goods/getlist?page=1&rows=1&keyword=${encodeURIComponent(keyword)}&user_id=654321&from=weixin`;

        console.log('Fetching goods list from:', listUrl);
        const listResponse = await fetch(listUrl, {
            method: 'GET',
            headers: {
                'User-Agent': randomUserAgent,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://duimu.ji000.cn/',
                'Origin': 'https://duimu.ji000.cn',
            },
        });

        if (!listResponse.ok) {
            console.log('Failed to fetch goods list:', listResponse.statusText);
            return NextResponse.json(
                { error: `Failed to fetch goods list: ${listResponse.statusText}` },
                { status: listResponse.status }
            );
        }

        const responseData = await listResponse.json();
        const listData = responseData?.list;

        // Step 2: Check if we have exactly one entry
        if (!Array.isArray(listData) || listData.length !== 1) {
            return NextResponse.json(
                { error: `Expected exactly 1 result, got ${Array.isArray(listData) ? listData.length : 0}` },
                { status: 404 }
            );
        }

        const entry = listData[0];
        const qdfPath = entry?.fujian;
        const imagePath = entry?.image;

        if (!qdfPath) {
            return NextResponse.json(
                { error: 'No fujian field found in the response' },
                { status: 404 }
            );
        }

        // Step 3: Parse the domain from the image URL
        let ossDomain = 'https://haha9000.oss-cn-shanghai.aliyuncs.com'; // Default fallback

        if (imagePath && typeof imagePath === 'string') {
            try {
                const imageUrl = new URL(imagePath);
                // Extract the domain without the path
                ossDomain = `${imageUrl.protocol}//${imageUrl.hostname}`;
            } catch (err) {
                console.log('Failed to parse image URL, using default domain:', err);
            }
        }

        // Construct the file URL using the parsed domain
        const fileUrl = `${ossDomain}${qdfPath}`;

        const fileResponse = await fetch(fileUrl, {
            method: 'GET',
            headers: {
                'User-Agent': randomUserAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://duimu.ji000.cn/',
                'Origin': 'https://duimu.ji000.cn',
            },
        });

        if (!fileResponse.ok) {
            console.log('Failed to fetch file:', fileResponse.statusText);
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
