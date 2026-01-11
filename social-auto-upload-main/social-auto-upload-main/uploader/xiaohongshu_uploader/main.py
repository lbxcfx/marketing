# -*- coding: utf-8 -*-
from datetime import datetime

from playwright.async_api import Playwright, async_playwright, Page
import os
import asyncio

from conf import LOCAL_CHROME_PATH, LOCAL_CHROME_HEADLESS
from utils.base_social_media import set_init_script
from utils.log import xiaohongshu_logger


async def cookie_auth(account_file):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=LOCAL_CHROME_HEADLESS)
        context = await browser.new_context(storage_state=account_file)
        context = await set_init_script(context)
        # 创建一个新的页面
        page = await context.new_page()
        # 访问指定的 URL
        await page.goto("https://creator.xiaohongshu.com/creator-micro/content/upload")
        try:
            await page.wait_for_url("https://creator.xiaohongshu.com/creator-micro/content/upload", timeout=5000)
        except:
            print("[+] 等待5秒 cookie 失效")
            await context.close()
            await browser.close()
            return False
        # 2024.06.17 抖音创作者中心改版
        if await page.get_by_text('手机号登录').count() or await page.get_by_text('扫码登录').count():
            print("[+] 等待5秒 cookie 失效")
            return False
        else:
            print("[+] cookie 有效")
            return True


async def xiaohongshu_setup(account_file, handle=False):
    if not os.path.exists(account_file) or not await cookie_auth(account_file):
        if not handle:
            # Todo alert message
            return False
        xiaohongshu_logger.info('[+] cookie文件不存在或已失效，即将自动打开浏览器，请扫码登录，登陆后会自动生成cookie文件')
        await xiaohongshu_cookie_gen(account_file)
    return True


async def xiaohongshu_cookie_gen(account_file):
    async with async_playwright() as playwright:
        options = {
            'headless': LOCAL_CHROME_HEADLESS
        }
        # Make sure to run headed.
        browser = await playwright.chromium.launch(**options)
        # Setup context however you like.
        context = await browser.new_context()  # Pass any options
        context = await set_init_script(context)
        # Pause the page, and start recording manually.
        page = await context.new_page()
        await page.goto("https://creator.xiaohongshu.com/")
        await page.pause()
        # 点击调试器的继续，保存cookie
        await context.storage_state(path=account_file)


class XiaoHongShuVideo(object):
    def __init__(self, title, file_path, tags, publish_date: datetime, account_file, thumbnail_path=None):
        self.title = title  # 视频标题
        self.file_path = file_path
        self.tags = tags
        self.publish_date = publish_date
        self.account_file = account_file
        self.date_format = '%Y年%m月%d日 %H:%M'
        self.local_executable_path = LOCAL_CHROME_PATH
        self.headless = LOCAL_CHROME_HEADLESS
        self.thumbnail_path = thumbnail_path

    async def set_schedule_time_xiaohongshu(self, page, publish_date):
        print("  [-] 正在设置定时发布时间...")
        print(f"publish_date: {publish_date}")

        # 使用文本内容定位元素
        # element = await page.wait_for_selector(
        #     'label:has-text("定时发布")',
        #     timeout=5000  # 5秒超时时间
        # )
        # await element.click()

        # # 选择包含特定文本内容的 label 元素
        label_element = page.locator("label:has-text('定时发布')")
        # # 在选中的 label 元素下点击 checkbox
        await label_element.click()
        await asyncio.sleep(1)
        publish_date_hour = publish_date.strftime("%Y-%m-%d %H:%M")
        print(f"publish_date_hour: {publish_date_hour}")

        await asyncio.sleep(1)
        await page.locator('.el-input__inner[placeholder="选择日期和时间"]').click()
        await page.keyboard.press("Control+KeyA")
        await page.keyboard.type(str(publish_date_hour))
        await page.keyboard.press("Enter")

        await asyncio.sleep(1)

    async def handle_upload_error(self, page):
        xiaohongshu_logger.info('视频出错了，重新上传中')
        await page.locator('div.progress-div [class^="upload-btn-input"]').set_input_files(self.file_path)

    async def upload(self, playwright: Playwright) -> None:
        # 使用 Chromium 浏览器启动一个浏览器实例
        if self.local_executable_path:
            browser = await playwright.chromium.launch(headless=self.headless, executable_path=self.local_executable_path)
        else:
            browser = await playwright.chromium.launch(headless=self.headless)
        # 创建一个浏览器上下文，使用指定的 cookie 文件
        context = await browser.new_context(
            viewport={"width": 1600, "height": 900},
            storage_state=f"{self.account_file}"
        )
        context = await set_init_script(context)

        # 创建一个新的页面
        page = await context.new_page()
        # 访问指定的 URL
        await page.goto("https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video")
        xiaohongshu_logger.info(f'[+]正在上传-------{self.title}.mp4')
        # 等待页面跳转到指定的 URL，没进入，则自动等待到超时
        xiaohongshu_logger.info(f'[-] 正在打开主页...')
        await page.wait_for_url("https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video")
        # 点击 "上传视频" 按钮
        await page.locator("div[class^='upload-content'] input[class='upload-input']").set_input_files(self.file_path)

        # 等待页面跳转到指定的 URL 2025.01.08修改在原有基础上兼容两种页面
        xiaohongshu_logger.info("  [-] 正在等待视频上传...")
        wait_count = 0
        max_wait_time = 300  # 最大等待5分钟
        last_progress_msg = ""
        
        while wait_count < max_wait_time:
            try:
                # 等待upload-input元素出现
                upload_input = await page.wait_for_selector('input.upload-input', timeout=3000)
                # 获取下一个兄弟元素
                preview_new = await upload_input.query_selector(
                    'xpath=following-sibling::div[contains(@class, "preview-new")]')
                if preview_new:
                    # 在preview-new元素中查找包含"上传成功"的stage元素
                    stage_elements = await preview_new.query_selector_all('div.stage')
                    upload_success = False
                    for stage in stage_elements:
                        text_content = await page.evaluate('(element) => element.textContent', stage)
                        if '上传成功' in text_content:
                            upload_success = True
                            break
                        # 尝试获取上传进度
                        if '%' in text_content and text_content != last_progress_msg:
                            last_progress_msg = text_content
                            xiaohongshu_logger.info(f"  [-] 上传进度: {text_content.strip()}")
                    if upload_success:
                        xiaohongshu_logger.info("[+] 检测到上传成功标识!")
                        break  # 成功检测到上传成功后跳出循环
                else:
                    # 每5秒输出一次等待状态，而不是每次都输出
                    if wait_count % 5 == 0:
                        xiaohongshu_logger.info(f"  [-] 等待视频处理中... ({wait_count}s)")
                    await asyncio.sleep(1)
                    wait_count += 1
            except Exception as e:
                wait_count += 1
                if wait_count % 10 == 0:
                    xiaohongshu_logger.warning(f"  [-] 等待中... ({wait_count}s)")
                await asyncio.sleep(0.5)  # 等待0.5秒后重新尝试
        
        if wait_count >= max_wait_time:
            xiaohongshu_logger.error("  [-] 上传超时，请检查网络连接")

        # 填充标题和话题
        # 检查是否存在包含输入框的元素
        # 这里为了避免页面变化，故使用相对位置定位：作品标题父级右侧第一个元素的input子元素
        await asyncio.sleep(2)  # 增加等待时间确保页面加载完成
        xiaohongshu_logger.info(f'  [-] 正在填充标题和话题...')
        
        # 尝试多种方式填充标题
        title_filled = False
        title_selectors = [
            'div.plugin.title-container input.d-text',
            'input[placeholder*="标题"]',
            'input[placeholder*="title"]',
            '.title-input input',
            'div.title-container input',
        ]
        
        for selector in title_selectors:
            try:
                title_element = page.locator(selector)
                if await title_element.count() > 0:
                    await title_element.first.fill(self.title[:30])
                    title_filled = True
                    xiaohongshu_logger.info(f'  [-] 标题填充成功 (使用选择器: {selector})')
                    break
            except Exception as e:
                continue
        
        # 如果上述方法都失败，尝试使用 .notranslate 元素
        if not title_filled:
            try:
                titlecontainer = page.locator(".notranslate")
                if await titlecontainer.count() > 0:
                    await titlecontainer.first.click()
                    await page.keyboard.press("Control+KeyA")
                    await page.keyboard.press("Delete")
                    await page.keyboard.type(self.title[:30])
                    await page.keyboard.press("Enter")
                    title_filled = True
                    xiaohongshu_logger.info(f'  [-] 标题填充成功 (使用 .notranslate)')
            except Exception as e:
                xiaohongshu_logger.warning(f'  [-] 标题填充失败: {str(e)}')
        
        # 填充话题标签
        await asyncio.sleep(1)
        tags_filled = False
        
        # 尝试多种话题输入选择器
        tag_selectors = [
            ".ql-editor",
            "[contenteditable='true']",
            "div.desc-input",
            "textarea[placeholder*='描述']",
            "div[data-placeholder*='描述']",
            ".editor-container [contenteditable]",
        ]
        
        for css_selector in tag_selectors:
            try:
                tag_element = page.locator(css_selector)
                if await tag_element.count() > 0:
                    await tag_element.first.click()
                    await asyncio.sleep(0.5)
                    for index, tag in enumerate(self.tags, start=1):
                        await page.keyboard.type("#" + tag)
                        await page.keyboard.press("Space")
                        await asyncio.sleep(0.3)
                    tags_filled = True
                    xiaohongshu_logger.info(f'总共添加{len(self.tags)}个话题 (使用选择器: {css_selector})')
                    break
            except Exception as e:
                continue
        
        if not tags_filled:
            xiaohongshu_logger.warning(f'  [-] 话题填充失败，将跳过话题')

        # while True:
        #     # 判断重新上传按钮是否存在，如果不存在，代表视频正在上传，则等待
        #     try:
        #         #  新版：定位重新上传
        #         number = await page.locator('[class^="long-card"] div:has-text("重新上传")').count()
        #         if number > 0:
        #             xiaohongshu_logger.success("  [-]视频上传完毕")
        #             break
        #         else:
        #             xiaohongshu_logger.info("  [-] 正在上传视频中...")
        #             await asyncio.sleep(2)

        #             if await page.locator('div.progress-div > div:has-text("上传失败")').count():
        #                 xiaohongshu_logger.error("  [-] 发现上传出错了... 准备重试")
        #                 await self.handle_upload_error(page)
        #     except:
        #         xiaohongshu_logger.info("  [-] 正在上传视频中...")
        #         await asyncio.sleep(2)
        
        # 上传视频封面
        # await self.set_thumbnail(page, self.thumbnail_path)

        # 更换可见元素
        # await self.set_location(page, "青岛市")

        # # 頭條/西瓜
        # third_part_element = '[class^="info"] > [class^="first-part"] div div.semi-switch'
        # # 定位是否有第三方平台
        # if await page.locator(third_part_element).count():
        #     # 检测是否是已选中状态
        #     if 'semi-switch-checked' not in await page.eval_on_selector(third_part_element, 'div => div.className'):
        #         await page.locator(third_part_element).locator('input.semi-switch-native-control').click()

        if self.publish_date != 0:
            await self.set_schedule_time_xiaohongshu(page, self.publish_date)

        # 判断视频是否发布成功
        while True:
            try:
                # 等待包含"定时发布"文本的button元素出现并点击
                if self.publish_date != 0:
                    await page.locator('button:has-text("定时发布")').click()
                else:
                    await page.locator('button:has-text("发布")').click()
                await page.wait_for_url(
                    "https://creator.xiaohongshu.com/publish/success?**",
                    timeout=3000
                )  # 如果自动跳转到作品页面，则代表发布成功
                xiaohongshu_logger.success("  [-]视频发布成功")
                break
            except:
                xiaohongshu_logger.info("  [-] 视频正在发布中...")
                await page.screenshot(full_page=True)
                await asyncio.sleep(0.5)

        await context.storage_state(path=self.account_file)  # 保存cookie
        xiaohongshu_logger.success('  [-]cookie更新完毕！')
        await asyncio.sleep(2)  # 这里延迟是为了方便眼睛直观的观看
        # 关闭浏览器上下文和浏览器实例
        await context.close()
        await browser.close()
    
    async def set_thumbnail(self, page: Page, thumbnail_path: str):
        if thumbnail_path:
            await page.click('text="选择封面"')
            await page.wait_for_selector("div.semi-modal-content:visible")
            await page.click('text="设置竖封面"')
            await page.wait_for_timeout(2000)  # 等待2秒
            # 定位到上传区域并点击
            await page.locator("div[class^='semi-upload upload'] >> input.semi-upload-hidden-input").set_input_files(thumbnail_path)
            await page.wait_for_timeout(2000)  # 等待2秒
            await page.locator("div[class^='extractFooter'] button:visible:has-text('完成')").click()
            # finish_confirm_element = page.locator("div[class^='confirmBtn'] >> div:has-text('完成')")
            # if await finish_confirm_element.count():
            #     await finish_confirm_element.click()
            # await page.locator("div[class^='footer'] button:has-text('完成')").click()

    async def set_location(self, page: Page, location: str = "青岛市"):
        print(f"开始设置位置: {location}")
        
        # 点击地点输入框
        print("等待地点输入框加载...")
        loc_ele = await page.wait_for_selector('div.d-text.d-select-placeholder.d-text-ellipsis.d-text-nowrap')
        print(f"已定位到地点输入框: {loc_ele}")
        await loc_ele.click()
        print("点击地点输入框完成")
        
        # 输入位置名称
        print(f"等待1秒后输入位置名称: {location}")
        await page.wait_for_timeout(1000)
        await page.keyboard.type(location)
        print(f"位置名称输入完成: {location}")
        
        # 等待下拉列表加载
        print("等待下拉列表加载...")
        dropdown_selector = 'div.d-popover.d-popover-default.d-dropdown.--size-min-width-large'
        await page.wait_for_timeout(3000)
        try:
            await page.wait_for_selector(dropdown_selector, timeout=3000)
            print("下拉列表已加载")
        except:
            print("下拉列表未按预期显示，可能结构已变化")
        
        # 增加等待时间以确保内容加载完成
        print("额外等待1秒确保内容渲染完成...")
        await page.wait_for_timeout(1000)
        
        # 尝试更灵活的XPath选择器
        print("尝试使用更灵活的XPath选择器...")
        flexible_xpath = (
            f'//div[contains(@class, "d-popover") and contains(@class, "d-dropdown")]'
            f'//div[contains(@class, "d-options-wrapper")]'
            f'//div[contains(@class, "d-grid") and contains(@class, "d-options")]'
            f'//div[contains(@class, "name") and text()="{location}"]'
        )
        await page.wait_for_timeout(3000)
        
        # 尝试定位元素
        print(f"尝试定位包含'{location}'的选项...")
        try:
            # 先尝试使用更灵活的选择器
            location_option = await page.wait_for_selector(
                flexible_xpath,
                timeout=3000
            )
            
            if location_option:
                print(f"使用灵活选择器定位成功: {location_option}")
            else:
                # 如果灵活选择器失败，再尝试原选择器
                print("灵活选择器未找到元素，尝试原始选择器...")
                location_option = await page.wait_for_selector(
                    f'//div[contains(@class, "d-popover") and contains(@class, "d-dropdown")]'
                    f'//div[contains(@class, "d-options-wrapper")]'
                    f'//div[contains(@class, "d-grid") and contains(@class, "d-options")]'
                    f'/div[1]//div[contains(@class, "name") and text()="{location}"]',
                    timeout=2000
                )
            
            # 滚动到元素并点击
            print("滚动到目标选项...")
            await location_option.scroll_into_view_if_needed()
            print("元素已滚动到视图内")
            
            # 增加元素可见性检查
            is_visible = await location_option.is_visible()
            print(f"目标选项是否可见: {is_visible}")
            
            # 点击元素
            print("准备点击目标选项...")
            await location_option.click()
            print(f"成功选择位置: {location}")
            return True
            
        except Exception as e:
            print(f"定位位置失败: {e}")
            
            # 打印更多调试信息
            print("尝试获取下拉列表中的所有选项...")
            try:
                all_options = await page.query_selector_all(
                    '//div[contains(@class, "d-popover") and contains(@class, "d-dropdown")]'
                    '//div[contains(@class, "d-options-wrapper")]'
                    '//div[contains(@class, "d-grid") and contains(@class, "d-options")]'
                    '/div'
                )
                print(f"找到 {len(all_options)} 个选项")
                
                # 打印前3个选项的文本内容
                for i, option in enumerate(all_options[:3]):
                    option_text = await option.inner_text()
                    print(f"选项 {i+1}: {option_text.strip()[:50]}...")
                    
            except Exception as e:
                print(f"获取选项列表失败: {e}")
                
            # 截图保存（取消注释使用）
            # await page.screenshot(path=f"location_error_{location}.png")
            return False

    async def main(self):
        async with async_playwright() as playwright:
            await self.upload(playwright)


class XiaoHongShuImage(object):
    """小红书图文笔记发布类"""
    
    def __init__(self, title, image_paths, tags, publish_date, account_file, description=""):
        """
        初始化图文发布
        
        Args:
            title: 笔记标题（最大20字）
            image_paths: 图片路径列表（支持多张图片）
            tags: 话题标签列表
            publish_date: 发布时间（0表示立即发布，datetime表示定时发布）
            account_file: cookie文件路径
            description: 笔记正文描述
        """
        self.title = title
        self.image_paths = image_paths if isinstance(image_paths, list) else [image_paths]
        self.tags = tags
        self.publish_date = publish_date
        self.account_file = account_file
        self.description = description
        self.date_format = '%Y年%m月%d日 %H:%M'
        self.local_executable_path = LOCAL_CHROME_PATH
        self.headless = LOCAL_CHROME_HEADLESS

    async def set_schedule_time(self, page, publish_date):
        """设置定时发布时间"""
        xiaohongshu_logger.info("  [-] 正在设置定时发布时间...")
        
        # 点击定时发布选项
        label_element = page.locator("label:has-text('定时发布')")
        await label_element.click()
        await asyncio.sleep(1)
        
        publish_date_hour = publish_date.strftime("%Y-%m-%d %H:%M")
        xiaohongshu_logger.info(f"  [-] 定时发布时间: {publish_date_hour}")
        
        await page.locator('.el-input__inner[placeholder="选择日期和时间"]').click()
        await page.keyboard.press("Control+KeyA")
        await page.keyboard.type(str(publish_date_hour))
        await page.keyboard.press("Enter")
        await asyncio.sleep(1)

    async def upload(self, playwright: Playwright) -> None:
        """执行图文上传"""
        # 启动浏览器
        if self.local_executable_path:
            browser = await playwright.chromium.launch(
                headless=self.headless, 
                executable_path=self.local_executable_path
            )
        else:
            browser = await playwright.chromium.launch(headless=self.headless)
        
        # 创建浏览器上下文
        context = await browser.new_context(
            viewport={"width": 1600, "height": 900},
            storage_state=f"{self.account_file}"
        )
        context = await set_init_script(context)
        
        # 创建页面
        page = await context.new_page()
        
        # 访问图文发布页面（注意：target=image 而不是 target=video）
        await page.goto("https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image")
        xiaohongshu_logger.info(f'[+] 正在上传图文笔记-------{self.title}')
        xiaohongshu_logger.info(f'[-] 正在打开图文发布页面...')
        
        await page.wait_for_url("https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image")
        await asyncio.sleep(2)
        
        # 上传图片
        xiaohongshu_logger.info(f'  [-] 正在上传 {len(self.image_paths)} 张图片...')
        
        # 查找图片上传输入框
        upload_selectors = [
            "div[class^='upload-content'] input[class='upload-input']",
            "input[type='file'][accept*='image']",
            "input.upload-input",
        ]
        
        upload_input = None
        for selector in upload_selectors:
            try:
                element = page.locator(selector)
                if await element.count() > 0:
                    upload_input = element.first
                    break
            except:
                continue
        
        if upload_input:
            # 上传所有图片
            file_paths = [str(p) for p in self.image_paths]
            await upload_input.set_input_files(file_paths)
            xiaohongshu_logger.info(f'  [-] 图片已选择，等待上传完成...')
        else:
            xiaohongshu_logger.error("  [-] 未找到图片上传输入框")
            await context.close()
            await browser.close()
            return
        
        # 等待图片上传完成
        await asyncio.sleep(3)
        wait_count = 0
        max_wait = 120  # 最大等待2分钟
        
        while wait_count < max_wait:
            try:
                # 检查是否有上传进度或成功标识
                # 图片上传通常会显示缩略图
                thumbnails = page.locator("div.image-item, div.upload-item, div[class*='preview']")
                if await thumbnails.count() >= len(self.image_paths):
                    xiaohongshu_logger.info(f'  [-] 图片上传完成！')
                    break
                
                if wait_count % 5 == 0:
                    xiaohongshu_logger.info(f'  [-] 等待图片上传... ({wait_count}s)')
                
                await asyncio.sleep(1)
                wait_count += 1
            except:
                wait_count += 1
                await asyncio.sleep(1)
        
        # 填充标题
        await asyncio.sleep(2)
        xiaohongshu_logger.info(f'  [-] 正在填充标题和内容...')
        
        title_filled = False
        title_selectors = [
            'div.plugin.title-container input.d-text',
            'input[placeholder*="标题"]',
            'input[placeholder*="title"]',
            '.title-input input',
            'div.title-container input',
        ]
        
        for selector in title_selectors:
            try:
                title_element = page.locator(selector)
                if await title_element.count() > 0:
                    await title_element.first.fill(self.title[:20])
                    title_filled = True
                    xiaohongshu_logger.info(f'  [-] 标题填充成功')
                    break
            except:
                continue
        
        if not title_filled:
            try:
                titlecontainer = page.locator(".notranslate")
                if await titlecontainer.count() > 0:
                    await titlecontainer.first.click()
                    await page.keyboard.press("Control+KeyA")
                    await page.keyboard.press("Delete")
                    await page.keyboard.type(self.title[:20])
                    await page.keyboard.press("Enter")
                    title_filled = True
                    xiaohongshu_logger.info(f'  [-] 标题填充成功 (使用 .notranslate)')
            except Exception as e:
                xiaohongshu_logger.warning(f'  [-] 标题填充失败: {str(e)}')
        
        # 填充正文描述和话题
        await asyncio.sleep(1)
        
        content_selectors = [
            ".ql-editor",
            "[contenteditable='true']",
            "div.desc-input",
            "textarea[placeholder*='描述']",
            "div[data-placeholder*='描述']",
        ]
        
        content_filled = False
        for css_selector in content_selectors:
            try:
                content_element = page.locator(css_selector)
                if await content_element.count() > 0:
                    await content_element.first.click()
                    await asyncio.sleep(0.5)
                    
                    # 填充描述
                    if self.description:
                        await page.keyboard.type(self.description)
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(0.3)
                    
                    # 填充话题标签
                    for tag in self.tags:
                        await page.keyboard.type("#" + tag)
                        await page.keyboard.press("Space")
                        await asyncio.sleep(0.3)
                    
                    content_filled = True
                    xiaohongshu_logger.info(f'  [-] 正文和话题填充成功，添加了 {len(self.tags)} 个话题')
                    break
            except:
                continue
        
        if not content_filled:
            xiaohongshu_logger.warning(f'  [-] 正文填充失败，将跳过')
        
        # 设置定时发布（如果需要）
        if self.publish_date != 0:
            await self.set_schedule_time(page, self.publish_date)
        
        # 点击发布按钮
        xiaohongshu_logger.info(f'  [-] 正在发布...')
        
        while True:
            try:
                if self.publish_date != 0:
                    publish_button = page.locator('button:has-text("定时发布")')
                else:
                    publish_button = page.locator('button:has-text("发布")')
                
                await publish_button.click()
                
                # 等待跳转到成功页面
                await page.wait_for_url(
                    "https://creator.xiaohongshu.com/publish/success?**",
                    timeout=10000
                )
                xiaohongshu_logger.success("  [-] 图文笔记发布成功！")
                break
            except:
                xiaohongshu_logger.info("  [-] 正在等待发布...")
                await page.screenshot(full_page=True)
                await asyncio.sleep(1)
        
        # 保存更新后的 cookie
        await context.storage_state(path=self.account_file)
        xiaohongshu_logger.success('  [-] cookie更新完毕！')
        
        await asyncio.sleep(2)
        await context.close()
        await browser.close()

    async def main(self):
        async with async_playwright() as playwright:
            await self.upload(playwright)
