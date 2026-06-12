# 小兔助手网页端部署说明

这是给网页端部署用的项目包，推荐部署到 Vercel。

## 方式一：上传到 GitHub 后导入 Vercel

1. 解压本压缩包。
2. 把解压后的项目文件上传到一个新的 GitHub 仓库。
3. 打开 https://vercel.com
4. 点击 New Project。
5. 选择刚上传的 GitHub 仓库。
6. 保持默认设置：
   - Framework Preset: Vite
   - Build Command: npm run build
   - Output Directory: dist
7. 在 Vercel 项目里打开 Settings -> Environment Variables。
8. 新增环境变量：

```text
TIMEAI_API_KEY=你的真实 API Key
```

9. 保存后点击 Redeploy。
10. 部署成功后，Vercel 会生成一个网址，把这个网址发给朋友即可。

## 方式二：本地预览

```bash
npm install
npm run dev
```

然后打开终端显示的本地网址。

## 重要说明

- 不要把真实 API Key 写进前端源码。
- 真实 API Key 只放在 Vercel 的 `TIMEAI_API_KEY` 环境变量里。
- 前端默认请求 `/api/timeai/v1`，由服务端代理转发到 `https://timeai.chat/v1`。
- 朋友使用网页时不需要自己填写你的 API Key。
