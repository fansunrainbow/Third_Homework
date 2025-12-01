// 简单的WebSocket连接测试脚本
const WebSocket = require('ws');

// 创建两个客户端连接，模拟用户间通信
const client1 = new WebSocket('ws://localhost:3000');
const client2 = new WebSocket('ws://localhost:3000');

let client1Connected = false;
let client2Connected = false;

client1.on('open', () => {
    console.log('客户端1连接成功');
    client1Connected = true;
    // 登录为用户1
    client1.send(JSON.stringify({
        type: 'login',
        userId: 'test_user1'
    }));
    
    // 如果两个客户端都已连接，开始测试
    if (client1Connected && client2Connected) {
        startTest();
    }
});

client2.on('open', () => {
    console.log('客户端2连接成功');
    client2Connected = true;
    // 登录为用户2
    client2.send(JSON.stringify({
        type: 'login',
        userId: 'test_user2'
    }));
    
    // 如果两个客户端都已连接，开始测试
    if (client1Connected && client2Connected) {
        startTest();
    }
});

client1.on('message', (data) => {
    console.log('客户端1收到消息:', JSON.parse(data));
});

client2.on('message', (data) => {
    console.log('客户端2收到消息:', JSON.parse(data));
    
    // 收到消息后5秒关闭连接
    setTimeout(() => {
        console.log('测试完成，关闭连接');
        client1.close();
        client2.close();
    }, 5000);
});

function startTest() {
    console.log('开始测试私聊消息');
    // 客户端1向客户端2发送私聊消息
    setTimeout(() => {
        client1.send(JSON.stringify({
            type: 'private_message',
            from_user: 'test_user1',
            to_user: 'test_user2',
            content: '这是一条测试消息',
            timestamp: Date.now()
        }));
    }, 2000);
}

// 错误处理
client1.on('error', (error) => {
    console.error('客户端1错误:', error);
});

client2.on('error', (error) => {
    console.error('客户端2错误:', error);
});

// 连接关闭处理
client1.on('close', () => {
    console.log('客户端1连接关闭');
});

client2.on('close', () => {
    console.log('客户端2连接关闭');
});