# Docker Compose 部署配置

这套配置按照现有服务器的 `nginx + koa` 结构编写，但为了和目标站点 `partyquery` 共存，做了以下隔离：

| 项目 | 现有站点 | 本项目 |
| --- | --- | --- |
| Compose 网络 | `partyquery` | `ourstory` |
| Nginx 容器 | `partyquery_nginx` | `ourstory_nginx` |
| Koa 容器 | `partyquery_koa` | `ourstory_koa` |
| 宿主机端口 | `8080` | `8081` |
| 前端目录 | 由 Nginx 静态托管 | 由 Nginx 静态托管 `./dist` |
| API | Nginx 代理到 `koa:3000` | 同样代理到 `koa:3000` |
| 照片读取 | — | 额外代理 `/uploads/` 到 Koa，保留鉴权 |

## 目录结构

部署到服务器后，相关目录应类似：

```text
.
├─ docker-compose.yml
├─ dist/                       # pnpm build 生成
├─ nginx/conf/nginx.conf
├─ package.json
├─ pnpm-lock.yaml
├─ server/
│  ├─ index.js
│  ├─ data.json                # 运行时自动生成；真实数据请单独迁移
│  └─ uploads/                 # 照片，持久化在宿主机
└─ .env                        # 不提交 Git，至少包含 LOVE_PASSCODE
```

`dist` 和 `server/data.json` 都不在 Git 仓库中，所以首次部署前需要单独构建和迁移。

## 1. 本地构建前端

```bash
pnpm install --frozen-lockfile
pnpm build
```

确认本地生成 `dist/index.html` 和 `dist/assets/`。

## 2. 服务器准备

服务器需要已安装 Docker 和 Docker Compose 插件：

```bash
docker --version
docker compose version
```

将项目代码和构建产物上传到服务器，例如 `/opt/ourstory`：

```bash
rsync -avz --exclude node_modules --exclude .git ./ user@服务器:/opt/ourstory/
```

如果服务器上还没有当前数据，Koa 首次启动会自动创建 `server/data.json` 和 `server/uploads/`。

如果要迁移本地数据：

```bash
scp server/data.json user@服务器:/opt/ourstory/server/data.json
scp -r server/uploads/ user@服务器:/opt/ourstory/server/uploads/
```

## 3. 创建 `.env`

在服务器项目目录创建 `.env`：

```env
LOVE_PASSCODE=换成只有你们知道的长暗号
```

注意：

- 不要提交 `.env`。
- Compose 会读取这个变量并注入 Koa。
- Docker 容器内会覆盖 `HOST=0.0.0.0` 和 `PORT=3000`，不需要在 `.env` 中设置。
- 如果服务器已经有旧 `.env`，请确认其中包含正确的 `LOVE_PASSCODE`。

## 4. 启动

```bash
docker compose up -d
docker compose ps
```

默认访问地址：

```text
http://服务器公网IP:8081
```

如果 8081 已被其他服务占用，修改 `docker-compose.yml` 的 `ports` 即可，例如：

```yaml
ports:
  - "8082:80"
```

同时需要在云服务器安全组放行对应端口。

## 5. 查看日志与排查

```bash
docker compose logs -f nginx
docker compose logs -f koa
```

常见问题：

- **页面 403 / 空白**：`dist` 没有构建或挂载路径不对。
- **API 502**：Koa 容器未启动，检查 `docker compose logs koa`。
- **登录报错**：Koa 没有拿到 `LOVE_PASSCODE`，检查 `.env` 后重新创建容器。
- **照片 404 / 401**：`/uploads/` 必须代理到 Koa，且浏览器需要登录会话 Cookie。
- **上传大图失败**：Nginx 已设置 `client_max_body_size 12m`，如果修改过配置需重新加载 Nginx。

## 6. 更新代码

```bash
# 1. 备份数据
tar -czf /var/backups/ourstory-$(date +%F-%H%M).tar.gz \
  -C /opt/ourstory server/data.json server/uploads

# 2. 更新代码（Git 或 rsync）
cd /opt/ourstory
# git pull 或重新上传

# 3. 重新构建前端
pnpm install --frozen-lockfile
pnpm build

# 4. 重启 Koa（让后端代码生效）
docker compose restart koa
```

如果 `package.json` 或 `pnpm-lock.yaml` 有变化：

```bash
docker compose up -d --force-recreate koa
```

Nginx 配置修改后：

```bash
docker compose exec nginx nginx -t
docker compose restart nginx
```

## 7. 数据持久化

`server/` 是宿主机目录挂载进 Koa 容器：

- `server/data.json`：板块、待办、笔记、见面计划和照片墙布局。
- `server/uploads/`：笔记照片和照片墙照片。

因此容器重建不会丢数据，但必须备份宿主机上的这两个路径，并把备份复制到另一台机器或对象存储。

## 8. 公网访问与 HTTPS

当前 Compose 暴露的是 HTTP `8081`，和现有 `partyquery` 的 8080 保持同一层级。正式对公网开放前，建议：

- 在云安全组只放行需要的端口；
- 前面再加一层 HTTPS 入口（宿主 Nginx、Caddy、云负载均衡均可）；
- 最终通过域名访问，而不是直接暴露 IP:8081；
- 当前项目已经在云服务器上通过 `LOVE_PASSCODE` 注入强暗号，不要使用默认数字。

如果后续要接入已有的 `partyquery_nginx`，可以在那台 Nginx 中新增一个 server 块，反向代理到本项目的 `ourstory_nginx` 或 Koa，但通常独立 Compose 更不容易互相影响。

## 9. 首次访问验收

- [ ] `http://服务器IP:8081` 可以看到锁屏页
- [ ] 输入 `.env` 中配置的暗号可以登录
- [ ] 三个板块可正常读取
- [ ] 新建待办、笔记、照片墙照片可以保存
- [ ] 笔记中的照片可以显示
- [ ] 照片墙可以拖动、长按旋转、预览和右键删除
- [ ] 重启 Koa 容器后数据仍在
- [ ] 备份文件包含 `data.json` 和 `uploads/`
