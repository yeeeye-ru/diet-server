const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // 如果需要托管前端文件

// 初始化数据库文件
async function initDB() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ posts: [] }));
  }
}

// 读取帖子
app.get('/api/posts', async (req, res) => {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    res.json(db.posts);
  } catch (error) {
    res.status(500).json({ error: '读取失败' });
  }
});

// 发布新帖子
app.post('/api/posts', async (req, res) => {
  try {
    const { content, author = '匿名' } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '帖子内容不能为空' });
    }
    
    const data = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    
    const newPost = {
      id: Date.now().toString(),
      content: content.trim(),
      author,
      timestamp: new Date().toISOString(),
      likes: 0
    };
    
    db.posts.unshift(newPost); // 最新帖子在最前面
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    
    res.status(201).json(newPost);
  } catch (error) {
    res.status(500).json({ error: '发布失败' });
  }
});

// 点赞帖子
app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    
    const postIndex = db.posts.findIndex(post => post.id === id);
    if (postIndex === -1) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    
    db.posts[postIndex].likes += 1;
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    
    res.json({ likes: db.posts[postIndex].likes });
  } catch (error) {
    res.status(500).json({ error: '点赞失败' });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 启动服务器
async function startServer() {
  await initDB();
  
  if (process.env.VERCEL) {
    // Vercel 环境下导出 handler
    module.exports = app;
  } else {
    // 本地开发
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  }
}

startServer();
