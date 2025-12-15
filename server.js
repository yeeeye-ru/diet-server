const jsonServer = require('json-server');
const server = jsonServer.create();
const router = jsonServer.router('db.json'); // 数据文件
const middlewares = jsonServer.defaults();

// 允许跨域（关键：让前端能访问）
server.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

server.use(middlewares);
server.use(router);

// 监听端口（Vercel 会自动分配端口）
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('JSON Server is running');
});