# -*- coding: utf-8 -*-
"""
Postiz Integration API Layer
为 Postiz 提供统一的 REST API 接口
"""

from flask import Blueprint, request, jsonify
import asyncio
import threading
from queue import Queue
from pathlib import Path
import sqlite3
import uuid
import os

from conf import BASE_DIR
from myUtils.login import douyin_cookie_gen, xiaohongshu_cookie_gen
from myUtils.postVideo import post_video_DouYin, post_video_xhs, post_image_xhs
from myUtils.auth import check_cookie

# 创建 Blueprint
postiz_api = Blueprint('postiz_api', __name__, url_prefix='/api/v1')

# 活跃的登录会话
login_sessions = {}


@postiz_api.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({
        "status": "healthy",
        "service": "social-auto-upload",
        "version": "1.0.0"
    }), 200


@postiz_api.route('/platforms', methods=['GET'])
def get_platforms():
    """获取支持的平台列表"""
    return jsonify({
        "code": 200,
        "data": [
            {
                "id": "douyin",
                "name": "抖音",
                "type": 3,
                "icon": "douyin",
                "supported_media": ["video"],
                "max_video_size_mb": 128,
                "max_title_length": 30
            },
            {
                "id": "xiaohongshu",
                "name": "小红书",
                "type": 1,
                "icon": "xiaohongshu",
                "supported_media": ["video", "image"],
                "max_video_size_mb": 100,
                "max_title_length": 20
            }
        ]
    }), 200


@postiz_api.route('/accounts', methods=['GET'])
def get_accounts():
    """获取所有账号列表"""
    platform = request.args.get('platform')  # 可选过滤
    
    try:
        with sqlite3.connect(Path(BASE_DIR / "db" / "database.db")) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            if platform:
                type_map = {"douyin": 3, "xiaohongshu": 1}
                platform_type = type_map.get(platform)
                if platform_type:
                    cursor.execute('SELECT * FROM user_info WHERE type = ?', (platform_type,))
                else:
                    cursor.execute('SELECT * FROM user_info')
            else:
                cursor.execute('SELECT * FROM user_info')
            
            rows = cursor.fetchall()
            
            accounts = []
            for row in rows:
                row_dict = dict(row)
                # 转换类型为平台名称
                type_names = {1: "xiaohongshu", 2: "weixin", 3: "douyin", 4: "kuaishou"}
                row_dict['platform'] = type_names.get(row_dict.get('type'), 'unknown')
                accounts.append(row_dict)
            
            return jsonify({
                "code": 200,
                "msg": "success",
                "data": accounts
            }), 200
            
    except Exception as e:
        return jsonify({
            "code": 500,
            "msg": f"获取账号失败: {str(e)}",
            "data": None
        }), 500


@postiz_api.route('/accounts/<int:account_id>/validate', methods=['POST'])
async def validate_account(account_id):
    """验证账号 Cookie 是否有效"""
    try:
        with sqlite3.connect(Path(BASE_DIR / "db" / "database.db")) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM user_info WHERE id = ?', (account_id,))
            row = cursor.fetchone()
            
            if not row:
                return jsonify({
                    "code": 404,
                    "msg": "账号不存在",
                    "data": None
                }), 404
            
            row_dict = dict(row)
            is_valid = await check_cookie(row_dict['type'], row_dict['filePath'])
            
            # 更新状态
            cursor.execute('''
                UPDATE user_info SET status = ? WHERE id = ?
            ''', (1 if is_valid else 0, account_id))
            conn.commit()
            
            return jsonify({
                "code": 200,
                "msg": "success",
                "data": {
                    "id": account_id,
                    "valid": is_valid
                }
            }), 200
            
    except Exception as e:
        return jsonify({
            "code": 500,
            "msg": f"验证失败: {str(e)}",
            "data": None
        }), 500


@postiz_api.route('/login/init', methods=['POST'])
def init_login():
    """初始化登录会话"""
    data = request.get_json()
    platform = data.get('platform')  # "douyin" 或 "xiaohongshu"
    account_name = data.get('account_name', f'account_{uuid.uuid4().hex[:8]}')
    
    platform_types = {"douyin": 3, "xiaohongshu": 1}
    platform_type = platform_types.get(platform)
    
    if not platform_type:
        return jsonify({
            "code": 400,
            "msg": "不支持的平台",
            "data": None
        }), 400
    
    # 生成会话 ID
    session_id = str(uuid.uuid4())
    
    # 创建状态队列
    status_queue = Queue()
    login_sessions[session_id] = {
        "queue": status_queue,
        "platform": platform,
        "platform_type": platform_type,
        "account_name": account_name,
        "status": "pending",
        "qrcode_url": None
    }
    
    # 启动登录线程
    thread = threading.Thread(
        target=run_login_async,
        args=(session_id, platform_type, account_name, status_queue),
        daemon=True
    )
    thread.start()
    
    return jsonify({
        "code": 200,
        "msg": "登录会话已创建",
        "data": {
            "session_id": session_id,
            "platform": platform,
            "account_name": account_name
        }
    }), 200


@postiz_api.route('/login/status/<session_id>', methods=['GET'])
def get_login_status(session_id):
    """获取登录状态"""
    session = login_sessions.get(session_id)
    
    if not session:
        return jsonify({
            "code": 404,
            "msg": "会话不存在",
            "data": None
        }), 404
    
    # 检查队列中的消息
    messages = []
    queue = session["queue"]
    while not queue.empty():
        msg = queue.get()
        print(f"DEBUG: Session {session_id} - Queue Msg: {msg}") # ADDED LOG
        messages.append(msg)
        
        # 解析消息状态
        if "success" in msg.lower() or "登录成功" in msg or msg == "200":
            print(f"DEBUG: Session {session_id} - Status set to SUCCESS") # ADDED LOG
            session["status"] = "success"
        elif "failed" in msg.lower() or "失败" in msg or msg == "500":
            print(f"DEBUG: Session {session_id} - Status set to FAILED") # ADDED LOG
            session["status"] = "failed"
        elif "qrcode" in msg.lower() or "二维码" in msg:
            session["status"] = "waiting_scan"
    
    # Manually check if the last message was "200" which means success from our updated login.py
    if messages and messages[-1] == "200":
        session["status"] = "success"

    return jsonify({
        "code": 200,
        "msg": "success",
        "data": {
            "session_id": session_id,
            "status": session["status"],
            "platform": session["platform"],
            "messages": messages
        }
    }), 200


@postiz_api.route('/login/cancel/<session_id>', methods=['POST'])
def cancel_login(session_id):
    """取消登录会话"""
    if session_id in login_sessions:
        del login_sessions[session_id]
        return jsonify({
            "code": 200,
            "msg": "会话已取消",
            "data": None
        }), 200
    
    return jsonify({
        "code": 404,
        "msg": "会话不存在",
        "data": None
    }), 404


@postiz_api.route('/douyin/publish', methods=['POST'])
def publish_douyin():
    """发布抖音视频"""
    data = request.get_json()
    
    # 必填参数
    account_id = data.get('account_id')
    video_url = data.get('video_url')  # 视频文件 URL 或路径
    title = data.get('title', '')
    
    # 可选参数
    tags = data.get('tags', [])
    scheduled_time = data.get('scheduled_time')  # ISO 格式时间
    thumbnail_url = data.get('thumbnail_url')
    product_link = data.get('product_link', '')
    product_title = data.get('product_title', '')
    
    if not account_id or not video_url:
        return jsonify({
            "code": 400,
            "msg": "缺少必填参数 account_id 或 video_url",
            "data": None
        }), 400
    
    try:
        # 获取账号信息
        with sqlite3.connect(Path(BASE_DIR / "db" / "database.db")) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM user_info WHERE id = ? AND type = 3', (account_id,))
            account = cursor.fetchone()
            
            if not account:
                return jsonify({
                    "code": 404,
                    "msg": "抖音账号不存在",
                    "data": None
                }), 404
        
        # 准备发布参数
        file_list = [video_url]
        account_list = [dict(account)]
        enable_timer = scheduled_time is not None
        
        # 异步发布
        thread = threading.Thread(
            target=lambda: post_video_DouYin(
                title=title,
                file_list=file_list,
                tags=tags,
                account_list=account_list,
                category=None,
                enableTimer=enable_timer,
                videos_per_day=1,
                daily_times=["10:00"],
                start_days=0,
                thumbnail_path=thumbnail_url,
                productLink=product_link,
                productTitle=product_title
            ),
            daemon=True
        )
        thread.start()
        
        return jsonify({
            "code": 200,
            "msg": "发布任务已提交",
            "data": {
                "account_id": account_id,
                "platform": "douyin",
                "status": "processing"
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            "code": 500,
            "msg": f"发布失败: {str(e)}",
            "data": None
        }), 500


@postiz_api.route('/xiaohongshu/publish', methods=['POST'])
def publish_xiaohongshu():
    """发布小红书内容"""
    import shutil
    data = request.get_json()
    
    # 必填参数
    account_id = data.get('account_id')
    video_url = data.get('video_url')  # 视频文件 URL 或路径
    title = data.get('title', '')
    
    # 可选参数
    tags = data.get('tags', [])
    scheduled_time = data.get('scheduled_time')  # ISO 格式时间
    
    if not account_id or not video_url:
        return jsonify({
            "code": 400,
            "msg": "缺少必填参数 account_id 或 video_url",
            "data": None
        }), 400
    
    try:
        # 获取账号信息
        with sqlite3.connect(Path(BASE_DIR / "db" / "database.db")) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM user_info WHERE id = ? AND type = 1', (account_id,))
            account = cursor.fetchone()
            
            if not account:
                return jsonify({
                    "code": 404,
                    "msg": "小红书账号不存在",
                    "data": None
                }), 404
            
            account_dict = dict(account)
        
        # 处理文件路径 - 如果是外部路径，复制到 videoFile 目录
        source_path = Path(video_url)
        if source_path.is_absolute() and source_path.exists():
            # 外部文件，需要复制到 videoFile 目录
            dest_filename = f"{uuid.uuid4().hex}_{source_path.name}"
            dest_path = Path(BASE_DIR / "videoFile" / dest_filename)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(source_path), str(dest_path))
            file_list = [dest_filename]  # 只传文件名
        else:
            # 已经是 videoFile 目录下的文件名
            file_list = [video_url]
        
        # account_file 需要是 filePath 字符串列表，不是账号字典
        account_file_list = [account_dict['filePath']]
        enable_timer = scheduled_time is not None
        
        print(f"[DEBUG] publish_xiaohongshu:")
        print(f"  - title: {title}")
        print(f"  - file_list: {file_list}")
        print(f"  - account_file_list: {account_file_list}")
        print(f"  - tags: {tags}")
        
        # 异步发布
        thread = threading.Thread(
            target=lambda: post_video_xhs(
                title=title,
                files=file_list,
                tags=tags,
                account_file=account_file_list,
                category=None,
                enableTimer=enable_timer,
                videos_per_day=1,
                daily_times=["10:00"],
                start_days=0
            ),
            daemon=True
        )
        thread.start()
        
        return jsonify({
            "code": 200,
            "msg": "发布任务已提交",
            "data": {
                "account_id": account_id,
                "platform": "xiaohongshu",
                "status": "processing"
            }
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "code": 500,
            "msg": f"发布失败: {str(e)}",
            "data": None
        }), 500


@postiz_api.route('/xiaohongshu/publish-image', methods=['POST'])
def publish_xiaohongshu_image():
    """发布小红书图文笔记"""
    import shutil
    data = request.get_json()
    
    # 必填参数
    account_id = data.get('account_id')
    image_urls = data.get('image_urls', [])  # 图片文件 URL 或路径列表
    title = data.get('title', '')
    
    # 可选参数
    tags = data.get('tags', [])
    description = data.get('description', '')  # 笔记正文
    scheduled_time = data.get('scheduled_time')  # ISO 格式时间
    
    # 兼容单张图片
    if not image_urls and data.get('image_url'):
        image_urls = [data.get('image_url')]
    
    if not account_id or not image_urls:
        return jsonify({
            "code": 400,
            "msg": "缺少必填参数 account_id 或 image_urls",
            "data": None
        }), 400
    
    try:
        # 获取账号信息
        with sqlite3.connect(Path(BASE_DIR / "db" / "database.db")) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM user_info WHERE id = ? AND type = 1', (account_id,))
            account = cursor.fetchone()
            
            if not account:
                return jsonify({
                    "code": 404,
                    "msg": "小红书账号不存在",
                    "data": None
                }), 404
            
            account_dict = dict(account)
        
        # 处理图片文件路径
        # 创建 imageFile 目录（如果不存在）
        image_dir = Path(BASE_DIR / "imageFile")
        image_dir.mkdir(parents=True, exist_ok=True)
        
        processed_images = []
        for img_url in image_urls:
            source_path = Path(img_url)
            if source_path.is_absolute() and source_path.exists():
                # 外部文件，复制到 imageFile 目录
                dest_filename = f"{uuid.uuid4().hex}_{source_path.name}"
                dest_path = image_dir / dest_filename
                shutil.copy2(str(source_path), str(dest_path))
                processed_images.append(dest_filename)
            else:
                # 已经是相对路径
                processed_images.append(img_url)
        
        # account_file 需要是 filePath 字符串列表
        account_file_list = [account_dict['filePath']]
        enable_timer = scheduled_time is not None
        
        print(f"[DEBUG] publish_xiaohongshu_image:")
        print(f"  - title: {title}")
        print(f"  - images: {processed_images}")
        print(f"  - description: {description}")
        print(f"  - account_file_list: {account_file_list}")
        print(f"  - tags: {tags}")
        
        # 异步发布
        thread = threading.Thread(
            target=lambda: post_image_xhs(
                title=title,
                images=processed_images,
                tags=tags,
                account_file=account_file_list,
                description=description,
                enableTimer=enable_timer,
                videos_per_day=1,
                daily_times=["10:00"],
                start_days=0
            ),
            daemon=True
        )
        thread.start()
        
        return jsonify({
            "code": 200,
            "msg": "图文笔记发布任务已提交",
            "data": {
                "account_id": account_id,
                "platform": "xiaohongshu",
                "type": "image",
                "image_count": len(processed_images),
                "status": "processing"
            }
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "code": 500,
            "msg": f"发布失败: {str(e)}",
            "data": None
        }), 500


@postiz_api.route('/media/upload', methods=['POST'])
def upload_media():
    """上传媒体文件（视频/图片）"""
    if 'file' not in request.files:
        return jsonify({
            "code": 400,
            "msg": "没有找到文件",
            "data": None
        }), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({
            "code": 400,
            "msg": "文件名不能空",
            "data": None
        }), 400
    
    try:
        # 生成唯一文件名
        file_uuid = str(uuid.uuid4())
        ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else ''
        new_filename = f"{file_uuid}.{ext}" if ext else file_uuid
        
        # 保存文件
        filepath = Path(BASE_DIR / "videoFile" / new_filename)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        file.save(str(filepath))
        
        # 获取文件信息
        file_size = os.path.getsize(filepath)
        
        return jsonify({
            "code": 200,
            "msg": "上传成功",
            "data": {
                "file_id": file_uuid,
                "filename": new_filename,
                "original_name": file.filename,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 2),
                "url": f"/api/v1/media/{new_filename}"
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            "code": 500,
            "msg": f"上传失败: {str(e)}",
            "data": None
        }), 500


@postiz_api.route('/media/<filename>', methods=['GET'])
def get_media(filename):
    """获取媒体文件"""
    from flask import send_from_directory
    
    # 防止路径穿越
    if '..' in filename or filename.startswith('/'):
        return jsonify({
            "code": 400,
            "msg": "非法文件名",
            "data": None
        }), 400
    
    file_path = Path(BASE_DIR / "videoFile")
    return send_from_directory(str(file_path), filename)


def run_login_async(session_id, platform_type, account_name, status_queue):
    """异步运行登录流程"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        if platform_type == 3:  # 抖音
            loop.run_until_complete(douyin_cookie_gen(account_name, status_queue))
        elif platform_type == 1:  # 小红书
            loop.run_until_complete(xiaohongshu_cookie_gen(account_name, status_queue))
    except Exception as e:
        status_queue.put(f"error: {str(e)}")
    finally:
        loop.close()
        
        # 清理会话（延迟清理，让客户端有时间获取最终状态）
        import time
        time.sleep(60)
        if session_id in login_sessions:
            del login_sessions[session_id]
