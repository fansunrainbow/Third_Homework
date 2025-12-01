// 全局变量
let ws = null;
let currentUserId = null;
let isConnecting = false;
let currentGroupId = null; // 当前选中的群组
let groups = []; // 群组列表
let currentChatType = 'broadcast'; // 'broadcast', 'private', 'group'
let selectedFile = null;
let fileInfo = null;

// DOM元素
const loginContainer = document.getElementById('login-container');
const chatApp = document.getElementById('chat-app');
const userIdInput = document.getElementById('userId-input');
const loginBtn = document.getElementById('login-button');
const logoutBtn = document.getElementById('logout-btn');
const currentUserEl = document.getElementById('current-user');
const chatMain = document.getElementById('chat-main');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-button');
const privateMessageContainer = document.querySelector('.private-message-container');
const privateRecipientInput = document.getElementById('private-recipient');
const groupNameInput = document.getElementById('group-name-input');
const createGroupBtn = document.getElementById('create-group-btn');
const joinGroupIdInput = document.getElementById('join-group-id');
const joinGroupBtn = document.getElementById('join-group-btn');
const groupsList = document.getElementById('groups-list');
const chatTitle = document.getElementById('current-chat-title');
const fileUpload = document.getElementById('file-upload');
const toggleAllChat = document.getElementById('toggle-all-chat');
const togglePrivateChat = document.getElementById('toggle-private-chat');

// 显示错误提示
function showError(message) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-toast';
    errorContainer.textContent = message;
    document.body.appendChild(errorContainer);
    
    setTimeout(() => {
        errorContainer.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(errorContainer);
        }, 300);
    }, 3000);
}

// 显示加载指示器
function showLoading(message = '加载中...') {
    let loadingElement = document.getElementById('loading-indicator');
    if (!loadingElement) {
        loadingElement = document.createElement('div');
        loadingElement.id = 'loading-indicator';
        loadingElement.className = 'loading-indicator';
        document.body.appendChild(loadingElement);
    }
    
    loadingElement.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">${message}</div>
    `;
    loadingElement.style.display = 'flex';
}

// 隐藏加载指示器
function hideLoading() {
    const loadingElement = document.getElementById('loading-indicator');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// 滚动到底部
function scrollToBottom() {
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
}

// 初始化事件监听
function initEventListeners() {
    // 登录按钮点击事件
    loginBtn.addEventListener('click', handleLogin);
    userIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // 退出按钮点击事件
    logoutBtn.addEventListener('click', handleLogout);

    // 发送按钮点击事件
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 聊天类型切换处理
    if (toggleAllChat) {
        toggleAllChat.addEventListener('click', () => switchChatType('broadcast'));
    }
    if (togglePrivateChat) {
        togglePrivateChat.addEventListener('click', () => switchChatType('private'));
    }
    
    // 监听群组创建按钮点击
    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => {
            const groupName = groupNameInput.value.trim();
            if (groupName) {
                createGroup(groupName);
                groupNameInput.value = '';
            } else {
                showError('请输入群组名称');
            }
        });
    }
    
    // 监听加入群组按钮点击
    if (joinGroupBtn) {
        joinGroupBtn.addEventListener('click', () => {
            const groupId = joinGroupIdInput.value.trim();
            if (groupId) {
                joinGroup(groupId);
                joinGroupIdInput.value = '';
            } else {
                showError('请输入群组ID');
            }
        });
    }
    
    // 监听文件上传
    if (fileUpload) {
        fileUpload.addEventListener('change', handleFileSelect);
    }

    // 附件按钮点击事件
    if (window.attachBtn) {
        window.attachBtn.addEventListener('click', handleAttach);
    }
    
    // 为私信输入框添加回车键事件
    if (privateRecipientInput) {
        privateRecipientInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && currentChatType === 'private') {
                const recipientId = privateRecipientInput.value.trim();
                if (recipientId) {
                    chatMessages.innerHTML = '';
                    getChatHistory(null, recipientId);
                    if (chatTitle) {
                        chatTitle.textContent = `私聊: ${recipientId}`;
                    }
                }
            }
        });
    }

    // 监听窗口关闭事件，关闭WebSocket连接
    window.addEventListener('beforeunload', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    });
    
    // 初始设置
    updateSendButtonState();
    messageInput.addEventListener('input', updateSendButtonState);
}

// 登录处理
function handleLogin() {
    const userId = userIdInput.value.trim();
    if (!userId) {
        alert('请输入用户名');
        return;
    }

    currentUserId = userId;
    currentUserEl.textContent = userId;
    
    // 显示聊天界面，隐藏登录界面
    loginContainer.classList.add('hidden');
    if (chatMain) {
        chatMain.style.display = 'flex';
    } else if (chatApp) {
        chatApp.classList.remove('hidden');
    }
    
    // 设置当前聊天标题
    if (chatTitle) {
        chatTitle.textContent = `欢迎，${userId}`;
    }
    
    messageInput.focus();

    // 连接WebSocket服务器
    connectWebSocket();
    
    // 加载群组列表
    if (typeof fetchGroups === 'function') {
        fetchGroups();
    }
    
    // 加载聊天历史
    if (typeof getChatHistory === 'function') {
        getChatHistory();
    }
}

// 退出处理
function handleLogout() {
    if (ws) {
        ws.close();
        ws = null;
    }
    
    // 重置状态
    currentUserId = null;
    loginContainer.classList.remove('hidden');
    chatApp.classList.add('hidden');
    userIdInput.value = '';
    chatMessages.innerHTML = '<div class="system-message">请输入消息并发送...</div>';
    
    console.log('已退出登录');
}

// 连接WebSocket服务器
function connectWebSocket() {
    if (isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
        return;
    }

    isConnecting = true;
    
    // 获取当前页面的协议和主机
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port || (protocol === 'https:' ? 443 : 3000);
    const wsUrl = `${protocol}//${host}:${port}`;
    
    console.log(`正在连接到WebSocket服务器: ${wsUrl}`);
    
    try {
        ws = new WebSocket(wsUrl);
        
        // 连接成功
        ws.onopen = () => {
            isConnecting = false;
            console.log('WebSocket连接成功');
            
            // 发送登录消息
            ws.send(JSON.stringify({
                type: 'login',
                userId: currentUserId
            }));
            
            addSystemMessage('已连接到服务器');
            hideLoading();
        };
        
        // 接收消息
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('解析消息失败:', error);
                showError('消息解析错误');
            }
        };
        
        // 连接关闭
        let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseReconnectTime = 3000;
    
    ws.onclose = () => {
        isConnecting = false;
        console.log('WebSocket连接关闭');
        addSystemMessage('连接已关闭，正在尝试重连...');
        
        // 指数退避重连策略
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(baseReconnectTime * Math.pow(2, reconnectAttempts - 1) + Math.random() * 1000, 30000);
            console.log(`将在 ${delay}ms 后进行第 ${reconnectAttempts} 次重连`);
            setTimeout(() => {
                connectWebSocket();
            }, delay);
        } else {
            showError('连接断开，请手动刷新页面');
        }
    };
    
    // 连接成功时重置重连计数
    ws.onopen = () => {
        isConnecting = false;
        console.log('WebSocket连接成功');
        
        // 发送登录消息
        ws.send(JSON.stringify({
            type: 'login',
            userId: currentUserId
        }));
        
        addSystemMessage('已连接到服务器');
        hideLoading();
        reconnectAttempts = 0;
    };
        
        // 连接错误
        ws.onerror = (error) => {
            isConnecting = false;
            console.error('WebSocket错误:', error);
            addSystemMessage('连接服务器时发生错误');
            hideLoading();
        };
    } catch (error) {
        isConnecting = false;
        console.error('创建WebSocket连接失败:', error);
        addSystemMessage('创建连接失败，请检查网络');
        hideLoading();
    }
}

// 处理接收到的WebSocket消息
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'login_success':
            console.log('登录成功');
            break;
        
        case 'chat':
            // 显示广播消息
            addMessage(data.from, data.content, data.timestamp);
            break;
        
        case 'private_chat':
            // 显示私信消息
            addMessage(data.from, data.content, data.timestamp, true);
            break;
        
        case 'private_chat_sent':
            // 显示已发送的私信消息（自己发送的）
            addMyMessage(data.to, data.content, data.timestamp);
            break;
        
        case 'user_left':
            addSystemMessage(`用户 ${data.userId} 离开了聊天`);
            break;
        
        // 处理群组创建成功
        case 'group_created':
            addSystemMessage(`群组创建成功: ${data.groupName} (ID: ${data.groupId})`);
            // 刷新群组列表
            fetchGroups();
            break;
            
        // 处理加入群组成功
        case 'join_group_success':
            addSystemMessage(`成功加入群组: ${data.groupName}`);
            // 刷新群组列表
            fetchGroups();
            break;
            
        // 处理用户加入群组通知
        case 'user_joined_group':
            if (currentGroupId === data.groupId) {
                addSystemMessage(`${data.userId} 加入了群组`);
            }
            break;
            
        // 处理群聊消息
        case 'group_chat':
            // 只有当前在该群组聊天时才显示消息
            if (currentGroupId === data.groupId) {
                if (data.from === currentUserId) {
                    addMyMessage(data.groupId, data.content, data.timestamp, true, data.file);
                } else {
                    addMessage(data.from, data.content, data.timestamp, true, data.file);
                }
            }
            break;
        
        default:
            console.log('未知消息类型:', data.type);
    }
}

// 发送消息
function sendMessage() {
    const content = messageInput.value.trim();
    
    // 如果没有消息内容也没有文件，不发送
    if (!content && !selectedFile) {
        return;
    }

    // 验证连接状态
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('未连接到服务器，请等待连接或刷新页面');
        return;
    }

    // 根据当前模式发送不同类型的消息
    let messageType, targetId;
    if (currentGroupId) {
        messageType = 'group_chat';
        targetId = currentGroupId;
    } else {
        // 根据聊天类型设置
        if (currentChatType === 'private') {
            messageType = 'private_chat';
            targetId = privateRecipientInput?.value?.trim() || '';
        } else {
            messageType = 'chat';
            targetId = 'all';
        }
    }
    
    // 验证接收者
    if (messageType === 'private_chat') {
        if (!targetId) {
            showError('请输入接收者ID');
            return;
        }
        
        if (targetId === currentUserId) {
            showError('不能给自己发送私信');
            return;
        }
    } else if (messageType === 'group_chat' && !targetId) {
        showError('请先选择群组');
        return;
    }
    
    // 构建消息数据
    const messageData = {
        type: messageType,
        from: currentUserId,
        to: targetId,
        content: content,
        timestamp: new Date().toISOString(),
        groupId: currentGroupId || null
    };
    
    // 显示加载状态
    showLoading(messageType === 'group_chat' ? '发送群聊消息...' : messageType === 'private_chat' ? '发送私信...' : '发送消息...');
    
    // 处理文件发送
    if (selectedFile) {
        // 检查文件大小（限制为50MB）
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (selectedFile.size > maxSize) {
            hideLoading();
            showError('文件大小不能超过50MB');
            return;
        }
        
        uploadFileWithMessage(selectedFile, messageData);
    } else {
        try {
            // 只发送文本消息
            ws.send(JSON.stringify(messageData));
            
            // 添加消息到聊天记录（自己发送的）
            addMyMessage(targetId, content, messageData.timestamp, messageType === 'private_chat');
        } catch (error) {
            console.error('发送消息错误:', error);
            showError('发送消息失败，请重试');
        } finally {
            hideLoading();
        }
    }
    
    // 清空输入框
    messageInput.value = '';
    messageInput.focus();
    
    // 移除文件预览
    const filePreview = document.querySelector('.file-preview');
    if (filePreview) {
        filePreview.remove();
    }
    
    selectedFile = null;
    fileInfo = null;
    updateSendButtonState();
}

// 创建群组
function createGroup(groupName) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('未连接到服务器，请等待连接或刷新页面');
        return;
    }

    const messageData = {
        type: 'create_group',
        from: currentUserId,
        name: groupName,
        timestamp: new Date().toISOString()
    };

    ws.send(JSON.stringify(messageData));
}

// 加入群组
function joinGroup(groupId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('未连接到服务器，请等待连接或刷新页面');
        return;
    }

    const messageData = {
        type: 'join_group',
        from: currentUserId,
        groupId: groupId,
        timestamp: new Date().toISOString()
    };

    ws.send(JSON.stringify(messageData));
}

// 切换聊天类型
function switchChatType(type) {
    currentChatType = type;
    currentGroupId = null;
    
    // 更新UI状态
    if (toggleAllChat) toggleAllChat.classList.toggle('active', type === 'broadcast');
    if (togglePrivateChat) togglePrivateChat.classList.toggle('active', type === 'private');
    
    // 显示或隐藏私信输入框
    if (privateMessageContainer) {
        privateMessageContainer.classList.toggle('hidden', type !== 'private');
    }
    
    // 清空消息区域并加载对应历史
    chatMessages.innerHTML = '';
    
    // 更新标题
    if (chatTitle) {
        if (type === 'broadcast') {
            chatTitle.textContent = '全体聊天';
            getChatHistory();
        } else if (type === 'private') {
            chatTitle.textContent = '私聊';
            // 私聊需要在输入接收者ID后再加载历史
        }
    }
}

// 选择群组
function switchToGroup(groupId) {
    currentChatType = 'group';
    currentGroupId = groupId;
    
    // 更新UI状态
    if (toggleAllChat) toggleAllChat.classList.remove('active');
    if (togglePrivateChat) togglePrivateChat.classList.remove('active');
    
    // 隐藏私信输入框
    if (privateMessageContainer) {
        privateMessageContainer.classList.add('hidden');
    }
    
    // 更新聊天标题
    const groupElement = document.querySelector(`[data-group-id="${groupId}"]`);
    if (chatTitle) {
        chatTitle.textContent = `群聊: ${groupElement?.textContent.trim() || groupId}`;
    }
    
    // 清空聊天记录
    chatMessages.innerHTML = '';
    
    // 获取聊天历史
    getChatHistory(groupId);
}

// 更新发送按钮状态
function updateSendButtonState() {
    sendBtn.disabled = !messageInput.value.trim() && !selectedFile;
}

// 获取聊天历史
async function getChatHistory(groupId = null, userId = null) {
    showLoading('加载聊天历史...');
    
    try {
        let url = '/api/history';
        const params = new URLSearchParams();
        
        // 根据当前状态设置参数
        if (groupId) {
            params.append('type', 'group');
            params.append('groupId', groupId);
        } else if (userId) {
            params.append('type', 'private');
            params.append('recipientId', userId);
        } else if (currentChatType === 'private' && privateRecipientInput?.value?.trim()) {
            params.append('type', 'private');
            params.append('recipientId', privateRecipientInput.value.trim());
        } else {
            params.append('type', 'broadcast');
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('获取聊天历史失败');
        }
        
        const data = await response.json();
        
        // 清空现有消息
        chatMessages.innerHTML = '';
        
        if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach(message => {
                try {
                    // 检查消息对象的有效性
                    if (!message || !message.sender || !message.content && !message.fileInfo) {
                        return; // 跳过无效消息
                    }
                    
                    // 检查是否为自己发送的消息
                    const isMyMessage = message.sender === currentUserId;
                    
                    // 确定接收者（群组ID或用户ID）
                    let recipient = message.to || message.recipient || null;
                    
                    // 文件信息处理
                    let file = message.file || message.fileInfo || null;
                    
                    if (isMyMessage) {
                        addMyMessage(recipient, message.content || '', message.timestamp || new Date().toISOString(), 
                            message.type === 'private_chat' || message.type === 'private_message', file);
                    } else {
                        addMessage(message.from || message.sender, message.content || '', message.timestamp || new Date().toISOString(), 
                            message.type === 'private_chat' || message.type === 'private_message', file);
                    }
                } catch (err) {
                    console.error('处理历史消息失败:', err);
                }
            });
        }
    } catch (error) {
        console.error('获取聊天历史失败:', error);
        showError('获取聊天历史失败，请稍后重试');
    } finally {
        hideLoading();
    }
}

// 带消息的文件上传
async function uploadFileWithMessage(file, messageData) {
    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const fileData = event.target.result.split(',')[1]; // 获取base64数据部分
            
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fileName: file.name,
                        fileData: fileData,
                        fileType: file.type,
                        senderId: currentUserId
                    })
                });
                
                const result = await response.json();
                if (result.success) {
                    // 添加文件信息到消息数据
                    const fileMessageData = {
                        ...messageData,
                        file: result
                    };
                    
                    // 发送带文件的消息
                    ws.send(JSON.stringify(fileMessageData));
                    
                    // 添加消息到聊天记录（自己发送的）
                    addMyMessage(messageData.to, messageData.content, messageData.timestamp, 
                        messageData.type === 'private_chat', result);
                } else {
                    showError('文件上传失败: ' + result.error);
                }
            } catch (error) {
                console.error('文件上传失败:', error);
                showError('文件上传失败，请检查网络连接');
            } finally {
                hideLoading();
            }
        };
        reader.onerror = () => {
            console.error('文件读取失败');
            showError('文件读取失败');
            hideLoading();
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('文件上传失败:', error);
        showError('文件上传失败');
        hideLoading();
    }
}

// 发送文件消息
function sendFileMessage(fileInfo) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('未连接到服务器，请等待连接或刷新页面');
        return;
    }

    let messageType, targetId;
    if (currentGroupId) {
        messageType = 'group_chat';
        targetId = currentGroupId;
    } else {
        const isPrivate = document.querySelector('input[name="messageType"]:checked').value === 'private';
        messageType = isPrivate ? 'private_chat' : 'chat';
        targetId = isPrivate ? privateRecipientInput.value.trim() : 'all';
    }
    
    const messageData = {
        type: messageType,
        from: currentUserId,
        to: targetId,
        content: `发送了文件: ${fileInfo.fileName}`,
        timestamp: new Date().toISOString(),
        groupId: currentGroupId || null,
        file: fileInfo
    };

    ws.send(JSON.stringify(messageData));
    // 显示文件消息
    addMyMessage(targetId, messageData.content, messageData.timestamp, messageType === 'private_chat');
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        // 检查文件大小（限制为50MB）
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            showError('文件大小不能超过50MB');
            return;
        }
        
        // 显示文件选择预览
        selectedFile = file;
        fileInfo = {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
        };
        
        // 显示文件预览
        showFilePreview(fileInfo);
        
        // 重置文件输入，以便可以再次选择相同文件
        event.target.value = '';
    }
}

// 显示文件预览
function showFilePreview(info) {
    // 移除之前的预览
    const existingPreview = document.querySelector('.file-preview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    const filePreview = document.createElement('div');
    filePreview.className = 'file-preview';
    
    // 计算文件大小显示
    const fileSize = info.size < 1024 ? 
        `${info.size} B` : 
        (info.size / 1024).toFixed(1) + ' KB';
    
    filePreview.innerHTML = `
        <span class="file-icon">📎</span>
        <span class="file-name">${info.name}</span>
        <span class="file-size">${fileSize}</span>
        <button class="remove-file">×</button>
    `;
    
    // 移除文件按钮事件
    const removeBtn = filePreview.querySelector('.remove-file');
    removeBtn.addEventListener('click', () => {
        filePreview.remove();
        selectedFile = null;
        fileInfo = null;
        updateSendButtonState();
    });
    
    // 添加到输入区域
    const messageContainer = messageInput.parentElement;
    messageContainer.insertBefore(filePreview, messageInput);
    
    // 更新发送按钮状态
    updateSendButtonState();
}

// 添加系统消息
function addSystemMessage(content) {
    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    messageEl.textContent = content;
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 添加他人发送的消息
function addMessage(sender, content, timestamp, isPrivate = false, file = null) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message other-message';
    
    const headerEl = document.createElement('div');
    headerEl.className = 'message-header';
    headerEl.textContent = isPrivate ? `${sender} (私信)` : sender;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;
    
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = formatTimestamp(timestamp);
    
    messageEl.appendChild(headerEl);
    messageEl.appendChild(contentEl);
    
    // 添加文件预览（如果有）
    if (file) {
        const filePreview = renderFilePreview(file);
        if (filePreview) {
            messageEl.appendChild(filePreview);
        }
    }
    
    messageEl.appendChild(timeEl);
    
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 添加自己发送的消息
function addMyMessage(recipient, content, timestamp, isPrivate = false, file = null) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message my-message';
    
    const headerEl = document.createElement('div');
    headerEl.className = 'message-header';
    headerEl.textContent = isPrivate ? `发送给 ${recipient} (私信)` : '我';
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;
    
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = formatTimestamp(timestamp);
    
    messageEl.appendChild(headerEl);
    messageEl.appendChild(contentEl);
    
    // 添加文件预览（如果有）
    if (file) {
        const filePreview = renderFilePreview(file);
        if (filePreview) {
            messageEl.appendChild(filePreview);
        }
    }
    
    messageEl.appendChild(timeEl);
    
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 渲染文件预览
function renderFilePreview(file) {
    const fileType = file.fileType || file.type || '';
    const fileUrl = file.url || `/api/files/${file.fileId}`;
    const fileName = file.fileName || file.name || '未知文件';
    const fileSize = file.size || 0;
    
    const previewContainer = document.createElement('div');
    previewContainer.className = 'file-preview';
    
    // 文件类型图标
    const getFileTypeIcon = (type) => {
        if (type.startsWith('image/')) return '🖼️';
        if (type.startsWith('audio/')) return '🎵';
        if (type.startsWith('video/')) return '🎬';
        if (type.includes('pdf')) return '📄';
        if (type.includes('word') || type.includes('document')) return '📝';
        if (type.includes('sheet') || type.includes('excel')) return '📊';
        if (type.includes('zip') || type.includes('compressed')) return '🗜️';
        return '📎';
    };
    
    // 文件大小格式化
    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };
    
    // 文件信息头部
    const fileHeader = document.createElement('div');
    fileHeader.className = 'file-info';
    fileHeader.innerHTML = `
        <span class="file-icon">${getFileTypeIcon(fileType)}</span>
        <span class="file-name">${fileName}</span>
        <span class="file-size">${formatFileSize(fileSize)}</span>
    `;
    previewContainer.appendChild(fileHeader);
    
    // 根据文件类型创建预览
    if (fileType.startsWith('image/')) {
        const imgContainer = document.createElement('div');
        imgContainer.className = 'image-preview-container';
        
        const img = document.createElement('img');
        img.src = fileUrl;
        img.alt = fileName;
        img.className = 'preview-image';
        img.style.maxWidth = '250px';
        img.style.maxHeight = '250px';
        img.loading = 'lazy'; // 延迟加载
        
        // 加载失败时显示占位
        img.onerror = () => {
            img.src = `https://via.placeholder.com/200?text=图片加载失败`;
        };
        
        imgContainer.appendChild(img);
        previewContainer.appendChild(imgContainer);
    } else if (fileType.startsWith('audio/')) {
        const audioContainer = document.createElement('div');
        audioContainer.className = 'audio-preview-container';
        
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = fileUrl;
        audio.className = 'preview-audio';
        audio.setAttribute('preload', 'metadata');
        
        audioContainer.appendChild(audio);
        previewContainer.appendChild(audioContainer);
    } else if (fileType.startsWith('video/')) {
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-preview-container';
        
        const video = document.createElement('video');
        video.controls = true;
        video.src = fileUrl;
        video.className = 'preview-video';
        video.style.maxWidth = '350px';
        video.setAttribute('preload', 'metadata');
        
        videoContainer.appendChild(video);
        previewContainer.appendChild(videoContainer);
    } else {
        // 普通文件显示下载链接
        const downloadContainer = document.createElement('div');
        downloadContainer.className = 'download-container';
        
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName;
        link.className = 'download-link';
        link.innerHTML = '<span class="download-icon">⬇️</span> 点击下载';
        
        downloadContainer.appendChild(link);
        previewContainer.appendChild(downloadContainer);
    }
    
    return previewContainer;
}

// 切换私信输入框显示
function togglePrivateMessageInput() {
    const isPrivate = document.querySelector('input[name="messageType"]:checked').value === 'private';
    if (isPrivate) {
        privateMessageContainer.classList.remove('hidden');
    } else {
        privateMessageContainer.classList.add('hidden');
    }
    
    // 切换模式时重置群组状态
    currentGroupId = null;
    if (chatTitle) {
        chatTitle.textContent = isPrivate ? '选择私信对象' : '广播聊天';
    }
    // 清空聊天记录
    chatMessages.innerHTML = '';
}

// 处理附件
function handleAttach() {
    // 这里只是一个简单的提示，实际实现中可以添加文件选择逻辑
    alert('附件功能待实现');
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// 页面加载完成后初始化
window.addEventListener('load', () => {
    initEventListeners();
    console.log('聊天应用已加载');
});