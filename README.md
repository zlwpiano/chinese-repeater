# 中文复读

一个中文复读 PWA。输入中文后，可以设置重复次数、间隔、语速、音调、自然停顿，并调用系统语音反复朗读。常用短句支持保存、载入、删除，以及归档到“已背出”复习区。

还支持本地上传 EPUB：应用只打开当前章节，把章节拆成段落。你可以一段一段加入“背诵仓库”，标记待背/已背出，并查看背诵百分比。EPUB 文件不会上传到云端。

## 本地试用

在本目录运行：

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173
```

## 装到 iPhone

1. 把本目录部署到一个 HTTPS 静态网站，例如 GitHub Pages、Netlify、Vercel、Cloudflare Pages。
2. 用 iPhone Safari 打开部署后的网址。
3. 点 Safari 分享按钮。
4. 选择“添加到主屏幕”。

添加后会像普通 App 一样从主屏幕打开。朗读功能使用 iPhone 系统自带中文语音，第一次播放需要用户点一下“播放”，这是 iOS 的系统限制。

## 让声音更自然

这个 App 默认使用浏览器能调用到的系统语音。iPhone 上可以到“设置 > 辅助功能 > 朗读内容 > 声音 > 中文”下载更高质量的普通话声音，然后回到 App 里点“试听声音”选择效果更好的声音。

如果要接近真人播音，需要接入云端 TTS，例如 OpenAI、Azure、火山引擎或腾讯云语音。那会比系统语音自然很多，但需要 API Key 和一个后端代理，不能把 Key 直接放在网页里。

## 文件

- `index.html`：应用页面
- `styles.css`：界面样式
- `app.js`：复读和本地保存逻辑
- `jszip.min.js`：本机解析 EPUB 文件
- `manifest.webmanifest`：PWA 安装信息
- `sw.js`：离线缓存
- `icon.svg` / `apple-touch-icon.png` / `icon-512.png`：应用图标
