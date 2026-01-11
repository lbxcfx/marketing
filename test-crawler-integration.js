
const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:8080/api/crawler';
const CLIENT_JOB_ID = 'test-job-' + Date.now();

async function runTest() {
    console.log('--- Starting Integration Test ---');
    console.log('Target Client Job ID:', CLIENT_JOB_ID);

    try {
        // 1. Start Crawler
        console.log('\n[1] Starting Crawler...');
        const startRes = await axios.post(`${BASE_URL}/start`, {
            platform: 'xhs',
            crawler_type: 'search',
            keywords: 'test',
            login_type: 'qrcode',
            save_option: 'json',
            start_page: 1,
            client_job_id: CLIENT_JOB_ID,
            headless: true // Run headless to avoid popping up browser
        });

        console.log('Start Response:', startRes.data);

        if (startRes.data.client_job_id !== CLIENT_JOB_ID) {
            throw new Error(`Mismatch! Expected ${CLIENT_JOB_ID}, got ${startRes.data.client_job_id}`);
        }
        console.log('✅ Start request verified client_job_id echo.');

        // 2. Check Status
        console.log('\n[2] Checking Status...');
        // Wait a bit for status to update
        await new Promise(r => setTimeout(r, 1000));

        const statusRes = await axios.get(`${BASE_URL}/status`);
        console.log('Status Response:', statusRes.data);

        if (statusRes.data.client_job_id !== CLIENT_JOB_ID) {
            // Note: It might be idle if it finished very fast or failed to start, but we assume running for a bit
            console.warn(`⚠️ Status check: Expected ${CLIENT_JOB_ID}, got ${statusRes.data.client_job_id}. Status is ${statusRes.data.status}`);
            if (statusRes.data.status === 'running' && statusRes.data.client_job_id !== CLIENT_JOB_ID) {
                throw new Error('Running status missing client_job_id!');
            }
        } else {
            console.log('✅ Status verified client_job_id persistence.');
        }

        // 3. Stop Crawler
        console.log('\n[3] Stopping Crawler...');
        const stopRes = await axios.post(`${BASE_URL}/stop`);
        console.log('Stop Response:', stopRes.data);
        console.log('✅ Stop request successful.');

    } catch (error) {
        console.error('❌ Test Failed:', error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

runTest();
