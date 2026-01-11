/**
 * 测试 AI 图像生成 API
 * 模拟前端发送请求到后端的 /media/generate-image 端点
 * 
 * 使用方法:
 * 1. 先在浏览器中登录 http://localhost:4200
 * 2. 打开开发者工具 -> Application -> Cookies -> localhost
 * 3. 复制 'auth' cookie 的值
 * 4. 设置环境变量 AUTH_TOKEN 或直接粘贴到下面的 AUTH_TOKEN 变量
 * 5. 运行: node test-image-api.js
 */

require('dotenv').config();

// 从环境变量或手动设置获取 auth token
// 你可以从浏览器的 Cookie 中复制 'auth' 值到这里
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const BACKEND_URL = 'http://localhost:3000';

async function testGenerateImage(prompt) {
    console.log('=== Testing AI Image Generation API ===\n');
    console.log('Prompt:', prompt);
    console.log('Backend URL:', BACKEND_URL);
    console.log('Auth Token:', AUTH_TOKEN ? AUTH_TOKEN.substring(0, 20) + '...' : 'NOT SET');

    if (!AUTH_TOKEN) {
        console.error('\nERROR: AUTH_TOKEN not set!');
        console.log('\n如何获取 AUTH_TOKEN:');
        console.log('1. 在浏览器中访问 http://localhost:4200 并登录');
        console.log('2. 打开开发者工具 (F12)');
        console.log('3. 进入 Application -> Cookies -> localhost');
        console.log('4. 找到名为 "auth" 的 cookie，复制其值');
        console.log('5. 设置环境变量: set AUTH_TOKEN=<your_token>');
        console.log('6. 或者直接编辑此脚本，填入 AUTH_TOKEN 变量');
        return;
    }

    console.log('\n--- Sending request to /media/generate-image ---\n');

    const startTime = Date.now();

    try {
        const response = await fetch(`${BACKEND_URL}/media/generate-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'auth': AUTH_TOKEN,
            },
            body: JSON.stringify({
                prompt: prompt
            })
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Response status: ${response.status} ${response.statusText}`);
        console.log(`Time elapsed: ${elapsed}s`);

        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);

        if (response.ok) {
            const data = await response.json();
            console.log('\n=== SUCCESS ===');
            if (data.output) {
                console.log('Output type:', data.output.startsWith('data:image') ? 'Base64 Image' : 'URL');
                console.log('Output length:', data.output.length);
                console.log('First 100 chars:', data.output.substring(0, 100) + '...');
            } else {
                console.log('Response:', JSON.stringify(data, null, 2));
            }
        } else {
            console.log('\n=== ERROR ===');
            try {
                const errorData = await response.json();
                console.log('Error response:', JSON.stringify(errorData, null, 2));
            } catch (e) {
                const errorText = await response.text();
                console.log('Error text:', errorText);
            }
        }
    } catch (err) {
        console.log('\n=== FETCH ERROR ===');
        console.error(err);
    }
}

// 运行测试
const prompt = process.argv[2] || 'a cute white cat playing with a red ball';
testGenerateImage(prompt);
