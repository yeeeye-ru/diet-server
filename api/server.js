const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const DB_FILE = path.join(__dirname, 'db.json');

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 静态文件服务（如果 public 目录存在）
try {
  app.use(express.static('public'));
} catch (e) {
  console.log('Public directory not found');
}

// 初始化数据库
async function initDB() {
  try {
    await fs.access(DB_FILE);
    console.log('Database file exists');
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ posts: [] }, null, 2));
    console.log('Database file created');
  }
}

// 获取所有帖子
app.get('/api/posts', async (req, res) => {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    // 按时间倒序排列，最新的在前
    const sortedPosts = db.posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(sortedPosts);
  } catch (error) {
    console.error('Error reading posts:', error);
    res.status(500).json({ error: '读取失败', details: error.message });
  }
});

// 创建新帖子
app.post('/api/posts', async (req, res) => {
  try {
    const { content, author = '匿名' } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '帖子内容不能为空' });
    }
    
    const data = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    
    const newPost = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      content: content.trim(),
      author: author.trim() || '匿名',
      timestamp: new Date().toISOString(),
      likes: 0,
      comments: []
    };
    
    db.posts.push(newPost);
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    
    console.log('New post created:', newPost.id);
    res.status(201).json(newPost);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: '发布失败', details: error.message });
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
    
    res.json({ 
      success: true, 
      likes: db.posts[postIndex].likes,
      id: id 
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ error: '点赞失败', details: error.message });
  }
});

// 添加评论
app.post('/api/posts/:id/comment', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, author = '匿名' } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '评论内容不能为空' });
    }
    
    const data = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    
    const postIndex = db.posts.findIndex(post => post.id === id);
    if (postIndex === -1) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    
    const newComment = {
      id: Date.now().toString(),
      content: content.trim(),
      author: author.trim() || '匿名',
      timestamp: new Date().toISOString()
    };
    
    if (!db.posts[postIndex].comments) {
      db.posts[postIndex].comments = [];
    }
    
    db.posts[postIndex].comments.push(newComment);
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    
    res.json({ success: true, comment: newComment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: '评论失败', details: error.message });
  }
});

// 删除帖子
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    
    const initialLength = db.posts.length;
    db.posts = db.posts.filter(post => post.id !== id);
    
    if (db.posts.length === initialLength) {
      return res.status(404).json({ error: '帖子不存在' });
    }
    
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
    
    res.json({ success: true, message: '帖子已删除' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: '删除失败', details: error.message });
  }
});

// 主页路由 - 提供前端页面
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>同学帖子墙</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px; 
          background: #f5f5f5;
        }
        .container { 
          background: white; 
          padding: 30px; 
          border-radius: 10px; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .api-link { 
          background: #0070f3; 
          color: white; 
          padding: 10px 15px; 
          border-radius: 5px; 
          text-decoration: none; 
          display: inline-block; 
          margin: 10px 0;
        }
        .endpoint { 
          background: #f0f0f0; 
          padding: 10px; 
          margin: 10px 0; 
          border-radius: 5px; 
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📝 同学帖子墙 API</h1>
        <p>后端API已成功运行！</p>
        
        <h2>API 端点：</h2>
        <div class="endpoint">GET /api/posts - 获取所有帖子</div>
        <div class="endpoint">POST /api/posts - 创建新帖子</div>
        <div class="endpoint">POST /api/posts/:id/like - 点赞帖子</div>
        <div class="endpoint">POST /api/posts/:id/comment - 添加评论</div>
        <div class="endpoint">DELETE /api/posts/:id - 删除帖子</div>
        
        <h2>测试链接：</h2>
        <a class="api-link" href="/api/posts" target="_blank">查看所有帖子</a>
        <br>
        <a class="api-link" href="/health" target="_blank">健康检查</a>
        
        <h2>使用方法：</h2>
        <p>1. 创建前端页面调用这些API</p>
        <p>2. 或使用Postman测试API</p>
        
        <h2>快速创建帖子：</h2>
        <form id="postForm" style="margin-top: 20px;">
          <textarea id="content" placeholder="帖子内容" style="width:100%; height:100px; padding:10px;"></textarea><br>
          <input id="author" placeholder="作者（可选）" style="width:100%; padding:10px; margin:10px 0;"><br>
          <button type="submit" style="background:#0070f3; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer;">
            发布测试帖子
          </button>
        </form>
      </div>
      
      <script>
        document.getElementById('postForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const content = document.getElementById('content').value;
          const author = document.getElementById('author').value;
          
          const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, author })
          });
          
          if (response.ok) {
            alert('帖子发布成功！');
            document.getElementById('content').value = '';
            document.getElementById('author').value = '';
          } else {
            alert('发布失败');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '未找到该路由' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: '服务器内部错误', details: err.message });
});

// 初始化并启动
async function startServer() {
  await initDB();
  console.log('Database initialized');
  
  if (process.env.VERCEL) {
    // Vercel 环境
    module.exports = app;
    console.log('Server configured for Vercel');
  } else {
    // 本地环境
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Node.js version: ${process.version}`);
    });
  }
}

startServer().catch(console.error);
