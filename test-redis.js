
require('dotenv').config({ path: './.env' });
const Redis = require('ioredis');

async function testRedis() {
    console.log('Testing Redis Connection...');
    console.log('REDIS_URL:', process.env.REDIS_URL);

    const redis = new Redis(process.env.REDIS_URL);

    try {
        await redis.set('test_key', 'hello_world', 'EX', 60);
        console.log('Write Success: test_key = hello_world');

        const value = await redis.get('test_key');
        console.log('Read Success:', value);

        if (value === 'hello_world') {
            console.log('Redis is working correctly!');
        } else {
            console.error('Value mismatch!');
        }
    } catch (e) {
        console.error('Redis Operation Failed:', e.message);
    } finally {
        redis.disconnect();
    }
}

testRedis();
