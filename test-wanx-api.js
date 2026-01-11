// Test Wanx API directly
require('dotenv').config();

const apiKey = process.env.DASHSCOPE_API_KEY;
console.log('API Key:', apiKey ? apiKey.substring(0, 15) + '...' : 'NOT SET');

async function testWanxAPI() {
    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
    const body = {
        model: 'wanx2.1-t2i-turbo',
        input: {
            prompt: 'a cute white cat',
            negative_prompt: 'low quality'
        },
        parameters: {
            size: '1024*1024',
            n: 1
        }
    };

    console.log('Testing Wanx API...');
    console.log('URL:', url);
    console.log('Body:', JSON.stringify(body, null, 2));

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey,
                'X-DashScope-Async': 'enable'
            },
            body: JSON.stringify(body)
        });

        console.log('Status:', res.status, res.statusText);
        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.output?.task_id) {
            console.log('\n--- Polling task ---');
            const taskId = data.output.task_id;
            const taskUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;

            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                const taskRes = await fetch(taskUrl, {
                    headers: { 'Authorization': 'Bearer ' + apiKey }
                });
                const taskData = await taskRes.json();
                console.log(`Poll ${i + 1}: ${taskData.output?.task_status}`);

                if (taskData.output?.task_status === 'SUCCEEDED') {
                    console.log('Success! Image URL:', taskData.output?.results?.[0]?.url);
                    break;
                } else if (taskData.output?.task_status === 'FAILED') {
                    console.log('Failed:', JSON.stringify(taskData, null, 2));
                    break;
                }
            }
        }
    } catch (err) {
        console.log('Error:', err);
    }
}

testWanxAPI();
