---
description: 抖音/小红书集成开发流程
---

# 抖音/小红书平台集成开发计划

## 第一阶段：微服务部署 ✅ 已完成

### 1.1 部署 social-auto-upload 服务

```bash
cd f:\postiz-app\social-auto-upload-main\social-auto-upload-main

# 安装依赖
pip install -r requirements.txt

# 安装 Playwright 浏览器
playwright install chromium

# 初始化数据库 (如果不存在)
cd db && python createTable.py && cd ..

# 创建必要的文件夹
mkdir cookiesFile videoFile

# 启动服务
python sau_backend.py
```

服务将运行在 `http://localhost:5409`

### 1.2 API 接口说明

新增的 Postiz 集成 API (prefix: `/api/v1`):

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/health` | GET | 健康检查 |
| `/api/v1/platforms` | GET | 获取支持的平台列表 |
| `/api/v1/accounts` | GET | 获取账号列表 |
| `/api/v1/accounts/<id>/validate` | POST | 验证账号 Cookie |
| `/api/v1/login/init` | POST | 初始化登录会话 |
| `/api/v1/login/status/<session_id>` | GET | 获取登录状态 |
| `/api/v1/login/cancel/<session_id>` | POST | 取消登录 |
| `/api/v1/douyin/publish` | POST | 发布抖音视频 |
| `/api/v1/xiaohongshu/publish` | POST | 发布小红书内容 |
| `/api/v1/media/upload` | POST | 上传媒体文件 |
| `/api/v1/media/<filename>` | GET | 获取媒体文件 |

---

## 第二阶段：Postiz Provider 开发 ✅ 已完成

### 2.1 DouyinProvider (后端)

文件位置: `libraries/nestjs-libraries/src/integrations/social/douyin.provider.ts`

功能：
- ✅ 扫码登录认证 (`generateAuthUrl`, `authenticate`)
- ✅ Token 刷新 (`refreshToken`)
- ✅ 视频发布 (`post`)

### 2.2 XiaohongshuProvider (后端)

文件位置: `libraries/nestjs-libraries/src/integrations/social/xiaohongshu.provider.ts`

功能：
- ✅ 扫码登录认证
- ✅ Token 刷新
- ✅ 视频/图片发布

### 2.3 DTO 定义

- `libraries/nestjs-libraries/src/dtos/posts/providers-settings/douyin.dto.ts`
- `libraries/nestjs-libraries/src/dtos/posts/providers-settings/xiaohongshu.dto.ts`

### 2.4 IntegrationManager 注册

文件位置: `libraries/nestjs-libraries/src/integrations/integration.manager.ts`

---

## 第三阶段：用户界面 ✅ 已完成

### 3.1 平台图标 ✅

已添加到 `apps/frontend/public/icons/platforms/`:
- ✅ `douyin.png` - 抖音图标
- ✅ `xiaohongshu.png` - 小红书图标

### 3.2 前端 Provider 组件 ✅

已创建:
- ✅ `apps/frontend/src/components/new-launch/providers/douyin/douyin.provider.tsx`
- ✅ `apps/frontend/src/components/new-launch/providers/xiaohongshu/xiaohongshu.provider.tsx`

### 3.3 Provider 注册 ✅

文件位置: `apps/frontend/src/components/new-launch/providers/show.all.providers.tsx`

### 3.4 中文翻译 ✅

文件位置: `libraries/react-shared-libraries/src/translation/locales/zh/translation.json`

新增翻译 key:
- `douyin_title`, `douyin_tags`, `douyin_product_settings` 等
- `xhs_title`, `xhs_tags`, `xhs_notice` 等

---

## 环境变量配置

在 `.env` 文件中添加：

```env
# China Social Platforms (Douyin/Xiaohongshu) Integration Service
CHINA_SOCIAL_SERVICE_URL="http://localhost:5409"
```

---

## 开发进度

- [x] 第一阶段：微服务部署
  - [x] 创建 Postiz API 封装层 (`postiz_api.py`)
  - [x] 注册 Blueprint 到 Flask 应用
  - [x] 添加健康检查端点
  
- [x] 第二阶段：Provider 开发
  - [x] DouyinProvider
  - [x] XiaohongshuProvider
  - [x] 注册到 IntegrationManager
  - [x] 添加环境变量配置
  - [x] DTO 定义
  
- [x] 第三阶段：用户界面
  - [x] 平台图标
  - [x] 前端 Provider 组件
  - [x] 注册到 show.all.providers
  - [x] 中文翻译

---

## 创建的完整文件列表

```
f:\postiz-app\
├── .env.example                                      # 添加了 CHINA_SOCIAL_SERVICE_URL
├── .agent\workflows\
│   └── china-social-integration.md                   # 本文档
├── apps\frontend\
│   ├── public\icons\platforms\
│   │   ├── douyin.png                               # 抖音图标 (新建)
│   │   └── xiaohongshu.png                          # 小红书图标 (新建)
│   └── src\components\new-launch\providers\
│       ├── show.all.providers.tsx                   # 注册了新 Provider
│       ├── douyin\
│       │   └── douyin.provider.tsx                  # 抖音前端组件 (新建)
│       └── xiaohongshu\
│           └── xiaohongshu.provider.tsx             # 小红书前端组件 (新建)
├── libraries\
│   ├── nestjs-libraries\src\
│   │   ├── dtos\posts\providers-settings\
│   │   │   ├── douyin.dto.ts                        # 抖音 DTO (新建)
│   │   │   └── xiaohongshu.dto.ts                   # 小红书 DTO (新建)
│   │   └── integrations\
│   │       ├── integration.manager.ts               # 注册了新 Provider
│   │       └── social\
│   │           ├── douyin.provider.ts               # 抖音后端 Provider (新建)
│   │           └── xiaohongshu.provider.ts          # 小红书后端 Provider (新建)
│   └── react-shared-libraries\src\translation\locales\zh\
│       └── translation.json                          # 添加了中文翻译
└── social-auto-upload-main\social-auto-upload-main\
    ├── postiz_api.py                                 # API 封装层 (新建)
    └── sau_backend.py                                # 注册了 Blueprint

```

---

## 启动和测试步骤

### 1. 启动 social-auto-upload 服务

```bash
cd f:\postiz-app\social-auto-upload-main\social-auto-upload-main
python sau_backend.py
```

### 2. 测试 API 健康检查

```bash
curl http://localhost:5409/api/v1/health
```

预期响应：
```json
{
  "status": "healthy",
  "service": "social-auto-upload",
  "version": "1.0.0"
}
```

### 3. 安装 Postiz 依赖并启动

```bash
cd f:\postiz-app
pnpm install
pnpm dev
```

### 4. 在 Postiz 中测试

1. 访问 `http://localhost:4200`
2. 进入集成设置 (Settings > Integrations)
3. 查看是否显示抖音和小红书选项
4. 点击添加账号，扫码登录
5. 创建帖子并选择抖音/小红书发布

---

## 注意事项

1. **Cookie 过期**: 抖音/小红书的 Cookie 通常 7 天过期，需要定期重新扫码登录
2. **页面变化**: 平台 UI 更新可能导致自动化脚本失效
3. **网络要求**: social-auto-upload 服务需要能够访问抖音/小红书网站
4. **浏览器环境**: Playwright 需要图形环境或 headless 模式支持
5. **并发限制**: 建议同一时间只发布一个视频，避免账号风控
