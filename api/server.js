const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase配置（替换成你的真实信息）
const supabaseUrl = 'https://ppkkgtaiyioyemdyotog.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwa2tndGFpeWlveWVtZHlvdG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MDk5MTAsImV4cCI6MjA4MTM4NTkxMH0.G_QPD2TMkKp5bBxcC87RYt75CzHo8GOdNbqzTjw8DoQ';
const supabase = createClient(supabaseUrl, supabaseKey);

// 中间件
app.use(cors()); // 跨域
app.use(express.json()); // 解析JSON请求

// 路由：获取所有帖子
app.get('/api/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 路由：发布新帖子
app.post('/api/posts', async (req, res) => {
  try {
    const { content, author } = req.body;
    if (!content || !author) {
      return res.status(400).json({ error: '内容和作者不能为空' });
    }
    const { data, error } = await supabase
      .from('posts')
      .insert([{ content, author }]);
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 启动服务（必须有）
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// 暴露给Vercel（关键）

module.exports = app;

