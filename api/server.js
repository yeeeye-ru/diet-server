const express = require('express');
const { createClient } = require('@vercel/kv');
const cors = require('cors');
const app = express();

// 1. 增强跨域配置（解决不同环境跨域拦截问题）
app.use(cors({
  origin: '*', // 允许所有前端域名访问（生产环境可限定你的前端域名）
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], // 包含预检请求方法
  allowedHeaders: ['Content-Type', 'Origin', 'X-Requested-With'], // 允许更多请求头
  credentials: true, // 允许携带凭证
  maxAge: 86400 // 预检请求缓存时间（24小时），减少OPTIONS请求
}));

// 2. 解析JSON请求体（增加大小限制，支持Base64图片）
app.use(express.json({ 
  limit: '10mb' // 增大请求体限制，支持Base64图片上传（默认1mb不够）
}));

// 3. 处理预检请求（OPTIONS），避免跨域拦截
app.options('*', (req, res) => {
  res.status(200).send();
});

// 4. 初始化Vercel KV客户端（增强容错，添加超时）
let kv = null;
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      // 添加KV客户端超时配置
      fetchOptions: {
        timeout: 5000 // KV操作超时5秒
      }
    });
  } else {
    console.warn('KV环境变量未配置，将使用内存存储（仅测试用）');
  }
} catch (err) {
  console.error('KV客户端初始化失败:', err.message);
}

// ========== 内存存储降级（KV不可用时兜底，避免服务完全不可用） ==========
let memoryPosts = []; // 内存帖子存储
let memoryComments = {}; // 内存评论存储

// ========== 工具函数：KV/内存双存储（增加容错） ==========
// 获取所有帖子（优先KV，失败则用内存）
async function getPosts() {
  // KV可用时优先读取KV
  if (kv) {
    try {
      const posts = await kv.get('posts');
      return posts || [];
    } catch (err) {
      console.error('KV获取帖子失败，降级到内存:', err.message);
    }
  }
  // KV不可用时返回内存数据
  return memoryPosts;
}

// 保存所有帖子（同时写入KV和内存）
async function setPosts(posts) {
  // 先更新内存（确保即时可用）
  memoryPosts = [...posts];
  
  // KV可用时写入KV
  if (kv) {
    try {
      await kv.set('posts', posts);
      return true;
    } catch (err) {
      console.error('KV保存帖子失败，仅内存更新:', err.message);
      return false;
    }
  }
  return true; // 无KV时默认成功
}

// 获取某帖子的评论（优先KV，失败则用内存）
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

// 保存某帖子的评论（同时写入KV和内存）
async function setComments(postId, comments) {
  // 先更新内存
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

// ========== 全局请求超时处理（避免请求一直转圈） ==========
app.use((req, res, next) => {
  // 设置全局请求超时（10秒）
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ 
        error: '请求超时', 
        msg: '服务器响应超时，请稍后重试' 
      });
    }
  }, 10000);

  res.on('finish', () => clearTimeout(timeoutId));
  next();
});

// ========== 健康检查接口（方便排查服务是否可用） ==========
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    kvEnabled: !!kv,
    memoryPostsCount: memoryPosts.length
  });
});

// ========== 帖子接口（增强错误处理和返回信息） ==========
// 1. 获取所有帖子
app.get('/posts', async (req, res) => {
  try {
    const posts = await getPosts();
    // 确保返回格式统一
    res.json(Array.isArray(posts) ? posts : []);
  } catch (err) {
    console.error('GET /posts 错误:', err);
    res.status(500).json({ 
      error: '获取帖子失败', 
      msg: err.message,
      data: [] // 保证前端接收到数组，避免解析报错
    });
  }
});

// 2. 获取单条帖子
app.get('/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) {
      return res.status(404).json({ 
        error: '帖子不存在',
        msg: `未找到ID为${req.params.id}的帖子`
      });
    }
    res.json(post);
  } catch (err) {
    console.error(`GET /posts/${req.params.id} 错误:`, err);
    res.status(500).json({ 
      error: '获取帖子失败', 
      msg: err.message 
    });
  }
});

// 3. 新增帖子（优化ID生成，支持大体积Base64图片）
app.post('/posts', async (req, res) => {
  try {
    // 校验必填字段
    if (!req.body.content && (!req.body.images || req.body.images.length === 0)) {
      return res.status(400).json({ 
        error: '发布失败', 
        msg: '帖子内容或图片不能为空' 
      });
    }

    const posts = await getPosts();
    // 生成更可靠的唯一ID
    const newPost = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      ...req.body,
      createdAt: new Date().toISOString(),
      // 补全默认值，避免前端报错
      likes: req.body.likes || 0,
      comments: req.body.comments || 0,
      shares: req.body.shares || 0,
      isLiked: req.body.isLiked || false
    };

    posts.push(newPost);
    const saveSuccess = await setPosts(posts);
    
    res.status(201).json({ // 201创建成功状态码
      success: saveSuccess,
      data: newPost,
      msg: saveSuccess ? '发布成功' : '发布成功（临时存储，刷新后可能丢失）'
    });
  } catch (err) {
    console.error('POST /posts 错误:', err);
    res.status(500).json({ 
      error: '发布帖子失败', 
      msg: err.message,
      data: null 
    });
  }
});

// 4. 修改帖子（点赞/评论数）
app.patch('/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const postIndex = posts.findIndex(p => p.id === req.params.id);
    
    if (postIndex === -1) {
      return res.status(404).json({ 
        error: '帖子不存在',
        msg: `未找到ID为${req.params.id}的帖子`
      });
    }

    // 安全合并数据，只允许更新指定字段
    const allowedFields = ['likes', 'comments', 'shares', 'isLiked'];
    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    posts[postIndex] = { ...posts[postIndex], ...updateData };
    const saveSuccess = await setPosts(posts);

    res.json({
      success: saveSuccess,
      data: posts[postIndex],
      msg: saveSuccess ? '更新成功' : '更新成功（临时存储）'
    });
  } catch (err) {
    console.error(`PATCH /posts/${req.params.id} 错误:`, err);
    res.status(500).json({ 
      error: '修改帖子失败', 
      msg: err.message 
    });
  }
});

// 5. 删除帖子
app.delete('/posts/:id', async (req, res) => {
  try {
    let posts = await getPosts();
    const originalLength = posts.length;
    posts = posts.filter(p => p.id !== req.params.id);
    
    // 只有帖子数量变化时才保存
    let saveSuccess = true;
    if (posts.length !== originalLength) {
      saveSuccess = await setPosts(posts);
      // 尝试删除对应评论（即使失败也不影响帖子删除）
      if (kv) {
        try {
          await kv.del(`comments_${req.params.id}`);
        } catch (err) {
          console.warn(`删除评论失败(${req.params.id}):`, err.message);
        }
      } else {
        delete memoryComments[req.params.id];
      }
    }

    res.json({
      success: saveSuccess,
      msg: saveSuccess ? '删除成功' : '删除成功（临时存储）'
    });
  } catch (err) {
    console.error(`DELETE /posts/${req.params.id} 错误:`, err);
    res.status(500).json({ 
      error: '删除帖子失败', 
      msg: err.message 
    });
  }
});

// ========== 评论接口（增强容错） ==========
// 1. 获取帖子的所有评论
app.get('/comments', async (req, res) => {
  try {
    const { postId } = req.query;
    if (!postId) {
      return res.status(400).json({ 
        error: '参数错误', 
        msg: '缺少postId查询参数' 
      });
    }
    const comments = await getComments(postId);
    res.json(Array.isArray(comments) ? comments : []);
  } catch (err) {
    console.error('GET /comments 错误:', err);
    res.status(500).json({ 
      error: '获取评论失败', 
      msg: err.message,
      data: [] 
    });
  }
});

// 2. 新增评论
app.post('/comments', async (req, res) => {
  try {
    const { postId, content, author, avatar } = req.body;
    
    // 校验必填参数
    if (!postId) return res.status(400).json({ error: '缺少postId参数' });
    if (!content) return res.status(400).json({ error: '评论内容不能为空' });
    if (!author) return res.status(400).json({ error: '缺少评论者名称' });

    const comments = await getComments(postId);
    const newComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      postId,
      content,
      author,
      avatar: avatar || `https://picsum.photos/64/64?random=${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString()
    };

    comments.push(newComment);
    const saveSuccess = await setComments(postId, comments);

    res.status(201).json({
      success: saveSuccess,
      data: newComment,
      msg: saveSuccess ? '评论发布成功' : '评论发布成功（临时存储）'
    });
  } catch (err) {
    console.error('POST /comments 错误:', err);
    res.status(500).json({ 
      error: '发布评论失败', 
      msg: err.message,
      data: null 
    });
  }
});

// ========== Vercel Serverless适配（增加错误捕获） ==========
// 全局错误处理中间件
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  res.status(500).json({
    error: '服务器内部错误',
    msg: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

module.exports = app;
