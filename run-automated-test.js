
const axios = require('axios');
const { spawn } = require('child_process');

const BASE_URL = 'http://localhost:3000/auth';

async function run() {
    console.log('--- Starting Automated Test Suite ---');

    // 1. Register a temporary user to get a token
    const timestamp = Date.now();
    const email = `test.auto.${timestamp}@example.com`;
    const password = 'Password123!';

    console.log(`[1] Registering temporary user: ${email}`);

    try {
        const regRes = await axios.post(`${BASE_URL}/register`, {
            email,
            password,
            company: 'AutoTest Corp',
            provider: 'LOCAL'
        });

        // Extract cookie
        const cookies = regRes.headers['set-cookie'];
        if (!cookies) {
            throw new Error('No cookies returned from registration');
        }

        // Find 'auth' cookie
        const authCookie = cookies.find(c => c.startsWith('auth='));
        if (!authCookie) {
            // Maybe it's in the body for NOT_SECURED mode?
            // Check controller logic: if (process.env.NOT_SECURED) response.header('auth', jwt);
            // Let's check headers 'auth' too.
            if (regRes.headers['auth']) {
                return startSimulation(regRes.headers['auth']);
            }
            throw new Error('Auth cookie/header not found');
        }

        const authToken = authCookie.split(';')[0].replace('auth=', '');
        console.log('✅ Auth Token obtained.');

        startSimulation(authToken);

    } catch (error) {
        console.error('❌ Registration Failed:',
            error.response ? JSON.stringify(error.response.data, null, 2) : error.message
        );
        if (error.response) {
            console.error('Status:', error.response.status);
        }
        process.exit(1);
    }
}

function startSimulation(token) {
    console.log('\n[2] Launching Frontend Simulation Script...');
    const child = spawn('node', ['simulate-frontend-materials.js'], {
        env: { ...process.env, AUTH_TOKEN: token },
        stdio: 'inherit'
    });

    child.on('close', (code) => {
        console.log(`\n--- Test Suite Finished with code ${code} ---`);
        process.exit(code);
    });
}

run();
