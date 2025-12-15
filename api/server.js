const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// 模拟db.json的数据（直接写在代码里，或读取../db.json）
const db = require('../db.json');

// 示例接口：获取所有数据
app.get('/', (req, res) => {
  res.json(db);
});

// Vercel Serverless函数的适配（将Express app转为处理函数）
module.exports = app;
