# -*- coding: utf-8 -*-
"""
小红书发布测试脚本 v2
测试 social-auto-upload-main 的小红书发布功能
修复后的版本
"""

import requests
import json
import os
import sys
import time

# 配置
BASE_URL = "http://127.0.0.1:5409"

def test_health():
    """测试健康检查"""
    print("=" * 50)
    print("1. 测试健康检查...")
    try:
        resp = requests.get(f"{BASE_URL}/api/v1/health", timeout=5)
        print(f"   状态码: {resp.status_code}")
        print(f"   响应: {resp.json()}")
        return resp.status_code == 200
    except requests.exceptions.ConnectionError:
        print("   ❌ 无法连接到服务，请确保 sau_backend.py 正在运行")
        print(f"   请先启动服务: cd social-auto-upload-main/social-auto-upload-main && python sau_backend.py")
        return False
    except Exception as e:
        print(f"   ❌ 错误: {e}")
        return False

def test_get_accounts():
    """获取账号列表"""
    print("=" * 50)
    print("2. 获取小红书账号列表...")
    try:
        resp = requests.get(f"{BASE_URL}/api/v1/accounts?platform=xiaohongshu", timeout=10)
        print(f"   状态码: {resp.status_code}")
        data = resp.json()
        
        if data.get('code') == 200 and data.get('data'):
            accounts = data['data']
            print(f"   ✅ 找到 {len(accounts)} 个小红书账号")
            for acc in accounts:
                print(f"      - ID: {acc.get('id')}, 用户名: {acc.get('userName')}, filePath: {acc.get('filePath')}")
            return accounts
        else:
            print("   ⚠️ 没有找到小红书账号，请先登录")
            return []
    except Exception as e:
        print(f"   ❌ 错误: {e}")
        return []

def test_publish_xiaohongshu(account_id, image_path=None, title="测试发布"):
    """测试小红书发布"""
    print("=" * 50)
    print("3. 测试小红书发布...")
    
    # 如果没有提供图片路径，使用默认测试图片
    if not image_path:
        # 尝试找一个测试图片
        test_images = [
            "F:/postiz-app/uploads/2026/01/09/a6d4291c3039911bde37fc1e88682f4e.png",
            "social-auto-upload-main/social-auto-upload-main/media/test.png"
        ]
        for img in test_images:
            if os.path.exists(img):
                image_path = img
                break
    
    if not image_path or not os.path.exists(image_path):
        print("   ⚠️ 未找到测试图片，跳过发布测试")
        print("   请提供图片路径作为参数")
        return False
    
    print(f"   使用图片: {image_path}")
    print(f"   账号ID: {account_id}")
    print(f"   标题: {title}")
    
    try:
        # 发布请求
        payload = {
            "account_id": account_id,
            "video_url": image_path,  # 这里可以是图片路径
            "title": title,
            "tags": ["测试", "自动化"]
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/v1/xiaohongshu/publish",
            json=payload,
            timeout=30
        )
        print(f"   状态码: {resp.status_code}")
        print(f"   响应: {json.dumps(resp.json(), ensure_ascii=False, indent=2)}")
        
        if resp.status_code == 200:
            print("   ✅ 发布请求已提交")
            print("\n   ⏳ 等待30秒让发布任务执行...")
            time.sleep(30)
            return True
        else:
            print("   ❌ 发布请求失败")
            return False
            
    except Exception as e:
        print(f"   ❌ 错误: {e}")
        return False

def check_logs():
    """检查日志"""
    print("=" * 50)
    print("4. 检查发布日志...")
    log_path = "social-auto-upload-main/social-auto-upload-main/logs/xiaohongshu.log"
    if os.path.exists(log_path):
        with open(log_path, 'r', encoding='utf-8') as f:
            content = f.read()
            if content:
                print(f"   日志内容:\n{content[-2000:]}")  # 最后2000字符
            else:
                print("   日志为空")
    else:
        print(f"   日志文件不存在: {log_path}")

def main():
    print("\n" + "=" * 50)
    print("    小红书发布功能测试 v2")
    print("=" * 50 + "\n")
    
    # 1. 健康检查
    if not test_health():
        print("\n❌ 服务未运行，请先启动 sau_backend.py")
        sys.exit(1)
    
    # 2. 获取账号
    accounts = test_get_accounts()
    if not accounts:
        print("\n❌ 没有可用的小红书账号")
        print("请先通过 social-auto-upload 前端登录小红书账号")
        sys.exit(1)
    
    # 3. 使用第一个账号测试发布
    account_id = accounts[0].get('id')
    
    # 可以通过命令行参数传入图片路径
    image_path = sys.argv[1] if len(sys.argv) > 1 else None
    title = sys.argv[2] if len(sys.argv) > 2 else "Postiz自动发布测试"
    
    test_publish_xiaohongshu(account_id, image_path, title)
    
    # 4. 检查日志
    check_logs()
    
    print("\n" + "=" * 50)
    print("    测试完成")
    print("=" * 50 + "\n")

if __name__ == "__main__":
    main()
