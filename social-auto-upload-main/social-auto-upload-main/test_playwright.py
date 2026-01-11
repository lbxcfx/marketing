
import asyncio
from playwright.async_api import async_playwright

async def main():
    print("Starting Playwright...")
    async with async_playwright() as p:
        print("Launching Chromium (Headless=False)...")
        try:
            browser = await p.chromium.launch(headless=False)
            print("Browser launched!")
            page = await browser.new_page()
            await page.goto("https://creator.xiaohongshu.com/")
            print("Page loaded. Waiting 10 seconds...")
            await asyncio.sleep(10)
            await browser.close()
            print("Browser closed.")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
