import asyncio
from pathlib import Path

from conf import BASE_DIR
from uploader.douyin_uploader.main import DouYinVideo
from uploader.ks_uploader.main import KSVideo
from uploader.tencent_uploader.main import TencentVideo
from uploader.xiaohongshu_uploader.main import XiaoHongShuVideo, XiaoHongShuImage
from utils.constant import TencentZoneTypes
from utils.files_times import generate_schedule_time_next_day


def post_video_tencent(title,files,tags,account_file,category=TencentZoneTypes.LIFESTYLE.value,enableTimer=False,videos_per_day = 1, daily_times=None,start_days = 0, is_draft=False):
    # 生成文件的完整路径
    account_file = [Path(BASE_DIR / "cookiesFile" / file) for file in account_file]
    files = [Path(BASE_DIR / "videoFile" / file) for file in files]
    if enableTimer:
        publish_datetimes = generate_schedule_time_next_day(len(files), videos_per_day, daily_times,start_days)
    else:
        publish_datetimes = [0 for i in range(len(files))]
    for index, file in enumerate(files):
        for cookie in account_file:
            print(f"文件路径{str(file)}")
            # 打印视频文件名、标题和 hashtag
            print(f"视频文件名：{file}")
            print(f"标题：{title}")
            print(f"Hashtag：{tags}")
            app = TencentVideo(title, str(file), tags, publish_datetimes[index], cookie, category, is_draft)
            asyncio.run(app.main(), debug=False)


def post_video_DouYin(title,files,tags,account_file,category=TencentZoneTypes.LIFESTYLE.value,enableTimer=False,videos_per_day = 1, daily_times=None,start_days = 0,
                      thumbnail_path = '',
                      productLink = '', productTitle = ''):
    # 生成文件的完整路径
    account_file = [Path(BASE_DIR / "cookiesFile" / file) for file in account_file]
    files = [Path(BASE_DIR / "videoFile" / file) for file in files]
    if enableTimer:
        publish_datetimes = generate_schedule_time_next_day(len(files), videos_per_day, daily_times,start_days)
    else:
        publish_datetimes = [0 for i in range(len(files))]
    for index, file in enumerate(files):
        for cookie in account_file:
            print(f"文件路径{str(file)}")
            # 打印视频文件名、标题和 hashtag
            print(f"视频文件名：{file}")
            print(f"标题：{title}")
            print(f"Hashtag：{tags}")
            app = DouYinVideo(title, str(file), tags, publish_datetimes[index], cookie, thumbnail_path, productLink, productTitle)
            asyncio.run(app.main(), debug=False)


def post_video_ks(title,files,tags,account_file,category=TencentZoneTypes.LIFESTYLE.value,enableTimer=False,videos_per_day = 1, daily_times=None,start_days = 0):
    # 生成文件的完整路径
    account_file = [Path(BASE_DIR / "cookiesFile" / file) for file in account_file]
    files = [Path(BASE_DIR / "videoFile" / file) for file in files]
    if enableTimer:
        publish_datetimes = generate_schedule_time_next_day(len(files), videos_per_day, daily_times,start_days)
    else:
        publish_datetimes = [0 for i in range(len(files))]
    for index, file in enumerate(files):
        for cookie in account_file:
            print(f"文件路径{str(file)}")
            # 打印视频文件名、标题和 hashtag
            print(f"视频文件名：{file}")
            print(f"标题：{title}")
            print(f"Hashtag：{tags}")
            app = KSVideo(title, str(file), tags, publish_datetimes[index], cookie)
            asyncio.run(app.main(), debug=False)

def post_video_xhs(title,files,tags,account_file,category=TencentZoneTypes.LIFESTYLE.value,enableTimer=False,videos_per_day = 1, daily_times=None,start_days = 0):
    # 生成文件的完整路径
    account_file = [Path(BASE_DIR / "cookiesFile" / file) for file in account_file]
    files = [Path(BASE_DIR / "videoFile" / file) for file in files]
    file_num = len(files)
    if enableTimer:
        publish_datetimes = generate_schedule_time_next_day(file_num, videos_per_day, daily_times,start_days)
    else:
        publish_datetimes = 0
    for index, file in enumerate(files):
        for cookie in account_file:
            # 打印视频文件名、标题和 hashtag
            print(f"视频文件名：{file}")
            print(f"标题：{title}")
            print(f"Hashtag：{tags}")
            app = XiaoHongShuVideo(title, file, tags, publish_datetimes, cookie)
            asyncio.run(app.main(), debug=False)


def post_image_xhs(title, images, tags, account_file, description="", enableTimer=False, videos_per_day=1, daily_times=None, start_days=0):
    """
    发布小红书图文笔记
    
    Args:
        title: 笔记标题（最大20字）
        images: 图片文件名列表（相对于 imageFile 目录）
        tags: 话题标签列表
        account_file: cookie 文件名列表
        description: 笔记正文描述
        enableTimer: 是否定时发布
        videos_per_day: 每天发布数量
        daily_times: 每天发布时间列表
        start_days: 开始天数偏移
    """
    # 生成文件的完整路径
    account_file = [Path(BASE_DIR / "cookiesFile" / file) for file in account_file]
    # 图片支持从 imageFile 或 videoFile 目录读取
    image_paths = []
    for img in images:
        # 检查是否是绝对路径
        img_path = Path(img)
        if img_path.is_absolute() and img_path.exists():
            image_paths.append(img_path)
        else:
            # 尝试从 imageFile 目录读取
            img_in_image_dir = Path(BASE_DIR / "imageFile" / img)
            img_in_video_dir = Path(BASE_DIR / "videoFile" / img)
            if img_in_image_dir.exists():
                image_paths.append(img_in_image_dir)
            elif img_in_video_dir.exists():
                image_paths.append(img_in_video_dir)
            else:
                print(f"警告：图片文件不存在: {img}")
    
    if not image_paths:
        print("错误：没有找到有效的图片文件")
        return
    
    if enableTimer:
        publish_datetimes = generate_schedule_time_next_day(1, videos_per_day, daily_times, start_days)
        publish_datetime = publish_datetimes[0] if publish_datetimes else 0
    else:
        publish_datetime = 0
    
    for cookie in account_file:
        print(f"图片文件：{image_paths}")
        print(f"标题：{title}")
        print(f"描述：{description}")
        print(f"Hashtag：{tags}")
        app = XiaoHongShuImage(title, image_paths, tags, publish_datetime, cookie, description)
        asyncio.run(app.main(), debug=False)


# post_video("333",["demo.mp4"],"d","d")
# post_video_DouYin("333",["demo.mp4"],"d","d")