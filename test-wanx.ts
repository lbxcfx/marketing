/**
 * DashScope Wanx API 测试脚本
 * 用于验证图片生成功能是否正常工作
 * 
 * 运行方式: npx ts-node test-wanx.ts
 */

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ESM 模块兼容
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env 文件
dotenv.config({ path: join(__dirname, '.env') });

const WANX_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const WANX_MODEL = process.env.WANX_MODEL || 'wan2.6-t2i';

async function testWanxAPI(): Promise<void> {
    console.log('='.repeat(60));
    console.log('DashScope Wanx API 测试');
    console.log('='.repeat(60));

    // 1. 检查 API Key
    const apiKey = process.env.DASHSCOPE_API_KEY;
    console.log('\n[1] 检查环境变量:');
    console.log(`    DASHSCOPE_API_KEY: ${apiKey ? `已配置 (${apiKey.substring(0, 8)}...)` : '❌ 未设置!'}`);
    console.log(`    WANX_MODEL: ${WANX_MODEL}`);

    if (!apiKey) {
        console.error('\n❌ 错误: DASHSCOPE_API_KEY 未配置，请在 .env 文件中设置');
        process.exit(1);
    }

    // 2. 构建请求
    const prompt = '一间有着精致窗户的花店，漂亮的木质门，摆放着花朵';
    const requestBody = {
        model: WANX_MODEL,
        input: {
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        },
        parameters: {
            prompt_extend: true,
            watermark: false,
            negative_prompt: '',
            n: 1,
            size: '1280*1280',
        },
    };

    console.log('\n[2] 请求配置:');
    console.log(`    API URL: ${WANX_API_URL}`);
    console.log(`    Model: ${WANX_MODEL}`);
    console.log(`    Prompt: ${prompt}`);

    // 3. 发送请求
    console.log('\n[3] 发送请求中...');
    const startTime = Date.now();

    try {
        const response = await fetch(WANX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`    耗时: ${elapsed}s`);
        console.log(`    HTTP Status: ${response.status} ${response.statusText}`);

        const responseText = await response.text();

        if (!response.ok) {
            console.error('\n❌ API 请求失败:');
            console.error(responseText);
            process.exit(1);
        }

        // 4. 解析响应
        const data = JSON.parse(responseText);
        console.log('\n[4] API 响应:');
        console.log(JSON.stringify(data, null, 2));

        // 5. 提取图片 URL
        const imageUrl = data?.output?.choices?.[0]?.message?.content?.[0]?.image
            || data?.output?.results?.[0]?.url;

        if (imageUrl) {
            console.log('\n✅ 成功! 生成的图片 URL:');
            console.log(`    ${imageUrl}`);
        } else {
            console.error('\n❌ 错误: 响应中没有找到图片 URL');
            console.error('完整响应:', JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error('\n❌ 请求异常:');
        console.error(error);
        process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
}

// 运行测试
testWanxAPI();
