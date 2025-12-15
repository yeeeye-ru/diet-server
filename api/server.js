const jsonServer = require('json-server');
const server = jsonServer.create();
const router = jsonServer.router('../db.json'); 
const middlewares = jsonServer.defaults();

server.use(middlewares);
server.use(router);

// Vercel Serverless要求导出请求处理函数
module.exports = (req, res) => {
  // 转发请求到json-server
  server(req, res);
};