# 云服务器上线方案

> 适用版本：当前 Vue 3 + Vite + Koa2 项目
> 推荐环境：Ubuntu 24.04 LTS、Node.js 24 LTS、Nginx、systemd
> 目标：让两个人可以通过域名安全访问，数据与照片在服务器重启、部署更新后仍然保留。
>
> 项目已改为必须通过 `LOVE_PASSCODE` 环境变量提供登录暗号；`.env`、`server/data.json` 和用户照片都不会进入 Git 仓库。

## 一、推荐架构

```text
浏览器
  │  HTTPS / 443
  ▼
Nginx
  │  反向代理到 127.0.0.1:5500
  ▼
Koa2
  ├─ /api/*       登录、板块、照片墙 API
  ├─ /uploads/*   鉴权后读取照片
  └─ 其他路径     Koa 直接提供 dist/ 中的 Vue 构建
        │
        ▼
server/data.json + server/uploads/
```

不建议把 5500 直接暴露到公网。Node 只监听 `127.0.0.1`，外部只开放 22、80、443。

理由：

- 当前项目规模很小，单台轻量云服务器足够。
- 不需要数据库、Docker 或 Kubernetes。
- JSON 和照片文件适合放在持久化磁盘上，定期备份即可。
- 如果以后需要更稳定，再把 JSON 换成 SQLite/PostgreSQL，把照片移到对象存储。

## 二、上线前需要先决定的事

### 1. 云服务器地区

- **中国大陆服务器**：如果使用 80/443 对外提供域名访问，通常需要完成域名 ICP 备案。
- **香港或海外服务器**：一般不需要 ICP，但在中国大陆访问速度可能稍慢。
- **没有备案域名**：可以暂时用 `IP:端口` 访问，但不适合长期对外分享。

### 2. 域名

建议准备一个独立子域名，例如：

```text
story.example.com
```

在云厂商 DNS 控制台添加 A 记录指向服务器公网 IP；如果使用 CDN，则按 CDN 接入方式配置。

### 3. 访问暗号

仓库不会提交真实登录暗号。部署时必须通过服务器环境变量配置新的强暗号。

上线前应该改成一段只有你们两个人知道的长暗号，例如：

```text
OurStory_2026_forever
```

当前登录输入框支持文本，最多 24 个字符。建议同时更新登录提示，不要把真实暗号写在 README、HANDOFF 或公开代码仓库中。

## 三、上线前必须完成的代码/安全调整

以下项目建议在本轮部署前完成，而不是直接暴露当前版本。

| 优先级 | 调整 | 原因 |
| --- | --- | --- |
| P0 | 通过 `LOVE_PASSCODE` 环境变量注入强暗号 | 仓库是公开的，不能提交真实暗号 |
| P0 | 生产环境 Cookie 增加 `Secure` | 避免 Cookie 在非 HTTPS 连接中传输 |
| P0 | 设置 `app.proxy = true`，信任 `X-Forwarded-Proto` | 反向代理后才能正确识别 HTTPS |
| P0 | 登录接口限流 | 防止公网暴力猜暗号 |
| P0 | 备份 `server/data.json` 与 `server/uploads/` | 这是你们的全部数据 |
| P1 | 把数据与上传目录移出代码目录，例如 `/var/lib/our-story/` | 更新代码时不误删用户数据 |
| P1 | API 写操作只接受 Bearer，Cookie 仅用于 `<img>` 鉴权 | 降低 CSRF 风险 |
| P2 | 添加 `robots.txt` / `X-Robots-Tag: noindex` | 防止搜索引擎收录 |

如果暂时不改数据目录路径，也可以按当前代码部署，但必须做到：

- 发布新版本时绝不覆盖 `/srv/our-story/server/data.json` 和 `/srv/our-story/server/uploads/`。
- 每次重启或更新前先备份这两个位置。

## 四、首次部署步骤

### 1. 本地检查

```bash
pnpm install
pnpm build
pnpm start
```

确认本地生产构建可以访问、登录、上传照片；然后把项目上传到服务器。

### 2. 服务器初始化

以 Ubuntu 24.04 为例：

```bash
sudo apt update
sudo apt install -y nginx git curl ufw
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm
node -v
pnpm -v
```

创建服务用户和目录：

```bash
sudo useradd --system --create-home --home-dir /srv/our-story --shell /usr/sbin/nologin ourstory
sudo mkdir -p /srv/our-story
sudo chown -R ourstory:ourstory /srv/our-story
```

### 3. 把当前网页传到服务器

推荐使用 Git；如果没有仓库，可以先用 rsync：

```bash
rsync -avz \
  --exclude node_modules \
  --exclude dist \
  --exclude preview \
  --exclude qa-shots \
  --exclude qa-assets \
  --exclude server/data.json \
  --exclude 'server/uploads/*' \
  ./ user@服务器IP:/srv/our-story/
```

然后单独迁移真实数据和照片：

```bash
rsync -avz server/data.json user@服务器IP:/srv/our-story/server/
rsync -avz server/uploads/ user@服务器IP:/srv/our-story/server/uploads/
```

如果还没有真实数据，可以跳过第二步，保留远程已有的空文件/目录。

### 4. 安装依赖并构建

```bash
cd /srv/our-story
sudo -u ourstory pnpm install --frozen-lockfile
sudo -u ourstory pnpm build
```

### 5. 配置环境变量

创建 `/etc/our-story.env`：

```bash
sudo tee /etc/our-story.env > /dev/null <<'EOF'
NODE_ENV=production
HOST=127.0.0.1
PORT=5500
LOVE_PASSCODE=这里换成你们的长暗号
EOF

sudo chmod 600 /etc/our-story.env
```

注意：

- 暗号不要使用容易猜到的短数字，建议使用一段只有你们知道的长文本。
- 不要把 `/etc/our-story.env` 提交到 Git。
- 修改环境变量后重启服务。

### 6. 配置 systemd

创建 `/etc/systemd/system/our-story.service`：

```ini
[Unit]
Description=Our Story
After=network.target

[Service]
Type=simple
User=ourstory
Group=ourstory
WorkingDirectory=/srv/our-story
EnvironmentFile=/etc/our-story.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/srv/our-story

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now our-story
sudo systemctl status our-story
curl http://127.0.0.1:5500/api/health
```

查看日志：

```bash
sudo journalctl -u our-story -f
```

### 7. 配置 Nginx

创建 `/etc/nginx/sites-available/our-story`：

```nginx
server {
    listen 80;
    server_name story.example.com;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:5500;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/our-story /etc/nginx/sites-enabled/our-story
sudo nginx -t
sudo systemctl reload nginx
```

先确认 `http://story.example.com` 能看到锁屏页面。

### 8. 登录限流

在 Nginx 的 http 配置层添加（可以放在 `/etc/nginx/conf.d/our-story-rate-limit.conf`）：

```nginx
limit_req_zone $binary_remote_addr zone=our_story_login:10m rate=10r/m;
```

然后在 `server` 块中加入：

```nginx
location = /api/login {
    limit_req zone=our_story_login burst=3 nodelay;
    proxy_pass http://127.0.0.1:5500;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 9. 配置 HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d story.example.com
sudo certbot renew --dry-run
```

Certbot 会自动处理证书和 HTTP → HTTPS 跳转。

### 10. 防火墙

云厂商安全组和服务器防火墙都要配置：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

只开放 22、80、443；不要开放 5500。

## 五、数据备份

建议每天备份一次，并把备份复制到另一台机器或对象存储。

```bash
sudo mkdir -p /var/backups/our-story
sudo chown -R root:root /var/backups/our-story
sudo crontab -e
```

加入：

```cron
30 3 * * * tar -czf /var/backups/our-story/our-story-$(date +\%F-\%H\%M).tar.gz -C /srv/our-story server/data.json server/uploads && find /var/backups/our-story -type f -mtime +14 -delete
```

请至少做一次恢复演练：

```bash
tar -tzf /var/backups/our-story/xxx.tar.gz | head
```

如果只用本机备份，服务器磁盘坏了备份也会一起丢失，建议再同步到对象存储。

## 六、以后如何更新网站

```bash
# 1. 先备份
sudo tar -czf /var/backups/our-story/pre-deploy-$(date +%F-%H%M).tar.gz \
  -C /srv/our-story server/data.json server/uploads

# 2. 更新代码（Git 或 rsync）
cd /srv/our-story
# git pull 或重新 rsync

# 3. 安装依赖并构建
sudo -u ourstory pnpm install --frozen-lockfile
sudo -u ourstory pnpm build

# 4. 保留数据目录，不要覆盖
# server/data.json 和 server/uploads/ 必须保持原样

# 5. 重启
sudo systemctl restart our-story
sudo systemctl status our-story
```

更新前确认 rsync 的参数没有删除 `server/data.json` 和 `server/uploads/`。

## 七、上线验收清单

- [ ] `https://你的域名` 可以打开锁屏页
- [ ] `/api/health` 返回正常
- [ ] 5500 端口没有对公网开放
- [ ] 输入新强暗号可以登录，错误暗号会被拒绝
- [ ] 登出后刷新页面需要重新输入暗号
- [ ] 添加待办、笔记、见面计划成功
- [ ] 上传照片，笔记中可以看到图片
- [ ] 照片墙可以进入，照片可拖动、长按旋转、预览、删除
- [ ] 刷新页面后数据仍在
- [ ] `systemctl restart our-story` 后数据仍在
- [ ] HTTPS 证书有效，`certbot renew --dry-run` 成功
- [ ] 每日备份已经生成
- [ ] 浏览器控制台没有报错
- [ ] 手机通过公网访问正常

## 八、可选方案

### 方案 B：Docker Compose

如果以后需要迁移服务器或增加环境，可以改成：

- `Dockerfile`：构建 Vue 生产包 + Node 运行
- `docker-compose.yml`：Koa 容器 + Nginx 容器
- data/uploads 挂载到宿主机卷
- 证书仍然放在宿主机 Nginx 或 Caddy

对目前只有两个人的站点来说不是必须的。

### 方案 C：PaaS / 托管平台

适合更省运维，但需要额外处理：

- 持久化磁盘，避免容器重启后数据丢失
- 上传照片的持久化存储
- 自定义域名和 HTTPS

当前项目用本地 JSON + 上传目录，单台云服务器反而更直接。

## 九、建议的下一步

1. 先确定云厂商、Ubuntu 版本、域名和是否备案。
2. 完成上线前的代码安全项（强暗号、Secure Cookie、代理信任、接口限流、数据目录外置）。
3. 准备 Nginx 配置、systemd 文件和 `.env` 模板。
4. 在服务器完成首次部署。
5. 迁移现有 `data.json` 和 `uploads/`，做一次备份恢复演练。

在服务商和域名确定后，可以把本方案落成可直接执行的部署文件与命令。
