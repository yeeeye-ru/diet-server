const express = require('express');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const cors = require('cors');
const app = express();

// 1. 配置跨域（允许前端访问）
app.use(cors());
// 2. 解析JSON请求体
app.use(express.json());

// 3. 初始化lowdb（持久化存储到db.json）
const adapter = new FileSync('../db.json'); // 指向项目根目录的db.json
const db = low(adapter);

// 4. 初始化数据库结构（首次运行创建）
db.defaults({ 
  posts: [], 
  comments: [],
  users: []
}).write();

// ========== 帖子接口 ==========
// 获取所有帖子
app.get('/posts', (req, res) => {
  const posts = db.get('posts').value();
  res.json(posts);
});

// 获取单条帖子
app.get('/posts/:id', (req, res) => {
  const post = db.get('posts').find({ id: req.params.id }).value();
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  res.json(post);
});

// 新增帖子
app.post('/posts', (req, res) => {
  const newPost = {
    id: Date.now().toString(), // 用时间戳生成唯一ID
    ...req.body,
    createdAt: new Date().toISOString()
  };
  db.get('posts').push(newPost).write();
  res.json(newPost);
});

// 修改帖子（点赞/评论数）
app.patch('/posts/:id', (req, res) => {
  const post = db.get('posts').find({ id: req.params.id });
  if (!post.value()) return res.status(404).json({ error: '帖子不存在' });
  post.assign(req.body).write();
  res.json(post.value());
});

// 删除帖子
app.delete('/posts/:id', (req, res) => {
  db.get('posts').remove({ id: req.params.id }).write();
  // 同时删除该帖子的所有评论
  db.get('comments').remove({ postId: req.params.id }).write();
  res.json({ success: true });
});

// ========== 评论接口 ==========
// 获取帖子的所有评论
app.get('/comments', (req, res) => {
  const comments = db.get('comments').filter({ postId: req.query.postId }).value();
  res.json(comments);
});

// 新增评论
app.post('/comments', (req, res) => {
  const newComment = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  db.get('comments').push(newComment).write();
  res.json(newComment);
});

// ========== Vercel Serverless适配 ==========
module.exports = app;
