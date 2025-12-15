const express = require('express');
const { createClient } = require('@vercel/kv');
const cors = require('cors');
const serverless = require('serverless-http'); // 新增
const app = express();

// 1. 增强跨域配置
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Origin', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
}));

// 2. 解析JSON请求体
app.use(express.json({ limit: '10mb' }));

// 3. 处理预检请求
app.options('*', (req, res) => {
  res.status(200).send();
});

// 4. 初始化KV客户端
let kv = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      fetchOptions: { timeout: 5000 }
    });
  }
} catch (err) {
  console.error('KV客户端初始化失败:', err.message);
}

// 5. 内存存储降级
let memoryPosts = [];
let memoryComments = {};

// 6. 工具函数（KV+内存）
async function getPosts() {
  if (kv) {
    try {
      const posts = await kv.get('posts');
      return posts || [];
    } catch (err) {
      console.error('KV获取帖子失败，降级到内存:', err.message);
    }
  }
  return memoryPosts;
}

async function setPosts(posts) {
  memoryPosts = [...posts];
  if (kv) {
    try {
      await kv.set('posts', posts);
      return true;
    } catch (err) {
      console.error('KV保存帖子失败，仅内存更新:', err.message);
      return false;
    }
  }
  return true;
}

async function getComments(postId) {
  if (kv) {
    try {
      const comments = await kv.get(`comments_${postId}`);
      return comments || [];
    } catch (err) {
      console.error(`KV获取评论失败(${postId})，降级到内存:`, err.message);
    }
  }
  return memoryComments[postId] || [];
}

async function setComments(postId, comments) {
  memoryComments[postId] = [...comments];
  if (kv) {
    try {
      await kv.set(`comments_${postId}`, comments);
      return true;
    } catch (err) {
      console.error(`KV保存评论失败(${postId})，仅内存更新:`, err.message);
      return false;
    }
  }
  return true;
}

// 7. 全局请求超时
app.use((req, res, next) => {
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: '请求超时', msg: '服务器响应超时' });
    }
  }, 10000);
  res.on('finish', () => clearTimeout(timeoutId));
  next();
});

// 8. 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    kvEnabled: !!kv,
    memoryPostsCount: memoryPosts.length
  });
});

// 9. 帖子接口（路径改为/api/posts）
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await getPosts();
    res.json(Array.isArray(posts) ? posts : []);
  } catch (err) {
    res.status(500).json({ error: '获取帖子失败', msg: err.message, data: [] });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: '获取帖子失败', msg: err.message });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    if (!req.body.content && (!req.body.images || req.body.images.length === 0)) {
      return res.status(400).json({ error: '内容或图片不能为空' });
    }
    const posts = await getPosts();
    const newPost = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      ...req.body,
      createdAt: new Date().toISOString(),
      likes: req.body.likes || 0,
      comments: req.body.comments || 0,
      shares: req.body.shares || 0,
      isLiked: req.body.isLiked || false
    };
    posts.push(newPost);
    const saveSuccess = await setPosts(posts);
    res.status(201).json({ success: saveSuccess, data: newPost });
  } catch (err) {
    res.status(500).json({ error: '发布失败', msg: err.message });
  }
});

app.patch('/api/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const postIndex = posts.findIndex(p => p.id === req.params.id);
    if (postIndex === -1) return res.status(404).json({ error: '帖子不存在' });
    const allowedFields = ['likes', 'comments', 'shares', 'isLiked'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    });
    posts[postIndex] = { ...posts[postIndex], ...updateData };
    const saveSuccess = await setPosts(posts);
    res.json({ success: saveSuccess, data: posts[postIndex] });
  } catch (err) {
    res.status(500).json({ error: '修改失败', msg: err.message });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    let posts = await getPosts();
    const originalLength = posts.length;
    posts = posts.filter(p => p.id !== req.params.id);
    let saveSuccess = true;
    if (posts.length !== originalLength) {
      saveSuccess = await setPosts(posts);
      if (kv) await kv.del(`comments_${req.params.id}`);
      else delete memoryComments[req.params.id];
    }
    res.json({ success: saveSuccess });
  } catch (err) {
    res.status(500).json({ error: '删除失败', msg: err.message });
  }
});

// 10. 评论接口（路径改为/api/comments）
app.get('/api/comments', async (req, res) => {
  try {
    const { postId } = req.query;
    if (!postId) return res.status(400).json({ error: '缺少postId' });
    const comments = await getComments(postId);
    res.json(Array.isArray(comments) ? comments : []);
  } catch (err) {
    res.status(500).json({ error: '获取评论失败', msg: err.message });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { postId, content, author } = req.body;
    if (!postId) return res.status(400).json({ error: '缺少postId' });
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    if (!author) return res.status(400).json({ error: '缺少作者' });
    const comments = await getComments(postId);
    const newComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      postId,
      content,
      author,
      avatar: req.body.avatar || `https://picsum.photos/64/64?random=${Math.random() * 1000}`,
      createdAt: new Date().toISOString()
    };
    comments.push(newComment);
    const saveSuccess = await setComments(postId, comments);
    res.status(201).json({ success: saveSuccess, data: newComment });
  } catch (err) {
    res.status(500).json({ error: '评论失败', msg: err.message });
  }
});

// 11. 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  res.status(500).json({ error: '服务器错误', msg: err.message });
});

// 12. Vercel Serverless适配（核心）
// 替换原有的导出代码
module.exports = serverless(app);

