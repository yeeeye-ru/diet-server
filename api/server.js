const express = require('express');
const { createClient } = require('@vercel/kv');
const cors = require('cors');
const app = express();

// 1. 配置跨域（允许所有前端域名访问）
app.use(cors({ origin: '*' }));
// 2. 解析JSON请求体
app.use(express.json());

// 3. 初始化Vercel KV客户端（增加容错，避免环境变量缺失报错）
let kv = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
} catch (err) {
  console.error('KV客户端初始化失败:', err.message);
}

// ========== 工具函数：KV数据操作（增加容错） ==========
// 获取所有帖子
async function getPosts() {
  if (!kv) return []; // KV未初始化时返回空数组
  try {
    const posts = await kv.get('posts');
    return posts || [];
  } catch (err) {
    console.error('获取帖子失败:', err.message);
    return [];
  }
}

// 保存所有帖子
async function setPosts(posts) {
  if (!kv) return false; // KV未初始化时返回false
  try {
    await kv.set('posts', posts);
    return true;
  } catch (err) {
    console.error('保存帖子失败:', err.message);
    return false;
  }
}

// 获取某帖子的评论
async function getComments(postId) {
  if (!kv) return []; // KV未初始化时返回空数组
  try {
    const comments = await kv.get(`comments_${postId}`);
    return comments || [];
  } catch (err) {
    console.error('获取评论失败:', err.message);
    return [];
  }
}

// 保存某帖子的评论
async function setComments(postId, comments) {
  if (!kv) return false; // KV未初始化时返回false
  try {
    await kv.set(`comments_${postId}`, comments);
    return true;
  } catch (err) {
    console.error('保存评论失败:', err.message);
    return false;
  }
}

// ========== 帖子接口 ==========
// 1. 获取所有帖子
app.get('/posts', async (req, res) => {
  try {
    const posts = await getPosts();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: '获取帖子失败', msg: err.message });
  }
});

// 2. 获取单条帖子
app.get('/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: '获取帖子失败', msg: err.message });
  }
});

// 3. 新增帖子
app.post('/posts', async (req, res) => {
  try {
    const posts = await getPosts();
    const newPost = {
      id: Date.now().toString(), // 时间戳作为唯一ID
      ...req.body,
      createdAt: new Date().toISOString()
    };
    posts.push(newPost);
    const saveSuccess = await setPosts(posts);
    if (!saveSuccess) {
      return res.status(500).json({ error: '发布帖子失败', msg: '存储服务未就绪' });
    }
    res.json(newPost);
  } catch (err) {
    res.status(500).json({ error: '发布帖子失败', msg: err.message });
  }
});

// 4. 修改帖子（点赞/评论数）
app.patch('/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const postIndex = posts.findIndex(p => p.id === req.params.id);
    if (postIndex === -1) return res.status(404).json({ error: '帖子不存在' });

    posts[postIndex] = { ...posts[postIndex], ...req.body };
    const saveSuccess = await setPosts(posts);
    if (!saveSuccess) {
      return res.status(500).json({ error: '修改帖子失败', msg: '存储服务未就绪' });
    }
    res.json(posts[postIndex]);
  } catch (err) {
    res.status(500).json({ error: '修改帖子失败', msg: err.message });
  }
});

// 5. 删除帖子
app.delete('/posts/:id', async (req, res) => {
  try {
    let posts = await getPosts();
    posts = posts.filter(p => p.id !== req.params.id);
    const saveSuccess = await setPosts(posts);
    if (!saveSuccess) {
      return res.status(500).json({ error: '删除帖子失败', msg: '存储服务未就绪' });
    }
    // 尝试删除对应评论（即使失败也不影响帖子删除）
    if (kv) await kv.del(`comments_${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除帖子失败', msg: err.message });
  }
});

// ========== 评论接口 ==========
// 1. 获取帖子的所有评论
app.get('/comments', async (req, res) => {
  try {
    const comments = await getComments(req.query.postId);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: '获取评论失败', msg: err.message });
  }
});

// 2. 新增评论
app.post('/comments', async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId) return res.status(400).json({ error: '缺少postId参数' });
    
    const comments = await getComments(postId);
    const newComment = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    comments.push(newComment);
    const saveSuccess = await setComments(postId, comments);
    if (!saveSuccess) {
      return res.status(500).json({ error: '发布评论失败', msg: '存储服务未就绪' });
    }
    res.json(newComment);
  } catch (err) {
    res.status(500).json({ error: '发布评论失败', msg: err.message });
  }
});

// ========== Vercel Serverless适配 ==========
module.exports = app;
