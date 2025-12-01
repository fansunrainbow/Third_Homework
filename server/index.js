const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const formidable = require('formidable');
const Database = require('better-sqlite3');

// 创建或连接到SQLite数据库
const db = new Database('chat.db');

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    from_user TEXT NOT NULL,
    to_user TEXT,
    group_id TEXT,
    content TEXT,
    file_id TEXT,
    file_name TEXT,
    file_type TEXT,
    timestamp INTEGER NOT NULL,
    is_broadcast INTEGER DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    creator TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id)
  );
  
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    filetype TEXT NOT NULL,
    filesize INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL
  );
`);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 存储客户端连接
const clients = new Map();
// 存储群组信息（内存中缓存，同步到数据库）
const groups = new Map();

// 从数据库加载群组信息
function loadGroupsFromDB() {
  const stmt = db.prepare('SELECT * FROM groups');
  const groupsData = stmt.all();
  
  groupsData.forEach(group => {
    groups.set(group.id, {
      id: group.id,
      name: group.name,
      creator: group.creator,
      members: new Set()
    });
  });
  
  // 加载群组成员
  const memberStmt = db.prepare('SELECT group_id, user_id FROM group_members');
  const membersData = memberStmt.all();
  
  membersData.forEach(member => {
    const group = groups.get(member.group_id);
    if (group) {
      group.members.add(member.user_id);
    }
  });
}

// 初始化时加载群组信息
loadGroupsFromDB();

// 配置静态文件服务，用于提供前端页面
app.use(express.static(path.join(__dirname, '../client')));

// 处理WebSocket连接
wss.on('connection', (ws) => {
    let userId = null;
    
    console.log('新的客户端连接');
    
    // 处理消息接收
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            // 处理用户登录消息
            if (data.type === 'login') {
                userId = data.userId;
                clients.set(userId, ws);
                console.log(`用户 ${userId} 登录成功`);
                
                // 发送登录成功消息
                ws.send(JSON.stringify({
                    type: 'login_success',
                    message: '登录成功',
                    userId: userId
                }));
            }
            
            // 处理聊天消息
            else if (data.type === 'chat') {
                console.log(`收到来自 ${userId} 的消息: ${data.content}`);
                
                // 保存广播消息到数据库
                const insertMessage = db.prepare(`
                  INSERT INTO messages (type, from_user, content, timestamp, is_broadcast)
                  VALUES (@type, @from, @content, @timestamp, 1)
                `);
                
                insertMessage.run({
                  type: 'chat',
                  from: userId,
                  content: data.content,
                  timestamp: Date.now()
                });
                
                // 广播消息给所有客户端
                broadcastMessage({
                    type: 'chat',
                    from: userId,
                    content: data.content,
                    timestamp: new Date().toISOString()
                });
            }
            
            // 处理群聊消息
            else if (data.type === 'group_chat') {
                console.log(`收到来自 ${userId} 发送到群组 ${data.groupId} 的消息: ${data.content}`);
                
                const group = groups.get(data.groupId);
                if (group && group.members.includes(userId)) {
                    // 保存消息到历史记录（支持文件）
                    const messageData = {
                        type: 'group_chat',
                        from: userId,
                        groupId: data.groupId,
                        content: data.content,
                        timestamp: new Date().toISOString()
                    };
                    
                    // 如果有文件信息，添加到消息中
                    if (data.file) {
                        messageData.file = data.file;
                    }
                    
                    // 保存消息到数据库
                    const insertMessage = db.prepare(`
                      INSERT INTO messages (type, from_user, group_id, content, file_id, file_name, file_type, timestamp)
                      VALUES (@type, @from, @groupId, @content, @fileId, @fileName, @fileType, @timestamp)
                    `);
                    
                    const fileId = messageData.file ? messageData.file.fileId : null;
                    const fileName = messageData.file ? messageData.file.fileName : null;
                    const fileType = messageData.file ? messageData.file.fileType : null;
                    
                    insertMessage.run({
                      type: 'group_chat',
                      from: messageData.from,
                      groupId: messageData.groupId,
                      content: messageData.content,
                      fileId,
                      fileName,
                      fileType,
                      timestamp: Date.now()
                    });
                    
                    // 发送消息给群组所有成员
                    sendToGroup(data.groupId, messageData, userId);
                }
            }
            
            // 创建群组
            else if (data.type === 'create_group') {
                console.log(`用户 ${userId} 创建群组: ${data.groupName}`);
                
                const groupId = 'group_' + Date.now();
                groups.set(groupId, {
                    id: groupId,
                    name: data.groupName,
                    creator: userId,
                    members: new Set([userId]),
                    createdAt: new Date().toISOString()
                });
                
                // 保存群组信息到数据库
                const insertGroup = db.prepare(`
                  INSERT INTO groups (id, name, creator, created_at)
                  VALUES (@groupId, @groupName, @creator, @createdAt)
                `);
                
                insertGroup.run({
                  groupId,
                  groupName: data.groupName,
                  creator: userId,
                  createdAt: Date.now()
                });
                
                // 保存群主为第一个成员
                const insertMember = db.prepare(`
                  INSERT INTO group_members (group_id, user_id, joined_at)
                  VALUES (@groupId, @userId, @joinedAt)
                `);
                
                insertMember.run({
                  groupId,
                  userId: userId,
                  joinedAt: Date.now()
                });
                
                // 发送创建成功消息
                ws.send(JSON.stringify({
                    type: 'group_created',
                    groupId: groupId,
                    groupName: data.groupName
                }));
            }
            
            // 加入群组
            else if (data.type === 'join_group') {
                console.log(`用户 ${userId} 请求加入群组: ${data.groupId}`);
                
                const group = groups.get(data.groupId);
                if (group && !group.members.includes(userId)) {
                    // 转换members从数组到Set以便更好的成员管理
                    if (!group.members.has) {
                      group.members = new Set(group.members);
                    }
                    group.members.add(userId);
                    
                    // 保存群组成员信息到数据库
                    const insertMember = db.prepare(`
                      INSERT INTO group_members (group_id, user_id, joined_at)
                      VALUES (@groupId, @userId, @joinedAt)
                    `);
                    
                    insertMember.run({
                      groupId: data.groupId,
                      userId: userId,
                      joinedAt: Date.now()
                    });
                    
                    // 发送加入成功消息
                    ws.send(JSON.stringify({
                        type: 'join_group_success',
                        groupId: data.groupId,
                        groupName: group.name
                    }));
                    
                    // 通知群组成员有新成员加入
                    sendToGroup(data.groupId, {
                        type: 'user_joined_group',
                        userId: userId,
                        groupId: data.groupId
                    }, userId);
                }
            }
            
            // 获取聊天历史
            else if (data.type === 'get_history') {
                const limit = data.limit || 50;
                const offset = data.offset || 0;
                const historySlice = chatHistory.slice(offset, offset + limit).reverse();
                
                ws.send(JSON.stringify({
                    type: 'history_response',
                    history: historySlice,
                    total: chatHistory.length
                }));
            }
            
            // 处理私信消息
            else if (data.type === 'private_chat') {
                console.log(`收到来自 ${userId} 发给 ${data.to} 的私信: ${data.content}`);
                
                // 创建消息数据（支持文件）
                const messageData = {
                    type: 'private_chat',
                    from: userId,
                    to: data.to,
                    content: data.content,
                    timestamp: new Date().toISOString()
                };
                
                // 如果有文件信息，添加到消息中
                if (data.file) {
                    messageData.file = data.file;
                }
                
                // 保存消息到数据库
                const insertMessage = db.prepare(`
                  INSERT INTO messages (type, from_user, to_user, content, file_id, file_name, file_type, timestamp)
                  VALUES (@type, @from, @to, @content, @fileId, @fileName, @fileType, @timestamp)
                `);
                
                const fileId = messageData.file ? messageData.file.fileId : null;
                const fileName = messageData.file ? messageData.file.fileName : null;
                const fileType = messageData.file ? messageData.file.fileType : null;
                
                insertMessage.run({
                  type: 'private_chat',
                  from: messageData.from,
                  to: messageData.to,
                  content: messageData.content,
                  fileId,
                  fileName,
                  fileType,
                  timestamp: Date.now()
                });
                
                // 发送给目标用户
                const targetClient = clients.get(data.to);
                if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                    targetClient.send(JSON.stringify(messageData));
                }
                
                // 也发送给自己（消息确认）
                ws.send(JSON.stringify({
                    type: 'private_chat_sent',
                    ...messageData
                }));
            }
        } catch (error) {
            console.error('消息处理错误:', error);
        }
    });
    
    // 处理连接关闭
    ws.on('close', () => {
        if (userId) {
            clients.delete(userId);
            console.log(`用户 ${userId} 断开连接`);
            
            // 广播用户离开消息
            broadcastMessage({
                type: 'user_left',
                userId: userId
            });
        }
    });
    
    // 处理错误
    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

// 广播消息给所有客户端
function broadcastMessage(message) {
    const messageString = JSON.stringify(message);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
}

// 保存文件信息到数据库
function saveFileToDB(fileId, fileInfo, uploadedBy) {
    const insertFile = db.prepare(`
      INSERT INTO files (id, filename, filepath, filetype, filesize, uploaded_at, uploaded_by)
      VALUES (@id, @filename, @filepath, @filetype, @filesize, @uploadedAt, @uploadedBy)
    `);
    
    insertFile.run({
      id: fileId,
      filename: fileInfo.name,
      filepath: fileInfo.path,
      filetype: fileInfo.type,
      filesize: fileInfo.size,
      uploadedAt: Date.now(),
      uploadedBy
    });
}

// 发送消息给群组所有成员
function sendToGroup(groupId, message, excludeUserId = null) {
    const group = groups.get(groupId);
    if (!group) return;
    
    const messageString = JSON.stringify(message);
    
    group.members.forEach((memberId) => {
        if (memberId !== excludeUserId) {
            const client = clients.get(memberId);
            if (client && client.readyState === WebSocket.OPEN) {
                client.send(messageString);
            }
        }
    });
}

// 获取在线用户列表
app.get('/api/users', (req, res) => {
    const userList = Array.from(clients.keys());
    res.json({ users: userList });
});

// 获取群组列表
app.get('/api/groups', (req, res) => {
    const groupList = Array.from(groups.values()).map(group => ({
        id: group.id,
        name: group.name,
        creator: group.creator,
        memberCount: group.members.length,
        createdAt: group.createdAt
    }));
    res.json({ groups: groupList });
});

// 获取群组成员
app.get('/api/groups/:groupId/members', (req, res) => {
    const groupId = req.params.groupId;
    const group = groups.get(groupId);
    
    if (group) {
        res.json({ members: group.members });
    } else {
        res.status(404).json({ error: '群组不存在' });
    }
});

// 增加文件上传支持
app.use(express.json({ limit: '50mb' }));

// 处理文件上传
app.post('/api/upload', (req, res) => {
    try {
        const { fileName, fileData, fileType, senderId } = req.body;
        
        if (!fileName || !fileData || !senderId) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        // 生成文件ID
        const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 在实际应用中，这里应该将文件保存到磁盘或云存储
        // 这里简单模拟保存
        console.log(`收到文件上传: ${fileName}, 大小: ${fileData.length} 字节`);
        
        // 创建模拟文件信息对象
        const mockFileInfo = {
          name: fileName,
          path: `/uploads/${fileId}`, // 模拟文件路径
          type: fileType,
          size: fileData.length
        };
        
        // 保存文件信息到数据库
        saveFileToDB(fileId, mockFileInfo, senderId);
        
        // 返回文件信息
        res.json({
            success: true,
            fileId: fileId,
            fileName: fileName,
            fileType: fileType,
            url: `/api/files/${fileId}`
        });
    } catch (error) {
        console.error('文件上传错误:', error);
        res.status(500).json({ error: '文件上传失败' });
    }
});

// 提供文件下载
app.get('/api/files/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    
    try {
      // 从数据库查询文件信息
      const stmt = db.prepare('SELECT * FROM files WHERE id = ?');
      const file = stmt.get(fileId);
      
      if (!file) {
        res.status(404).json({ error: '文件不存在' });
        return;
      }
      
      // 检查文件是否存在
      fs.access(file.filepath, fs.constants.F_OK, (err) => {
        if (err) {
          res.status(404).json({ error: '文件不存在' });
          return;
        }
        
        // 设置正确的MIME类型
        res.setHeader('Content-Type', file.filetype);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
        
        // 发送文件
        const fileStream = fs.createReadStream(file.filepath);
        fileStream.pipe(res);
      });
    } catch (error) {
      console.error('文件下载失败:', error);
      res.status(500).json({ error: '文件下载失败' });
    }
});

// 获取聊天历史API
app.get('/api/history', (req, res) => {
    const groupId = req.query.groupId;
    const withUserId = req.query.with;
    const userId = req.query.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    try {
        let filteredHistory = [];
        
        if (groupId) {
            // 获取群组聊天历史
            filteredHistory = chatHistory.filter(msg => 
                msg.type === 'group_chat' && msg.groupId === groupId
            );
        } else if (withUserId && userId) {
            // 获取私聊历史
            filteredHistory = chatHistory.filter(msg => 
                ((msg.from === userId && msg.to === withUserId) || 
                 (msg.from === withUserId && msg.to === userId)) && 
                (msg.type === 'private_chat')
            );
        } else {
            // 获取广播消息历史
            filteredHistory = chatHistory.filter(msg => 
                msg.type === 'chat'
            );
        }
        
        // 按时间排序并分页
        filteredHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const paginatedHistory = filteredHistory.slice(offset, offset + limit);
        
        res.json({
            success: true,
            messages: paginatedHistory,
            total: filteredHistory.length,
            hasMore: offset + limit < filteredHistory.length
        });
    } catch (error) {
        console.error('获取聊天历史错误:', error);
        res.status(500).json({ 
            success: false, 
            error: '获取聊天历史失败' 
        });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`WebSocket服务器已启动`);
});