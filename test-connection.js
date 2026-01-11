
const http = require('http');

function request(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (data) {
            req.write(data);
        }
        req.end();
    });
}

async function testConnection() {
    console.log('Testing connection to social-auto-upload service...');

    // 1. Test Health
    try {
        const healthRes = await request({
            hostname: '127.0.0.1',
            port: 5409,
            path: '/api/v1/health',
            method: 'GET'
        });
        console.log('Health Status:', healthRes.status);
        console.log('Health Data:', healthRes.data);
    } catch (e) {
        console.error('Health Check Failed:', e.message);
    }

    // 2. Test Login Init
    try {
        const sessionId = 'test_' + Date.now();
        console.log('\nTesting Login Init...');
        const postData = JSON.stringify({
            platform: 'xiaohongshu',
            account_name: `xhs_${sessionId}`,
        });

        const loginRes = await request({
            hostname: '127.0.0.1',
            port: 5409,
            path: '/api/v1/login/init',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, postData);

        console.log('Login Init Status:', loginRes.status);
        console.log('Login Init Data:', loginRes.data);

    } catch (e) {
        console.error('Login Init Failed:', e.message);
    }
}

testConnection();
