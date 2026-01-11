// Full test of Wanx image generation flow including base64 conversion
require('dotenv').config();

const apiKey = process.env.DASHSCOPE_API_KEY;
console.log('API Key:', apiKey ? apiKey.substring(0, 15) + '...' : 'NOT SET');

async function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function generateImageWithWanx(prompt, size = '1024*1024') {
    console.log('\n[Step 1] Submitting task...');
    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
    const body = {
        model: 'wanx2.1-t2i-turbo',
        input: {
            prompt: prompt,
            negative_prompt: 'low quality, blurry, distorted'
        },
        parameters: {
            size: size,
            n: 1
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
            'X-DashScope-Async': 'enable'
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    console.log('Submit response:', JSON.stringify(data, null, 2));

    if (!data.output?.task_id) {
        throw new Error('No task_id: ' + JSON.stringify(data));
    }

    const taskId = data.output.task_id;
    console.log('\n[Step 2] Polling task:', taskId);

    for (let i = 0; i < 60; i++) {
        await delay(2000);
        const taskRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
            headers: { 'Authorization': 'Bearer ' + apiKey }
        });
        const taskData = await taskRes.json();
        console.log(`Poll ${i + 1}: ${taskData.output?.task_status}`);

        if (taskData.output?.task_status === 'SUCCEEDED') {
            const imageUrl = taskData.output?.results?.[0]?.url;
            console.log('\n[Step 3] Task succeeded! Image URL:', imageUrl);
            return imageUrl;
        } else if (taskData.output?.task_status === 'FAILED') {
            throw new Error('Task failed: ' + JSON.stringify(taskData));
        }
    }
    throw new Error('Task timed out');
}

async function imageUrlToBase64(imageUrl) {
    console.log('\n[Step 4] Converting to base64...');
    console.log('URL:', imageUrl.substring(0, 80) + '...');

    const response = await fetch(imageUrl);
    console.log('Fetch status:', response.status, response.statusText);

    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    console.log('Base64 length:', base64.length);
    console.log('First 100 chars:', base64.substring(0, 100));
    return base64;
}

async function main() {
    try {
        console.log('=== Testing full image generation flow ===\n');
        const imageUrl = await generateImageWithWanx('a cute white cat playing with a ball');
        const base64 = await imageUrlToBase64(imageUrl);
        console.log('\n=== SUCCESS ===');
        console.log('Final result (first 200 chars):', ('data:image/png;base64,' + base64).substring(0, 200));
    } catch (err) {
        console.error('\n=== ERROR ===');
        console.error(err);
    }
}

main();
