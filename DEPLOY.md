# 部署成在线工具

推荐用 Vercel，最简单，前端和后端代理可以放在同一个项目里。

## 1. 准备账号

注册 Vercel：

https://vercel.com

推荐用 GitHub 登录。

## 2. 上传项目

把这个项目上传到 GitHub。项目根目录就是包含 `package.json` 的这个文件夹。

## 3. 导入 Vercel

在 Vercel 点：

New Project -> Import Git Repository -> 选择这个项目

保持默认设置即可：

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

## 4. 添加 API Key

在 Vercel 项目里打开：

Settings -> Environment Variables

新增：

```text
TIMEAI_API_KEY=你的 timeai sk-... key
```

保存后重新 Deploy。

## 5. 发给朋友

部署成功后，Vercel 会给你一个网址，例如：

```text
https://novel-script-tool.vercel.app
```

朋友直接打开这个网址就能使用。

## 注意

- 不要把真实 API Key 写进前端代码。
- 真实 Key 只放在 Vercel 的 `TIMEAI_API_KEY` 环境变量里。
- 前端默认请求 `/api/timeai/v1`，由服务器代理到 `https://timeai.chat/v1`。
