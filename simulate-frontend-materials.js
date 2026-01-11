
/**
 * Frontend Simulation for Materials Feature
 * 
 * Usage:
 * 1. Login to your Postiz instance http://localhost:4200
 * 2. Get the value of 'auth' cookie or localStorage token.
 * 3. Run: export AUTH_TOKEN="your_jwt_here" && node simulate-frontend-materials.js
 *    (Or edit the const AUTH_TOKEN below)
 */

const axios = require('axios');
const EventSource = require('eventsource');

// CHANGE THIS TO YOUR AUTH TOKEN
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const BASE_URL = 'http://localhost:3000/api';

async function main() {
    if (!AUTH_TOKEN) {
        console.error('❌ Error: AUTH_TOKEN is missing. Please set it in the script or env var.');
        process.exit(1);
    }

    console.log('--- Postiz Materials Frontend Simulation ---');
    console.log('Target: Xiaohongshu (xhs)');
    console.log('Keywords: AI Tools');

    try {
        // 1. Trigger Search
        console.log('\n[1] Sending Search Request...');
        const searchRes = await axios.post(
            `${BASE_URL}/materials/search`,
            {
                platform: 'xhs',
                keywords: 'AI Tools',
                startPage: 1,
                pageLimit: 1, // Keep it fast
                forceCrawl: true // Bypass cache for testing
            },
            {
                headers: {
                    auth: AUTH_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        const { jobId, state, cachedResults } = searchRes.data;
        console.log(`✅ Search accepted. Job ID: ${jobId}, State: ${state}`);

        if (cachedResults) {
            console.log('⚠️ Result returned from cache. To test full flow, use forceCrawl: true.');
            console.log('Result Preview:', cachedResults.preview?.length);
            return;
        }

        if (!jobId) {
            console.error('❌ No Job ID returned!');
            return;
        }

        // 2. Connect to SSE
        console.log(`\n[2] Connecting to Event Stream for Job ${jobId}...`);
        const sseUrl = `${BASE_URL}/materials/events?jobId=${jobId}`;
        const es = new EventSource(sseUrl, {
            headers: { auth: AUTH_TOKEN }
        });

        es.onopen = () => {
            console.log('✅ SSE Connected.');
        };

        es.onmessage = (event) => {
            // NestJS SSE sends data wrapped in 'data' field usually, but EventSource handles 'message' type.
            // Let's check raw data.
            try {
                const payload = JSON.parse(event.data);
                handleEvent(payload, es);
            } catch (e) {
                console.log('Received raw message:', event.data);
            }
        };

        es.addEventListener('log', (e) => {
            const payload = JSON.parse(e.data);
            console.log(`📜 [LOG] ${payload.message}`);
        });

        es.addEventListener('status', (e) => {
            const payload = JSON.parse(e.data);
            console.log(`🔄 [STATUS] ${payload.state} (${Math.round(payload.progress * 100)}%) - ${payload.message || ''}`);

            if (payload.state === 'succeeded') {
                console.log('🎉 Job Succeeded! Waiting for result event...');
            } else if (payload.state === 'failed') {
                console.error(`❌ Job Failed: ${payload.message}`);
                es.close();
                process.exit(1);
            }
        });

        es.addEventListener('result', (e) => {
            const payload = JSON.parse(e.data);
            console.log('\n✅ [RESULT] Received Data!');
            console.log(`   Count: ${payload.count}`);
            console.log(`   Preview: ${(payload.preview || []).map(i => i.title).join(', ')}`);

            console.log('\n--- Test Completed Successfully ---');
            es.close();
            process.exit(0);
        });

        es.addEventListener('login_qrcode', (e) => {
            const payload = JSON.parse(e.data);
            console.log('⚠️ [LOGIN REQUIRED] Please scan QR Code (Base64 length: ' + payload.base64_image?.length + ')');
        });

        es.onerror = (err) => {
            if (err.status === 401 || err.status === 403) {
                console.error('❌ SSE Connection Rejected (Auth Error).');
            }
            // console.error('SSE Error:', err);
        };

    } catch (error) {
        console.error('❌ Request Failed:', error.response?.data || error.message);
        if (error.response?.status === 404) {
            console.error('Hint: Is the backend running? Is MaterialsController registered?');
        }
    }
}

function handleEvent(payload, es) {
    // Fallback if custom events aren't working and everything comes as 'message'
    console.log('Msg:', payload);
}

main();
