# -*- coding: utf-8 -*-
"""
Postiz 小红书集成测试脚本
验证从 Postiz API 到 social-auto-upload 的完整流程
"""

import requests
import json
import sys

# 配置
CHINA_SOCIAL_SERVICE_URL = "http://127.0.0.1:5409"

def test_all_endpoints():
    """测试所有必要的 API 端点"""
    print("\n" + "=" * 60)
    print("    Postiz 小红书集成测试")
    print("=" * 60 + "\n")
    
    # 1. 健康检查
    print("1. 测试健康检查...")
    try:
        resp = requests.get(f"{CHINA_SOCIAL_SERVICE_URL}/api/v1/health", timeout=5)
        if resp.status_code == 200:
            print(f"   ✅ 健康检查通过: {resp.json()}")
        else:
            print(f"   ❌ 健康检查失败: {resp.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ 服务不可用: {e}")
        print(f"\n   请确保 social-auto-upload 服务正在运行:")
        print(f"   cd social-auto-upload-main/social-auto-upload-main && python sau_backend.py")
        return False
    
    # 2. 获取平台列表
    print("\n2. 测试获取平台列表...")
    try:
        resp = requests.get(f"{CHINA_SOCIAL_SERVICE_URL}/api/v1/platforms", timeout=5)
        if resp.status_code == 200:
            platforms = resp.json().get('data', [])
            print(f"   ✅ 支持的平台: {[p['name'] for p in platforms]}")
        else:
            print(f"   ❌ 获取平台失败: {resp.status_code}")
    except Exception as e:
        print(f"   ❌ 错误: {e}")
    
    # 3. 获取小红书账号
    print("\n3. 测试获取小红书账号...")
    try:
        resp = requests.get(f"{CHINA_SOCIAL_SERVICE_URL}/api/v1/accounts?platform=xiaohongshu", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            accounts = data.get('data', [])
            if accounts:
                print(f"   ✅ 找到 {len(accounts)} 个小红书账号:")
                for acc in accounts:
                    print(f"      - ID: {acc['id']}, 用户名: {acc['userName']}, 状态: {'有效' if acc['status'] == 1 else '无效'}")
            else:
                print(f"   ⚠️ 没有找到小红书账号")
                print(f"   请先通过 Postiz 前端或 social-auto-upload 前端登录小红书")
        else:
            print(f"   ❌ 获取账号失败: {resp.status_code}")
    except Exception as e:
        print(f"   ❌ 错误: {e}")
    
    # 4. 测试视频发布端点 (不实际发布)
    print("\n4. 测试视频发布端点...")
    try:
        # 使用不存在的账号 ID 测试端点是否可达
        resp = requests.post(
            f"{CHINA_SOCIAL_SERVICE_URL}/api/v1/xiaohongshu/publish",
            json={"account_id": 9999, "video_url": "test.mp4", "title": "测试"},
            timeout=5
        )
        if resp.status_code in [200, 404]:
            print(f"   ✅ 视频发布端点可达 (状态码: {resp.status_code})")
        else:
            print(f"   ⚠️ 视频发布端点响应: {resp.status_code}")
    except Exception as e:
        print(f"   ❌ 错误: {e}")
    
    # 5. 测试图文发布端点 (不实际发布)
    print("\n5. 测试图文发布端点...")
    try:
        resp = requests.post(
            f"{CHINA_SOCIAL_SERVICE_URL}/api/v1/xiaohongshu/publish-image",
            json={"account_id": 9999, "image_urls": ["test.png"], "title": "测试"},
            timeout=5
        )
        if resp.status_code in [200, 404]:
            print(f"   ✅ 图文发布端点可达 (状态码: {resp.status_code})")
        else:
            print(f"   ⚠️ 图文发布端点响应: {resp.status_code}")
    except Exception as e:
        print(f"   ❌ 错误: {e}")
    
    # 6. 测试媒体上传端点
    print("\n6. 测试媒体上传端点...")
    try:
        # 创建一个测试文件
        import io
        test_file = io.BytesIO(b"test content")
        test_file.name = "test.txt"
        resp = requests.post(
            f"{CHINA_SOCIAL_SERVICE_URL}/api/v1/media/upload",
            files={"file": ("test.txt", test_file, "text/plain")},
            timeout=10
        )
        if resp.status_code == 200:
            print(f"   ✅ 媒体上传端点可用")
        else:
            print(f"   ⚠️ 媒体上传端点响应: {resp.status_code}")
    except Exception as e:
        print(f"   ❌ 错误: {e}")
    
    print("\n" + "=" * 60)
    print("    测试完成")
    print("=" * 60)
    
    print("\n📝 Postiz 前端集成说明:")
    print("-" * 60)
    print("1. 确保 .env 中配置了: CHINA_SOCIAL_SERVICE_URL=http://127.0.0.1:5409")
    print("2. 确保 social-auto-upload 服务正在运行")
    print("3. 在 Postiz 前端添加小红书账号 (通过扫码登录)")
    print("4. 创建帖子时选择小红书平台")
    print("5. 上传视频或图片，填写标题和话题")
    print("6. 点击发布")
    print("-" * 60)
    
    return True

if __name__ == "__main__":
    test_all_endpoints()
