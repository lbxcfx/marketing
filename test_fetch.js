
async function test() {
    console.log('Testing connection to social-auto-upload...');
    const url = 'http://127.0.0.1:5409/api/v1/xiaohongshu/publish-image';
    const body = {
        account_id: 1,
        image_urls: ['test.png'],
        title: 'test title',
        description: 'test description',
        tags: [],
        scheduled_time: null
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Response: ${text.substring(0, 500)}`); // Show first 500 chars

        try {
            const json = JSON.parse(text);
            console.log('JSON parse success:', json);
        } catch (e) {
            console.error('JSON parse failed:', e.message);
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

test();
