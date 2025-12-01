混合聊天应用

这是一个使用WebSocket实现的实时聊天应用，支持一对一私聊和群组聊天功能。

功能特性

- 实时消息发送和接收
- 一对一私聊
- 群组聊天
- 文件上传和分享（支持图片、音频、视频等）
- 聊天记录持久化存储
- 响应式设计，支持多设备访问
- 自动重连机制

技术栈

- **前端**：HTML, CSS, JavaScript
- **后端**：Node.js, WebSocket
- **数据库**：SQLite (使用better-sqlite3)
- **文件处理**：formidable

快速开始

安装依赖

1. 进入server目录：
```bash
cd server
```

2. 安装依赖包：
```bash
npm install
```

启动服务器

在server目录下运行：
```bash
node index.js
```
服务器将在 http://localhost:3000 上启动。

启动客户端

直接在浏览器中打开client目录下的index.html文件即可。

使用说明

1. 输入用户ID进行登录
2. 选择聊天类型：私聊或群组聊天
3. 对于私聊，选择聊天对象
4. 对于群组聊天，选择或创建群组
5. 在输入框中输入消息并发送
6. 点击附件按钮可以上传文件

注意事项

- 文件上传大小限制为50MB
- 支持的文件类型：图片、音频、视频等
- 聊天记录会自动保存到数据库中

项目结构

```
work3/
├── server/           # 服务器端代码
│   ├── index.js      # 主入口文件
│   └── chat.db       # SQLite数据库文件
├── client/           # 客户端代码
│   ├── index.html    # 主页面
│   ├── style.css     # 样式文件
│   └── js/           # JavaScript文件
│       └── chat.js   # 聊天功能实现
└── README.md         # 项目说明文档
```

许可证

MIT