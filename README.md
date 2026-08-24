# 公寓入住人员信息登记小程序

一个用于公寓住户入住登记的网页小程序，支持千禧、香山、时代、爱家四栋公寓。

## 功能

- 首页：4 个大按钮选择公寓（千禧 / 香山 / 时代 / 爱家）
- 登记页：填写房间号、姓名、身份证号码、备注，前 3 项填满后确认按钮由灰色变为绿色
- 完成页：仅显示"登记完成"
- 后台：自动收集数据到表格

## 存储方式

- **本地运行**（无环境变量）：数据写入 `registrations.csv` 文件
- **云端运行**（设置 `DATABASE_URL` 环境变量）：数据写入 PostgreSQL 数据库（数据不丢失）

## 本地运行

```bash
npm install
npm start
```

然后浏览器打开 http://localhost:8080

## 云端部署（Render）

1. 把本仓库推送到 GitHub
2. 在 Render (render.com) 注册账号（可用 GitHub 登录）
3. 创建免费 PostgreSQL 数据库，复制连接字符串（DATABASE_URL）
4. 创建 Web Service，连接 GitHub 仓库
5. 在环境变量中添加 `DATABASE_URL`，设置为数据库连接字符串
6. 部署完成后访问 `https://你的服务名.onrender.com`

## 常用接口

| 接口 | 说明 |
|------|------|
| `GET /` | 登记页面 |
| `POST /api/register` | 提交登记数据 |
| `GET /api/records` | 查看所有登记记录（JSON） |
| `GET /api/download` | 下载 CSV 表格 |
| `GET /api/health` | 健康检查 |

## 文件结构

```
├── server.js          # 后端服务器（支持 CSV / PostgreSQL 双存储）
├── package.json
├── public/
│   ├── index.html     # 前端三页面
│   ├── style.css      # 样式
│   └── app.js         # 前端逻辑
└── registrations.csv  # 本地模式下的数据表格（自动生成）
```
